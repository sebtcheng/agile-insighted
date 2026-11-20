import { z } from "zod";
import type { PmApproval } from "./enums";
import { sprintKeySchema } from "./sprint";

/**
 * User Story Mapping, simplified: Project -> User (persona) -> ordered journey step cards -> step feature checklist.
 * Backed by usm_personas, usm_steps and usm_step_features. Releases, story points and acceptance criteria
 * are not part of this flow.
 */
const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const MAX_USM_FEATURES_PER_STEP = 50;

export const usmProjectQuerySchema = z.object({ projectId: id });
export const usmStepsQuerySchema = z.object({ projectId: id, personaId: id.optional() });

export const createUsmPersonaSchema = z.object({
  projectId: id,
  name: text(80),
  description: optionalText(1000),
});
export const updateUsmPersonaSchema = z
  .object({ name: text(80), description: optionalText(1000) })
  .partial();

export const createUsmStepSchema = z.object({
  projectId: id,
  personaId: id,
  title: text(160),
  description: optionalText(2000),
  /** 0-based slot the new step takes; later steps shift down. Omit to append. */
  insertAtIndex: z.number().int().min(0).max(100000).optional(),
});
export const updateUsmStepSchema = z
  .object({ title: text(160), description: optionalText(2000) })
  .partial();
export const reorderUsmStepsSchema = z.object({
  projectId: id,
  personaId: id,
  stepIds: z.array(id).min(1).max(500),
});

export const createUsmFeatureSchema = z.object({
  projectId: id,
  stepId: id,
  title: text(300),
  responsibleId: id.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  sprintKey: sprintKeySchema.nullable().optional(),
  isCompleted: z.boolean().optional(),
});
export const updateUsmFeatureSchema = z
  .object({
    title: text(300),
    responsibleId: id.nullable(),
    targetDate: isoDate.nullable(),
    sprintKey: sprintKeySchema.nullable(),
    sortOrder: z.number().int().min(0).max(100000),
    isCompleted: z.boolean(),
  })
  .partial();

export type CreateUsmPersonaInput = z.infer<typeof createUsmPersonaSchema>;
export type UpdateUsmPersonaInput = z.infer<typeof updateUsmPersonaSchema>;
export type CreateUsmStepInput = z.infer<typeof createUsmStepSchema>;
export type UpdateUsmStepInput = z.infer<typeof updateUsmStepSchema>;
export type ReorderUsmStepsInput = z.infer<typeof reorderUsmStepsSchema>;
export type CreateUsmFeatureInput = z.infer<typeof createUsmFeatureSchema>;
export type UpdateUsmFeatureInput = z.infer<typeof updateUsmFeatureSchema>;

export type UsmPersonaDto = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  sortOrder: number;
};
export type UsmFeatureDto = {
  id: string;
  projectId: string;
  stepId: string;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  targetDate: string | null;
  sprintKey: string | null;
  sprintLabel: string | null;
  pmApproval: PmApproval;
  sortOrder: number;
};
export type UsmStepDto = {
  id: string;
  projectId: string;
  personaId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  features: UsmFeatureDto[];
};

/** Card summary: "X/Y features completed" plus how many open features are past their target date. */
export function usmStepSummary(
  features: ReadonlyArray<{ isCompleted: boolean; targetDate: string | null }>,
  today: string,
): { completed: number; total: number; overdue: number } {
  return {
    completed: features.filter((f) => f.isCompleted).length,
    total: features.length,
    overdue: features.filter((f) => !f.isCompleted && f.targetDate !== null && f.targetDate < today)
      .length,
  };
}
