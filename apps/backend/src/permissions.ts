import { MEMBER_EDITABLE_FIELDS, type UserRole } from "@myapp/shared";

export type Actor = { id: string; role: UserRole; fullName: string };

/**
 * The single permission map. Every write endpoint names one action here; routes never
 * check roles inline. 401 (not signed in) is handled by the auth middleware, 403 by this map.
 */
export const PERMISSIONS = {
  "user.manage": ["pm"],
  "project.write": ["pm"],
  // Anyone can start a project; they become its owner (or a member), so it is visible to them.
  "project.create": ["pm", "team_member"],
  // Team members edit a project's name, owner and team (within their visible projects); archive and delete stay PM-only.
  "project.edit": ["pm", "team_member"],
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
  // Phase 5: team members submit RAID items; the PM edits, assigns owners and resolves them.
  "raid.create": ["pm", "team_member"],
  "raid.manage": ["pm"],
  // Phase 6: team members propose stories and tick Definition of Ready items; the PM shapes the map.
  "story.create": ["pm", "team_member"],
  "story.manage": ["pm"],
  // Phase 7: anyone can submit a request; the PM categorizes and manages them.
  "kano.create": ["pm", "team_member"],
  "kano.manage": ["pm"],
  // Phase 8: the PM shapes the tree and converts solutions; team members add assumptions and record test results.
  "ost.manage": ["pm"],
  "ost.contribute": ["pm", "team_member"],
  // Team members add and edit User Story Mapping and OST items in their projects; deleting, validating and
  // converting stay with the PM. PM approval is never settable through these routes.
  "usm.edit": ["pm", "team_member"],
  // Same for RAID and Kano: members add and edit (and tick approved actions); delete, status of the Kano
  // evaluation (category) and approval stay with the PM.
  "raid.edit": ["pm", "team_member"],
  "kano.edit": ["pm", "team_member"],
  "ost.edit": ["pm", "team_member"],
  // Admin Log: the PM reviews, edits and approves every task across all projects.
  "adminlog.manage": ["pm"],
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
