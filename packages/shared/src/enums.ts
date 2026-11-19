import { z } from "zod";

export const USER_ROLES = ["pm", "team_member"] as const;
export const SPRINT_STATUSES = ["planning", "active", "completed"] as const;
export const ACTIVITY_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const ACTIVITY_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const WORK_TYPES = ["feature", "defect", "risk", "debt", "enabler"] as const;
export const TRACKS = ["discovery", "delivery"] as const;
export const HEALTHS = ["on_track", "at_risk", "off_track"] as const;
export const ACTIVITY_EVENT_TYPES = [
  "status_changed",
  "blocked",
  "unblocked",
  "sprint_changed",
  "assigned",
] as const;

export const RELEASE_STATUSES = ["planned", "released"] as const;
export const CHECKLIST_KINDS = ["ready", "done"] as const;
export const GATES = ["dor", "dod", "validation", "scope_change"] as const;
export const OVERRIDE_ENTITY_TYPES = ["story", "activity", "solution"] as const;

// Module data layer (Phase 4). Enum values are additive-only.
export const VALIDATION_STATUSES = ["planned", "in_progress", "validated", "invalidated"] as const;
export const STORY_STATUSES = ["backlog", "planning", "in_progress", "completed"] as const;
export const KANO_CATEGORIES = [
  "must_be",
  "performance",
  "attractive",
  "indifferent",
  "reverse",
] as const;
export const RAID_TYPES = ["risk", "assumption", "issue", "dependency"] as const;
export const RAID_STATUSES = ["open", "in_progress", "mitigated", "closed"] as const;
export const CODE_SCOPES = ["ost", "usm", "req", "raid", "sub"] as const;
export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;

export const KANO_LABELS = {
  must_be: "Must-Have",
  performance: "Performance Optimizer",
  attractive: "Delighter",
  indifferent: "Indifferent",
  reverse: "Reverse",
} as const;

export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export type CodeScope = (typeof CODE_SCOPES)[number];

export const releaseStatusSchema = z.enum(RELEASE_STATUSES);
export const checklistKindSchema = z.enum(CHECKLIST_KINDS);
export const gateSchema = z.enum(GATES);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type ChecklistKind = z.infer<typeof checklistKindSchema>;
export type Gate = z.infer<typeof gateSchema>;

export const userRoleSchema = z.enum(USER_ROLES);
export const sprintStatusSchema = z.enum(SPRINT_STATUSES);
export const activityStatusSchema = z.enum(ACTIVITY_STATUSES);
export const activityPrioritySchema = z.enum(ACTIVITY_PRIORITIES);
export const workTypeSchema = z.enum(WORK_TYPES);
export const trackSchema = z.enum(TRACKS);
export const healthSchema = z.enum(HEALTHS);
export const activityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

export type UserRole = z.infer<typeof userRoleSchema>;
export type SprintStatus = z.infer<typeof sprintStatusSchema>;
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export type ActivityPriority = z.infer<typeof activityPrioritySchema>;
export type WorkType = z.infer<typeof workTypeSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Health = z.infer<typeof healthSchema>;
export type ActivityEventType = z.infer<typeof activityEventTypeSchema>;

export const ENUM_LABELS = {
  role: { pm: "Project Manager", team_member: "Team Member" },
  sprintStatus: { planning: "Planning", active: "Active", completed: "Completed" },
  status: { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done" },
  priority: { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" },
  workType: {
    feature: "Feature",
    defect: "Defect",
    risk: "Risk",
    debt: "Tech debt",
    enabler: "Enabler",
  },
  track: { discovery: "Discovery", delivery: "Delivery" },
  health: { on_track: "On track", at_risk: "At risk", off_track: "Off track" },
  raidType: { risk: "Risk", assumption: "Assumption", issue: "Issue", dependency: "Dependency" },
  raidStatus: {
    open: "Open",
    in_progress: "In progress",
    mitigated: "Mitigated",
    closed: "Closed",
  },
  level: { 1: "Low", 2: "Medium", 3: "High" },
} as const;

export const raidTypeSchema = z.enum(RAID_TYPES);
export const raidStatusSchema = z.enum(RAID_STATUSES);
export type RaidType = z.infer<typeof raidTypeSchema>;
export type RaidStatus = z.infer<typeof raidStatusSchema>;

export const storyStatusSchema = z.enum(STORY_STATUSES);
export type StoryStatus = z.infer<typeof storyStatusSchema>;
export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: "Backlog",
  planning: "Planning",
  in_progress: "In progress",
  completed: "Completed",
};
