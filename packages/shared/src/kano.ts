import { z } from "zod";
import { KANO_CATEGORIES, KANO_DECISIONS, WSJF_VALUES } from "./enums";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---- Kano Request Tracker (Phase 7)
export const kanoCategorySchema = z.enum(KANO_CATEGORIES);
export const kanoDecisionSchema = z.enum(KANO_DECISIONS);
export type KanoCategory = z.infer<typeof kanoCategorySchema>;
export type KanoDecision = z.infer<typeof kanoDecisionSchema>;

export const KANO_DECISION_LABELS: Record<KanoDecision, string> = {
  approve_mvp: "Approve for MVP",
  prioritize_sprint: "Prioritize for sprint",
  schedule_release: "Schedule for release",
  research_spike: "Research spike",
  deprioritize: "Deprioritize",
};
export const RICE_IMPACT_VALUES = [0.25, 0.5, 1, 2, 3] as const;

const wsjfValue = z
  .number()
  .int()
  .refine((n) => (WSJF_VALUES as readonly number[]).includes(n), {
    message: "Use 1, 2, 3, 5, 8, 13 or 20",
  });
const riceImpact = z.number().refine((n) => (RICE_IMPACT_VALUES as readonly number[]).includes(n), {
  message: "Use 0.25, 0.5, 1, 2 or 3",
});

export const createKanoSchema = z.object({
  subprojectId: id.nullable().optional(),
  description: text(2000),
  requesterName: text(120),
  requesterRole: optionalText(120),
});
export const updateKanoSchema = z
  .object({
    subprojectId: id.nullable(),
    description: text(2000),
    requesterName: text(120),
    requesterRole: optionalText(120),
    kanoCategory: kanoCategorySchema.nullable(),
    decision: kanoDecisionSchema.nullable(),
    targetSprintId: id.nullable(),
    targetReleaseId: id.nullable(),
    wsjfBusinessValue: wsjfValue.nullable(),
    wsjfTimeCriticality: wsjfValue.nullable(),
    wsjfRiskReduction: wsjfValue.nullable(),
    wsjfJobSize: wsjfValue.nullable(),
    riceReach: z.number().int().min(0).max(100_000_000).nullable(),
    riceImpact: riceImpact.nullable(),
    riceConfidence: z.number().int().min(0).max(100).nullable(),
    riceEffort: z.number().gt(0).max(100_000).nullable(),
  })
  .partial();
export const kanoListQuerySchema = z.object({
  subprojectId: id.optional(),
  kanoCategory: kanoCategorySchema.optional(),
  decision: kanoDecisionSchema.optional(),
  unevaluated: z.enum(["true", "false"]).optional(),
  sort: z.enum(["wsjf", "rice", "code"]).optional(),
});
export const promoteKanoSchema = z.object({
  story: text(1000).optional(),
  journeyStepId: id.nullable().optional(),
});

export type CreateKanoInput = z.infer<typeof createKanoSchema>;
export type UpdateKanoInput = z.infer<typeof updateKanoSchema>;
export type PromoteKanoInput = z.infer<typeof promoteKanoSchema>;

export type KanoDto = {
  id: string;
  projectId: string;
  code: string;
  subprojectId: string | null;
  subprojectCode: string | null;
  description: string;
  requesterName: string;
  requesterRole: string | null;
  kanoCategory: KanoCategory | null;
  decision: KanoDecision | null;
  targetSprintId: string | null;
  targetSprintName: string | null;
  targetReleaseId: string | null;
  targetReleaseName: string | null;
  promotedStoryId: string | null;
  promotedStoryCode: string | null;
  wsjfBusinessValue: number | null;
  wsjfTimeCriticality: number | null;
  wsjfRiskReduction: number | null;
  wsjfJobSize: number | null;
  wsjfScore: number | null;
  riceReach: number | null;
  riceImpact: number | null;
  riceConfidence: number | null;
  riceEffort: number | null;
  riceScore: number | null;
  createdAt: string;
};
