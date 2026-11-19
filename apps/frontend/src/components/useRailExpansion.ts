import { useState, type FocusEvent, type MouseEvent } from "react";

function isKeyboardFocus(el: EventTarget): boolean {
  try {
    return el instanceof Element && el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * Expansion state for the hover-to-expand sidebar rail.
 * Pointer clicks give links DOM focus, so plain focus must not keep the rail open:
 * only keyboard focus (:focus-visible) expands it, and a pointer click clears it.
 */
export function useRailExpansion() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    expanded: hovered || focused,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (e: FocusEvent<HTMLElement>) => {
        if (isKeyboardFocus(e.target)) setFocused(true);
      },
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setFocused(false);
        }
      },
      // detail > 0 means a pointer click; keyboard activation reports 0 and keeps the rail open.
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (e.detail > 0) setFocused(false);
      },
    },
  };
}
