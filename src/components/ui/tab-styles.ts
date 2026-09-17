import { cn } from "@/lib/utils";

/**
 * Underline tab strip shared by Radix tabs, link tabs and button tabs. Lives outside the
 * "use client" tabs module so server components can import it. The strip scrolls sideways
 * on narrow screens; its rule is an inset shadow so the active underline can sit on top of
 * it without a negative margin that the scroll container would clip.
 */
export const tabStripClass = "flex w-full items-center gap-5 overflow-x-auto scrollbar-none shadow-[inset_0_-1px_0_var(--border)]";

export function tabItemClass(active?: boolean) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:text-foreground",
    active === undefined
      ? "border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
      : active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
  );
}
