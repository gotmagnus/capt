import Link from "next/link";
import { differenceInDays } from "date-fns";
import { TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, waterfallHoldings, latestRound } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { ExitModeler, type ExitParams } from "./exit-modeler";

export const metadata = { title: "Exit waterfall" };

export default async function ExitPage(props: PageProps<"/app/[companyId]/modeling/exit">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, round, scenarios] = await Promise.all([loadCapTable(C), latestRound(C), db.scenario.findMany({ where: { companyId: C, type: "EXIT" }, orderBy: { updatedAt: "desc" } })]);
  const holdings = waterfallHoldings(data);
  // Simple accrued dividends per class: shares × OIP × rate × years outstanding.
  const now = new Date();
  const accrued: Record<string, number> = {};
  for (const s of data.securities) {
    if (s.type !== "PREFERRED_SHARES" || s.status !== "OUTSTANDING" || !s.shareClass?.dividendRate || s.shareClass.dividendType === "NONE") continue;
    const years = Math.max(0, differenceInDays(now, s.issueDate)) / 365;
    const oip = s.pricePerShare ?? s.shareClass.originalIssuePrice ?? 0;
    accrued[s.shareClassId!] = (accrued[s.shareClassId!] ?? 0) + (s.quantity - s.cancelledQuantity) * oip * (s.shareClass.dividendRate / 100) * years;
  }
  const scenarioId = typeof sp.scenario === "string" ? sp.scenario : null;
  const initial = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
  const defaults: ExitParams = {
    exitValue: round?.postMoneyValuation ? Math.round(round.postMoneyValuation * 4) : 100_000_000,
    debt: 0,
    transactionCostPct: 2,
    includeUnvestedOptions: true,
    includeUnallocatedPool: false,
    accrueDividends: false,
  };
  return (
    <>
      <PageHeader
        title="Exit waterfall"
        description="Who gets what at any exit value — liquidation preferences, participation, conversion decisions and option exercise are all solved automatically."
        actions={
          <Button variant="secondary" asChild>
            <Link href={`/app/${C}/modeling`}>
              <TrendingUp /> Round modeler
            </Link>
          </Button>
        }
      />
      <ExitModeler
        companyId={C}
        canEdit={ctx.canEdit}
        holdings={holdings}
        shareClasses={data.shareClasses.map((c) => ({ id: c.id, name: c.name, prefix: c.prefix, type: c.type, authorizedShares: c.authorizedShares, originalIssuePrice: c.originalIssuePrice, liquidationMultiple: c.liquidationMultiple, participating: c.participating, participationCap: c.participationCap, seniority: c.seniority, conversionRatio: c.conversionRatio, dividendRate: c.dividendRate, dividendType: c.dividendType }))}
        unallocatedPool={data.summary.totals.poolAvailable}
        accruedDividends={accrued}
        scenarios={scenarios.map((s) => ({ id: s.id, name: s.name, description: s.description, params: s.params, updatedAt: s.updatedAt.toISOString() }))}
        initialScenarioId={initial?.id ?? null}
        initialParams={initial ? { ...defaults, ...(JSON.parse(initial.params) as Partial<ExitParams>) } : defaults}
        defaults={defaults}
        lastRound={round ? { name: round.name, postMoneyValuation: round.postMoneyValuation } : null}
      />
    </>
  );
}
