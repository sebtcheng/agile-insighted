import { z } from "zod";
import { ASSUMPTION_CATEGORIES, VALIDATION_STATUSES } from "./enums";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ---- Opportunity Solution Tree (Phase 8)
export const validationStatusSchema = z.enum(VALIDATION_STATUSES);
export const assumptionCategorySchema = z.enum(ASSUMPTION_CATEGORIES);
export type AssumptionCategory = z.infer<typeof assumptionCategorySchema>;

export const VALIDATION_LABELS = {
  planned: "Planned",
  in_progress: "In progress",
  validated: "Validated",
  invalidated: "Invalidated",
} as const;
export const CATEGORY_LABELS: Record<AssumptionCategory, string> = {
  desirability: "Desirability",
  viability: "Viability",
  usability: "Usability",
  feasibility: "Feasibility",
};
/** A targeted opportunity should have at least this many contrasting solutions. */
export const MIN_SOLUTIONS_PER_TARGET = 3;

const metric = z.number().finite().min(-1e12).max(1e12);

export const createOutcomeSchema = z.object({
  subprojectId: id.nullable().optional(),
  title: text(200),
  description: optionalText(2000),
  metricName: optionalText(120),
  baselineValue: metric.nullable().optional(),
  targetValue: metric.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
});
export const updateOutcomeSchema = z
  .object({
    subprojectId: id.nullable(),
    title: text(200),
    description: optionalText(2000),
    metricName: optionalText(120),
    baselineValue: metric.nullable(),
    targetValue: metric.nullable(),
    targetDate: isoDate.nullable(),
  })
  .partial();

export const createOpportunitySchema = z.object({
  parentOpportunityId: id.nullable().optional(),
  title: text(300),
  description: optionalText(2000),
  evidence: optionalText(2000),
  isTargeted: z.boolean().optional(),
});
export const updateOpportunitySchema = z
  .object({
    title: text(300),
    description: optionalText(2000),
    evidence: optionalText(2000),
    isTargeted: z.boolean(),
  })
  .partial();

export const createSolutionSchema = z.object({
  title: text(300),
  ownerId: id.nullable().optional(),
});
export const updateSolutionSchema = z
  .object({ title: text(300), ownerId: id.nullable() })
  .partial();

export const createAssumptionSchema = z.object({
  statement: text(1000),
  category: assumptionCategorySchema,
  isRiskiest: z.boolean().optional(),
  validationTest: optionalText(1000),
});
export const updateAssumptionSchema = z
  .object({
    statement: text(1000),
    category: assumptionCategorySchema,
    isRiskiest: z.boolean(),
    validationTest: optionalText(1000),
    validationStatus: validationStatusSchema,
    resultNotes: optionalText(2000),
  })
  .partial();

export const convertSolutionSchema = z.object({
  subprojectId: id,
  story: text(1000).optional(),
  // PM only: converts a solution that is not validated yet, recorded in gate_overrides.
  overrideReason: text(500).optional(),
});

export type CreateOutcomeInput = z.infer<typeof createOutcomeSchema>;
export type UpdateOutcomeInput = z.infer<typeof updateOutcomeSchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type CreateSolutionInput = z.infer<typeof createSolutionSchema>;
export type UpdateSolutionInput = z.infer<typeof updateSolutionSchema>;
export type CreateAssumptionInput = z.infer<typeof createAssumptionSchema>;
export type UpdateAssumptionInput = z.infer<typeof updateAssumptionSchema>;
export type ConvertSolutionInput = z.infer<typeof convertSolutionSchema>;

type ValidationStatusValue = (typeof VALIDATION_STATUSES)[number];

export type OutcomeDto = {
  id: string;
  subprojectId: string | null;
  subprojectCode: string | null;
  title: string;
  description: string | null;
  metricName: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  targetDate: string | null;
};
export type OpportunityDto = {
  id: string;
  outcomeId: string;
  parentOpportunityId: string | null;
  title: string;
  description: string | null;
  evidence: string | null;
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
  convertedStoryId: string | null;
  convertedStoryCode: string | null;
};
export type AssumptionDto = {
  id: string;
  solutionId: string;
  statement: string;
  category: AssumptionCategory;
  isRiskiest: boolean;
  validationTest: string | null;
  validationStatus: ValidationStatusValue;
  resultNotes: string | null;
  position: number;
};
export type OstTreeDto = {
  outcomes: OutcomeDto[];
  opportunities: OpportunityDto[];
  solutions: SolutionDto[];
  assumptions: AssumptionDto[];
};
