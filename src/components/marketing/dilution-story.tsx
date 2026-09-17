"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GROUPS, STAGES, fullyDiluted, type GroupKey, type Stage } from "@/lib/marketing/story";
import { useScrollFrame, useTween } from "./hooks";

const fmt = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Alluvial geometry, in viewBox units. The SVG stretches to its box (preserveAspectRatio="none").
const VB_W = 1000;
const VB_H = 400;
const X0 = 64;
const DX = (VB_W - X0 * 2) / (STAGES.length - 1);
const NODE = 18;
const stageX = (i: number) => X0 + i * DX;

function buildBands() {
  const edges = STAGES.map((s) => {
    const total = fullyDiluted(s);
    let y = 0;
    return GROUPS.map((g) => {
      const top = y;
      y += (s.shares[g.key] / total) * VB_H;
      return [top, y] as const;
    });
  });
  const last = STAGES.length - 1;
  return GROUPS.map((g, gi) => {
    const top = edges.map((e) => e[gi][0]);
    const bottom = edges.map((e) => e[gi][1]);
    let d = `M ${stageX(0) - NODE} ${top[0]}`;
    for (let i = 0; i <= last; i++) {
      d += ` L ${stageX(i) + NODE} ${top[i]}`;
      if (i < last) {
        const mx = (stageX(i) + stageX(i + 1)) / 2;
        d += ` C ${mx} ${top[i]} ${mx} ${top[i + 1]} ${stageX(i + 1) - NODE} ${top[i + 1]}`;
      }
    }
    d += ` L ${stageX(last) + NODE} ${bottom[last]}`;
    for (let i = last; i >= 0; i--) {
      d += ` L ${stageX(i) - NODE} ${bottom[i]}`;
      if (i > 0) {
        const mx = (stageX(i) + stageX(i - 1)) / 2;
        d += ` C ${mx} ${bottom[i]} ${mx} ${bottom[i - 1]} ${stageX(i - 1) + NODE} ${bottom[i - 1]}`;
      }
    }
    return { key: g.key, color: g.color, d: `${d} Z` };
  });
}

const BANDS = buildBands();

const smooth = (t: number) => t * t * (3 - 2 * t);

