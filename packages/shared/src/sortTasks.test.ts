import { describe, expect, it } from "vitest";
import { compareByStatusOngoingFirst, sortTasksOngoingFirst } from "./sortTasks";

describe("sortTasksOngoingFirst", () => {
  it("places ONGOING and incomplete items above COMPLETED / isCompleted items", () => {
    const items = [
      { id: "1", title: "Done item", status: "COMPLETED", isCompleted: true, dueDate: "2026-01-01" },
      { id: "2", title: "Ongoing item", status: "ONGOING", isCompleted: false, dueDate: "2026-02-01" },
      { id: "3", title: "Delayed item", status: "DELAYED", isCompleted: false, dueDate: "2026-01-15" },
      { id: "4", title: "Closed item", status: "DONE", isCompleted: false, dueDate: "2026-01-02" },
    ];
    const sorted = sortTasksOngoingFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(["2", "3", "1", "4"]);
    // Pure: original array is not mutated
    expect(items.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("orders items within the same bucket by dueDate ascending, then title, then id", () => {
    const a = { id: "a", title: "Alpha", status: "ONGOING", isCompleted: false, dueDate: "2026-03-01" };
    const b = { id: "b", title: "Beta", status: "ONGOING", isCompleted: false, dueDate: "2026-02-01" };
    expect(compareByStatusOngoingFirst(a, b)).toBeGreaterThan(0);
  });
});
