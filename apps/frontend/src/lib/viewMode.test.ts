import { describe, expect, it } from "vitest";
import { parseViewMode } from "./viewMode";

describe("parseViewMode", () => {
  it("accepts the two known modes", () => {
    expect(parseViewMode("table", "card")).toBe("table");
    expect(parseViewMode("card", "table")).toBe("card");
  });

  it("falls back for missing or unknown values", () => {
    expect(parseViewMode(null, "table")).toBe("table");
    expect(parseViewMode(undefined, "card")).toBe("card");
    expect(parseViewMode("grid", "card")).toBe("card");
    expect(parseViewMode("", "table")).toBe("table");
  });
});
