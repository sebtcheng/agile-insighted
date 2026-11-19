import { describe, expect, it } from "vitest";
import {
  forecast,
  percentile,
  seededRandom,
  simulateItemsDone,
  simulateWeeksToFinish,
} from "./forecast";

describe("percentile", () => {
  it("uses nearest rank and handles empty and single values", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(v, 50)).toBe(5);
    expect(percentile(v, 85)).toBe(9);
    expect(percentile(v, 100)).toBe(10);
    expect(percentile([10, 1, 5], 50)).toBe(5);
  });
});

describe("seededRandom", () => {
  it("is repeatable and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("simulation", () => {
  it("is exact when every week is the same", () => {
    const weeks = simulateWeeksToFinish([5, 5, 5, 5], 20, 200, seededRandom(1));
    expect(new Set(weeks)).toEqual(new Set([4]));
    expect(new Set(simulateItemsDone([3, 3, 3, 3], 4, 50, seededRandom(1)))).toEqual(new Set([12]));
  });

  it("finishes sooner with more throughput and stays within the cap", () => {
    const slow = forecast([1, 0, 2, 1, 0, 1], 30);
    const fast = forecast([4, 6, 5, 7, 5, 6], 30);
    expect(slow.weeksToFinish && fast.weeksToFinish).toBeTruthy();
    expect((fast.weeksToFinish?.p85 ?? 0) < (slow.weeksToFinish?.p85 ?? 0)).toBe(true);
    expect((slow.weeksToFinish?.p85 ?? 0) <= 260).toBe(true);
  });

  it("orders confidence levels and is deterministic", () => {
    const samples = [0, 2, 5, 1, 8, 3, 0, 4, 6, 2, 1, 7];
    const a = forecast(samples, 25);
    const b = forecast(samples, 25);
    expect(a).toEqual(b);
    const w = a.weeksToFinish;
    expect(w && w.p50 <= w.p85 && w.p85 <= w.p95).toBe(true);
    for (const h of a.itemsDone) expect(h.p85).toBeLessThanOrEqual(h.p50);
  });

  it("explains itself when there is not enough to forecast", () => {
    expect(forecast([1, 2], 10).weeksToFinish).toBeNull();
    expect(forecast([1, 2], 10).note).toMatch(/4 complete weeks/);
    expect(forecast([0, 0, 0, 0, 0], 10).note).toMatch(/nothing was completed/i);
    expect(forecast([2, 3, 2, 3], 0).weeksToFinish).toEqual({ p50: 0, p85: 0, p95: 0 });
  });
});
