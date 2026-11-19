// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MitigatingActionsField, type MitigatingActionDraft } from "./MitigatingActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];
beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

const staff = [
  { value: "u1", label: "Ben Cruz" },
  { value: "u2", label: "Ana Reyes" },
];

function mount(value: MitigatingActionDraft[], onChange = vi.fn()) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          MantineProvider,
          null,
          createElement(MitigatingActionsField, { value, onChange, staffOptions: staff }),
        ),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return { el, onChange };
}

describe("MitigatingActionsField target dates", () => {
  it("shows each action's date and reports edits", () => {
    const { el, onChange } = mount([
      {
        id: "a1",
        description: "Do it",
        isCompleted: false,
        targetDate: "2026-12-31",
        responsibleId: "u1",
      },
    ]);
    const input = el.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(input.value).toBe("2026-12-31");
    expect(input.required).toBe(true);
    // React tracks the native value setter, so call it directly to fire onChange.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set as (
      this: HTMLInputElement,
      v: string,
    ) => void;
    act(() => {
      setter.call(input, "2027-01-15");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith([
      {
        id: "a1",
        description: "Do it",
        isCompleted: false,
        targetDate: "2027-01-15",
        responsibleId: "u1",
      },
    ]);
  });

  it("shows the chosen staff member per row, empty for a new action", () => {
    const { el } = mount([
      {
        id: "a1",
        description: "Do it",
        isCompleted: false,
        targetDate: "2026-12-31",
        responsibleId: "u1",
      },
      { description: "New", isCompleted: false, targetDate: "", responsibleId: "" },
    ]);
    const selects = el.querySelectorAll<HTMLInputElement>('input[aria-label$="staff responsible"]');
    expect(selects).toHaveLength(2);
    expect(selects[0]!.value).toBe("Ben Cruz");
    expect(selects[1]!.value).toBe("");
  });

  it("adds new actions with an empty date", () => {
    const { el, onChange } = mount([]);
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Add action")!;
    act(() => btn.click());
    expect(onChange).toHaveBeenCalledWith([
      { description: "", isCompleted: false, targetDate: "", responsibleId: "" },
    ]);
  });
});
