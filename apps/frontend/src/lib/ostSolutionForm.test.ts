import { describe, expect, it } from "vitest";
import { formToSolutionInput, solutionToForm } from "./ostSolutionForm";

describe("OST solution dialog mapping", () => {
  it("opens with the saved sprint and owner, mapping a legacy date to its sprint", () => {
    expect(
      solutionToForm({ title: "A", ownerId: "u1", targetDate: null, sprintKey: "2026-S50" }),
    ).toEqual({
      title: "A",
      ownerId: "u1",
      sprintKey: "2026-S50",
    });
    expect(solutionToForm({ title: "A", ownerId: "u1", targetDate: "2026-12-01" }).sprintKey).toBe(
      "2026-S49",
    );
    expect(solutionToForm({ title: "A", ownerId: null, targetDate: null })).toMatchObject({
      ownerId: "",
      sprintKey: "",
    });
  });
  it("sends the sprint so it is saved, and null when it is cleared", () => {
    expect(formToSolutionInput({ title: "A", ownerId: "u1", sprintKey: "2026-S50" })).toEqual({
      title: "A",
      ownerId: "u1",
      sprintKey: "2026-S50",
    });
    expect(formToSolutionInput({ title: "A", ownerId: "", sprintKey: "" })).toEqual({
      title: "A",
      ownerId: null,
      sprintKey: null,
    });
  });
});
