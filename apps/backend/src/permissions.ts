import { MEMBER_EDITABLE_FIELDS, type UserRole } from "@myapp/shared";

export type Actor = { id: string; role: UserRole; fullName: string };

/**
 * The single permission map. Every write endpoint names one action here; routes never
 * check roles inline. 401 (not signed in) is handled by the auth middleware, 403 by this map.
 */
export const PERMISSIONS = {
  "user.manage": ["pm"],
  "project.write": ["pm"],
  "subproject.write": ["pm"],
  "sprint.write": ["pm"],
  "activity.create": ["pm"],
  "activity.edit_any": ["pm"],
  "activity.delete": ["pm"],
  "activity.update_own_progress": ["pm", "team_member"],
  "tag.manage": ["pm"],
  "comment.create": ["pm", "team_member"],
  "read.any": ["pm", "team_member"],
  // Phase 2. Ownership rules (own activities only) for the two shared actions live in governanceService.
  "release.write": ["pm"],
  "checklist_template.write": ["pm"],
  "capacity.write": ["pm"],
  "gate_override.read": ["pm"],
  "dependency.write": ["pm", "team_member"],
  "checklist_check.write": ["pm", "team_member"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(actor: Pick<Actor, "role">, action: Action): boolean {
  return (PERMISSIONS[action] as readonly UserRole[]).includes(actor.role);
}

/** Fields a team member may change on an activity they are assigned to. */
export function memberMayEditOnly(fields: string[]): boolean {
  const allowed: readonly string[] = MEMBER_EDITABLE_FIELDS;
  return fields.every((f) => allowed.includes(f));
}

/** Can this actor apply this set of changed fields to an activity with this assignee? */
export function canEditActivityFields(
  actor: Actor,
  assigneeId: string | null,
  fields: string[],
): boolean {
  if (can(actor, "activity.edit_any")) return true;
  return (
    assigneeId === actor.id &&
    can(actor, "activity.update_own_progress") &&
    memberMayEditOnly(fields)
  );
}
