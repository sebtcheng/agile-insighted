/** Whole-number percentage of completed mitigating actions; 0 when there are none (never NaN). */
export function mitigationPercent(actions: ReadonlyArray<{ isCompleted: boolean }>): number {
  if (actions.length === 0) return 0;
  return Math.round((actions.filter((a) => a.isCompleted).length / actions.length) * 100);
}
