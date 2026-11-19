import { describe, expect, it } from "vitest";
import type { WorkItem } from "@myapp/shared";
import { classifySchedule, memberRollups, rollupByModule, summarize } from "./workItemRollups";

const TZ = "Asia/Manila";
const TODAY = "2026-11-18";

describe("classifySchedule (Asia/Manila)", () => {
  it("classifies open items by due date", () => {
    const c = (dueDate: string | null) =>
      classifySchedule({ dueDate, isCompleted: false, completedAt: null }, TODAY, TZ);
    expect(c("2026-11-18")).toBe("ongoing_on_time");
    expect(c("2026-11-30")).toBe("ongoing_on_time");
    expect(c("2026-11-17")).toBe("delayed");
    expect(c(null)).toBe("no_due_date");
  });

  it("judges completion on the Manila calendar day", () => {
    // 2026-11-17T17:00Z is 01:00 on the 18th in Manila: late for a 17 Nov deadline.
    const late = classifySchedule(
      { dueDate: "2026-11-17", isCompleted: true, completedAt: new Date("2026-11-17T17:00:00Z") },
      TODAY,
      TZ,
    );
    const onTime = classifySchedule(
      { dueDate: "2026-11-17", isCompleted: true, completedAt: new Date("2026-11-17T15:00:00Z") },
      TODAY,
      TZ,
    );
    expect(late).toBe("completed_delayed");
    expect(onTime).toBe("completed_on_time");
    expect(
      classifySchedule({ dueDate: null, isCompleted: true, completedAt: new Date() }, TODAY, TZ),
    ).toBe("completed");
  });
});

let n = 0;
const item = (o: Partial<WorkItem>): WorkItem => ({
  id: `i${(n += 1)}`,
  sourceModule: "project",
  itemKind: "activity",
  title: "t",
  parentTitle: null,
  projectId: "p1",
  subprojectId: null,
  assigneeId: null,
  assigneeName: null,
  dueDate: null,
  isCompleted: false,
  completedAt: null,
  scheduleStatus: "no_due_date",
  ...o,
});

const sample = [
  item({
    sourceModule: "project",
    assigneeId: "a",
    assigneeName: "Ana",
    scheduleStatus: "ongoing_on_time",
  }),
  item({ sourceModule: "ost", assigneeId: "a", assigneeName: "Ana", scheduleStatus: "delayed" }),
  item({
    sourceModule: "kano",
    itemKind: "step",
    assigneeId: "b",
    assigneeName: "Ben",
    isCompleted: true,
    scheduleStatus: "completed_on_time",
  }),
  item({
    sourceModule: "user_story",
    itemKind: "step",
    assigneeId: "b",
    assigneeName: "Ben",
    isCompleted: true,
    scheduleStatus: "completed_delayed",
  }),
  item({ sourceModule: "raid", itemKind: "step", scheduleStatus: "no_due_date" }),
];

describe("rollups", () => {
  it("summarizes across all five modules", () => {
    expect(summarize(sample)).toEqual({
      total: 5,
      completed: 2,
      incomplete: 3,
      completionRate: 40,
      ongoing: 1,
      onTime: 2,
      delayed: 2,
      unscheduled: 1,
    });
  });

  it("breaks down by module and keeps per-member counts consistent with the summary", () => {
    const mods = rollupByModule(sample);
    expect(mods.map((m) => m.key).sort()).toEqual(["kano", "ost", "project", "raid", "user_story"]);
    const members = memberRollups(sample, [{ id: "c", fullName: "Cy" }]);
    expect(members.map((m) => m.fullName)).toEqual(["Ana", "Ben", "Cy", "Unassigned"]);
    expect(members.reduce((s, m) => s + m.total, 0)).toBe(summarize(sample).total);
    const ana = members[0]!;
    expect(ana.active).toBe(2);
    expect(ana.byModule.ost).toBe(1);
    expect(members[2]!.total).toBe(0);
  });
});
