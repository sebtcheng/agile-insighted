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

// ---- Portfolio filters
export type PortfolioFilters = {
  health?: "on_track" | "at_risk" | "off_track";
  leadId?: string;
  hasBlockers?: boolean;
  mine?: boolean;
  sort: "code" | "name" | "health" | "open" | "blocked" | "waiting" | "overdue" | "percentDone";
  dir: "asc" | "desc";
};

const SORTS = [
  "code",
  "name",
  "health",
  "open",
  "blocked",
  "waiting",
  "overdue",
  "percentDone",
] as const;

export function parsePortfolioFilters(sp: URLSearchParams): PortfolioFilters {
  const health = sp.get("health");
  const sort = sp.get("sort");
  return {
    health:
      health === "on_track" || health === "at_risk" || health === "off_track" ? health : undefined,
    leadId: sp.get("leadId") || undefined,
    hasBlockers: sp.get("hasBlockers") === "true" ? true : undefined,
    mine: sp.get("mine") === "true" ? true : undefined,
    sort: (SORTS as readonly string[]).includes(sort ?? "")
      ? (sort as PortfolioFilters["sort"])
      : "code",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
  };
}

export function applyPortfolioFilters(sp: URLSearchParams, f: PortfolioFilters): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const key of ["health", "leadId", "hasBlockers", "mine", "sort", "dir"]) next.delete(key);
  if (f.health) next.set("health", f.health);
  if (f.leadId) next.set("leadId", f.leadId);
  if (f.hasBlockers) next.set("hasBlockers", "true");
  if (f.mine) next.set("mine", "true");
  if (f.sort !== "code") next.set("sort", f.sort);
  if (f.dir !== "asc") next.set("dir", f.dir);
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
