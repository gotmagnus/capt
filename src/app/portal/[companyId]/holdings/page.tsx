import Link from "next/link";
import { requireCompany } from "@/lib/auth";
import { loadPortal } from "@/lib/portal-data";
import { date, money, percent, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { NoHoldings } from "../no-holdings";

export const metadata = { title: "Holdings" };

export default async function HoldingsPage(props: PageProps<"/portal/[companyId]/holdings">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const rows = p.holdings.slice().sort((a, b) => b.security.issueDate.getTime() - a.security.issueDate.getTime());

  return (
    <>
      <PageHeader title="Holdings" description={`Every security issued to ${p.myStakeholders.map((s) => s.name).join(" and ")}, including exercised and cancelled grants for your records.`} />
      {rows.length === 0 ? (
        <EmptyState title="No securities yet" />
      ) : (
        <>
          {/* Phones: a card per holding — the 9-column table hid quantity, vesting and value off-screen. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((h) => {
              const s = h.security;
              const units = h.isConvertible ? null : h.isShares ? s.quantity - s.cancelledQuantity : s.quantity;
              return (
                <li key={s.id}>
                  <Link href={`/portal/${C}/holdings/${s.id}`} className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[15px] font-semibold tabular">{h.isConvertible ? money(s.totalAmount) : shares(units)}</span>
                          <span className="text-[13px] text-muted-foreground">{SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-mono">{s.certificateNumber}</span> · {s.shareClass?.name ?? s.equityPlan?.name ?? "—"}
                        </div>
                      </div>
                      <StatusBadge status={s.status} className="shrink-0" />
                    </div>
                    {s.vestingScheduleId && !h.isConvertible ? (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground tabular">
                          <span>{shares(h.vesting.vested)} vested</span>
                          <span>{percent(h.vesting.percentVested, 0)}</span>
                        </div>
                        <Progress value={h.vesting.percentVested * 100} className="mt-1" tone={h.vesting.terminated ? "warning" : "success"} />
                      </div>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{s.exercisePrice != null ? "Strike" : "Price"}</dt>
                        <dd className="mt-0.5 font-medium tabular">{price(s.exercisePrice ?? s.pricePerShare)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Issued</dt>
                        <dd className="mt-0.5 font-medium tabular">{date(s.grantDate ?? s.issueDate)}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-muted-foreground">Est. value</dt>
                        <dd className="mt-0.5 font-medium tabular">{p.fmv && !h.isConvertible ? money(h.totalValue) : "—"}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Type</th>
                  <th>Class / plan</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Price / strike</th>
                  <th>Issued</th>
                  <th>Vesting</th>
                  <th className="text-right">Est. value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const s = h.security;
                  const units = h.isConvertible ? null : h.isShares ? s.quantity - s.cancelledQuantity : s.quantity;
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/portal/${C}/holdings/${s.id}`} className="font-mono text-xs font-medium hover:underline">
                          {s.certificateNumber}
                        </Link>
                      </td>
                      <td>{SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type}</td>
                      <td className="text-muted-foreground">{s.shareClass?.name ?? s.equityPlan?.name ?? "—"}</td>
                      <td className="num">{h.isConvertible ? money(s.totalAmount) : shares(units)}</td>
                      <td className="num">{price(s.exercisePrice ?? s.pricePerShare)}</td>
                      <td className="text-muted-foreground">{date(s.grantDate ?? s.issueDate)}</td>
                      <td className="min-w-[140px]">
                        {s.vestingScheduleId && !h.isConvertible ? (
                          <div>
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>{percent(h.vesting.percentVested, 0)}</span>
                              <span>{shares(h.vesting.vested)} vested</span>
                            </div>
                            <Progress value={h.vesting.percentVested * 100} className="mt-1" tone={h.vesting.terminated ? "warning" : "success"} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{h.isConvertible ? "Converts at next round" : "Fully vested"}</span>
                        )}
                      </td>
                      <td className="num">{p.fmv && !h.isConvertible ? money(h.totalValue) : "—"}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Estimated values use the current 409A fair market value{p.fmv ? ` (${price(p.fmv)})` : ""} and, for options, subtract the exercise price. They exclude taxes and are not a promise of liquidity.</p>
    </>
  );
}
