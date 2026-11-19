import { describe, expect, it } from "vitest";
import type { OstTreeDto, SolutionDto } from "@myapp/shared";
import {
  isSolutionDone,
  outcomeSolutions,
  solutionProgress,
  statusForTick,
  withSolutionStatus,
} from "./ostOptimistic";

const sol = (
  id: string,
  opportunityId: string,
  validationStatus: SolutionDto["validationStatus"],
) => ({ id, opportunityId, validationStatus }) as SolutionDto;
const tree = (): OstTreeDto => ({
  outcomes: [],
  opportunities: [
    { id: "p1", outcomeId: "o1" },
    { id: "p2", outcomeId: "o2" },
  ] as OstTreeDto["opportunities"],
  solutions: [sol("s1", "p1", "validated"), sol("s2", "p1", "planned"), sol("s3", "p2", "planned")],
});

describe("solution ticking helpers", () => {
  it("maps tick state to a status and back", () => {
    expect(statusForTick(true)).toBe("validated");
    expect(statusForTick(false)).toBe("planned");
    expect(isSolutionDone({ validationStatus: "validated" })).toBe(true);
    expect(isSolutionDone({ validationStatus: "in_progress" })).toBe(false);
  });

  it("counts done solutions, with 0/0 for none", () => {
    expect(solutionProgress(tree().solutions)).toEqual({ done: 1, total: 3 });
    expect(solutionProgress([])).toEqual({ done: 0, total: 0 });
  });

  it("scopes solutions to one outcome through its opportunities", () => {
    expect(outcomeSolutions(tree(), "o1").map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(outcomeSolutions(tree(), "o2").map((s) => s.id)).toEqual(["s3"]);
  });

  it("returns a copy with one solution changed", () => {
    const t = tree();
    const next = withSolutionStatus(t, "s2", "validated");
    expect(next.solutions.find((s) => s.id === "s2")?.validationStatus).toBe("validated");
    expect(t.solutions.find((s) => s.id === "s2")?.validationStatus).toBe("planned");
  });
});
