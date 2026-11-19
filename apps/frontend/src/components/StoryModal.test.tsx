// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { storyCompletion, type StoryDto, type StoryMapDto, type UserDto } from "@myapp/shared";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("../api/client", () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: vi.fn(), put: vi.fn() },
  ApiClientError: class extends Error {},
}));
import { StoryModal, staffOptions } from "./StoryModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USERS: UserDto[] = [
  { id: "u1", email: "a@x", fullName: "Ana Reyes", role: "pm", isActive: true },
  { id: "u2", email: "b@x", fullName: "Ben Cruz", role: "team_member", isActive: true },
  { id: "u3", email: "c@x", fullName: "Cal Dean", role: "team_member", isActive: false },
];
const MAP: StoryMapDto = { personas: [], steps: [], stories: [] };
const MAP_WITH_STEP: StoryMapDto = {
  personas: [],
  steps: [{ id: "js1", projectId: "p1", parentStepId: null, name: "Sign in", position: 0 }],
  stories: [],
};
const RELEASE = {
  id: "r1",
  name: "R1",
  isMvp: false,
  targetDate: null,
  status: "planned",
  position: 0,
};
let releases: unknown[] = [];
const steps = [
  {
    id: "st1",
    label: "Write the API",
    isCompleted: true,
    completedAt: "2026-11-01T00:00:00.000Z",
    targetDate: "2026-12-01",
    responsibleId: "u2",
    responsibleName: "Ben Cruz",
    sortOrder: 0,
  },
];
const existing = {
  id: "s1",
  projectId: "p1",
  projectCode: "PRJ-01",
  projectName: "Campus Portal",
  code: "USM-01",
  story: "As a teacher, I want a view",
  acceptanceCriteria: null,
  personaId: null,
  personaName: null,
  journeyStepId: null,
  workType: "feature",
  releaseId: null,
  releaseName: null,
  isMvp: false,
  sprintId: null,
  sprintName: null,
  storyPoints: null,
  status: "in_progress",
  position: 0,
  responsibleId: "u1",
  responsibleName: "Ana Reyes",
  targetDate: "2026-12-15",
  actionSteps: steps,
  ...storyCompletion(steps),
  linkedActivities: 0,
} as StoryDto;

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
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.patch.mockReset();
  mocks.get.mockImplementation((url: string) => {
    if (url === "/users") return Promise.resolve({ items: USERS });
    if (url === "/projects")
      return Promise.resolve({ items: [{ id: "p1", name: "Campus Portal", archivedAt: null }] });
    if (url === "/projects/p1/releases") return Promise.resolve({ items: releases });
    return Promise.resolve({ items: [] });
  });
  releases = [];
  mocks.post.mockResolvedValue(existing);
  mocks.patch.mockResolvedValue(existing);
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  document.body.innerHTML = "";
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function mount(
  story?: StoryDto,
  opts: { map?: StoryMapDto; stepId?: string; releaseId?: string; isPm?: boolean } = {},
) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const onClose = vi.fn();
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          MantineProvider,
          null,
          createElement(StoryModal, {
            opened: true,
            onClose,
            story,
            map: opts.map ?? MAP,
            defaultProjectId: "p1",
            defaultStepId: opts.stepId,
            defaultReleaseId: opts.releaseId,
            isPm: opts.isPm ?? true,
          }),
        ),
      ),
    );
  });
  cleanups.push(() => act(() => root.unmount()));
  await flush();
  return { onClose };
}

