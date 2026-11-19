import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type ViewMode = "table" | "card";

export const VIEW_MODES: readonly ViewMode[] = ["table", "card"];

/** Falls back when the value is missing or not a known mode (e.g. a hand-edited URL). */
export function parseViewMode(raw: string | null | undefined, fallback: ViewMode): ViewMode {
  return VIEW_MODES.find((m) => m === raw) ?? fallback;
}

/**
 * The view preference lives in the `view` URL param, like the other page filters.
 * Changing it only rewrites the URL: query keys do not include it, so nothing refetches and
 * every other param (filters, search) is kept.
 */
export function useViewMode(fallback: ViewMode): [ViewMode, (mode: ViewMode) => void] {
  const [params, setParams] = useSearchParams();
  const mode = parseViewMode(params.get("view"), fallback);
  const setMode = useCallback(
    (next: ViewMode) => {
      const copy = new URLSearchParams(params);
      if (next === fallback) copy.delete("view");
      else copy.set("view", next);
      setParams(copy, { replace: true });
    },
    [params, setParams, fallback],
  );
  return [mode, setMode];
}
