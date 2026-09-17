import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/types";
import { COMPARISON, PLAN_COPY, PLAN_ORDER } from "@/lib/marketing/plans";

/** Three plans as ruled columns; the recommended one is the ink column. */
export function PlanColumns() {
  return (
    <div className="grid border-rule md:grid-cols-3 md:border-y">
      {PLAN_ORDER.map((id, i) => {
        const plan = PLANS[id];
        const copy = PLAN_COPY[id];
        const featured = id === "GROWTH";
        return (
          <div
            key={id}
            className={cn(
              "flex flex-col border-t border-rule px-0 py-8 md:border-t-0 md:px-8 md:py-10",
              i > 0 && "md:border-l",
              featured && "-mx-5 border-t-0 bg-ink px-5 text-white sm:-mx-8 sm:px-8 md:mx-0 md:-my-4 md:rounded-xl md:border-l-0 md:py-14",
              i === 2 && "md:border-l-0",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="mkt-display text-[1.75rem] leading-none">{plan.name}</h3>
              {featured ? <span className="text-xs text-blue-200">Most teams start here</span> : null}
            </div>
            <p className={cn("mt-3 min-h-[2.75rem] text-[0.9375rem] leading-snug", featured ? "text-slate-300" : "text-muted-foreground")}>{copy.pitch}</p>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="mkt-display mkt-figure text-[2.75rem] leading-none">{plan.price ? `$${plan.price.toLocaleString("en-US")}` : "Custom"}</span>
              {plan.price ? <span className={cn("text-sm", featured ? "text-slate-300" : "text-muted-foreground")}>a year</span> : null}
            </div>
            <div className={cn("mt-2 text-[0.8125rem]", featured ? "text-slate-300" : "text-muted-foreground")}>{plan.stakeholders ? `Includes your first ${plan.stakeholders} stakeholders` : "Unlimited stakeholders"}</div>
            <ul className="mt-7 flex-1 space-y-2.5 text-[0.9375rem]">
              {copy.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className={cn("mt-[0.2em] size-4 shrink-0", featured ? "text-blue-300" : "text-accent")} />
                  {f}
                </li>
              ))}
            </ul>
            <Link href={copy.href} className={cn("mkt-btn mt-8 w-full", featured ? "mkt-btn-light" : "mkt-btn-outline")}>
              {copy.cta}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function ComparisonTable() {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-[0.9375rem]">
        <thead>
          <tr className="text-left">
            <th className="w-[46%] pb-4 font-normal" />
            {PLAN_ORDER.map((id) => (
              <th key={id} className="mkt-display pb-4 text-center text-xl font-medium text-ink">
                {PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        {COMPARISON.map((section) => (
          <tbody key={section.group}>
            <tr>
              <th colSpan={4} scope="colgroup" className="border-t border-ink/80 pb-2 pt-8 text-left text-sm font-semibold text-ink">
                {section.group}
              </th>
            </tr>
            {section.rows.map((row) => (
              <tr key={row.label} className="border-t border-rule">
                <th scope="row" className="py-3 pr-4 text-left font-normal text-ink">
                  {row.label}
                </th>
                {row.tiers.map((t, i) => (
                  <td key={i} className={cn("py-3 text-center tabular", i === 1 && "bg-vellum")}>
                    {t === true ? (
                      <>
                        <Check className="mx-auto size-4 text-accent" />
                        <span className="sr-only">Included</span>
                      </>
                    ) : t === false ? (
                      <>
                        <Minus className="mx-auto size-4 text-ink/25" />
                        <span className="sr-only">Not included</span>
                      </>
                    ) : (
                      t
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
