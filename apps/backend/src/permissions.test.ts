import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  can,
  canEditActivityFields,
  memberMayEditOnly,
  type Action,
  type Actor,
} from "./permissions";

const pm: Actor = { id: "pm", role: "pm", fullName: "PM" };
const member: Actor = { id: "m1", role: "team_member", fullName: "Member" };

describe("permission map", () => {
  const pmOnly: Action[] = [
    "user.manage",
    "project.write",
    "subproject.write",
    "sprint.write",
    "activity.create",
    "activity.edit_any",
    "activity.delete",
    "tag.manage",
  ];
  it.each(pmOnly)("%s is PM only", (action) => {
    expect(can(pm, action)).toBe(true);
    expect(can(member, action)).toBe(false);
  });

  it("lets both roles comment, read and update their own progress", () => {
    for (const action of ["comment.create", "read.any", "activity.update_own_progress"] as const) {
      expect(can(pm, action)).toBe(true);
      expect(can(member, action)).toBe(true);
    }
  });

  it("has no action without an explicit role list", () => {
    for (const roles of Object.values(PERMISSIONS)) expect(roles.length).toBeGreaterThan(0);
  });
});

describe("activity field rules for team members", () => {
  it("allows status, progress and blocker fields on own activity", () => {
    expect(
      canEditActivityFields(member, "m1", [
        "status",
        "percentComplete",
        "isBlocked",
        "blockedReason",
      ]),
    ).toBe(true);
  });
  it("blocks other fields on own activity", () => {
    expect(canEditActivityFields(member, "m1", ["title"])).toBe(false);
    expect(canEditActivityFields(member, "m1", ["status", "assigneeId"])).toBe(false);
    expect(memberMayEditOnly(["priority"])).toBe(false);
  });
  it("blocks any edit on someone else's or unassigned activity", () => {
    expect(canEditActivityFields(member, "m2", ["status"])).toBe(false);
    expect(canEditActivityFields(member, null, ["status"])).toBe(false);
  });
  it("lets a PM edit anything", () => {
    expect(canEditActivityFields(pm, "m2", ["title", "assigneeId", "sprintId"])).toBe(true);
  });
});
