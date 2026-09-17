"use client";

import { useEffect, type RefObject } from "react";

/**
 * Tab strips scroll sideways on phones. After navigation, centre the active tab
 * (`aria-current="page"` or `aria-selected="true"`) so it is never left off-screen.
 */
export function useActiveTabScroll(strip: RefObject<HTMLElement | null>, current: string) {
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: active.offsetLeft - el.offsetLeft - (el.clientWidth - active.offsetWidth) / 2 });
  }, [strip, current]);
}
