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
vi.mock("../auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAuth: () => ({ id: "pm1", role: "pm" }),
  useIsPm: () => true,
}));
import { api } from "../api/client";
import { KanoPage } from "./KanoPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQUEST = {
  id: "k1",
  projectId: "p1",
  code: "REQ-001",
  projectCode: "P1",
  projectName: "Infra",
  revisionRequest: "Add categories",
  specs: [],
  specsTotal: 0,
  specsCompleted: 0,
  completionPercent: 0,
  isComplete: false,
  kanoCategory: null,
  targetDate: null,
  responsibleId: null,
  responsibleName: null,
  createdAt: "2026-11-01T00:00:00Z",
};

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
});
beforeEach(() => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/projects") return Promise.resolve({ items: [{ id: "p1", name: "Infra" }] });
    if (url.includes("kano")) return Promise.resolve({ items: [REQUEST] });
    return Promise.resolve({ items: [] });
  });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

async function mount(path = "/kano") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(MantineProvider, null, createElement(KanoPage)),
        ),
      ),
    );
    await new Promise((r) => setTimeout(r, 30));
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
}

const checkedMode = () =>
  document.querySelector<HTMLInputElement>('[aria-label="View mode"] input:checked')?.value;

describe("Kano Request Tracker view mode", () => {
  it("opens on Cards by default and can switch to Table", async () => {
    await mount();
    expect(checkedMode()).toBe("card");
    expect(document.querySelector("table")).toBeNull();
    const table = document.querySelector<HTMLInputElement>(
      '[aria-label="View mode"] input[value="table"]',
    )!;
    await act(async () => {
      table.click();
      await Promise.resolve();
    });
    expect(checkedMode()).toBe("table");
    expect(document.querySelector("table")).not.toBeNull();
  });

  it("still honours an explicit ?view=table", async () => {
    await mount("/kano?view=table");
    expect(checkedMode()).toBe("table");
  });
});
