import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadCapTable, convertibles, waterfallHoldings } from "@/lib/data/captable";
import { modelRound } from "@/lib/equity/round-model";
import { computeWaterfall, waterfallCurve } from "@/lib/equity/waterfall";
import { xlsxResponse, type ExportSheet } from "@/lib/export";
import { slugify } from "@/lib/utils";

export async function GET(_request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/scenarios/[id]">) {
  const { companyId, id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !user.memberships.some((m) => m.companyId === companyId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scenario = await db.scenario.findFirst({ where: { id, companyId } });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await loadCapTable(companyId);
  const params = JSON.parse(scenario.params) as Record<string, unknown>;
  const sheets: ExportSheet[] = [];

  if (scenario.type === "FINANCING") {
    const convs = convertibles(data);
    const investors = (params.investors as { name: string; amount: number; stakeholderId?: string | null }[] | undefined) ?? [];
    const model = modelRound({
      capTable: data.summary,
      preMoneyValuation: Number(params.preMoneyValuation) || 0,
      investors: investors.map((i) => ({ name: i.name, amount: Number(i.amount) || 0, stakeholderId: i.stakeholderId ?? null })),
      targetPoolPct: params.targetPoolPct == null ? null : Number(params.targetPoolPct),
      poolTiming: params.poolTiming === "POST" ? "POST" : "PRE",
      convertibles: convs,
      convertSafes: params.convertSafes !== false,
      convertNotes: params.convertNotes !== false,
      applyMfn: params.applyMfn !== false,
    });
    sheets.push({
      name: "Assumptions",
      title: scenario.name,
      subtitle: `Financing scenario · ${data.company.legalName} · computed ${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { key: "k", header: "Assumption", width: 34 },
        { key: "v", header: "Value", width: 24 },
      ],
      rows: [
        { k: "Pre-money valuation", v: model.preMoneyValuation },
        { k: "Total raised", v: model.totalRaised },
        { k: "Price per share", v: model.pricePerShare },
        { k: "Post-money valuation", v: model.postMoneyValuation },
        { k: "Pool target (post-money %)", v: params.targetPoolPct ?? "" },
        { k: "Pool timing", v: params.poolTiming ?? "PRE" },
        { k: "Pool shares added", v: model.poolIncrease },
        { k: "Convert SAFEs", v: params.convertSafes !== false ? "Yes" : "No" },
        { k: "Convert notes", v: params.convertNotes !== false ? "Yes" : "No" },
        { k: "Pre-round fully diluted", v: model.preFullyDiluted },
        { k: "Post-round fully diluted", v: model.postFullyDiluted },
        ...investors.map((i) => ({ k: `Investor: ${i.name}`, v: i.amount })),
      ],
    });
    sheets.push({
      name: "Pro forma",
      columns: [
        { key: "name", header: "Holder", width: 36 },
        { key: "kind", header: "Type", width: 14 },
        { key: "preShares", header: "Pre shares", type: "shares" },
        { key: "prePct", header: "Pre %", type: "percent" },
        { key: "newShares", header: "New shares", type: "shares" },
        { key: "investedThisRound", header: "Invested", type: "money" },
        { key: "postShares", header: "Post shares", type: "shares" },
        { key: "postPct", header: "Post %", type: "percent" },
        { key: "dilutionPct", header: "Change (pp)", type: "number" },
      ],
      rows: model.rows.map((r) => ({ ...r })),
    });
    sheets.push({
      name: "Conversions",
      columns: [
        { key: "cert", header: "Instrument", width: 14 },
        { key: "holder", header: "Holder", width: 32 },
        { key: "principal", header: "Principal", type: "money" },
        { key: "accruedInterest", header: "Accrued interest", type: "money" },
        { key: "method", header: "Method", width: 14 },
        { key: "capPrice", header: "Cap price", type: "money" },
        { key: "discountPrice", header: "Discount price", type: "money" },
        { key: "conversionPrice", header: "Conversion price", type: "money" },
        { key: "shares", header: "Shares", type: "shares" },
      ],
      rows: model.conversions.map((c) => {
        const sec = data.securities.find((s) => s.id === c.id);
        return { cert: sec?.certificateNumber ?? c.id, holder: sec?.stakeholder.name ?? "", principal: c.principal, accruedInterest: c.accruedInterest, method: c.method, capPrice: c.capPrice, discountPrice: c.discountPrice, conversionPrice: c.conversionPrice, shares: c.shares };
      }),
    });
  } else if (scenario.type === "EXIT") {
    const holdings = waterfallHoldings(data);
    const input = {
      shareClasses: data.shareClasses,
      holdings,
      debt: Number(params.debt) || 0,
      transactionCostPct: Number(params.transactionCostPct) || 0,
      includeUnvestedOptions: params.includeUnvestedOptions !== false,
      unallocatedPool: params.includeUnallocatedPool ? data.summary.totals.poolAvailable : 0,
    };
    const exitValue = Number(params.exitValue) || 0;
    const r = computeWaterfall({ ...input, exitValue });
    sheets.push({
      name: "Assumptions",
      title: scenario.name,
      subtitle: `Exit scenario · ${data.company.legalName} · computed ${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { key: "k", header: "Assumption", width: 34 },
        { key: "v", header: "Value", width: 24 },
      ],
      rows: [
        { k: "Exit value", v: exitValue },
        { k: "Debt", v: input.debt },
        { k: "Transaction costs (%)", v: input.transactionCostPct },
        { k: "Distributable", v: r.distributable },
        { k: "Exercise proceeds", v: r.exerciseProceeds },
        { k: "Common price per share", v: r.commonPricePerShare },
        { k: "Accelerate unvested options", v: input.includeUnvestedOptions ? "Yes" : "No" },
        { k: "Include unallocated pool", v: params.includeUnallocatedPool ? "Yes" : "No" },
      ],
    });
    sheets.push({
      name: "Classes",
      columns: [
        { key: "name", header: "Class", width: 28 },
        { key: "shares", header: "Shares", type: "shares" },
        { key: "preference", header: "Preference", type: "money" },
        { key: "preferencePaid", header: "Preference paid", type: "money" },
        { key: "participation", header: "Participation", type: "money" },
        { key: "total", header: "Total", type: "money" },
        { key: "perShare", header: "Per share", type: "money" },
        { key: "converted", header: "Converted" },
      ],
      rows: r.classes.map((c) => ({ ...c, converted: c.converted ? "Yes" : "No" })),
    });
    sheets.push({
      name: "Holders",
      columns: [
        { key: "name", header: "Stakeholder", width: 36 },
        { key: "relationship", header: "Relationship", width: 16 },
        { key: "proceeds", header: "Proceeds", type: "money" },
        { key: "pctOfProceeds", header: "% of proceeds", type: "percent" },
        { key: "invested", header: "Invested", type: "money" },
        { key: "moic", header: "MOIC", type: "number" },
      ],
      rows: r.holders.map((h) => ({ ...h })),
    });
    const maxExit = Math.max(exitValue * 2.5, 1_000_000);
    const curve = waterfallCurve(input, Array.from({ length: 21 }, (_, i) => Math.round((maxExit * i) / 20)));
    const classNames = r.classes.map((c) => c.name);
    sheets.push({
      name: "Curve",
      columns: [{ key: "exitValue", header: "Exit value", type: "money" }, { key: "commonPricePerShare", header: "Common / share", type: "money" }, ...classNames.map((n) => ({ key: n, header: n, type: "money" as const }))],
      rows: curve.map((pt) => ({ exitValue: pt.exitValue, commonPricePerShare: pt.commonPricePerShare, ...pt.byClass })),
    });
  } else {
    return NextResponse.json({ error: "Export not supported for this scenario type" }, { status: 400 });
  }

  await db.auditLog.create({ data: { companyId, userId: user.id, action: "EXPORT", entityType: "Scenario", entityId: scenario.id, summary: `Exported scenario “${scenario.name}” to Excel` } });
  return xlsxResponse(sheets, `${slugify(scenario.name) || "scenario"}`);
}
