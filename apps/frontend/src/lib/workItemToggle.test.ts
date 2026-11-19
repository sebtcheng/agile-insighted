import { describe, expect, it } from "vitest";
import type { WorkItem } from "@myapp/shared";
import { isCheckable, withWorkItemCompleted, workItemToggleRequest } from "./workItemToggle";

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: "i1",
  sourceModule: "ost",
  itemKind: "step",
  title: "t",
  parentTitle: null,
  parentId: "p1",
  projectId: "pr",
  subprojectId: null,
  assigneeId: null,
  assigneeName: null,
  dueDate: "2026-11-20",
  isCompleted: false,
  completedAt: null,
  scheduleStatus: "ongoing_on_time",
  ...over,
});

describe("workItemToggleRequest", () => {
  it("maps each module to its own toggle endpoint", () => {
    expect(workItemToggleRequest(item({ sourceModule: "user_story" }), true)).toEqual({
      path: "/story-map/features/i1",
      body: { isCompleted: true },
    });
    expect(workItemToggleRequest(item({ sourceModule: "ost" }), true)).toEqual({
      path: "/ost/solutions/i1",
      body: { validationStatus: "validated" },
    });
    expect(workItemToggleRequest(item({ sourceModule: "ost" }), false)?.body).toEqual({
      validationStatus: "planned",
    });
    expect(workItemToggleRequest(item({ sourceModule: "kano" }), false)).toEqual({
      path: "/kano/p1/specs/i1",
      body: { isCompleted: false },
    });
    expect(workItemToggleRequest(item({ sourceModule: "raid" }), true)).toEqual({
      path: "/raid/p1/mitigating-actions/i1",
      body: { isCompleted: true },
    });
  });
  it("has no request for a Kano request or RAID item without steps, or when the parent is missing", () => {
    expect(
      workItemToggleRequest(item({ sourceModule: "kano", itemKind: "activity" }), true),
    ).toBeNull();
    expect(workItemToggleRequest(item({ sourceModule: "raid", parentId: null }), true)).toBeNull();
    expect(isCheckable(item({ sourceModule: "raid", itemKind: "activity" }))).toBe(false);
    expect(isCheckable(item({ sourceModule: "project" }))).toBe(true);
  });
});

describe("withWorkItemCompleted", () => {
  it("flips only the matching item, anywhere in a cached response", () => {
    const data = {
      moduleItems: { thisWeek: [item({}), item({ id: "i2" })], later: [] },
      members: [{ items: [item({}), item({ sourceModule: "raid" })] }],
    };
    const next = withWorkItemCompleted(data, { id: "i1", sourceModule: "ost" }, true);
    expect(next.moduleItems.thisWeek[0]).toMatchObject({
      isCompleted: true,
      scheduleStatus: "completed",
    });
    expect(next.moduleItems.thisWeek[1]?.isCompleted).toBe(false);
    expect(next.members[0]?.items[0]?.isCompleted).toBe(true);
    expect(next.members[0]?.items[1]?.isCompleted).toBe(false); // same id, other module
    expect(data.moduleItems.thisWeek[0]?.isCompleted).toBe(false); // input is not mutated
  });
});
