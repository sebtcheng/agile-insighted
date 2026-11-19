// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkItem, WorkSummary } from "@myapp/shared";
import { BreakdownTable, SummaryStrip, WorkItemRow } from "./WorkItems";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const summary: WorkSummary = {
  total: 5,
  completed: 2,
  incomplete: 3,
  completionRate: 40,
  ongoing: 1,
  onTime: 2,
  delayed: 2,
  unscheduled: 1,
};
const item: WorkItem = {
  id: "s1",
  sourceModule: "kano",
  itemKind: "step",
  title: "Update export spec",
  parentTitle: "REQ-001 Export",
  projectId: "p",
  subprojectId: null,
  assigneeId: "u",
  assigneeName: "Ben Cruz",
  dueDate: "2026-11-10",
  isCompleted: false,
  completedAt: null,
  scheduleStatus: "delayed",
};

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
});

function render(node: React.ReactElement): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  act(() => createRoot(el).render(createElement(MantineProvider, null, node)));
  return el;
}

describe("work item components", () => {
  it("shows the same status counts the API returned", () => {
    const el = render(createElement(SummaryStrip, { summary }));
    const text = el.textContent ?? "";
    expect(text).toContain("Ongoing1");
    expect(text).toContain("On time2");
    expect(text).toContain("Delayed2");
    expect(text).toContain("Completed2");
  });

  it("renders module, assignee and schedule status for a nested step", () => {
    const text = render(createElement(WorkItemRow, { item })).textContent ?? "";
    expect(text).toContain("Update export spec");
    expect(text).toContain("REQ-001 Export");
    expect(text).toContain("Ben Cruz");
    expect(text).toContain("Kano");
    expect(text).toContain("Delayed");
  });

  it("renders breakdown rows with completion rate", () => {
    const el = render(
      createElement(BreakdownTable, {
        title: "Module",
        rows: [{ key: "kano", label: "Kano", ...summary }],
      }),
    );
    expect(el.textContent).toContain("2 (40%)");
  });
});
