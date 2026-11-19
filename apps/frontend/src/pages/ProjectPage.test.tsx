// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { matchesWorkStatus, type WorkItem, type WorkSourceModule } from "@myapp/shared";

vi.mock("../api/client", () => ({
  api: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() },
  errorMessage: (e: unknown) => String(e),
  ApiClientError: class extends Error {},
}));
vi.mock("../auth", () => ({
  useIsPm: () => true,
  useAuth: () => ({ id: "me", role: "pm", fullName: "Paula Manager" }),
}));
import { api } from "../api/client";
import { ProjectPage } from "./ProjectPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (
  id: string,
  sourceModule: WorkSourceModule,
  over: Partial<WorkItem> = {},
): WorkItem => ({
  id,
  sourceModule,
  itemKind: "step",
  title: `${id} action`,
  parentTitle: `${id} parent`,
  projectId: "p1",
  subprojectId: null,
  assigneeId: "u1",
  assigneeName: "Klein",
  dueDate: "2026-12-20",
  isCompleted: false,
  completedAt: null,
  scheduleStatus: "ongoing_on_time",
  ...over,
});
// One action per module (none has a sprint, release or subproject), plus an unassigned, undated one.
const ITEMS: WorkItem[] = [
  item("usm-1", "user_story", { parentTitle: "Teacher › Sign in" }),
  item("ost-1", "ost", { assigneeId: "me", assigneeName: "Paula Manager" }),
  item("kano-1", "kano", { parentTitle: "REQ-001 Revise the form", scheduleStatus: "delayed" }),
  item("raid-1", "raid", {
    parentTitle: "RAID-04 Vendor risk",
    isCompleted: true,
    scheduleStatus: "completed_on_time",
  }),
  item("act-1", "project", {
    itemKind: "activity",
    parentTitle: null,
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    scheduleStatus: "no_due_date",
  }),
];

const cleanups: Array<() => void> = [];
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
  Element.prototype.scrollIntoView = () => undefined;
});

let served: WorkItem[] = ITEMS;
beforeEach(() => {
  served = ITEMS;
  vi.mocked(api.get).mockImplementation((url: string, params?: unknown) => {
    if (url === "/projects")
      return Promise.resolve({
        items: [{ id: "p1", name: "Infra", code: "PROJ-06", archivedAt: null }],
      });
    if (url === "/users")
      return Promise.resolve({
        items: [
          { id: "u1", fullName: "Klein", role: "team_member", isActive: true },
          { id: "me", fullName: "Paula Manager", role: "pm", isActive: true },
        ],
      });
    if (url === "/projects/p1/work-items") {
      // Stand in for the server: apply the same filters it does.
      const q = (params ?? {}) as { module?: string; status?: string; assigneeId?: string };
      const items = served
        .filter((i) => !q.module || i.sourceModule === q.module)
        .filter((i) => !q.assigneeId || i.assigneeId === q.assigneeId)
        .filter(
          (i) =>
            !q.status || matchesWorkStatus(i, q.status as Parameters<typeof matchesWorkStatus>[1]),
        );
      return Promise.resolve({ items, today: "2026-11-20" });
    }
    return Promise.resolve({ items: [] });
  });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};
async function mount(url = "/projects/p1") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [url] },
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(
            MantineProvider,
            null,
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/projects",
                element: createElement("div", null, "Projects list page"),
              }),
              createElement(Route, {
                path: "/projects/:projectId",
                element: createElement(ProjectPage),
              }),
            ),
          ),
        ),
      ),
    );
    return Promise.resolve();
  });
  await flush();
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
}

const rows = () =>
  [...document.querySelectorAll("[data-testid='work-item-row']")].map((r) => r.textContent ?? "");
const labels = () =>
  [...document.querySelectorAll("label")].map((l) => l.textContent?.trim() ?? "");
const buttonByText = (text: string) =>
  [...document.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === text);
const lastWorkItemsParams = () =>
  vi
    .mocked(api.get)
    .mock.calls.filter((c) => c[0] === "/projects/p1/work-items")
    .at(-1)?.[1];

