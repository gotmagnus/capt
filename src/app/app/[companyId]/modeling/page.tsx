import Link from "next/link";
import { Rocket } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, convertibles, currentValuation, latestRound } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { RoundModeler, type RoundModelParams } from "./round-modeler";

export const metadata = { title: "Scenario modeling" };

export default async function ModelingPage(props: PageProps<"/app/[companyId]/modeling">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, valuation, round, scenarios, planned] = await Promise.all([
    loadCapTable(C),
    currentValuation(C),
    latestRound(C),
    db.scenario.findMany({ where: { companyId: C, type: "FINANCING" }, orderBy: { updatedAt: "desc" } }),
    db.fundingRound.findFirst({ where: { companyId: C, status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" } }),
  ]);
  const convs = convertibles(data).map((c) => {
    const sec = data.securities.find((x) => x.id === c.id)!;
    return { ...c, issueDate: sec.issueDate.toISOString(), certificateNumber: sec.certificateNumber, holderName: sec.stakeholder.name };
  });
  const scenarioId = typeof sp.scenario === "string" ? sp.scenario : null;
  const initial = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
  const defaults: RoundModelParams = {
    preMoneyValuation: planned?.preMoneyValuation ?? (round?.postMoneyValuation ? Math.round(round.postMoneyValuation * 2.5) : 20_000_000),
    investors: [{ name: planned?.leadInvestor ?? "New lead investor", amount: planned?.targetAmount ?? (round ? Math.round(round.amountRaised * 2.5) : 5_000_000), stakeholderId: null }],
    targetPoolPct: 10,
    poolTiming: "PRE",
    convertSafes: true,
    convertNotes: true,
    applyMfn: true,
    newShareClassName: planned?.name ? `${planned.name} Preferred` : "New Preferred",
  };

  return (
    <>
      <PageHeader
        title="Round modeler"
        description="Pro-forma a priced round with live numbers from your cap table: pool top-ups, SAFE and note conversion, pro-rata and dilution."
        actions={
          <Button variant="secondary" asChild>
            <Link href={`/app/${C}/modeling/exit`}>
              <Rocket /> Exit waterfall
            </Link>
          </Button>
        }
      />
      <RoundModeler
        companyId={C}
        canEdit={ctx.canEdit}
        summary={JSON.parse(JSON.stringify(data.summary))}
        convertibles={convs}
        stakeholders={data.summary.rows.map((r) => ({ id: r.stakeholderId, name: r.name, relationship: r.relationship, fdPct: r.fullyDilutedPct }))}
        scenarios={scenarios.map((s) => ({ id: s.id, name: s.name, description: s.description, params: s.params, updatedAt: s.updatedAt.toISOString() }))}
        initialScenarioId={initial?.id ?? null}
        initialParams={initial ? { ...defaults, ...(JSON.parse(initial.params) as Partial<RoundModelParams>) } : defaults}
        defaults={defaults}
        currentFmv={valuation?.fairMarketValue ?? null}
        lastRound={round ? { name: round.name, pricePerShare: round.pricePerShare, postMoneyValuation: round.postMoneyValuation } : null}
      />
    </>
  );
}
