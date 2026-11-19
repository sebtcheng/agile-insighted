import type { OstTreeDto, SolutionDto, ValidationStatus } from "@myapp/shared";

/** A solution (the action) counts as done when it is validated. Unticking sends it back to planned. */
export const isSolutionDone = (s: Pick<SolutionDto, "validationStatus">): boolean =>
  s.validationStatus === "validated";

export const statusForTick = (checked: boolean): ValidationStatus =>
  checked ? "validated" : "planned";

/** Returns a copy of the tree with one solution's status changed (used for the optimistic update). */
export function withSolutionStatus(
  tree: OstTreeDto,
  solutionId: string,
  status: ValidationStatus,
): OstTreeDto {
  return {
    ...tree,
    solutions: tree.solutions.map((s) =>
      s.id === solutionId ? { ...s, validationStatus: status } : s,
    ),
  };
}

export function solutionProgress(solutions: SolutionDto[]): { done: number; total: number } {
  return { done: solutions.filter(isSolutionDone).length, total: solutions.length };
}

/** Solutions under every opportunity of one outcome; drives that outcome's completion. */
export function outcomeSolutions(tree: OstTreeDto, outcomeId: string): SolutionDto[] {
  const oppIds = new Set(
    tree.opportunities.filter((o) => o.outcomeId === outcomeId).map((o) => o.id),
  );
  return tree.solutions.filter((s) => oppIds.has(s.opportunityId));
}
