import Link from "next/link";
import { Banknote, Plus, Plug } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, latestRound, loadCapTable } from "@/lib/data/captable";
import { tenderHolders } from "@/lib/people-tender";
import { compactMoney, date, money, price, shares } from "@/lib/format";
import { PageHeader, Stat, EmptyState, DescriptionList } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/forms";
import { connectLiquidityPartner } from "./actions";

export const metadata = { title: "Liquidity" };

export default async function LiquidityPage(props: PageProps<"/app/[companyId]/liquidity">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [tenders, data, valuation, round, npm] = await Promise.all([
    db.tenderOffer.findMany({ where: { companyId: C }, include: { participants: true }, orderBy: { createdAt: "desc" } }),
    loadCapTable(C),
    currentValuation(C),
    latestRound(C),
    db.integration.findFirst({ where: { companyId: C, provider: "NASDAQ_PRIVATE_MARKET" } }),
  ]);
  const holders = tenderHolders(data, ["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER", "ADVISOR", "CONSULTANT"], 100);
  const employeeHolders = holders.filter((h) => ["EMPLOYEE", "FORMER_EMPLOYEE"].includes(h.relationship));
  const fmv = valuation?.fairMarketValue ?? null;
  const sellableShares = holders.reduce((a, h) => a + h.sellable, 0);
  const estimatedValue = round?.pricePerShare ? sellableShares * round.pricePerShare : fmv ? sellableShares * fmv : 0;

  return (
    <>
      <PageHeader
        title="Liquidity"
        description="Design tender offers and secondary programs so employees and early investors can sell before an exit."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/liquidity/new`}>
                <Plus /> New tender offer
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Last preferred price" value={price(round?.pricePerShare)} hint={round ? `${round.name} · ${date(round.closeDate)}` : "No priced round"} />
        <Stat label="Common FMV (409A)" value={price(fmv)} hint={valuation ? `Valued ${date(valuation.valuationDate)}` : "No valuation"} />
        <Stat label="Holders with vested equity" value={holders.filter((h) => h.sellable > 0).length} hint={`${employeeHolders.filter((h) => h.sellable > 0).length} employees`} />
        <Stat label="Sellable value" value={compactMoney(estimatedValue)} hint={`${shares(sellableShares)} vested shares & options at last round price`} icon={Banknote} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {tenders.length === 0 ? (
            <EmptyState icon={Banknote} title="No tender offers yet" description="A tender offer lets an investor buy vested shares from employees at a set price during a window, with proration if oversubscribed." action={ctx.canEdit ? <Button asChild><Link href={`/app/${C}/liquidity/new`}>Design a tender offer</Link></Button> : undefined} />
          ) : (
            <>
              {/* Phones: one tappable block per program instead of a 7-column table */}
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
                {tenders.map((t) => {
                  const live = t.participants.filter((p) => p.status !== "WITHDRAWN");
                  const offered = live.reduce((a, p) => a + p.sharesOffered, 0);
                  return (
                    <li key={t.id}>
                      <Link href={`/app/${C}/liquidity/${t.id}`} className="block px-4 py-3 hover:bg-muted/50">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-[13px] font-medium">{t.name}</span>
                          <StatusBadge status={t.status} className="mt-0.5 shrink-0" />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t.buyerName} · <span className="tabular">{price(t.pricePerShare)}</span> per share · up to <span className="tabular">{shares(t.maxShares)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground tabular">
                          {date(t.startDate)} – {date(t.endDate)} · {live.length} election{live.length === 1 ? "" : "s"} · {shares(offered)} offered
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin md:block">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Buyer</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Max shares</th>
                      <th>Window</th>
                      <th>Participation</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenders.map((t) => {
                      const live = t.participants.filter((p) => p.status !== "WITHDRAWN");
                      const offered = live.reduce((a, p) => a + p.sharesOffered, 0);
                      const accepted = live.reduce((a, p) => a + (p.sharesAccepted ?? 0), 0);
                      return (
                        <tr key={t.id}>
                          <td>
                            <Link href={`/app/${C}/liquidity/${t.id}`} className="font-medium hover:underline">
                              {t.name}
                            </Link>
                          </td>
                          <td>{t.buyerName}</td>
                          <td className="num">{price(t.pricePerShare)}</td>
                          <td className="num">{shares(t.maxShares)}</td>
                          <td className="text-muted-foreground">
                            {date(t.startDate)} – {date(t.endDate)}
                          </td>
                          <td className="text-muted-foreground">
                            {live.length} elections · {shares(offered)} offered{accepted ? ` · ${shares(accepted)} accepted` : ""}
                          </td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="grid content-start items-start gap-5 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Liquidity readiness</CardTitle>
                <CardDescription>What a buyer could purchase today</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={2}
                items={[
                  { label: "Vested common shares", value: shares(holders.reduce((a, h) => a + h.securities.filter((s) => s.kind === "SHARES").reduce((b, s) => b + s.sellable, 0), 0)) },
                  { label: "Vested options", value: shares(holders.reduce((a, h) => a + h.vestedOptions, 0)) },
                  { label: "Value at last round", value: round?.pricePerShare ? money(sellableShares * round.pricePerShare) : "—" },
                  { label: "Value at FMV", value: fmv ? money(sellableShares * fmv) : "—" },
                ]}
              />
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                <li>• Requires board approval and a waiver of the right of first refusal.</li>
                <li>• Option sales are typically structured as cashless exercises.</li>
                <li>• Secondary prices above FMV may affect your next 409A.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  Nasdaq Private Market <StatusBadge status={npm?.status ?? "DISCONNECTED"} />
                </CardTitle>
                <CardDescription>Run a managed program with an outside buyer.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {npm?.status === "CONNECTED" ? (
                <p className="text-[13px] text-muted-foreground">Connected {date(npm.connectedAt)}. Cap table snapshots can be shared with your program manager from any tender offer.</p>
              ) : (
                <>
                  <p className="text-[13px] text-muted-foreground">Share your cap table securely, source buyers and settle transactions through a regulated marketplace.</p>
                  {ctx.canEdit ? (
                    <ConfirmButton action={connectLiquidityPartner} hidden={{ companyId: C }} title="Connect Nasdaq Private Market" description="Authorizes read-only sharing of cap table data for liquidity programs you initiate." confirmLabel="Connect" variant="secondary" className="mt-3">
                      <Plug /> Connect
                    </ConfirmButton>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
