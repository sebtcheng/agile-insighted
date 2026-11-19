import { describe, expect, it } from "vitest";
import { visibleSections } from "./navSections";

describe("visibleSections", () => {
  it("groups items in order for a PM", () => {
    const s = visibleSections(true);
    expect(s.map((x) => x.items.map((i) => i.label))).toEqual([
      ["Home"],
      ["Workload", "Insights"],
      ["Portfolio", "Projects"],
      ["Opportunity Solution Tree", "User Story Mapping", "Kano Request Tracker", "RAID Log"],
      ["Settings"],
    ]);
  });

  it("omits the empty admin section for non-PMs", () => {
    const s = visibleSections(false);
    expect(s).toHaveLength(4);
    expect(s.some((x) => x.id === "admin")).toBe(false);
  });
});
