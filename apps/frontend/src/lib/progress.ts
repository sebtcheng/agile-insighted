/** Whole-number completion percentage; 0 when there is nothing to complete. */
export function completionPercent(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export function completionLabel(completed: number, total: number): string {
  return `${completionPercent(completed, total)}% complete`;
}
