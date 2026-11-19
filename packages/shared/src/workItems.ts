import { z } from "zod";

/**
 * Unified work items: one normalised shape for activities and nested action steps from Projects, OST,
 * Kano, User Story Mapping and RAID. Home, Workload and Insights all read this, so their counts agree.
 */
export const WORK_SOURCE_MODULES = ["project", "ost", "kano", "user_story", "raid"] as const;
export const workSourceModuleSchema = z.enum(WORK_SOURCE_MODULES);
export type WorkSourceModule = z.infer<typeof workSourceModuleSchema>;

export const WORK_ITEM_KINDS = ["activity", "step"] as const;
export const SCHEDULE_STATUSES = [
  "completed_on_time",
  "completed_delayed",
  "completed",
  "ongoing_on_time",
  "delayed",
  "no_due_date",
] as const;
export const scheduleStatusSchema = z.enum(SCHEDULE_STATUSES);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const workItemSchema = z.object({
  id: z.string(),
  sourceModule: workSourceModuleSchema,
  /** "activity" is a parent record; "step" is an action step, revision spec or mitigating action. */
  itemKind: z.enum(WORK_ITEM_KINDS),
  title: z.string(),
  parentTitle: z.string().nullable(),
  projectId: z.string(),
  subprojectId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  dueDate: z.string().nullable(),
  isCompleted: z.boolean(),
  completedAt: z.string().nullable(),
  scheduleStatus: scheduleStatusSchema,
});
export type WorkItem = z.infer<typeof workItemSchema>;

/**
 * Counts that mean the same thing on every page.
 * ongoing: open, due today or later. delayed: open and overdue, or completed after the due date.
 * onTime: open and not overdue (with a date), or completed on or before the due date.
 * unscheduled: open with no due date. completed counts every finished item.
 */
export type WorkSummary = {
  total: number;
  completed: number;
  incomplete: number;
  /** completed / total, 0 to 100, one decimal. */
  completionRate: number;
  ongoing: number;
  onTime: number;
  delayed: number;
  unscheduled: number;
};

export type WorkBreakdownRow = WorkSummary & { key: string; label: string };

export type WorkMemberRollup = WorkSummary & {
  userId: string | null;
  fullName: string;
  /** Open items only. */
  active: number;
  byModule: Record<WorkSourceModule, number>;
  items: WorkItem[];
};

export const workItemsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  subprojectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});
export type WorkItemsQuery = z.infer<typeof workItemsQuerySchema>;

export type InsightsWorkSummary = {
  summary: WorkSummary;
  byModule: WorkBreakdownRow[];
  byProject: WorkBreakdownRow[];
  byMember: WorkBreakdownRow[];
};

export const SOURCE_MODULE_LABELS: Record<WorkSourceModule, string> = {
  project: "Projects",
  ost: "OST",
  kano: "Kano",
  user_story: "User Story Map",
  raid: "RAID",
};
