import { z } from "zod";
import type { WorkType } from "./enums";

const id = z.string().uuid();

// ---- Insights (Phase 9): flow metrics from activity history. Team-level only: nothing here is per person.
export const insightsQuerySchema = z.object({
  projectId: id.optional(),
  subprojectId: id.optional(),
  /** Complete weeks of history to analyse (the current, partial week is shown separately). */
  weeks: z.coerce.number().int().min(4).max(26).default(12),
});
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;

export type ThroughputWeek = { weekStart: string; count: number; partial: boolean };
export type CycleTimeStats = {
  /** Completed items with a start and an end inside the window. */
  sample: number;
  p50: number | null;
  p85: number | null;
  p95: number | null;
  average: number | null;
};
export type AgingItem = {
  id: string;
  title: string;
  subprojectCode: string | null;
  status: "in_progress" | "in_review";
  isBlocked: boolean;
  ageDays: number;
};
export type FlowShare = { workType: WorkType; count: number; share: number };
export type ForecastDto = {
  /** Open (not done) activities the forecast is about. */
  remaining: number;
  /** Weekly completions the simulation drew from (complete weeks only, zeros included). */
  samples: number[];
  runs: number;
  /** Weeks until `remaining` items are done: 50%, 85% and 95% likely to be done within this many weeks. */
  weeksToFinish: { p50: number; p85: number; p95: number } | null;
  /** Items finished in the next N weeks: the count reached or beaten in 85% (conservative) and 50% of runs. */
  itemsDone: Array<{ weeks: number; p85: number; p50: number }>;
  /** Why there is no forecast, when there is none. */
  note: string | null;
};
export type InsightsDto = {
  /** When the numbers were computed; forecast dates count forward from here. */
  generatedAt: string;
  timezone: string;
  windowWeeks: number;
  windowStart: string;
  throughput: ThroughputWeek[];
  throughputAverage: number;
  cycleTime: CycleTimeStats;
  wip: { current: number; inProgress: number; inReview: number; blocked: number };
  aging: AgingItem[];
  flowDistribution: FlowShare[];
  forecast: ForecastDto;
};
