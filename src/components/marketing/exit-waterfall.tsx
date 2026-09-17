"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { computeWaterfall, type WaterfallHolding } from "@/lib/equity/waterfall";
import type { ShareClassLike } from "@/lib/equity/captable";

// The demo company's cap table, folded into four holders. Runs on the same engine as the product.
const CLASSES: ShareClassLike[] = [
  { id: "common", name: "Common", prefix: "CS", type: "COMMON", authorizedShares: 30_000_000, liquidationMultiple: 1, participating: false, seniority: 99, conversionRatio: 1 },
  { id: "seed", name: "Series Seed Preferred", prefix: "PS-SEED", type: "PREFERRED", authorizedShares: 3_500_000, originalIssuePrice: 0.8, liquidationMultiple: 1, participating: false, seniority: 2, conversionRatio: 1 },
  { id: "a", name: "Series A Preferred", prefix: "PS-A", type: "PREFERRED", authorizedShares: 4_500_000, originalIssuePrice: 2.1, liquidationMultiple: 1, participating: false, seniority: 1, conversionRatio: 1 },
];

const PARTIES = [
  { id: "a", name: "Series A investors", terms: "1× non-participating, senior", color: "#12a594", classId: "a" },
  { id: "seed", name: "Seed investors", terms: "1× non-participating", color: "#5cc8bb", classId: "seed" },
  { id: "founders", name: "Founders", terms: "Common stock", color: "#3b6cf6", classId: null },
  { id: "team", name: "Employees & advisors", terms: "Common and options", color: "#8b6cf9", classId: null },
] as const;

const hold = (id: string, name: string, h: Partial<WaterfallHolding>): WaterfallHolding => ({ stakeholderId: id, stakeholderName: name, relationship: "", securityId: `${id}-${h.kind}-${h.shares}`, kind: "SHARES", shareClassId: null, shares: 0, ...h });

const HOLDINGS: WaterfallHolding[] = [
  hold("a", "Series A investors", { shareClassId: "a", shares: 4_047_619, originalIssuePrice: 2.1, invested: 8_500_000 }),
  hold("seed", "Seed investors", { shareClassId: "seed", shares: 3_406_250, originalIssuePrice: 0.8, invested: 2_725_000 }),
  hold("founders", "Founders", { shareClassId: "common", shares: 8_500_000 }),
  hold("team", "Employees & advisors", { shareClassId: "common", shares: 644_062 }),
  hold("team", "Employees & advisors", { kind: "OPTION", shares: 1_945_000, exercisePrice: 0.45 }),
];

// Fully diluted, so the percentages match the ledger above; the unallocated pool makes up the rest.
const POOL = 1_170_938;
const OWNED = (() => {
  const total = HOLDINGS.reduce((a, h) => a + h.shares, 0) + POOL;
  return Object.fromEntries(PARTIES.map((p) => [p.id, HOLDINGS.filter((h) => h.stakeholderId === p.id).reduce((a, h) => a + h.shares, 0) / total]));
})();

const MIN = 4_000_000;
const MAX = 300_000_000;
const toValue = (t: number) => Math.round((MIN * Math.pow(MAX / MIN, t)) / 250_000) * 250_000;
const toT = (v: number) => Math.log(v / MIN) / Math.log(MAX / MIN);
const PRESETS = [10_000_000, 25_000_000, 60_000_000, 200_000_000];

