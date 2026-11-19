import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  createSubprojectSchema,
  updateProjectSchema,
  updateSubprojectSchema,
} from "@myapp/shared";

// The create forms no longer ask for a code, and the shared schemas drop one if a client sends it.
describe("system-generated project and subproject codes", () => {
  it("accepts a new project without a code", () => {
    const r = createProjectSchema.safeParse({ name: "Roadmap" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("code");
  });

  it("accepts a new subproject without a code", () => {
    const r = createSubprojectSchema.safeParse({ name: "Onboarding" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("code");
  });

  it("strips a client-supplied code on create", () => {
    const p = createProjectSchema.parse({ name: "X", code: "HACK" });
    const s = createSubprojectSchema.parse({ name: "Y", code: "HACK" });
    expect(p).not.toHaveProperty("code");
    expect(s).not.toHaveProperty("code");
  });

  it("does not allow editing the code", () => {
    expect(updateProjectSchema.parse({ name: "Z", code: "HACK" })).toEqual({ name: "Z" });
    expect(updateSubprojectSchema.parse({ name: "Z", code: "HACK" })).toEqual({ name: "Z" });
  });
});