/** Sets a controlled input's value the way a user would. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const byLabel = <T extends Element>(label: string) =>
  document.querySelector<T>(`[aria-label="${label}"]`);
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
const submit = async () => {
  act(() => {
    document.querySelector("form")?.requestSubmit();
  });
  await flush();
};

describe("staffOptions", () => {
  it("lists active Team Members and PMs, keeping already-assigned inactive people", () => {
    expect(staffOptions(USERS, []).map((o) => o.label)).toEqual(["Ana Reyes", "Ben Cruz"]);
    expect(staffOptions(USERS, ["u3"]).map((o) => o.label)).toEqual([
      "Ana Reyes",
      "Ben Cruz",
      "Cal Dean",
    ]);
  });
});

describe("StoryModal", () => {
  it("lays out the wide modal with project, owner, date and the action steps editor", async () => {
    await mount();
    const labels = [...document.querySelectorAll("label")].map((l) => l.textContent?.trim());
    for (const l of [
      "Story title",
      "Project",
      "Person responsible",
      "Target date",
      "Release",
      "Journey step",
    ]) {
      expect(labels).toContain(l);
    }
    expect(document.body.textContent).toContain("Action steps");
    expect(button("Add step")).toBeDefined();
  });

  it("creates a story with its project, journey step, release and target date", async () => {
    releases = [RELEASE];
    await mount(undefined, { map: MAP_WITH_STEP, stepId: "js1", releaseId: "r1" });
    type(document.querySelector("textarea")!, "As a parent, I want alerts");
    const date = [...document.querySelectorAll<HTMLInputElement>('input[type="date"]')][0]!;
    type(date, "2026-12-20");
    await submit();
    expect(mocks.post).toHaveBeenCalledWith(
      "/stories",
      expect.objectContaining({
        projectId: "p1",
        journeyStepId: "js1",
        releaseId: "r1",
        story: "As a parent, I want alerts",
        targetDate: "2026-12-20",
        responsibleId: null,
        actionSteps: [],
      }),
    );
  });

  it("refuses a step without a staff member and date", async () => {
    releases = [RELEASE];
    await mount(undefined, { map: MAP_WITH_STEP, stepId: "js1", releaseId: "r1" });
    type(document.querySelector("textarea")!, "As a parent, I want alerts");
    act(() => button("Add step")?.click());
    type(byLabel<HTMLInputElement>("Step 1")!, "Draft the copy");
    await submit();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Every action step needs a staff member responsible and a target date",
    );
  });

  it("edits a story and sends owner, date and the full step list", async () => {
    await mount(existing);
    expect(byLabel<HTMLInputElement>("Step 1")?.value).toBe("Write the API");
    expect(byLabel<HTMLInputElement>("Step 1 done")?.checked).toBe(true);
    type(byLabel<HTMLInputElement>("Step 1")!, "Write and test the API");
    await submit();
    expect(mocks.patch).toHaveBeenCalledWith(
      "/stories/s1",
      expect.objectContaining({
        responsibleId: "u1",
        targetDate: "2026-12-15",
        status: "in_progress",
        actionSteps: [
          {
            id: "st1",
            label: "Write and test the API",
            isCompleted: true,
            responsibleId: "u2",
            targetDate: "2026-12-01",
          },
        ],
      }),
    );
  });

  it("blocks adding a story without a journey step and release, with inline feedback", async () => {
    releases = [RELEASE];
    await mount(undefined, { map: MAP_WITH_STEP });
    type(document.querySelector("textarea")!, "As a parent, I want alerts");
    await submit();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Choose a journey step");
    expect(document.body.textContent).toContain("Choose a release");
  });

  it("shows prerequisite quick-create when the project has no steps or releases, and selects what it creates", async () => {
    mocks.post.mockImplementation((url: string) =>
      Promise.resolve({ id: url.endsWith("/releases") ? "newR" : "newS" }),
    );
    await mount();
    expect(document.querySelector('[data-prereq="release"]')?.textContent).toContain(
      "no releases yet",
    );
    expect(document.querySelector('[data-prereq="step"]')?.textContent).toContain(
      "no journey steps yet",
    );
    type(byLabel<HTMLInputElement>("New release name")!, "MVP");
    act(() => button("Add release")?.click());
    await flush();
    expect(mocks.post).toHaveBeenCalledWith("/projects/p1/releases", {
      name: "MVP",
      targetDate: null,
    });
    type(byLabel<HTMLInputElement>("New journey step name")!, "Sign in");
    act(() => button("Add journey step")?.click());
    await flush();
    expect(mocks.post).toHaveBeenCalledWith("/projects/p1/journey-steps", {
      name: "Sign in",
      parentStepId: undefined,
    });
    type(document.querySelector("textarea")!, "As a parent, I want alerts");
    await submit();
    expect(mocks.post).toHaveBeenLastCalledWith(
      "/stories",
      expect.objectContaining({ journeyStepId: "newS", releaseId: "newR", projectId: "p1" }),
    );
  });

  it("tells team members to ask a PM instead of offering quick-create", async () => {
    await mount(undefined, { isPm: false });
    expect(document.querySelector('[data-prereq="release"]')?.textContent).toContain(
      "Ask a project manager",
    );
    expect(byLabel("New release name")).toBeNull();
  });

  it("hides the prerequisite helpers once the project has both", async () => {
    releases = [RELEASE];
    await mount(undefined, { map: MAP_WITH_STEP });
    expect(document.querySelector("[data-prereq]")).toBeNull();
  });
});
