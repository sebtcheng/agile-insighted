// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({
  api: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() },
  errorMessage: (e: unknown) => String(e),
  ApiClientError: class extends Error {},
}));
vi.mock("../auth", () => ({ useIsPm: () => true, useAuth: () => ({ role: "pm" }) }));
import { api } from "../api/client";
import { StoryMapPage } from "./StoryMapPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USERS = [{ id: "u-tm", fullName: "Tomas Member", role: "team_member", isActive: true }];
const feature = (over: Record<string, unknown>) => ({
  id: "f1",
  projectId: "p1",
  stepId: "s1",
  title: "Sign-in form",
  isCompleted: false,
  completedAt: null,
  responsibleId: "u-tm",
  responsibleName: "Tomas Member",
  targetDate: "2000-01-01",
  sortOrder: 0,
  ...over,
});
const step = (id: string, title: string, sortOrder: number, features: unknown[] = []) => ({
  id,
  projectId: "p1",
  personaId: "per1",
  title,
  description: null,
  sortOrder,
  features,
});
const STEPS = [
  step("s1", "Open the app", 0, [
    feature({}),
    feature({ id: "f2", title: "Logo", isCompleted: true, targetDate: null }),
  ]),
  step("s2", "Find a class", 1),
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
beforeEach(() => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/projects")
      return Promise.resolve({ items: [{ id: "p1", name: "Infra", archivedAt: null }] });
    if (url === "/users") return Promise.resolve({ items: USERS });
    if (url === "/story-map/personas")
      return Promise.resolve({
        items: [
          { id: "per1", projectId: "p1", name: "Teacher", description: null, sortOrder: 0 },
          { id: "per2", projectId: "p1", name: "Parent", description: null, sortOrder: 1 },
        ],
      });
    if (url === "/story-map/steps") return Promise.resolve({ items: STEPS });
    return Promise.resolve({ items: [] });
  });
  vi.mocked(api.post).mockResolvedValue({ id: "new" });
  vi.mocked(api.patch).mockResolvedValue({});
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/usm?project=p1"] },
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(MantineProvider, null, createElement(StoryMapPage)),
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

const byLabel = (label: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
const stepInput = () =>
  document.querySelector<HTMLInputElement>('input[placeholder="e.g. Sign in to the app"]');
const byAria = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(() => {
    (el as HTMLElement).click();
    return Promise.resolve();
  });
  await flush();
};
const setValue = async (el: HTMLInputElement | null, v: string) => {
  expect(el).toBeTruthy();
  await act(() => {
    // React tracks the native value setter, so call it directly to fire onChange.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
    return Promise.resolve();
  });
};
const posted = (url: string) =>
  vi
    .mocked(api.post)
    .mock.calls.filter((c) => c[0] === url)
    .map((c) => c[1]);

describe("User Story Mapping page", () => {
  it("shows users, ordered step cards with progress, and no legacy release or story-point controls", async () => {
    await mount();
    expect(buttonByText("Teacher")).toBeTruthy();
    expect(buttonByText("Parent")).toBeTruthy();
    const cards = [...document.querySelectorAll("[data-step]")];
    expect(cards.map((c) => c.getAttribute("data-step"))).toEqual(["s1", "s2"]);
    expect(cards[0]?.textContent).toContain("1/2 features completed");
    expect(cards[0]?.textContent).toContain("1 overdue");
    expect(cards[1]?.textContent).toContain("0/0 features completed");
    const text = document.body.textContent ?? "";
    for (const legacy of ["Release", "Story points", "Acceptance criteria", "Add story"]) {
      expect(text, legacy).not.toContain(legacy);
    }
  });

  it("adds several users to one project", async () => {
    await mount();
    await setValue(byLabel("New user name"), "Admin");
    await click(buttonByText("Add user"));
    expect(posted("/story-map/personas")).toEqual([{ projectId: "p1", name: "Admin" }]);
  });

  it("adds a step at the end and inserts one mid-flow", async () => {
    await mount();
    await click(buttonByText("Add step"));
    await setValue(stepInput(), "Check grades");
    await click(buttonByText("Add"));
    expect(posted("/story-map/steps")[0]).toEqual({
      projectId: "p1",
      personaId: "per1",
      title: "Check grades",
      insertAtIndex: undefined,
    });
    await click(byAria("Insert step at position 2"));
    await setValue(stepInput(), "Pick a seat");
    await click(buttonByText("Add"));
    expect(posted("/story-map/steps")[1]).toMatchObject({ title: "Pick a seat", insertAtIndex: 1 });
  });

  it("reorders step cards through the atomic reorder endpoint", async () => {
    await mount();
    await click(byAria("Move step 1 later"));
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/steps/reorder", {
      projectId: "p1",
      personaId: "per1",
      stepIds: ["s2", "s1"],
    });
  });

  it("opens the feature checklist from a card and persists ticks, dates and new features", async () => {
    await mount();
    await click(document.querySelector("[data-step='s1']"));
    expect(byLabel("Feature 1")?.value).toBe("Sign-in form");
    expect(byLabel("Feature 1 person responsible")).toBeTruthy();

    await click(byLabel("Feature 1 done"));
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/features/f1", {
      isCompleted: true,
    });

    await setValue(byLabel("Feature 1 target date"), "2026-12-24");
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/features/f1", {
      targetDate: "2026-12-24",
    });

    await click(buttonByText("Add feature"));
    await setValue(byLabel("New feature"), "Forgot password link");
    await setValue(byLabel("New feature target date"), "2026-12-30");
    await click(buttonByText("Save"));
    expect(posted("/story-map/features")).toEqual([
      {
        projectId: "p1",
        stepId: "s1",
        title: "Forgot password link",
        targetDate: "2026-12-30",
        responsibleId: null,
      },
    ]);
  });
});
