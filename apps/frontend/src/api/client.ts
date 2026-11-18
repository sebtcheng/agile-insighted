import type { ApiError } from "@myapp/shared";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type Params = Record<string, string | number | boolean | null | undefined>;

export function toQuery(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Params,
): Promise<T> {
  const res = await fetch(`/api${path}${toQuery(params)}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data as ApiError | undefined)?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, undefined, params),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong";
