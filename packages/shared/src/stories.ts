import { z } from "zod";
import { STORY_POINT_VALUES, storyStatusSchema, workTypeSchema } from "./enums";
import type { StoryStatus, WorkType } from "./enums";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---- User Story Mapping (Phase 6)
export const createPersonaSchema = z.object({
  name: text(80),
  description: optionalText(1000),
  subprojectId: id.nullable().optional(),
});
export const updatePersonaSchema = z
  .object({ name: text(80), description: optionalText(1000), subprojectId: id.nullable() })
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
export const createStorySchema = z.object({
  story: text(1000),
  acceptanceCriteria: optionalText(3000),
  personaId: id.nullable().optional(),
  journeyStepId: id.nullable().optional(),
  workType: workTypeSchema.optional(),
  releaseId: id.nullable().optional(),
  storyPoints: storyPoints.nullable().optional(),
});
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
    // PM only: lets a story skip the Definition of Ready, recorded in gate_overrides.
    overrideReason: text(500),
  })
  .partial();
export const storyMapQuerySchema = z.object({ subprojectId: id });

export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
export type CreateJourneyStepInput = z.infer<typeof createJourneyStepSchema>;
export type UpdateJourneyStepInput = z.infer<typeof updateJourneyStepSchema>;
export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

export type PersonaDto = {
  id: string;
  name: string;
  description: string | null;
  subprojectId: string | null;
};
export type JourneyStepDto = {
  id: string;
  subprojectId: string;
  parentStepId: string | null;
  name: string;
  position: number;
};
export type StoryDto = {
  id: string;
  projectId: string;
  subprojectId: string;
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
  readyChecked: number;
  readyTotal: number;
  linkedActivities: number;
};
export type StoryMapDto = {
  personas: PersonaDto[];
  steps: JourneyStepDto[];
  stories: StoryDto[];
};
export type StoryChecklistItemDto = {
  templateId: string;
  label: string;
  position: number;
  checked: boolean;
};
