import { ACTIVITY_STATUSES, WORK_TYPES, type ActivityStatus, type WorkType } from "@myapp/shared";

/**
 * Every list's filters live in the URL query string, so views can be bookmarked and shared. These pure
 * functions are the single parse/serialize pair; tests assert they round-trip.
 */
export type ActivityFilters = {
  subprojectId?: string;
  status?: ActivityStatus;
  assigneeId?: string;
  sprintId?: string;
  releaseId?: string;
  tagId?: string;
  blocked?: boolean;
  workType?: WorkType;
};

const STRING_KEYS = ["subprojectId", "assigneeId", "sprintId", "releaseId", "tagId"] as const;

export function parseActivityFilters(sp: URLSearchParams): ActivityFilters {
  const f: ActivityFilters = {};
  for (const key of STRING_KEYS) {
    const v = sp.get(key);
    if (v) f[key] = v;
  }
  const status = sp.get("status");
  if (status && (ACTIVITY_STATUSES as readonly string[]).includes(status))
    f.status = status as ActivityStatus;
  const workType = sp.get("workType");
  if (workType && (WORK_TYPES as readonly string[]).includes(workType))
    f.workType = workType as WorkType;
  const blocked = sp.get("blocked");
  if (blocked === "true") f.blocked = true;
  if (blocked === "false") f.blocked = false;
  return f;
}

/** Applies filters onto existing params, leaving unrelated params (tab, activity drawer, sort) alone. */
export function applyActivityFilters(sp: URLSearchParams, f: ActivityFilters): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const key of [...STRING_KEYS, "status", "workType", "blocked"]) next.delete(key);
  for (const key of STRING_KEYS) {
    const v = f[key];
    if (v) next.set(key, v);
  }
  if (f.status) next.set("status", f.status);
  if (f.workType) next.set("workType", f.workType);
  if (f.blocked !== undefined) next.set("blocked", String(f.blocked));
  return next;
}

// ---- Home: PM filters and the group-by toggle
export type HomeFilters = { assigneeId?: string; subprojectId?: string; group?: boolean };

export function parseHomeFilters(sp: URLSearchParams): HomeFilters {
  const group = sp.get("group");
  return {
    assigneeId: sp.get("assigneeId") || undefined,
    subprojectId: sp.get("subprojectId") || undefined,
    group: group === "1" ? true : group === "0" ? false : undefined,
  };
}

export function applyHomeFilters(sp: URLSearchParams, f: HomeFilters): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const key of ["assigneeId", "subprojectId", "group"]) next.delete(key);
  if (f.assigneeId) next.set("assigneeId", f.assigneeId);
  if (f.subprojectId) next.set("subprojectId", f.subprojectId);
  if (f.group !== undefined) next.set("group", f.group ? "1" : "0");
  return next;
}
