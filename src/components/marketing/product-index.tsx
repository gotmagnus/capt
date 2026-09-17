"use client";

import { useState, type ReactNode } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  title: string;
  summary: string;
  points: string[];
  specimen: ReactNode;
}

/** A scrap of real product UI, populated with the demo company's figures. */
function Specimen({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="m-0">
      <div className="rounded-xl border border-rule bg-white p-4 text-[0.8125rem] shadow-[0_1px_2px_rgba(10,20,48,0.04),0_12px_32px_-12px_rgba(10,20,48,0.12)] sm:p-5">{children}</div>
      <figcaption className="mt-3 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function Meter({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-vellum">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-rule py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-right tabular text-ink", strong && "font-semibold")}>{v}</span>
    </div>
  );
}

const Pill = ({ tone, children }: { tone: "green" | "blue" | "amber" | "slate"; children: ReactNode }) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.6875rem] font-medium",
      tone === "green" && "bg-success-soft text-success",
      tone === "blue" && "bg-accent-soft text-accent-foreground",
      tone === "amber" && "bg-warning-soft text-warning",
      tone === "slate" && "bg-vellum text-muted-foreground",
    )}
  >
    {children}
  </span>
);

const FMV = [
  { date: "May 2022", v: 0.05 },
  { date: "May 2023", v: 0.18 },
  { date: "Oct 2024", v: 0.62 },
  { date: "Oct 2025", v: 0.85 },
];