export function DilutionStory() {
  const chapters = useRef<(HTMLElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const clip = useRef<SVGRectElement>(null);
  const cursor = useRef<SVGLineElement>(null);
  const [active, setActive] = useState(0);

  useScrollFrame(() => {
    const els = chapters.current.filter(Boolean) as HTMLElement[];
    if (els.length !== STAGES.length) return;
    const vh = window.innerHeight;
    // Beside the text on desktop, the reading line is mid-screen; stacked on phones, the panel
    // is pinned on top and the reading line sits in what is left below it.
    const stacked = !window.matchMedia("(min-width: 1024px)").matches;
    const panelBottom = stacked ? panel.current?.getBoundingClientRect().bottom ?? 0 : 0;
    const focus = stacked ? panelBottom + (vh - panelBottom) * 0.4 : vh * 0.5;
    const centers = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    let p = 0;
    if (focus >= centers[centers.length - 1]) p = centers.length - 1;
    else if (focus > centers[0]) {
      const i = centers.findIndex((c, k) => focus >= c && focus < centers[k + 1]);
      const frac = (focus - centers[i]) / (centers[i + 1] - centers[i]);
      // Hold on each stage for a beat, then sweep to the next one.
      p = i + smooth(Math.min(1, Math.max(0, (frac - 0.2) / 0.6)));
    }
    const x = stageX(p);
    clip.current?.setAttribute("width", String(x + NODE));
    cursor.current?.setAttribute("x1", String(x));
    cursor.current?.setAttribute("x2", String(x));
    const next = Math.round(p);
    setActive((prev) => (prev === next ? prev : next));
  });

  const stage = STAGES[active];

  return (
    <div className="grid gap-x-16 lg:grid-cols-12">
      <div className="sticky top-14 z-10 -mx-5 self-start bg-ink px-5 pb-3 pt-3 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-10 after:bg-gradient-to-b after:from-ink after:to-transparent sm:-mx-8 sm:px-8 lg:top-24 lg:order-2 lg:col-span-7 lg:mx-0 lg:bg-transparent lg:p-0 lg:after:hidden" ref={panel}>
        <LedgerPanel stage={stage} active={active}>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block h-24 w-full sm:h-36 lg:h-64" role="img" aria-label="Ownership by group across five moments, from incorporation to today">
            <defs>
              <clipPath id="mkt-reveal">
                <rect ref={clip} x="0" y="0" width={stageX(0) + NODE} height={VB_H} />
              </clipPath>
            </defs>
            <g opacity="0.14">
              {BANDS.map((b) => (
                <path key={b.key} d={b.d} fill={b.color} />
              ))}
            </g>
            <g clipPath="url(#mkt-reveal)">
              {BANDS.map((b) => (
                <path key={b.key} d={b.d} fill={b.color} stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            <line ref={cursor} x1={stageX(0)} x2={stageX(0)} y1="0" y2={VB_H} stroke="white" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="relative mt-2 h-4 text-[0.6875rem] sm:text-xs">
            {STAGES.map((s, i) => (
              <span key={s.id} className={cn("absolute -translate-x-1/2 whitespace-nowrap transition-colors duration-300", i === active ? "text-white" : "text-white/40")} style={{ left: `${(stageX(i) / VB_W) * 100}%` }}>
                {s.tick}
              </span>
            ))}
          </div>
        </LedgerPanel>
      </div>

      <ol className="lg:order-1 lg:col-span-5">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            ref={(el) => {
              chapters.current[i] = el;
            }}
            className={cn("flex min-h-[64vh] flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[78vh]", i === 0 && "lg:min-h-[60vh] lg:justify-start lg:pt-20", i === active ? "opacity-100" : "opacity-35")}
          >
            <div className="text-sm tabular text-blue-300">{s.tick}</div>
            <h3 className="mkt-display mt-2 text-[2rem] leading-[1.05] text-white sm:text-[2.75rem]">{s.title}</h3>
            <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-slate-300">{s.body}</p>
            <p className="mt-6 max-w-[34rem] border-l border-white/20 pl-4 text-sm leading-relaxed text-slate-400">
              <span className="font-medium text-white">In Capt. </span>
              {s.inCapt}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LedgerPanel({ stage, active, children }: { stage: Stage; active: number; children: React.ReactNode }) {
  const total = fullyDiluted(stage);
  const fd = useTween(total);
  return (
    <div className="lg:rounded-2xl lg:border lg:border-white/10 lg:bg-white/[0.035] lg:p-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-slate-400">Ledger as of</div>
          <div key={stage.asOf} className="mkt-display mkt-display-sm mkt-swap truncate text-xl text-white sm:text-[1.75rem]">
            {stage.asOf}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-slate-400">Fully diluted shares</div>
          <div className="mkt-display mkt-display-sm mkt-figure text-xl text-white sm:text-[1.75rem]">{fmt.format(Math.round(fd))}</div>
        </div>
      </div>

      <div className="mt-4 lg:mt-6">{children}</div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[0.8125rem] lg:mt-6 lg:grid-cols-1 lg:gap-y-0 lg:text-sm">
        {GROUPS.map((g) => (
          <GroupRow key={g.key} label={g.label} short={g.short} color={g.color} shares={stage.shares[g.key]} total={total} groupKey={g.key} />
        ))}
      </dl>

      <div className="mt-5 hidden min-h-[4.5rem] border-t border-white/10 pt-4 text-sm lg:block">
        <p key={active} className="mkt-swap text-slate-300">
          {stage.event}
          <span className="text-slate-500"> · {stage.stakeholders} stakeholders</span>
        </p>
        {stage.unconverted ? (
          <p key={`u-${active}`} className="mkt-swap mt-2 inline-flex items-center gap-2 rounded-full border border-dashed border-amber-400/50 px-3 py-1 text-[0.8125rem] text-amber-200">
            <span className="size-1.5 rounded-full bg-amber-400" />
            {usd.format(stage.unconverted.amount)} not yet converted, {stage.unconverted.label}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GroupRow({ label, short, color, shares, total, groupKey }: { label: string; short: string; color: string; shares: number; total: number; groupKey: GroupKey }) {
  const s = useTween(shares);
  const pct = useTween((shares / total) * 100);
  const empty = shares === 0;
  return (
    <div className={cn("flex items-center gap-2.5 transition-opacity duration-500 lg:border-t lg:border-white/10 lg:py-2.5 lg:first:border-t-0", empty && "opacity-40")} data-group={groupKey}>
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      <dt className="min-w-0 flex-1 truncate text-slate-300">
        <span className="lg:hidden">{short}</span>
        <span className="hidden lg:inline">{label}</span>
      </dt>
      <dd className="hidden w-28 text-right tabular text-white lg:block">{empty ? "—" : fmt.format(Math.round(s))}</dd>
      <dd className="w-14 shrink-0 text-right tabular text-white lg:w-20 lg:text-slate-300">{empty ? "—" : `${pct.toFixed(1)}%`}</dd>
    </div>
  );
}
