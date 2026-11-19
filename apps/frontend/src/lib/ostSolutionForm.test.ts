import { describe, expect, it } from "vitest";
import { formToSolutionInput, solutionToForm } from "./ostSolutionForm";

describe("OST solution dialog mapping", () => {
  it("opens with the saved target date and owner", () => {
    expect(solutionToForm({ title: "A", ownerId: "u1", targetDate: "2026-12-01" })).toEqual({
      title: "A",
      ownerId: "u1",
      targetDate: "2026-12-01",
    });
    expect(solutionToForm({ title: "A", ownerId: null, targetDate: null })).toMatchObject({
      ownerId: "",
      targetDate: "",
    });
  });
  it("sends the target date so it is saved, and null when it is cleared", () => {
    expect(formToSolutionInput({ title: "A", ownerId: "u1", targetDate: "2026-12-05" })).toEqual({
      title: "A",
      ownerId: "u1",
      targetDate: "2026-12-05",
    });
    expect(formToSolutionInput({ title: "A", ownerId: "", targetDate: "" })).toEqual({
      title: "A",
      ownerId: null,
      targetDate: null,
    });
  });
});
