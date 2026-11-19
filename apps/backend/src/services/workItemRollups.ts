import type {
  WorkBreakdownRow,
  WorkItem,
  WorkMemberRollup,
  WorkSourceModule,
  WorkSummary,
  ScheduleStatus,
} from "@myapp/shared";
import { SOURCE_MODULE_LABELS, WORK_SOURCE_MODULES } from "@myapp/shared";
import { localDate } from "./dateBuckets";

/** Pure classification and rollups for unified work items. All dates are YYYY-MM-DD in the app timezone. */

export function classifySchedule(
  input: { dueDate: string | null; isCompleted: boolean; completedAt: Date | null },
  today: string,
  timeZone: string,
): ScheduleStatus {
  if (input.isCompleted) {
    if (!input.dueDate || !input.completedAt) return "completed";
    return localDate(input.completedAt, timeZone) <= input.dueDate
      ? "completed_on_time"
      : "completed_delayed";
  }
  if (!input.dueDate) return "no_due_date";
  return input.dueDate >= today ? "ongoing_on_time" : "delayed";
}

export function summarize(items: Pick<WorkItem, "isCompleted" | "scheduleStatus">[]): WorkSummary {
  const s: WorkSummary = {
    total: items.length,
    completed: 0,
    incomplete: 0,
    completionRate: 0,
    ongoing: 0,
    onTime: 0,
    delayed: 0,
    unscheduled: 0,
  };
  for (const i of items) {
    if (i.isCompleted) s.completed += 1;
    else s.incomplete += 1;
    switch (i.scheduleStatus) {
      case "ongoing_on_time":
        s.ongoing += 1;
        s.onTime += 1;
        break;
      case "completed_on_time":
        s.onTime += 1;
        break;
      case "delayed":
      case "completed_delayed":
        s.delayed += 1;
        break;
      case "no_due_date":
        s.unscheduled += 1;
        break;
      default:
        break;
    }
  }
  s.completionRate = s.total ? Math.round((s.completed / s.total) * 1000) / 10 : 0;
  return s;
}

function breakdown(
  items: WorkItem[],
  keyOf: (i: WorkItem) => { key: string; label: string },
): WorkBreakdownRow[] {
  const groups = new Map<string, { label: string; items: WorkItem[] }>();
  for (const i of items) {
    const { key, label } = keyOf(i);
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(i);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, ...summarize(g.items) }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

export const UNASSIGNED_LABEL = "Unassigned";

export function rollupByModule(items: WorkItem[]): WorkBreakdownRow[] {
  return breakdown(items, (i) => ({
    key: i.sourceModule,
    label: SOURCE_MODULE_LABELS[i.sourceModule],
  }));
}
export function rollupByProject(items: WorkItem[], names: Map<string, string>): WorkBreakdownRow[] {
  return breakdown(items, (i) => ({
    key: i.projectId,
    label: names.get(i.projectId) ?? "Project",
  }));
}
export function rollupByMember(items: WorkItem[]): WorkBreakdownRow[] {
  return breakdown(items, (i) => ({
    key: i.assigneeId ?? "unassigned",
    label: i.assigneeName ?? UNASSIGNED_LABEL,
  }));
}

/** Per-member workload, including an Unassigned bucket and members with no items (from `people`). */
export function memberRollups(
  items: WorkItem[],
  people: Array<{ id: string; fullName: string }> = [],
): WorkMemberRollup[] {
  const byUser = new Map<string | null, WorkItem[]>();
  for (const p of people) byUser.set(p.id, []);
  for (const i of items) {
    const list = byUser.get(i.assigneeId) ?? [];
    list.push(i);
    byUser.set(i.assigneeId, list);
  }
  const names = new Map(people.map((p) => [p.id, p.fullName]));
  for (const i of items)
    if (i.assigneeId && i.assigneeName) names.set(i.assigneeId, i.assigneeName);
  const out: WorkMemberRollup[] = [];
  for (const [userId, list] of byUser) {
    const byModule = Object.fromEntries(WORK_SOURCE_MODULES.map((m) => [m, 0])) as Record<
      WorkSourceModule,
      number
    >;
    for (const i of list) byModule[i.sourceModule] += 1;
    out.push({
      ...summarize(list),
      userId,
      fullName: userId ? (names.get(userId) ?? "Unknown") : UNASSIGNED_LABEL,
      active: list.filter((i) => !i.isCompleted).length,
      byModule,
      items: [...list].sort(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id.localeCompare(b.id),
      ),
    });
  }
  // Alphabetical, Unassigned last. Never ranked by output.
  return out.sort((a, b) =>
    a.userId === null ? 1 : b.userId === null ? -1 : a.fullName.localeCompare(b.fullName),
  );
}
