import { describe, expect, it } from "vitest";
import { kanoCompletion } from "./kano";

describe("kanoCompletion", () => {
  it("treats zero specs as 0% and not complete", () => {
    expect(kanoCompletion([])).toEqual({
      specsTotal: 0,
      specsCompleted: 0,
      completionPercent: 0,
      isComplete: false,
    });
  });
  it("is complete only at 100%", () => {
    expect(kanoCompletion([{ isCompleted: true }, { isCompleted: false }])).toMatchObject({
      completionPercent: 50,
      isComplete: false,
    });
    expect(kanoCompletion([{ isCompleted: true }, { isCompleted: true }])).toMatchObject({
      completionPercent: 100,
      isComplete: true,
    });
  });
});
