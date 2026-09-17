import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, latestRound, currentValuation } from "@/lib/data/captable";
import { compactMoney, date, price, shares, toInputDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { RequestForm } from "./request-form";

export const metadata = { title: "Request 409A valuation" };

export default async function RequestValuationPage(props: PageProps<"/app/[companyId]/valuations/request">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  if (!ctx.canEdit) redirect(`/app/${C}/valuations`);
  const [data, round, current, employees] = await Promise.all([loadCapTable(C), latestRound(C), currentValuation(C), db.stakeholder.count({ where: { companyId: C, employmentStatus: "ACTIVE" } })]);
  const s = data.summary;
  const snapshot = [
    { label: "Fully diluted shares", value: shares(s.totals.fullyDilutedShares) },
    { label: "Outstanding shares", value: shares(s.totals.outstandingShares) },
    { label: "Options outstanding", value: shares(s.totals.optionsOutstanding) },
    { label: "Unallocated pool", value: shares(s.totals.poolAvailable) },
    { label: "Preferred classes", value: String(data.shareClasses.filter((c) => c.type === "PREFERRED").length) },
    { label: "Total liquidation preference", value: compactMoney(s.totals.totalLiquidationPreference) },
    { label: "Outstanding convertibles", value: compactMoney(s.totals.safePrincipal + s.totals.notePrincipal) },
    { label: "Previous FMV", value: current ? `${price(current.fairMarketValue)} (${date(current.valuationDate)})` : "None" },
  ];
  const recentFinancing = round ? `${round.name}: ${compactMoney(round.amountRaised)} at ${price(round.pricePerShare)}/share, ${compactMoney(round.postMoneyValuation)} post-money, closed ${date(round.closeDate)}${round.leadInvestor ? `, led by ${round.leadInvestor}` : ""}.` : "";
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "409A valuations", href: `/app/${C}/valuations` }, { label: "Request" }]} title="Request a 409A valuation" description="Tell the valuation team about the business. The cap table snapshot is attached automatically." />
      <RequestForm companyId={C} defaultDate={toInputDate(new Date())} snapshot={snapshot} recentFinancing={recentFinancing} headcount={employees} suggestedPurpose={current ? (round && current.valuationDate < (round.closeDate ?? new Date(0)) ? "FINANCING" : "ANNUAL") : "INITIAL"} />
    </>
  );
}
