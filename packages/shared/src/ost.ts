import { z } from "zod";
import { VALIDATION_STATUSES, type PmApproval } from "./enums";
import { sprintKeySchema } from "./sprint";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ---- Opportunity Solution Tree (Phase 8)
export const validationStatusSchema = z.enum(VALIDATION_STATUSES);

export const VALIDATION_LABELS = {
  planned: "Planned",
  in_progress: "In progress",
  validated: "Validated",
  invalidated: "Invalidated",
} as const;
/** A targeted opportunity should have at least this many contrasting solutions. */
export const MIN_SOLUTIONS_PER_TARGET = 3;

export const createOutcomeSchema = z.object({
  // Defaults to the project in the URL; an outcome cannot be moved to another project after creation.
  projectId: id.optional(),
  title: text(200),
  description: optionalText(2000),
});
export const updateOutcomeSchema = z
  .object({
    title: text(200),
    description: optionalText(2000),
  })
  .partial();

export const MAX_REQUIREMENT_SOLUTIONS = 20;
/**
 * One solution / action step of a requirement. `id` present = existing row to update; absent = new row.
 * `completed` maps to the validation status: true = validated, false = planned (other statuses are kept).
 */
export const requirementSolutionInputSchema = z.object({
  id: id.optional(),
  title: text(300),
  completed: z.boolean().default(false),
  ownerId: id.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  sprintKey: sprintKeySchema.nullable().optional(),
});
const solutionsInput = z.array(requirementSolutionInputSchema).max(MAX_REQUIREMENT_SOLUTIONS);

export const createOpportunitySchema = z.object({
  title: text(300),
  isTargeted: z.boolean().optional(),
  solutions: solutionsInput.optional(),
});
export const updateOpportunitySchema = z
  .object({
    title: text(300),
    isTargeted: z.boolean(),
    solutions: solutionsInput,
  })
  .partial();

export const createSolutionSchema = z.object({
  title: text(300),
  ownerId: id.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  sprintKey: sprintKeySchema.nullable().optional(),
});
export const updateSolutionSchema = z
  .object({
    title: text(300),
    ownerId: id.nullable(),
    targetDate: isoDate.nullable(),
    sprintKey: sprintKeySchema.nullable(),
    validationStatus: validationStatusSchema,
  })
  .partial();

export const convertSolutionSchema = z.object({
  story: text(1000).optional(),
  // PM only: converts a solution that is not validated yet, recorded in gate_overrides.
  overrideReason: text(500).optional(),
});

export type CreateOutcomeInput = z.infer<typeof createOutcomeSchema>;
export type UpdateOutcomeInput = z.infer<typeof updateOutcomeSchema>;
export type RequirementSolutionInput = z.input<typeof requirementSolutionInputSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type CreateSolutionInput = z.infer<typeof createSolutionSchema>;
export type UpdateSolutionInput = z.infer<typeof updateSolutionSchema>;
export type ConvertSolutionInput = z.infer<typeof convertSolutionSchema>;

type ValidationStatusValue = (typeof VALIDATION_STATUSES)[number];

export type OutcomeDto = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
};
export type OpportunityDto = {
  id: string;
  outcomeId: string;
  title: string;
  isTargeted: boolean;
};
export type SolutionDto = {
  id: string;
  opportunityId: string;
  code: string;
  title: string;
  validationStatus: ValidationStatusValue;
  ownerId: string | null;
  ownerName: string | null;
  targetDate: string | null;
  sprintKey: string | null;
  sprintLabel: string | null;
  pmApproval: PmApproval;
  convertedStoryId: string | null;
  convertedStoryCode: string | null;
};
export type OstTreeDto = {
  outcomes: OutcomeDto[];
  opportunities: OpportunityDto[];
  solutions: SolutionDto[];
};
