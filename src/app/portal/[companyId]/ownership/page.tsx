import { requireCompany } from "@/lib/auth";
import { loadPortal } from "@/lib/portal-data";
import { compactMoney, date, money, percent, price, shares } from "@/lib/format";
import { PageHeader, Stat, Alert } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnershipDonut, LegendList } from "@/components/charts";
import { VALUATION_METHOD_LABELS } from "@/components/people-labels";
import { NoHoldings } from "../no-holdings";
import { db } from "@/lib/db";

export const metadata = { title: "Ownership" };

export default async function OwnershipPage(props: PageProps<"/portal/[companyId]/ownership">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  if (!p.isInvestorView) {
    return (
      <>
        <PageHeader title="Ownership" />
        <Alert tone="info">Company-level ownership details are shared with investors, board members and founders. Your own holdings and vesting are available under Holdings.</Alert>
      </>
    );
  }
  const rounds = await db.fundingRound.findMany({ where: { companyId: C, status: "CLOSED" }, orderBy: { closeDate: "asc" }, include: { shareClass: true } });
  const t = p.data.summary.totals;
  const byClass = p.data.summary.classTotals.filter((c) => c.issued > 0);
  const myByClass = byClass.map((c) => ({ class: c, mine: p.data.summary.rows.filter((r) => p.myIds.has(r.stakeholderId)).reduce((a, r) => a + (r.byClass[c.shareClassId] ?? 0), 0) })).filter((x) => x.mine > 0);
  const groupData = p.data.summary.groups.map((g) => ({ name: g.label, value: g.fullyDilutedShares }));
  const investedRounds = rounds.filter((r) => r.roundType === "PRICED");

  return (
    <>
      <PageHeader title="Ownership" description={`Your position in ${ctx.company.name} and how the company is capitalized, as of ${date(new Date(), "long")}.`} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Your fully diluted ownership" value={percent(p.ownership.fullyDilutedPct)} hint={`${shares(p.ownership.fullyDilutedShares)} of ${shares(t.fullyDilutedShares)}`} tone="accent" />
        <Stat label="Your outstanding ownership" value={percent(p.ownership.outstandingPct)} hint={`${shares(p.ownership.outstandingShares)} of ${shares(t.outstandingShares)}`} />
        <Stat label="Invested" value={money(p.ownership.invested)} hint="Cash paid for shares, SAFEs and notes" />
        <Stat label="Value at last round price" value={p.round?.pricePerShare ? money(p.ownership.fullyDilutedShares * p.round.pricePerShare) : "—"} hint={p.round ? `${p.round.name} · ${price(p.round.pricePerShare)}/share` : "No priced round"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Your holdings by class</CardTitle>
            </div>
          </CardHeader>
          {/* Phones: stacked rows; the 5-column table returns from sm up. */}
          <CardContent className="divide-y divide-border border-t border-border px-0 pb-0 sm:hidden">
            {myByClass.map(({ class: c, mine }) => (
              <div key={c.shareClassId} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 font-medium">{c.name}</span>
                  <span className="shrink-0 font-medium tabular">{shares(mine)}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular">
                  {percent(c.issued ? mine / c.issued : 0)} of {shares(c.issued)} issued
                  {c.type === "PREFERRED" ? ` · liq. pref. ${money(c.issued ? (c.liquidationPreference * mine) / c.issued : 0)}` : ""}
                </div>
              </div>
            ))}
            {p.holdings.filter((h) => h.isConvertible && h.security.status === "OUTSTANDING").map((h) => (
              <div key={h.security.id} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 font-medium">{h.security.type === "SAFE" ? "SAFE (unconverted)" : "Convertible note"}</span>
                  <span className="shrink-0 font-medium tabular">{money(h.security.totalAmount)}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Converts at next round{h.security.valuationCap ? ` · cap ${compactMoney(h.security.valuationCap)}` : ""}
                </div>
              </div>
            ))}
          </CardContent>
          <CardContent className="hidden px-0 pb-0 sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Your shares</th>
                  <th className="text-right">Class total</th>
                  <th className="text-right">% of class</th>
                  <th className="text-right">Liquidation pref.</th>
                </tr>
              </thead>
              <tbody>
                {myByClass.map(({ class: c, mine }) => (
                  <tr key={c.shareClassId}>
                    <td>{c.name}</td>
                    <td className="num">{shares(mine)}</td>
                    <td className="num">{shares(c.issued)}</td>
                    <td className="num">{percent(c.issued ? mine / c.issued : 0)}</td>
                    <td className="num">{c.type === "PREFERRED" ? money(c.issued ? (c.liquidationPreference * mine) / c.issued : 0) : "—"}</td>
                  </tr>
                ))}
                {p.holdings.filter((h) => h.isConvertible && h.security.status === "OUTSTANDING").map((h) => (
                  <tr key={h.security.id}>
                    <td>{h.security.type === "SAFE" ? "SAFE (unconverted)" : "Convertible note"}</td>
                    <td className="num">{money(h.security.totalAmount)}</td>
                    <td className="num text-muted-foreground">—</td>
                    <td className="num text-muted-foreground">converts at next round</td>
                    <td className="num">{h.security.valuationCap ? `cap ${compactMoney(h.security.valuationCap)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Company capitalization</CardTitle>
              <CardDescription>Fully diluted, by stakeholder group</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-4 sm:grid-cols-2">
              <OwnershipDonut data={groupData} height={180} />
              <LegendList data={groupData} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Outstanding</dt>
                <dd className="font-medium tabular">{shares(t.outstandingShares)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fully diluted</dt>
                <dd className="font-medium tabular">{shares(t.fullyDilutedShares)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unallocated pool</dt>
                <dd className="font-medium tabular">{shares(t.poolAvailable)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Financing history</CardTitle>
            </div>
          </CardHeader>
          {/* Phones: stacked rows; the 6-column table returns from sm up. */}
          <CardContent className="divide-y divide-border border-t border-border px-0 pb-0 sm:hidden">
            {investedRounds.map((r) => (
              <div key={r.id} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 font-medium">{r.name}</span>
                  <span className="shrink-0 font-medium tabular">{price(r.pricePerShare)} / share</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular">
                  {date(r.closeDate)} · raised {compactMoney(r.amountRaised)} · {compactMoney(r.preMoneyValuation)} pre → {compactMoney(r.postMoneyValuation)} post
                </div>
              </div>
            ))}
          </CardContent>
          <CardContent className="hidden px-0 pb-0 sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Closed</th>
                  <th className="text-right">Price / share</th>
                  <th className="text-right">Raised</th>
                  <th className="text-right">Pre-money</th>
                  <th className="text-right">Post-money</th>
                </tr>
              </thead>
              <tbody>
                {investedRounds.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td>{date(r.closeDate)}</td>
                    <td className="num">{price(r.pricePerShare)}</td>
                    <td className="num">{compactMoney(r.amountRaised)}</td>
                    <td className="num">{compactMoney(r.preMoneyValuation)}</td>
                    <td className="num">{compactMoney(r.postMoneyValuation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>409A fair market value history</CardTitle>
              <CardDescription>Common stock, per share</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Valuation date</th>
                  <th className="text-right">FMV</th>
                  <th className="text-right">Preferred price</th>
                  <th className="max-sm:hidden">Method</th>
                </tr>
              </thead>
              <tbody>
                {p.valuations.map((v) => (
                  <tr key={v.id}>
                    <td>{date(v.valuationDate)}</td>
                    <td className="num">{price(v.fairMarketValue)}</td>
                    <td className="num">{price(v.preferredPrice)}</td>
                    <td className="text-muted-foreground max-sm:hidden">{v.methodology ? VALUATION_METHOD_LABELS[v.methodology] ?? v.methodology : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
