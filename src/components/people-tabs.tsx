"use client";

import { useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { tabItemClass, tabStripClass } from "@/components/ui/tab-styles";
import { useActiveTabScroll } from "@/components/ui/use-active-tab-scroll";

/** Link tab strip driven by a search param (the tab pages themselves stay fully server-side). */
export function LinkTabs({ base, param = "tab", current, tabs }: { base: string; param?: string; current: string; tabs: { key: string; label: string; count?: number }[] }) {
  const strip = useRef<HTMLDivElement>(null);

  useActiveTabScroll(strip, current);

  return (
    <div ref={strip} className={cn("relative mb-5", tabStripClass)}>
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === tabs[0].key ? base : `${base}?${param}=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={tabItemClass(active)}
          >
            {t.label}
            {t.count !== undefined ? <span className={cn("rounded-full px-1.5 text-[10px] tabular", active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
