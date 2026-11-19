// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KanoDto } from "@myapp/shared";

vi.mock("../api/client", () => ({
  api: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() },
}));
import { api } from "../api/client";
import { EditModal, SubmitModal } from "./KanoPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USERS = [
  { id: "u-pm", fullName: "Paula Manager", role: "pm", isActive: true },
  { id: "u-tm", fullName: "Tomas Member", role: "team_member", isActive: true },
  { id: "u-off", fullName: "Gone Person", role: "team_member", isActive: false },
];
const request = {
  id: "k1",
  projectId: "p1",
  code: "REQ-001",
  projectName: "Infra",
  revisionRequest: "Add categories",
  specs: [],
  kanoCategory: null,
  targetDate: null,
  responsibleId: "u-tm",
  responsibleName: "Tomas Member",
} as unknown as KanoDto;

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
    if (url === "/users") return Promise.resolve({ items: USERS });
    return Promise.resolve({ items: [] });
  });
  vi.mocked(api.post).mockResolvedValue({});
  vi.mocked(api.patch).mockResolvedValue({});
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

async function mount(node: ReturnType<typeof createElement>) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(MantineProvider, null, node),
        ),
      ),
    );
    await Promise.resolve();
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
}

const field = () =>
  document.querySelector<HTMLInputElement>(
    'input[aria-haspopup="listbox"][data-path="responsibleId"]',
  ) ??
  [...document.querySelectorAll<HTMLInputElement>("input")].find((i) =>
    i.closest(".mantine-InputWrapper-root")?.textContent?.startsWith("Person responsible"),
  )!;

async function pick(label: string) {
  await act(async () => {
    field().click();
    await Promise.resolve();
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (o) => o.textContent === label,
  );
  expect(option, `option ${label}`).toBeTruthy();
  await act(async () => {
    option!.click();
    await Promise.resolve();
  });
}

describe("Kano Person responsible", () => {
  it("submit modal lists active PMs and team members and posts the chosen id", async () => {
    await mount(createElement(SubmitModal, { opened: true, onClose: vi.fn(), projectId: "p1" }));
    expect(field()).toBeTruthy();
    await act(async () => {
      field().click();
      await Promise.resolve();
    });
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Paula Manager", "Tomas Member"]));
    expect(labels).not.toContain("Gone Person");
    await pick("Paula Manager");
    const textarea = document.querySelector("textarea")!;
    // React tracks the native value setter, so call it directly to fire onChange.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set as (
      this: HTMLTextAreaElement,
      v: string,
    ) => void;
    act(() => {
      setter.call(textarea, "Need a thing");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining("/kano"),
      expect.objectContaining({ revisionRequest: "Need a thing", responsibleId: "u-pm" }),
    );
  });

  it("edit modal pre-populates the assignee and patches a change", async () => {
    await mount(createElement(EditModal, { request, onClose: vi.fn() }));
    expect(field().value).toBe("Tomas Member");
    await pick("Paula Manager");
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(api.patch).toHaveBeenCalledWith(
      expect.stringContaining("k1"),
      expect.objectContaining({ responsibleId: "u-pm" }),
    );
  });
});