const ENTRIES: Entry[] = [
  {
    id: "cap-table",
    title: "Cap table",
    summary: "Every share, option, SAFE, note and warrant on one ledger.",
    points: ["Rewind to any date and the table rebuilds itself from the transaction ledger", "Certificates numbered and generated as securities are issued", "Exports to CSV and Excel whenever counsel asks"],
    specimen: (
      <Specimen caption="A certificate from the demo ledger">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold tabular text-ink">PS-A-1</div>
            <div className="text-muted-foreground">Series A Preferred</div>
          </div>
          <Pill tone="green">Outstanding</Pill>
        </div>
        <div className="mt-4">
          <Line k="Holder" v="Ridgeline Capital Partners II, L.P." />
          <Line k="Shares" v="2,857,143" strong />
          <Line k="Price per share" v="$2.10" />
          <Line k="Issued" v="Sep 15, 2024" />
        </div>
      </Specimen>
    ),
  },
  {
    id: "modeling",
    title: "Round and exit modeling",
    summary: "Price a round against the live cap table before the term sheet arrives.",
    points: ["SAFE and note conversion solved together with the pool top-up", "Pro-rata rights filled from current ownership", "Exit waterfalls with stacked preferences, caps and conversion decisions"],
    specimen: (
      <Specimen caption="The saved Series B scenario in the demo">
        <div className="text-muted-foreground">$25,000,000 at $90,000,000 pre-money</div>
        <div className="mt-3">
          <Line k="Price per share" v="$4.1913" strong />
          <Line k="Post-money" v="$115M" />
          <Line k="New investors own" v="21.7%" />
          <Line k="Pool after top-up" v="10.0%" />
          <Line k="Shares from the SAFE and note" v="186,541" />
        </div>
      </Specimen>
    ),
  },
  {
    id: "valuations",
    title: "409A valuations",
    summary: "Request, review and accept a valuation, and grant against it the same day.",
    points: ["Fair market value history feeds the strike price of every new grant", "Safe-harbor expiry is tracked and flagged on the dashboard", "Reports are filed in the data room next to the board approval"],
    specimen: (
      <Specimen caption="Common fair market value, four valuations">
        <div className="flex h-28 items-end gap-3">
          {FMV.map((p) => (
            <div key={p.date} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="tabular font-medium text-ink">${p.v.toFixed(2)}</span>
              <span className="w-full rounded-t-[3px] bg-accent" style={{ height: `${(p.v / 0.85) * 64 + 4}px`, opacity: 0.35 + (p.v / 0.85) * 0.65 }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3 border-t border-rule pt-2 text-[0.6875rem] text-muted-foreground">
          {FMV.map((p) => (
            <span key={p.date} className="flex-1 text-center">
              {p.date}
            </span>
          ))}
        </div>
      </Specimen>
    ),
  },
  {
    id: "board",
    title: "Board consents",
    summary: "Draft the resolution, attach the grants, collect director signatures.",
    points: ["Resolutions generated from the grants they approve", "Each director signs from a private link, in order or all at once", "The approval date lands on every security the consent covers"],
    specimen: (
      <Specimen caption="A consent out for signature">
        <div className="flex items-start justify-between gap-3">
          <div className="font-medium text-ink">Option grants, September 2026</div>
          <Pill tone="blue">Sent</Pill>
        </div>
        <div className="mt-3 space-y-2">
          {[
            ["Maya Chen", true],
            ["Daniel Okafor", true],
            ["Elena Vasquez", false],
            ["James Park", false],
          ].map(([n, signed]) => (
            <div key={n as string} className="flex items-center justify-between gap-3">
              <span className="text-ink">{n}</span>
              {signed ? (
                <span className="flex items-center gap-1 text-success">
                  <Check className="size-3.5" /> Signed
                </span>
              ) : (
                <span className="text-muted-foreground">Waiting</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Meter value={50} color="var(--success)" />
        </div>
      </Specimen>
    ),
  },
  {
    id: "compliance",
    title: "Compliance",
    summary: "Rule 701, the ISO $100K limit, 83(b), Form 3921 and ASC 718 computed from the ledger.",
    points: ["Rolling 12-month Rule 701 tests against all three limits", "ISO grants split into NSOs where they cross $100,000 a year", "Form 3921 records and ASC 718 expense ready for your auditors"],
    specimen: (
      <Specimen caption="Rule 701, last twelve months">
        <div className="flex items-baseline justify-between gap-3">
          <span className="mkt-display mkt-figure text-2xl text-ink">$433,500</span>
          <span className="text-muted-foreground">of $2,103,486</span>
        </div>
        <div className="mt-3">
          <Meter value={20.6} />
        </div>
        <div className="mt-4">
          <Line k="Limit that applies" v="15% of outstanding securities" />
          <Line k="Headroom" v="$1,669,986" strong />
          <Line k="Enhanced disclosure" v="Not required" />
        </div>
      </Specimen>
    ),
  },
  {
    id: "portals",
    title: "Employee and investor portals",
    summary: "People see what they own without emailing you.",
    points: ["Vesting timelines, exercise costs and tax estimates for employees", "Holdings, ownership and updates for investors", "Every document they have signed, in one place"],
    specimen: (
      <Specimen caption="What one engineer sees">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-base font-semibold tabular text-ink">40,000</span> <span className="text-muted-foreground">ISO</span>
            <div className="text-xs text-muted-foreground">ES-17, granted Jun 2, 2025, strike $0.62</div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular text-ink">$3,833</div>
            <div className="text-xs text-muted-foreground">vested value</div>
          </div>
        </div>
        <div className="mt-4 flex justify-between text-xs text-muted-foreground">
          <span>16,666 of 40,000 vested</span>
          <span>Next: 3,334 on Dec 2, 2026</span>
        </div>
        <div className="mt-1.5">
          <Meter value={41.7} color="var(--success)" />
        </div>
      </Specimen>
    ),
  },
  {
    id: "sign",
    title: "Send and sign",
    summary: "Agreements go out from templates and update the ledger when countersigned.",
    points: ["Option, RSA, SAFE and note agreements generated from the terms you entered", "Signers get a private link; no account needed", "Offer letters that show candidates what the equity could be worth"],
    specimen: (
      <Specimen caption="Documents and offers in flight">
        <div className="space-y-3">
          {[
            ["ES-23 option agreement", "Omar Haddad", "Sent", "blue"],
            ["Offer letter, Staff Software Engineer", "Priyanka Desai", "Viewed", "amber"],
            ["SAFE-4 post-money SAFE", "Sequoia Scout", "Signed", "green"],
          ].map(([doc, who, status, tone]) => (
            <div key={doc} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{doc}</div>
                <div className="text-xs text-muted-foreground">{who}</div>
              </div>
              <Pill tone={tone as "blue"}>{status}</Pill>
            </div>
          ))}
        </div>
      </Specimen>
    ),
  },
  {
    id: "audit",
    title: "Audit log and access",
    summary: "An append-only record of every change, signature and export.",
    points: ["Entries cannot be edited or deleted, by anyone", "Seven roles, from admin to read-only board observer", "Exports are logged too, so you know who took what"],
    specimen: (
      <Specimen caption="Three entries from the demo log">
        <div className="space-y-3">
          {[
            ["export", "Exported cap table (fully diluted) to Excel", "Aisha Bell, Sep 12"],
            ["create", "Sent board consent “Option grants, September 2026” to 4 directors", "Maya Chen, Sep 10"],
            ["approve", "Approved exercise request from Wei Zhang", "Maya Chen, Sep 9"],
          ].map(([action, text, meta]) => (
            <div key={text} className="flex gap-3">
              <span className="mt-px w-14 shrink-0 text-xs text-muted-foreground">{action}</span>
              <div className="min-w-0">
                <div className="text-ink">{text}</div>
                <div className="text-xs text-muted-foreground">{meta}</div>
              </div>
            </div>
          ))}
        </div>
      </Specimen>
    ),
  },
];

export function ProductIndex() {
  const [open, setOpen] = useState<string | null>(ENTRIES[0].id);
  return (
    <div className="border-b border-rule">
      {ENTRIES.map((e) => {
        const isOpen = open === e.id;
        return (
          <div key={e.id} className="border-t border-rule">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`idx-${e.id}`}
                onClick={() => setOpen(isOpen ? null : e.id)}
                className="group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5 text-left focus-visible:outline-none sm:py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_auto]"
              >
                <span className={cn("mkt-display col-start-1 row-start-1 text-[1.625rem] leading-tight transition-colors sm:text-[2rem]", isOpen ? "text-ink" : "text-ink/65 group-hover:text-ink group-focus-visible:text-ink")}>{e.title}</span>
                <span className="col-span-2 col-start-1 row-start-2 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:text-base">{e.summary}</span>
                <span className="col-start-2 row-start-1 flex size-8 items-center justify-center self-center rounded-full border border-rule text-ink transition-colors group-hover:border-ink/40 group-focus-visible:ring-2 group-focus-visible:ring-ring/40 lg:col-start-3">
                  {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                </span>
              </button>
            </h3>
            <div id={`idx-${e.id}`} role="region" aria-label={e.title} className={cn("mkt-collapse", isOpen && "is-open")}>
              <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                <div className="grid gap-8 pb-10 pt-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_2rem] lg:gap-x-6">
                  <ul className="space-y-3 text-[0.9375rem] leading-relaxed text-ink lg:pr-10">
                    {e.points.map((p) => (
                      <li key={p} className="flex gap-3">
                        <span className="mt-[0.6em] h-px w-4 shrink-0 bg-ink/40" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div className="max-w-md">{e.specimen}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
