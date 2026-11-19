// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useRailExpansion } from "./useRailExpansion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rail = ReturnType<typeof useRailExpansion>;
let latest: Rail;
const cleanups: Array<() => void> = [];

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Probe() {
    latest = useRailExpansion();
    return null;
  }
  act(() => root.render(createElement(Probe)));
  cleanups.push(() => act(() => root.unmount()));
}

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
});

// Handlers only read target/currentTarget/relatedTarget/detail, so partial events are enough.
const focusEv = (target: Element, related: Node | null = null, current: Element = target) =>
  ({ target, currentTarget: current, relatedTarget: related }) as never;

describe("useRailExpansion", () => {
  it("expands on hover and collapses on mouse leave", () => {
    mount();
    act(() => latest.handlers.onMouseEnter());
    expect(latest.expanded).toBe(true);
    act(() => latest.handlers.onMouseLeave());
    expect(latest.expanded).toBe(false);
  });

  it("collapses after a pointer click on a link and mouse leave", () => {
    mount();
    const link = document.createElement("a");
    act(() => latest.handlers.onMouseEnter());
    // Pointer focus: :focus-visible does not match, so focus must not hold the rail open.
    act(() => latest.handlers.onFocus(focusEv(link)));
    act(() => latest.handlers.onClick({ detail: 1 } as never));
    act(() => latest.handlers.onMouseLeave());
    expect(latest.expanded).toBe(false);
  });

  it("expands on keyboard focus and collapses when focus leaves the rail", () => {
    mount();
    const nav = document.createElement("nav");
    const link = document.createElement("a");
    nav.append(link);
    link.matches = (sel: string) => sel === ":focus-visible";
    act(() => latest.handlers.onFocus(focusEv(link)));
    expect(latest.expanded).toBe(true);
    act(() => latest.handlers.onBlur(focusEv(link, document.body, nav)));
    expect(latest.expanded).toBe(false);
  });

  it("keeps the rail open on keyboard activation (click detail 0)", () => {
    mount();
    const link = document.createElement("a");
    link.matches = () => true;
    act(() => latest.handlers.onFocus(focusEv(link)));
    act(() => latest.handlers.onClick({ detail: 0 } as never));
    expect(latest.expanded).toBe(true);
  });
});
