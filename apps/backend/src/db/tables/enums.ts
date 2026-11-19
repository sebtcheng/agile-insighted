import { pgEnum } from "drizzle-orm/pg-core";
import {
  KANO_CATEGORIES,
  RAID_STATUSES,
  RAID_TYPES,
  STORY_STATUSES,
  VALIDATION_STATUSES,
  CHECKLIST_KINDS,
  GATES,
  RELEASE_STATUSES,
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  HEALTHS,
  SPRINT_STATUSES,
  TRACKS,
  USER_ROLES,
  WORK_TYPES,
} from "@myapp/shared";

/** Postgres enums, built from the value lists in @myapp/shared. */

export const userRole = pgEnum("user_role", USER_ROLES);
export const sprintStatus = pgEnum("sprint_status", SPRINT_STATUSES);
export const activityStatus = pgEnum("activity_status", ACTIVITY_STATUSES);
export const activityPriority = pgEnum("activity_priority", ACTIVITY_PRIORITIES);
export const workType = pgEnum("work_type", WORK_TYPES);
export const track = pgEnum("track", TRACKS);
export const health = pgEnum("health", HEALTHS);
export const activityEventType = pgEnum("activity_event_type", ACTIVITY_EVENT_TYPES);

export const releaseStatus = pgEnum("release_status", RELEASE_STATUSES);
export const checklistKind = pgEnum("checklist_kind", CHECKLIST_KINDS);
export const gate = pgEnum("gate", GATES);
export const validationStatus = pgEnum("validation_status", VALIDATION_STATUSES);
export const storyStatus = pgEnum("story_status", STORY_STATUSES);
export const kanoCategory = pgEnum("kano_category", KANO_CATEGORIES);
export const raidType = pgEnum("raid_type", RAID_TYPES);
export const raidStatus = pgEnum("raid_status", RAID_STATUSES);
