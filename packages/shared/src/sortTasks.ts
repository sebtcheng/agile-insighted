export interface TaskSortable {
  id?: string;
  title?: string;
  status?: string | null;
  isCompleted?: boolean | null;
  completed?: boolean | null;
  dueDate?: string | null;
}

const COMPLETED_STATUSES = new Set(["COMPLETED", "DONE", "CLOSED"]);

function statusPriority(item: TaskSortable): number {
  if (item.isCompleted === true || item.completed === true) return 2;
  const upper = item.status?.toUpperCase();
  if (upper && COMPLETED_STATUSES.has(upper)) return 2;
  if (upper === "ONGOING") return 0;
  return 1;
}

/**
 * Deterministic comparator that places ONGOING / incomplete tasks above
 * completed tasks, with dueDate ascending, title, and id as tie-breakers.
 */
export function compareByStatusOngoingFirst(a: TaskSortable, b: TaskSortable): number {
  return (
    statusPriority(a) - statusPriority(b) ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    (a.title ?? "").localeCompare(b.title ?? "") ||
    (a.id ?? "").localeCompare(b.id ?? "")
  );
}

/** Pure helper returning a new array sorted with ongoing/incomplete tasks first. */
export function sortTasksOngoingFirst<T extends TaskSortable>(items: readonly T[]): T[] {
  return [...items].sort(compareByStatusOngoingFirst);
}
