import { z } from "zod";
import { STORY_POINT_VALUES, storyStatusSchema, workTypeSchema } from "./enums";
import type { StoryStatus, WorkType } from "./enums";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---- User Story Mapping (Phase 6). Project scoped, like RAID, Kano and OST.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createPersonaSchema = z.object({
  name: text(80),
  description: optionalText(1000),
});
export const updatePersonaSchema = z
  .object({ name: text(80), description: optionalText(1000) })
  .partial();

export const createJourneyStepSchema = z.object({
  name: text(120),
  parentStepId: id.nullable().optional(),
  position: z.number().int().min(0).max(100000).optional(),
});
export const updateJourneyStepSchema = z
  .object({ name: text(120), position: z.number().int().min(0).max(100000) })
  .partial();

const storyPoints = z
  .number()
  .int()
  .refine((n) => (STORY_POINT_VALUES as readonly number[]).includes(n), {
    message: "Use 1, 2, 3, 5, 8, 13 or 21",
  });

export const MAX_STORY_ACTION_STEPS = 30;
/** One action step. `id` present = existing row to update; absent = new row. Array order is the display order. */
export const storyActionStepInputSchema = z.object({
  id: id.optional(),
  label: text(300),
  isCompleted: z.boolean().default(false),
  responsibleId: id,
  targetDate: isoDate,
});
const actionStepsInput = z.array(storyActionStepInputSchema).max(MAX_STORY_ACTION_STEPS);
export const toggleStoryActionStepSchema = z.object({ isCompleted: z.boolean() });

export const createStorySchema = z.object({
  projectId: id,
  story: text(1000),
  acceptanceCriteria: optionalText(3000),
  personaId: id.nullable().optional(),
  // A mapped story needs a journey step and a release, both from the same project.
  journeyStepId: id,
  workType: workTypeSchema.optional(),
  releaseId: id,
  storyPoints: storyPoints.nullable().optional(),
  responsibleId: id.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  actionSteps: actionStepsInput.optional(),
});
/** The project is fixed once a story exists (its code, sprint and delivery links are all per project). */
export const updateStorySchema = z
  .object({
    story: text(1000),
    acceptanceCriteria: optionalText(3000),
    personaId: id.nullable(),
    journeyStepId: id.nullable(),
    workType: workTypeSchema,
    releaseId: id.nullable(),
    sprintId: id.nullable(),
    storyPoints: storyPoints.nullable(),
    status: storyStatusSchema,
    position: z.number().int().min(0).max(1_000_000),
    responsibleId: id.nullable(),
    targetDate: isoDate.nullable(),
    // Atomically syncs the whole list: edits, additions, deletions, ticks and order.
    actionSteps: actionStepsInput,
  })
  .partial();
/** No projectId = every project the caller can see. */
export const storyMapQuerySchema = z.object({ projectId: id.optional() });

export type StoryActionStepInput = z.input<typeof storyActionStepInputSchema>;
export type ToggleStoryActionStepInput = z.infer<typeof toggleStoryActionStepSchema>;
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
export type CreateJourneyStepInput = z.infer<typeof createJourneyStepSchema>;
export type UpdateJourneyStepInput = z.infer<typeof updateJourneyStepSchema>;
export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

export type PersonaDto = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
};
export type JourneyStepDto = {
  id: string;
  projectId: string;
  parentStepId: string | null;
  name: string;
  position: number;
};
export type StoryActionStepDto = {
  id: string;
  label: string;
  isCompleted: boolean;
  completedAt: string | null;
  targetDate: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  sortOrder: number;
};
export type StoryCompletionDto = {
  completedCount: number;
  totalCount: number;
  completionPercentage: number;
};
/** Derived, never stored. A story with steps may only be completed when every step is done. */
export function storyCompletion(
  steps: ReadonlyArray<{ isCompleted: boolean }>,
): StoryCompletionDto {
  const totalCount = steps.length;
  const completedCount = steps.filter((s) => s.isCompleted).length;
  return {
    completedCount,
    totalCount,
    completionPercentage: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
  };
}
export type StoryDto = StoryCompletionDto & {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  story: string;
  acceptanceCriteria: string | null;
  personaId: string | null;
  personaName: string | null;
  journeyStepId: string | null;
  workType: WorkType;
  releaseId: string | null;
  releaseName: string | null;
  isMvp: boolean;
  sprintId: string | null;
  sprintName: string | null;
  storyPoints: number | null;
  status: StoryStatus;
  position: number;
  responsibleId: string | null;
  responsibleName: string | null;
  targetDate: string | null;
  /** Ordered by sortOrder; the completion fields derive from these. */
  actionSteps: StoryActionStepDto[];
  linkedActivities: number;
};
export type ToggleStoryActionStepResult = {
  step: StoryActionStepDto;
  summary: StoryCompletionDto;
  /** The story's status after the toggle (unticking a step on a completed story reopens it). */
  status: StoryStatus;
};
export type StoryMapDto = {
  personas: PersonaDto[];
  steps: JourneyStepDto[];
  stories: StoryDto[];
};
