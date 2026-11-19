// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage, validateEmail, validatePassword } from "./LoginPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }));
vi.mock("../api/hooks", () => ({
  useMe: () => ({ data: null }),
  useLogin: () => ({ mutate: h.mutate, isPending: h.pending, isError: false, error: null }),
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  h.mutate.mockReset();
  h.pending = false;
});

function render(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(createElement(MemoryRouter, null, createElement(LoginPage))));
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return el;
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    desc?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = (el: HTMLElement) =>
  act(() => {
    el.querySelector("form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });

describe("validators", () => {
  it("explain empty and malformed values", () => {
    expect(validateEmail("")).toBe("Enter your email address");
    expect(validateEmail("nope")).toBe("Enter a valid email address");
    expect(validateEmail("a@deped.gov.ph")).toBeNull();
    expect(validatePassword("")).toBe("Enter your password");
  });
});

describe("LoginPage", () => {
  it("shows inline errors for empty fields and does not sign in", () => {
    const el = render();
    submit(el);
    expect(el.textContent).toContain("Enter your email address");
    expect(el.textContent).toContain("Enter your password");
    expect(el.querySelector("#login-email")?.getAttribute("aria-invalid")).toBe("true");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("toggles password visibility", () => {
    const el = render();
    const pw = el.querySelector<HTMLInputElement>("#login-password")!;
    const toggle = el.querySelector<HTMLButtonElement>(".ls-toggle")!;
    expect(pw.type).toBe("password");
    act(() => toggle.click());
    expect(pw.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("warns while Caps Lock is on", () => {
    const el = render();
    const pw = el.querySelector<HTMLInputElement>("#login-password")!;
    act(() => {
      pw.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", modifierCapsLock: true, bubbles: true }),
      );
    });
    expect(el.querySelector("[role=status]")?.textContent).toContain("Caps Lock");
    act(() => {
      pw.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }));
    });
    expect(el.querySelector("[role=status]")).toBeNull();
  });

  it("submits valid values through the existing login mutation", () => {
    const el = render();
    type(el.querySelector<HTMLInputElement>("#login-email")!, "pm@deped.gov.ph");
    type(el.querySelector<HTMLInputElement>("#login-password")!, "secret");
    submit(el);
    expect(h.mutate).toHaveBeenCalledWith(
      { email: "pm@deped.gov.ph", password: "secret" },
      expect.any(Object),
    );
  });

  it("disables the button and sets aria-busy while signing in", () => {
    h.pending = true;
    const el = render();
    expect(el.querySelector<HTMLButtonElement>(".ls-submit")?.disabled).toBe(true);
    expect(el.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
  });

  it("renders the telemetry cards and switches the active one on hover and focus", () => {
    const el = render();
    const cards = el.querySelectorAll<HTMLButtonElement>(".ls-card");
    const active = () => [...cards].findIndex((c) => c.getAttribute("aria-current") === "true");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.length).toBeLessThanOrEqual(3);
    expect(active()).toBe(0);
    act(() => {
      cards[1]?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    expect(active()).toBe(1);
    act(() => cards[2]?.focus());
    expect(active()).toBe(2);
  });

  it("shows the title, status pill, institutional dock and help callout", () => {
    const el = render();
    expect(el.querySelector(".ls-title")?.textContent).toBe("InsightED AGILE");
    expect(el.querySelector(".ls-pill")?.textContent).toBe("Portal ready");
    const chips = [...el.querySelectorAll(".ls-dock .ls-chip")].map((c) => c.textContent);
    expect(chips).toEqual(["DepEd", "Bagong Pilipinas", "HROD", "InsightED"]);
    expect(el.querySelector(".ls-help")?.textContent).toContain("Trouble signing in?");
  });

  it("renders the email error inside its reserved slot", () => {
    const el = render();
    submit(el);
    const slot = el.querySelector("#login-email-error")?.closest(".ls-slot");
    expect(slot?.textContent).toBe("Enter your email address");
    expect(el.querySelector("#login-email")?.getAttribute("aria-describedby")).toBe(
      "login-email-error",
    );
  });
});