describe("Project detail page", () => {
  it("has a back button that returns to the Projects list", async () => {
    await mount();
    const back = [...document.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Back to Projects"),
    );
    expect(back?.getAttribute("href")).toBe("/projects");
    expect(document.body.textContent).toContain("Infra");
    expect(document.body.textContent).toContain("PROJ-06");
    expect(document.body.textContent).not.toContain("WIP limit");
    await act(() => {
      back!.click();
      return Promise.resolve();
    });
    await flush();
    expect(document.body.textContent).toContain("Projects list page");
  });

  it("no longer shows Subprojects, Sprints or Releases tabs or filters", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    for (const gone of ["Subprojects", "Sprints", "Releases"])
      expect(text, gone).not.toContain(gone);
    expect(document.querySelectorAll("[role='tab']")).toHaveLength(0);
    const l = labels();
    for (const gone of ["Subproject", "Sprint", "Release", "Tag", "Work type"])
      expect(l, gone).not.toContain(gone);
    for (const kept of ["Module", "Status", "Assignee"]) expect(l, kept).toContain(kept);
    expect(buttonByText("Assigned to me")).toBeTruthy();
    expect(buttonByText("New activity")).toBeTruthy();
  });

  it("lists the project's actions from every module with owner, date and schedule status", async () => {
    await mount();
    const all = rows();
    expect(all).toHaveLength(5);
    const joined = all.join("|");
    for (const t of [
      "usm-1 action",
      "ost-1 action",
      "kano-1 action",
      "raid-1 action",
      "act-1 action",
    ])
      expect(joined).toContain(t);
    for (const pill of ["User Story Map", "OST", "Kano", "RAID", "Projects"])
      expect(joined).toContain(pill);
    expect(joined).toContain("Teacher › Sign in");
    expect(joined).toContain("REQ-001 Revise the form");
    expect(joined).toContain("RAID-04 Vendor risk");
    expect(all.find((r) => r.includes("act-1"))).toContain("Unassigned");
    expect(all.find((r) => r.includes("act-1"))).toContain("No due date");
    expect(all.find((r) => r.includes("usm-1"))).toContain("Klein");
    expect(all.find((r) => r.includes("kano-1"))).toContain("Delayed");
    expect(all.find((r) => r.includes("raid-1"))).toContain("Completed on time");
    expect(joined).not.toContain("No activities yet.");
  });

  it("filters by module, status and assignee through the URL and the request", async () => {
    await mount("/projects/p1?module=kano");
    expect(lastWorkItemsParams()).toMatchObject({ module: "kano" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain("kano-1 action");
    cleanups.pop()?.();

    await mount("/projects/p1?status=delayed");
    expect(lastWorkItemsParams()).toMatchObject({ status: "delayed" });
    expect(rows().map((r) => r.includes("kano-1"))).toEqual([true]);
    cleanups.pop()?.();

    await mount("/projects/p1?assignee=u1");
    expect(lastWorkItemsParams()).toMatchObject({ assigneeId: "u1" });
    expect(rows().join("|")).toContain("usm-1 action");
    expect(rows().join("|")).not.toContain("ost-1 action");
  });

  it("Assigned to me narrows the list to the signed-in user", async () => {
    await mount();
    await act(() => {
      (buttonByText("Assigned to me") as HTMLElement).click();
      return Promise.resolve();
    });
    await flush();
    expect(lastWorkItemsParams()).toMatchObject({ assigneeId: "me" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain("ost-1 action");
    expect(buttonByText("Clear filters")).toBeTruthy();
  });

  it("says 'No activities yet.' only when nothing exists, and a filter message when nothing matches", async () => {
    served = [];
    await mount();
    expect(document.body.textContent).toContain("No activities yet.");
    cleanups.pop()?.();
    served = ITEMS;
    await mount("/projects/p1?module=raid&assignee=me");
    expect(document.body.textContent).toContain("No activities match these filters.");
    expect(document.body.textContent).not.toContain("No activities yet.");
  });
});
