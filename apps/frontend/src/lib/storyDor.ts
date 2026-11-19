import type { StoryDorItemDto, StoryMapDto } from "@myapp/shared";

/** Applies `change` to one story's Definition of Ready items and recomputes its X/Y counts from them. */
export function withStoryDor(
  map: StoryMapDto,
  storyId: string,
  change: (items: StoryDorItemDto[]) => StoryDorItemDto[],
): StoryMapDto {
  return {
    ...map,
    stories: map.stories.map((s) => {
      if (s.id !== storyId) return s;
      const dorItems = change(s.dorItems);
      return {
        ...s,
        dorItems,
        readyChecked: dorItems.filter((i) => i.isCompleted).length,
        readyTotal: dorItems.length,
      };
    }),
  };
}
