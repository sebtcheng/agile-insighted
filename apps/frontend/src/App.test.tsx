// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./api/client", () => ({
  api: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() },
  errorMessage: (e: unknown) => String(e),
  ApiClientError: class extends Error {},
}));
const role = { current: "team_member" };
vi.mock("./auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAuth: () => ({ id: "u1", role: role.current }),
  useIsPm: () => role.current === "pm",
}));
import { api } from "./api/client";
import { RequirePm } from "./App";

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
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

function mountAt(path: string) {
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
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: "/", element: createElement("p", null, "HOME PAGE") }),
              createElement(Route, {
                path: "/admin-log",
                element: createElement(RequirePm, null, createElement("p", null, "ADMIN LOG PAGE")),
              }),
            ),
          ),
        ),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return el;
}

describe("/admin-log route guard", () => {
  it("redirects a team member home without rendering the page or calling the API", () => {
    role.current = "team_member";
    const el = mountAt("/admin-log");
    expect(el.querySelector("p")?.textContent).toBe("HOME PAGE");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("renders the page for a project manager", () => {
    role.current = "pm";
    expect(mountAt("/admin-log").querySelector("p")?.textContent).toBe("ADMIN LOG PAGE");
  });
});
