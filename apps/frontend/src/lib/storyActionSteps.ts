import { storyCompletion, type StoryActionStepDto, type StoryMapDto } from "@myapp/shared";

/** Applies `change` to one story's action steps and recomputes its completion fields from them. */
export function withStoryActionSteps(
  map: StoryMapDto,
  storyId: string,
  change: (steps: StoryActionStepDto[]) => StoryActionStepDto[],
): StoryMapDto {
  return {
    ...map,
    stories: map.stories.map((s) => {
      if (s.id !== storyId) return s;
      const actionSteps = change(s.actionSteps);
      return { ...s, actionSteps, ...storyCompletion(actionSteps) };
    }),
  };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Open and past its date. */
export const isStepOverdue = (s: Pick<StoryActionStepDto, "isCompleted" | "targetDate">) =>
  !s.isCompleted && !!s.targetDate && s.targetDate < todayIso();
