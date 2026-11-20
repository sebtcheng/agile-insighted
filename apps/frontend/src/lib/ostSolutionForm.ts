import { resolveStoredSprint, type UpdateSolutionInput } from "@myapp/shared";

/** The Edit / Add solution dialog's text fields, all strings so they bind to inputs ("" = empty). */
export type SolutionFormValues = { title?: string; sprintKey?: string; ownerId?: string };

/** Initial values for the dialog. Every field the form shows must be listed here, or it opens blank. */
export const solutionToForm = (s: {
  title: string;
  ownerId: string | null;
  targetDate: string | null;
  sprintKey?: string | null;
}): SolutionFormValues => ({
  title: s.title,
  ownerId: s.ownerId ?? "",
  sprintKey: resolveStoredSprint(s.sprintKey, s.targetDate)?.key ?? "",
});

/** The request body for the dialog. An emptied sprint or owner is sent as null so it can be cleared. */
export const formToSolutionInput = (
  v: SolutionFormValues,
): Required<Pick<UpdateSolutionInput, "title" | "ownerId" | "sprintKey">> => ({
  title: v.title ?? "",
  ownerId: v.ownerId || null,
  sprintKey: v.sprintKey || null,
});
