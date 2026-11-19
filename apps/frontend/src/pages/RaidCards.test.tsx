// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RaidItemDto } from "@myapp/shared";

vi.mock("../api/client", () => ({
  api: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() },
}));
import { mitigationPercent } from "../lib/raidMitigation";
import { RaidCards } from "./RaidPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const action = (id: string, isCompleted: boolean) => ({
  id,
  description: `Action text ${id}`,
  isCompleted,
  sortOrder: 0,
});
const item = (done: boolean[]): RaidItemDto =>
  ({
    id: "r1",
    code: "RAID-01",
    subprojectCode: "PRJ-02",
    itemType: "risk",
    description: "Student privacy concerns",
    impact: 3,
    likelihood: 2,
    ownerName: "Ana Reyes",
    status: "open",
    targetDate: null,
    isOverdue: false,
    mitigatingActions: done.map((d, i) => action(`a${i}`, d)),
  }) as unknown as RaidItemDto;

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
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function mount(i: RaidItemDto, onEdit = vi.fn()) {
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
          createElement(RaidCards, { items: [i], canEdit: true, onEdit }),
        ),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return { el, onEdit };
}

describe("mitigationPercent", () => {
  it("handles zero, partial, full and empty", () => {
    expect(mitigationPercent([])).toBe(0);
    expect(mitigationPercent([{ isCompleted: false }, { isCompleted: false }])).toBe(0);
    expect(
      mitigationPercent([{ isCompleted: true }, { isCompleted: false }, { isCompleted: false }]),
    ).toBe(33);
    expect(mitigationPercent([{ isCompleted: true }, { isCompleted: true }])).toBe(100);
  });
});

describe("RaidCards mitigation summary", () => {
  it.each([
    [[], "0%"],
    [[false, false], "0%"],
    [[true, false, false], "33%"],
    [[true, true], "100%"],
  ])("shows %j as %s", (done, pct) => {
    const { el } = mount(item(done));
    expect(el.textContent).toContain(`Mitigation: ${pct}`);
    expect(el.textContent).not.toContain("NaN");
  });

  it("hides individual actions on the card", () => {
    const { el } = mount(item([true, false]));
    expect(el.textContent).not.toContain("Action text");
    expect(el.querySelector(".raid-action-check")).toBeNull();
  });

  it("opens the modal when the card or summary is clicked, once", () => {
    const { el, onEdit } = mount(item([true]));
    act(() => {
      el.querySelector<HTMLElement>(".item-card")!.click();
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    act(() => {
      el.querySelector<HTMLElement>(".raid-mitigation-summary")!.click();
    });
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("Edit button opens the modal once without double trigger", () => {
    const { el, onEdit } = mount(item([]));
    const edit = [...el.querySelectorAll("button")].find((b) => b.textContent === "Edit")!;
    act(() => edit.click());
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
