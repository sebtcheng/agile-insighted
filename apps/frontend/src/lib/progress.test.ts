import { describe, expect, it } from "vitest";
import { completionLabel, completionPercent } from "./progress";

describe("completionPercent", () => {
  it("returns 0 for an empty total", () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionLabel(0, 0)).toBe("0% complete");
  });
  it("rounds to whole numbers", () => {
    expect(completionPercent(3, 5)).toBe(60);
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(2, 3)).toBe(67);
    expect(completionPercent(5, 5)).toBe(100);
    expect(completionLabel(0, 5)).toBe("0% complete");
  });
});
