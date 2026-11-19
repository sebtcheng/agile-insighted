import { describe, expect, it } from "vitest";
import { signSimulation, verifySimulation } from "./simulation";

const SECRET = "unit-test-secret-0123456789";

describe("simulation cookie", () => {
  it("round-trips for the same session token", () => {
    const cookie = signSimulation("tok-a", "user-1", SECRET);
    expect(verifySimulation("tok-a", cookie, SECRET)).toBe("user-1");
  });
  it("rejects a cookie replayed on another session", () => {
    const cookie = signSimulation("tok-a", "user-1", SECRET);
    expect(verifySimulation("tok-b", cookie, SECRET)).toBeNull();
  });
  it("rejects a tampered target id or unsigned value", () => {
    const sig = signSimulation("tok-a", "user-1", SECRET).split(".")[1];
    expect(verifySimulation("tok-a", `user-2.${sig}`, SECRET)).toBeNull();
    expect(verifySimulation("tok-a", "user-1", SECRET)).toBeNull();
    expect(verifySimulation("tok-a", undefined, SECRET)).toBeNull();
  });
});
