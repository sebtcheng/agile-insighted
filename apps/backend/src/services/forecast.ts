/**
 * Pure forecasting helpers for Insights. No database, no clock: easy to test and deterministic.
 * The Monte Carlo draws whole weeks of past throughput at random (with replacement), which keeps the
 * real spread and bursts of the team's history instead of assuming an average.
 */

/** Small seedable generator (mulberry32) so a forecast does not jitter between page loads. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nearest-rank percentile of a numeric list (p in 0..100). Returns null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] as number;
}

export const MAX_FORECAST_WEEKS = 260;

/** For each run, how many weeks it takes to finish `remaining` items; runs that never finish are capped. */
export function simulateWeeksToFinish(
  samples: number[],
  remaining: number,
  runs: number,
  rand: () => number,
): number[] {
  const out: number[] = [];
  for (let r = 0; r < runs; r += 1) {
    let left = remaining;
    let weeks = 0;
    while (left > 0 && weeks < MAX_FORECAST_WEEKS) {
      left -= samples[Math.floor(rand() * samples.length)] as number;
      weeks += 1;
    }
    out.push(weeks);
  }
  return out;
}

/** For each run, how many items get done in `weeks` weeks. */
export function simulateItemsDone(
  samples: number[],
  weeks: number,
  runs: number,
  rand: () => number,
): number[] {
  const out: number[] = [];
  for (let r = 0; r < runs; r += 1) {
    let done = 0;
    for (let w = 0; w < weeks; w += 1)
      done += samples[Math.floor(rand() * samples.length)] as number;
    out.push(done);
  }
  return out;
}

export type ForecastResult = {
  weeksToFinish: { p50: number; p85: number; p95: number } | null;
  itemsDone: Array<{ weeks: number; p85: number; p50: number }>;
  note: string | null;
};

export function forecast(
  samples: number[],
  remaining: number,
  options: { runs?: number; seed?: number; horizons?: number[] } = {},
): ForecastResult {
  const runs = options.runs ?? 5000;
  const horizons = options.horizons ?? [2, 4, 8];
  const total = samples.reduce((a, b) => a + b, 0);
  if (samples.length < 4) {
    return {
      weeksToFinish: null,
      itemsDone: [],
      note: "Not enough history yet: need at least 4 complete weeks.",
    };
  }
  if (total === 0) {
    return {
      weeksToFinish: null,
      itemsDone: [],
      note: "Nothing was completed in this window, so there is nothing to forecast from.",
    };
  }
  const seed = options.seed ?? 20260101;
  const itemsDone = horizons.map((weeks) => {
    const results = simulateItemsDone(samples, weeks, runs, seededRandom(seed + weeks));
    // "85% likely to finish at least this many": the 15th percentile of the outcomes.
    return {
      weeks,
      p85: percentile(results, 15) ?? 0,
      p50: percentile(results, 50) ?? 0,
    };
  });
  if (remaining <= 0) {
    return {
      weeksToFinish: { p50: 0, p85: 0, p95: 0 },
      itemsDone,
      note: "There is no open work left to forecast.",
    };
  }
  const weeks = simulateWeeksToFinish(samples, remaining, runs, seededRandom(seed));
  return {
    weeksToFinish: {
      p50: percentile(weeks, 50) ?? 0,
      p85: percentile(weeks, 85) ?? 0,
      p95: percentile(weeks, 95) ?? 0,
    },
    itemsDone,
    note: null,
  };
}
