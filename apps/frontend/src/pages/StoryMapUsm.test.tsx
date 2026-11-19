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
  description: null as string | null,
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
const pressEnter = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(() => {
    el?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    return Promise.resolve();
  });
  await flush();
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
    await click(byAria("Move step 1 right"));
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
    expect(buttonByText("Save")).toBeUndefined();
    await pressEnter(byLabel("New feature"));
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

describe("Add user flow", () => {
  const person = (id: string, name: string, sortOrder: number) => ({
    id,
    projectId: "p1",
    name,
    description: null,
    sortOrder,
  });
  let personas: ReturnType<typeof person>[] = [];
  beforeEach(() => {
    personas = [];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/projects")
        return Promise.resolve({
          items: [
            { id: "p1", name: "AGAP Applicant", archivedAt: null },
            { id: "p2", name: "Other", archivedAt: null },
          ],
        });
      if (url === "/users") return Promise.resolve({ items: USERS });
      if (url === "/story-map/personas") return Promise.resolve({ items: personas });
      if (url === "/story-map/steps") return Promise.resolve({ items: STEPS });
      return Promise.resolve({ items: [] });
    });
  });
  const submitButton = () => buttonByText("Add user");
  const emptyText = "No users yet. Add one to start mapping their journey.";

  it("uses the first project that the selector shows, without it being picked by hand", async () => {
    await mount();
    expect(document.body.textContent).toContain(emptyText);
    await setValue(byLabel("New user name"), "Teacher");
    await click(submitButton());
    expect(posted("/story-map/personas")).toEqual([{ projectId: "p1", name: "Teacher" }]);
  });

  it("shows inline validation and focuses the input when the name is empty", async () => {
    await mount();
    await setValue(byLabel("New user name"), "   ");
    await click(submitButton());
    expect(posted("/story-map/personas")).toEqual([]);
    expect(document.body.textContent).toContain("Enter a user or role");
    expect(document.activeElement).toBe(byLabel("New user name"));
  });

  it("creates the user, clears the input, replaces the empty state and selects the new user", async () => {
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url !== "/story-map/personas") return Promise.resolve({});
      const created = person("per9", "Admin", 0);
      personas = [created];
      return Promise.resolve(created);
    });
    await mount();
    await setValue(byLabel("New user name"), "  Admin ");
    await click(submitButton());
    expect(posted("/story-map/personas")).toEqual([{ projectId: "p1", name: "Admin" }]);
    expect(byLabel("New user name")?.value).toBe("");
    expect(document.body.textContent).not.toContain(emptyText);
    const tab = buttonByText("Admin");
    expect(tab?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelectorAll("[data-step]").length).toBe(2);
  });

  it("surfaces a server error inline and re-enables the button", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("A user with that name already exists"));
    await mount();
    await setValue(byLabel("New user name"), "Teacher");
    await click(submitButton());
    expect(document.body.textContent).toContain("A user with that name already exists");
    expect(byLabel("New user name")?.value).toBe("Teacher");
    expect(submitButton()?.hasAttribute("disabled")).toBe(false);
    expect(submitButton()?.hasAttribute("data-loading")).toBe(false);
  });
});

