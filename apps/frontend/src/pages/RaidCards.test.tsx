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
  targetDate: "2026-12-31",
  pmApproval: "APPROVED",
  responsibleId: "u1",
  responsibleName: "Ben Cruz",
  sortOrder: 0,
});
const item = (done: boolean[]): RaidItemDto =>
  ({
    id: "r1",
    code: "RAID-01",
    projectCode: "PRJ-02",
    projectName: "Campus Portal",
    itemType: "risk",
    description: "Student privacy concerns",
    impact: 3,
    likelihood: 2,
    ownerName: "Ana Reyes",
    status: "open",
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

function mount(i: RaidItemDto, onEdit = vi.fn(), canDelete = true) {
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
          createElement(RaidCards, { items: [i], canEdit: true, canDelete, onEdit }),
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
    expect(el.querySelector(".raid-mitigation-summary")?.textContent).toBe(pct);
    expect(el.textContent).not.toContain("Mitigation:");
    expect(el.textContent).not.toContain("NaN");
  });

  it("puts description and owner in the header, mitigation top right, and hides type and impact", () => {
    const { el } = mount(item([true, false]));
    const title = el.querySelector(".raid-card-title");
    expect(title?.textContent).toBe("Student privacy concerns");
    expect(el.querySelector(".raid-card-owner")?.textContent).toBe("Ana Reyes");
    const header = title!.closest(".mantine-Group-root")!;
    expect(header.lastElementChild?.classList.contains("raid-mitigation-summary")).toBe(true);
    const card = el.querySelector(".item-card")?.textContent ?? "";
    expect(card).not.toContain("RAID-01");
    expect(card).not.toContain("Risk"); // type
    expect(card).not.toContain("High"); // impact 3
    expect(card).not.toContain("Likelihood");
    expect(el.querySelector(".raid-badge")).toBeNull();
    expect(el.querySelectorAll(".raid-sub").length).toBeGreaterThan(0);
    expect((el.textContent ?? "").match(/Student privacy concerns/g)).toHaveLength(1);
    expect((el.textContent ?? "").match(/Ana Reyes/g)).toHaveLength(1);
  });

  it("falls back to Unassigned when there is no owner", () => {
    const { el } = mount({ ...item([]), ownerName: null });
    expect(el.querySelector(".raid-card-owner")?.textContent).toBe("Unassigned");
  });

  it("renders the project badge above the description", () => {
    const { el } = mount(item([]));
    const badge = el.querySelector(".raid-project-badge")!;
    const title = el.querySelector(".raid-card-title")!;
    expect(badge.textContent).toBe("Campus Portal");
    expect(el.querySelector(".item-card")?.textContent).not.toContain("PRJ-02");
    expect(badge.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders all mitigating actions as checkboxes and toggles one", async () => {
    const { api } = await import("../api/client");
    vi.mocked(api.patch).mockResolvedValue({});
    const { el } = mount(item([true, false]));
    const boxes = el.querySelectorAll<HTMLInputElement>(".raid-action-check input");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.checked).toBe(true);
    expect(el.textContent).toContain("Action text a1");
    expect(el.textContent).toMatch(/due .*31.* · Ben Cruz/);
    await act(() => {
      boxes[1]!.click();
      return Promise.resolve();
    });
    expect(api.patch).toHaveBeenCalledWith("/raid/r1/mitigating-actions/a1", { isCompleted: true });
  });

  it("shows an empty state when there are no mitigating actions", () => {
    const { el } = mount(item([]));
    expect(el.textContent).toContain("No mitigating actions");
    expect(el.querySelector(".raid-action-check")).toBeNull();
  });

  it("puts status, Edit and Delete in the footer", () => {
    const { el } = mount(item([]));
    const foot = el.querySelector(".raid-card-foot")!;
    expect(foot.textContent).not.toContain("Target");
    expect(foot.textContent).toContain("Status");
    expect(foot.querySelector("input[aria-label='Status for RAID-01']")).not.toBeNull();
    const labels = [...foot.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Edit", "Delete"]));
    expect(el.querySelector(".raid-card-mitigations")!.closest(".raid-card-foot")).toBeNull();
    // Status sits in the divider row (border-top) with Edit and Delete.
    const divider = foot.querySelector(".raid-card-actions")!;
    expect(divider.querySelector("input[aria-label='Status for RAID-01']")).not.toBeNull();
    expect([...divider.querySelectorAll("button")].map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Edit", "Delete"]),
    );
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

describe("RaidCards as a team member", () => {
  it("offers Edit but not Delete", () => {
    const { el } = mount(item([]), vi.fn(), false);
    const labels = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toContain("Edit");
    expect(labels).not.toContain("Delete");
  });
});
