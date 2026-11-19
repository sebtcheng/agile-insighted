import { describe, expect, it } from "vitest";
import {
  applyActivityFilters,
  applyHomeFilters,
  parseActivityFilters,
  parseHomeFilters,
  type ActivityFilters,
} from "./filters";

const ID = "01a1ef79-0e1d-7a5f-be99-5ccf8a7654e4";

describe("activity filters round-trip through the URL", () => {
  const full: ActivityFilters = {
    subprojectId: ID,
    status: "in_progress",
    assigneeId: ID,
    sprintId: ID,
    releaseId: ID,
    tagId: ID,
    blocked: true,
    workType: "defect",
  };

  it("serializes and parses every filter back to the same value", () => {
    const sp = applyActivityFilters(new URLSearchParams(), full);
    expect(parseActivityFilters(new URLSearchParams(sp.toString()))).toEqual(full);
  });

  it("keeps blocked=false distinct from unset", () => {
    const sp = applyActivityFilters(new URLSearchParams(), { blocked: false });
    expect(sp.get("blocked")).toBe("false");
    expect(parseActivityFilters(sp).blocked).toBe(false);
    expect(parseActivityFilters(new URLSearchParams()).blocked).toBeUndefined();
  });

  it("leaves unrelated params alone and clears removed filters", () => {
    const start = new URLSearchParams("tab=activities&activity=abc&status=done&sprintId=x");
    const next = applyActivityFilters(start, { status: "todo" });
    expect(next.get("tab")).toBe("activities");
    expect(next.get("activity")).toBe("abc");
    expect(next.get("status")).toBe("todo");
    expect(next.has("sprintId")).toBe(false);
  });

  it("ignores invalid enum values from a hand-edited URL", () => {
    const f = parseActivityFilters(new URLSearchParams("status=bogus&workType=nope&blocked=maybe"));
    expect(f).toEqual({});
  });

  it("produces a stable query string for bookmarking", () => {
    const a = applyActivityFilters(new URLSearchParams(), {
      status: "todo",
      subprojectId: ID,
    }).toString();
    const b = applyActivityFilters(new URLSearchParams(), {
      subprojectId: ID,
      status: "todo",
    }).toString();
    expect(a).toBe(b);
  });
});

describe("home filters round-trip", () => {
  it("keeps the group toggle tri-state: on, off, or unset (falls back to the remembered value)", () => {
    expect(parseHomeFilters(new URLSearchParams("group=1")).group).toBe(true);
    expect(parseHomeFilters(new URLSearchParams("group=0")).group).toBe(false);
    expect(parseHomeFilters(new URLSearchParams()).group).toBeUndefined();
    const sp = applyHomeFilters(new URLSearchParams(), {
      assigneeId: ID,
      subprojectId: ID,
      group: true,
    });
    expect(parseHomeFilters(sp)).toEqual({ assigneeId: ID, subprojectId: ID, group: true });
  });
});
