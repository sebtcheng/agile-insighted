// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryDorItemDto, StoryDto, StoryMapDto } from "@myapp/shared";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("../api/client", () => ({
  api: { patch: mocks.patch, post: mocks.post, delete: mocks.del, get: vi.fn(), put: vi.fn() },
}));
import { CompletionMeter } from "./CompletionMeter";
import { StoryReadyChecklist } from "./StoryReadyChecklist";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = ["story-map", "sub1"];
const baseItems = (): StoryDorItemDto[] => [
  { id: "i1", label: "Acceptance criteria written", isCompleted: true, sortOrder: 0 },
  { id: "i2", label: "Estimated", isCompleted: false, sortOrder: 1 },
];
const mapWith = (dorItems: StoryDorItemDto[]): StoryMapDto => ({
  personas: [],
  steps: [],
  stories: [
    {
      id: "s1",
      code: "USM-01",
      readyChecked: dorItems.filter((i) => i.isCompleted).length,
      readyTotal: dorItems.length,
      dorItems,
    } as StoryDto,
  ],
});

const cleanups: Array<() => void> = [];
let server: StoryDorItemDto[];

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
beforeEach(() => {
  server = baseItems();
  mocks.patch.mockReset();
  mocks.post.mockReset();
  mocks.del.mockReset();
  mocks.patch.mockImplementation((url: string, body: { isCompleted: boolean }) => {
    const id = url.split("/").pop();
    server = server.map((i) => (i.id === id ? { ...i, isCompleted: body.isCompleted } : i));
    return Promise.resolve({});
  });
  mocks.post.mockImplementation((_url: string, body: { label: string }) => {
    const item = { id: `n${server.length}`, label: body.label, isCompleted: false, sortOrder: 9 };
    server = [...server, item];
    return Promise.resolve({ item });
  });
  mocks.del.mockImplementation((url: string) => {
    const id = url.split("/").pop();
    server = server.filter((i) => i.id !== id);
    return Promise.resolve({});
  });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  document.body.innerHTML = "";
});

const flush = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
};

/** Mirrors the drawer: the checklist and the card meter both read the same cached map row. */
function Harness({ canTick }: { canTick: boolean }) {
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => Promise.resolve(mapWith(structuredClone(server))),
  });
  const story = q.data?.stories[0];
  if (!story) return null;
  return createElement(
    "div",
    null,
    createElement(CompletionMeter, { done: story.readyChecked, total: story.readyTotal }),
    createElement(StoryReadyChecklist, { story, subprojectId: "sub1", canTick }),
  );
}

async function mount(canTick = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(MantineProvider, null, createElement(Harness, { canTick })),
      ),
    ),
  );
  cleanups.push(() => act(() => root.unmount()));
  await flush();
  return host;
}

const boxes = (h: HTMLElement) => [...h.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
const input = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>('input[aria-label="New Definition of Ready criterion"]')!;
const typeInto = (el: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.bind(el);
  act(() => {
    set(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("StoryReadyChecklist", () => {
  it("renders every criterion with its state and a dynamic (X/Y) header", async () => {
    const host = await mount();
    expect(boxes(host).map((b) => b.checked)).toEqual([true, false]);
    expect(host.textContent).toContain("Definition of Ready (1/2)");
    expect(host.textContent).toContain("50% complete");
  });

  it("ticking a criterion patches it and updates the count and percentage", async () => {
    const host = await mount();
    act(() => boxes(host)[1]?.click());
    await flush();
    expect(mocks.patch).toHaveBeenCalledWith("/stories/s1/dor-items/i2", { isCompleted: true });
    expect(host.textContent).toContain("Definition of Ready (2/2)");
    expect(host.textContent).toContain("100% complete");
  });

  it("adds a criterion with the button or Enter and recalculates the total", async () => {
    const host = await mount();
    typeInto(input(host), "Security reviewed");
    act(() => {
      input(host).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(mocks.post).toHaveBeenCalledWith("/stories/s1/dor-items", {
      label: "Security reviewed",
    });
    expect(host.textContent).toContain("Security reviewed");
    expect(host.textContent).toContain("Definition of Ready (1/3)");
    expect(host.textContent).toContain("33% complete");
    expect(input(host).value).toBe("");

    typeInto(input(host), "Wireframes");
    const add = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Add criterion",
    )!;
    act(() => add.click());
    await flush();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Definition of Ready (1/4)");
  });

  it("does not add a blank criterion", async () => {
    const host = await mount();
    typeInto(input(host), "   ");
    act(() => {
      input(host).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("removes a criterion and recalculates", async () => {
    const host = await mount();
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Remove Estimated"]')!;
    act(() => remove.click());
    await flush();
    expect(mocks.del).toHaveBeenCalledWith("/stories/s1/dor-items/i2");
    expect(host.textContent).toContain("Definition of Ready (1/1)");
    expect(host.textContent).toContain("100% complete");
  });

  it("rolls a failed tick back", async () => {
    mocks.patch.mockImplementation(() => Promise.reject(new Error("nope")));
    const host = await mount();
    act(() => boxes(host)[1]?.click());
    await flush();
    expect(boxes(host).map((b) => b.checked)).toEqual([true, false]);
    expect(host.textContent).toContain("Definition of Ready (1/2)");
  });

  it("is read-only when the user cannot tick", async () => {
    const host = await mount(false);
    expect(boxes(host).every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('input[aria-label="New Definition of Ready criterion"]')).toBeNull();
    expect(host.querySelector('button[aria-label^="Remove"]')).toBeNull();
  });
});
