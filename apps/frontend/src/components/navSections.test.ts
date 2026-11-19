import { describe, expect, it } from "vitest";
import { visibleSections } from "./navSections";

describe("visibleSections", () => {
  it("groups items in order for a PM, with Projects directly under Workload in Overview", () => {
    const s = visibleSections(true);
    expect(s.map((x) => x.title)).toEqual(["Overview", "Agile & Discovery", "Administration"]);
    expect(s.map((x) => x.items.map((i) => i.label))).toEqual([
      ["Home", "Workload", "Projects"],
      [
        "User Story Mapping (USM)",
        "Opportunity Solution Tree (OST)",
        "RAID Log",
        "KANO Request Tracker",
      ],
      ["Settings"],
    ]);
  });

  it("points Projects at /projects and has no Portfolio item or Projects section", () => {
    const s = visibleSections(true);
    const items = s.flatMap((x) => x.items);
    expect(items.find((i) => i.label === "Projects")?.to).toBe("/projects");
    expect(items.some((i) => i.label === "Portfolio" || i.to === "/portfolio")).toBe(false);
    expect(s.some((x) => x.title === "Projects" || x.id === "delivery")).toBe(false);
  });

  it("has no Insights section or item", () => {
    const s = visibleSections(true);
    expect(s.some((x) => x.id === "insights" || x.title === "Insights")).toBe(false);
    expect(s.flatMap((x) => x.items).some((i) => i.label === "Insights")).toBe(false);
  });

  it("omits the empty admin section for non-PMs", () => {
    const s = visibleSections(false);
    expect(s).toHaveLength(2);
    expect(s.some((x) => x.id === "admin")).toBe(false);
    expect(s[0]?.items.map((i) => i.label)).toEqual(["Home", "Workload", "Projects"]);
  });
});