describe("Horizontal step track", () => {
  const fl = (id: string, done: boolean) =>
    feature({ id, stepId: "x", title: id, isCompleted: done, targetDate: null });
  let track: ReturnType<typeof step>[] = [];
  beforeEach(() => {
    track = [
      step("a", "Register", 0, []),
      step("b", "Login", 1, [fl("b1", true), fl("b2", false)]),
      step("c", "Browse", 2, [fl("c1", true), fl("c2", true)]),
      step("d", "Checkout", 3, [fl("d1", false), fl("d2", false), fl("d3", false)]),
    ];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/projects")
        return Promise.resolve({ items: [{ id: "p1", name: "Infra", archivedAt: null }] });
      if (url === "/users") return Promise.resolve({ items: USERS });
      if (url === "/story-map/personas")
        return Promise.resolve({
          items: [
            { id: "per1", projectId: "p1", name: "Teacher", description: null, sortOrder: 0 },
          ],
        });
      if (url === "/story-map/steps") return Promise.resolve({ items: track });
      return Promise.resolve({ items: [] });
    });
  });
  const order = () =>
    [...document.querySelectorAll("[data-step]")].map((c) => c.getAttribute("data-step"));
  const numbers = () =>
    [...document.querySelectorAll(".usm-step-number")].map((n) => n.textContent);
  const grip = (id: string) => document.querySelector<HTMLElement>(`[data-grip="${id}"]`);
  const slot = (id: string) =>
    document.querySelector(`[data-step="${id}"]`)?.closest<HTMLElement>(".usm-slot");
  const fire = (type: string, el: Element | null | undefined) =>
    act(() => {
      expect(el).toBeTruthy();
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", {
        value: {
          setData: () => undefined,
          setDragImage: () => undefined,
          effectAllowed: "",
          dropEffect: "",
        },
      });
      el!.dispatchEvent(ev);
      return Promise.resolve();
    });
  const dragTo = async (from: string, to: string) => {
    await fire("dragstart", grip(from));
    await fire("dragover", slot(to));
    await fire("drop", slot(to));
    await fire("dragend", grip(from));
    await flush();
  };

  it("lays the steps out in a horizontal track with large numbers and completion states", async () => {
    await mount();
    expect(document.querySelector(".usm-track")).toBeTruthy();
    expect(order()).toEqual(["a", "b", "c", "d"]);
    expect(numbers()).toEqual(["1", "2", "3", "4"]);
    const card = (id: string) => document.querySelector(`[data-step="${id}"]`);
    const state = (id: string) =>
      card(id)?.querySelector("[data-state]")?.getAttribute("data-state");
    expect(card("a")?.textContent).toContain("0/0 features completed");
    expect(state("a")).toBe("No features");
    expect(card("b")?.textContent).toContain("1/2 features completed");
    expect(state("b")).toBe("In progress");
    expect(card("c")?.textContent).toContain("2/2 features completed");
    expect(state("c")).toBe("Complete");
    expect(card("d")?.textContent).toContain("0/3 features completed");
    expect(state("d")).toBe("Not started");
    const bar = (id: string) => card(id)?.querySelector("[role='progressbar']");
    expect(bar("b")?.getAttribute("aria-valuenow")).toBe("50");
    expect(bar("c")?.getAttribute("aria-valuenow")).toBe("100");
    expect(bar("a")?.getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows the step description as a subtitle under the title, and nothing when it is empty", async () => {
    track[1] = { ...track[1]!, description: "Existing users sign in with email" };
    await mount();
    const sub = (id: string) => document.querySelector(`[data-step="${id}"] .usm-step-desc`);
    expect(sub("b")?.textContent).toBe("Existing users sign in with email");
    expect(sub("a")).toBeNull();
  });

  it("drags a card to any position and sends the exact new order", async () => {
    await mount();
    await dragTo("a", "d");
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/steps/reorder", {
      projectId: "p1",
      personaId: "per1",
      stepIds: ["b", "c", "d", "a"],
    });
    vi.mocked(api.patch).mockClear();
    await dragTo("d", "b");
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/steps/reorder", {
      projectId: "p1",
      personaId: "per1",
      stepIds: ["a", "d", "b", "c"],
    });
  });

  it("shows the new order and numbers at once, then rolls back with an inline error on failure", async () => {
    let fail: (e: Error) => void = () => undefined;
    vi.mocked(api.patch).mockImplementation(() => new Promise((_, reject) => void (fail = reject)));
    await mount();
    await dragTo("a", "c");
    expect(order()).toEqual(["b", "c", "a", "d"]);
    expect(numbers()).toEqual(["1", "2", "3", "4"]);
    await act(() => {
      fail(new Error("Reorder refused"));
      return Promise.resolve();
    });
    await flush();
    expect(order()).toEqual(["a", "b", "c", "d"]);
    expect(document.body.textContent).toContain("Reorder refused");
  });

  it("offers left and right buttons as a fallback", async () => {
    await mount();
    expect(byAria("Move step 1 left")?.hasAttribute("disabled")).toBe(true);
    expect(byAria("Move step 4 right")?.hasAttribute("disabled")).toBe(true);
    await click(byAria("Move step 2 left"));
    expect(vi.mocked(api.patch)).toHaveBeenCalledWith("/story-map/steps/reorder", {
      projectId: "p1",
      personaId: "per1",
      stepIds: ["b", "a", "c", "d"],
    });
  });

  it("opens the checklist from the card body but never from the drag handle", async () => {
    await mount();
    await click(grip("b"));
    await fire("dragstart", grip("b"));
    await fire("dragend", grip("b"));
    expect(document.body.textContent).not.toContain("Feature checklist");
    await click(document.querySelector("[data-step='b'] .usm-step-number"));
    expect(document.body.textContent).toContain("Feature checklist");
  });

  it("keeps a + slot before, between and after the cards with the exact insert index", async () => {
    await mount();
    for (let at = 1; at <= 5; at++) expect(byAria(`Insert step at position ${at}`)).toBeTruthy();
    await click(byAria("Insert step at position 3"));
    await setValue(stepInput(), "Compare");
    await click(buttonByText("Add"));
    expect(posted("/story-map/steps").at(-1)).toMatchObject({ title: "Compare", insertAtIndex: 2 });
    await click(byAria("Insert step at position 5"));
    await setValue(stepInput(), "Pay");
    await click(buttonByText("Add"));
    expect(posted("/story-map/steps").at(-1)).toMatchObject({ title: "Pay", insertAtIndex: 4 });
  });
});

describe("Feature checklist Enter key", () => {
  const openStep = async () => {
    await mount();
    await click(document.querySelector('[data-step="s1"]'));
  };
  it("adds the next feature when Enter is pressed in a feature row, with no Save button", async () => {
    await openStep();
    expect(byLabel("New feature")).toBeNull();
    await pressEnter(byLabel("Feature 1"));
    expect(byLabel("New feature")).toBeTruthy();
    expect(document.activeElement).toBe(byLabel("New feature"));
    expect(buttonByText("Save")).toBeUndefined();
  });
  it("creates the typed feature on Enter and opens another empty row", async () => {
    await openStep();
    await click(buttonByText("Add feature"));
    await setValue(byLabel("New feature"), "Reset password");
    await pressEnter(byLabel("New feature"));
    expect(posted("/story-map/features")).toEqual([
      {
        projectId: "p1",
        stepId: "s1",
        title: "Reset password",
        targetDate: null,
        responsibleId: null,
      },
    ]);
    expect(byLabel("New feature")?.value).toBe("");
    await pressEnter(byLabel("New feature"));
    expect(posted("/story-map/features")).toHaveLength(1);
  });
});
