"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GROUPS, HERO_ROWS, HERO_TOTAL } from "@/lib/marketing/story";
import { Guilloche } from "./guilloche";

const COLOR = Object.fromEntries(GROUPS.map((g) => [g.key, g.color])) as Record<string, string>;
const fmt = new Intl.NumberFormat("en-US");

/** Today's demo cap table, typeset like a certificate. Rows and strip segments highlight each other. */
export function HeroSheet() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="mkt-sheet relative" onMouseLeave={() => setActive(null)}>
      <Guilloche variant="seal" className="absolute right-4 top-4 size-14 sm:right-5 sm:top-5 sm:size-[4.5rem]" />
      <div className="pr-14 sm:pr-20">
        <div className="mkt-display mkt-display-sm text-xl leading-tight sm:text-2xl">Northwind Robotics, Inc.</div>
        <div className="mt-1 text-[0.8125rem] text-muted-foreground">Capitalization table, fully diluted</div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Shares</div>
          <div className="mkt-display mkt-figure text-[2rem] leading-none sm:text-[2.5rem]">{fmt.format(HERO_TOTAL)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          32 stakeholders
          <br />3 share classes
        </div>
      </div>

      <div className="mt-5 flex h-3 w-full gap-px overflow-hidden rounded-[3px]" role="img" aria-label="Ownership by holder">
        {HERO_ROWS.map((r, i) => (
          <span
            key={r.name}
            onMouseEnter={() => setActive(i)}
            className="mkt-strip-seg h-full transition-opacity duration-200"
            style={{ flex: `0 0 ${(r.shares / HERO_TOTAL) * 100}%`, background: COLOR[r.kind], opacity: active === null || active === i ? 1 : 0.22, ["--i" as string]: i }}
          />
        ))}
      </div>

      <table className="mt-4 w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-normal">Holder</th>
            <th className="pb-2 text-right font-normal">Shares</th>
            <th className="w-16 pb-2 text-right font-normal">Owns</th>
          </tr>
        </thead>
        <tbody>
          {HERO_ROWS.map((r, i) => (
            <tr
              key={r.name}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
              className={cn("mkt-row border-t border-rule transition-colors duration-150", active === i && "bg-vellum")}
              style={{ ["--i" as string]: i }}
            >
              <td className="py-2 pr-3">
                <span className="flex items-start gap-2.5">
                  <span className="mt-[0.4em] size-2 shrink-0 rounded-[2px]" style={{ background: COLOR[r.kind] }} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug text-ink">{r.name}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{r.detail}</span>
                  </span>
                </span>
              </td>
              <td className="py-2 text-right align-top tabular text-ink">{fmt.format(r.shares)}</td>
              <td className="py-2 text-right align-top tabular text-muted-foreground">{((r.shares / HERO_TOTAL) * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