const compact = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1e3)}K`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function ExitWaterfall() {
  const [t, setT] = useState(toT(25_000_000));
  const exit = toValue(t);

  const result = useMemo(() => computeWaterfall({ exitValue: exit, shareClasses: CLASSES, holdings: HOLDINGS, includeUnvestedOptions: true }), [exit]);
  const rows = PARTIES.map((p) => {
    const h = result.holders.find((x) => x.stakeholderId === p.id);
    const cls = p.classId ? result.classes.find((c) => c.shareClassId === p.classId) : undefined;
    return { ...p, proceeds: h?.proceeds ?? 0, share: h?.pctOfProceeds ?? 0, owns: OWNED[p.id], converted: cls?.converted, moic: h?.moic ?? null };
  });
  const a = rows[0];
  const insight =
    a.converted === false && a.share > a.owns + 0.02
      ? `Series A owns ${pct(a.owns)} of the company and takes ${pct(a.share)} of a ${compact(exit)} sale. Its $8.5M preference is paid before anyone else sees a dollar.`
      : rows[1].converted === false
        ? `Series A has converted to common. The seed investors still do better holding their $2.7M preference than converting.`
        : `At ${compact(exit)}, every preferred holder converts to common and the proceeds follow ownership. Common is worth $${result.commonPricePerShare.toFixed(2)} a share.`;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-5">
        <label htmlFor="exit-value" className="text-sm text-muted-foreground">
          Sale price
        </label>
        <div className="mkt-display mkt-figure mt-1 text-[3.5rem] leading-none text-ink sm:text-[4.5rem]">{compact(exit)}</div>
        <input
          id="exit-value"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-valuetext={compact(exit)}
          className="mkt-range mt-7 w-full"
          style={{ ["--p" as string]: `${t * 100}%` }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setT(toT(v))}
              className={cn("h-8 rounded-full border px-3.5 text-[0.8125rem] tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", exit === v ? "border-ink bg-ink text-white" : "border-rule bg-white text-ink hover:border-ink/40")}
            >
              {compact(v)}
            </button>
          ))}
        </div>
        <p className="mt-8 min-h-[6.5rem] max-w-md text-[1.0625rem] leading-relaxed text-ink" aria-live="polite">
          {insight}
        </p>
      </div>

      <div className="lg:col-span-7">
        <div className="flex h-14 w-full overflow-hidden rounded-md" role="img" aria-label="Share of sale proceeds by holder">
          {rows.map((r) => (
            <span key={r.id} className="h-full transition-[flex-basis] duration-300 ease-out" style={{ flex: `0 0 ${r.share * 100}%`, background: r.color }} />
          ))}
        </div>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-3 font-normal">Holder</th>
              <th className="hidden py-3 pl-3 text-right font-normal sm:table-cell">Owns</th>
              <th className="py-3 pl-3 text-right font-normal">Receives</th>
              <th className="py-3 pl-3 text-right font-normal">Of proceeds</th>
              <th className="hidden w-44 py-3 pl-6 font-normal md:table-cell">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const decision = r.converted === undefined ? "Shares the remainder" : r.converted ? "Converts to common" : "Takes its preference";
              const decisionTone = r.converted === undefined ? "text-muted-foreground" : r.converted ? "text-ink" : "font-medium text-[#0b7a6e]";
              return (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-3.5 pr-2">
                    <span className="flex items-start gap-2.5">
                      <span className="mt-[0.35em] size-2.5 shrink-0 rounded-[2px]" style={{ background: r.color }} />
                      <span className="min-w-0">
                        <span className="block font-medium leading-snug text-ink">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">{r.terms}</span>
                        <span className={cn("mt-0.5 block text-xs md:hidden", decisionTone)}>{decision}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden py-3.5 pl-3 text-right align-top tabular text-muted-foreground sm:table-cell">{pct(r.owns)}</td>
                  <td className="py-3.5 pl-3 text-right align-top tabular font-medium text-ink">{compact(r.proceeds)}</td>
                  <td className="py-3.5 pl-3 text-right align-top tabular text-ink">{pct(r.share)}</td>
                  <td className={cn("hidden py-3.5 pl-6 align-top text-[0.8125rem] md:table-cell", decisionTone)}>{decision}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Ownership is fully diluted. The remaining 5.9% is the unallocated option pool, which receives nothing in a sale. Options are treated as fully vested and net of their exercise price.</p>
      </div>
    </div>
  );
}
