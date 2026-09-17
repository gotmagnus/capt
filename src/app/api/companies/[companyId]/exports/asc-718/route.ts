import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { xlsxResponse } from "@/lib/export";
import { asc718Assumptions, asc718Report, fiscalPeriod } from "@/lib/governance-compliance";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/asc-718">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  const m = user?.memberships.find((x) => x.companyId === companyId);
  if (!m || !WORKSPACE_ROLES.includes(m.role as Role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const a = asc718Assumptions(company);
  const fy = sp.get("fy") && /^\d{4}$/.test(sp.get("fy")!) ? Number(sp.get("fy")) : new Date().getFullYear();
  const q = sp.get("q") && /^[1-4]$/.test(sp.get("q")!) ? Number(sp.get("q")) : null;
  const method = sp.get("method") === "GRADED" ? "GRADED" : sp.get("method") === "STRAIGHT_LINE" ? "STRAIGHT_LINE" : a.method;
  const period = fiscalPeriod(company.fiscalYearEnd, fy, q);
  const data = await loadCapTable(companyId);
  const report = asc718Report(data, period.start, period.end, a, method);
  await db.auditLog.create({ data: { companyId, userId: user!.id, action: "EXPORT", entityType: "Report", summary: `Exported ASC 718 report (${period.label}, ${method})` } });
  const subtitle = `${period.label} · ${method === "GRADED" ? "Graded" : "Straight-line"} · vol ${(report.assumptions.volatility * 100).toFixed(1)}% · rf ${(report.assumptions.riskFreeRate * 100).toFixed(2)}% · forfeiture ${(report.assumptions.forfeitureRate * 100).toFixed(1)}%`;
  return xlsxResponse(
    [
      {
        name: "Summary",
        title: `${company.legalName} — ASC 718 expense`,
        subtitle,
        columns: [
          { key: "metric", header: "Metric", width: 40 },
          { key: "value", header: "Amount", type: "money", width: 20 },
        ],
        rows: [
          { metric: "Expense recognized in period", value: report.periodExpense },
          { metric: "Cumulative expense recognized", value: report.cumulativeExpense },
          { metric: "Unrecognized compensation cost", value: report.unrecognized },
          { metric: "Forfeited in period", value: report.grants.reduce((s, g) => s + g.forfeited, 0) },
        ],
      },
      {
        name: "By grant",
        columns: [
          { key: "stakeholderName", header: "Holder", width: 28 },
          { key: "department", header: "Department", width: 16 },
          { key: "type", header: "Type", width: 12 },
          { key: "quantity", header: "Shares", type: "shares" },
          { key: "fairValuePerShare", header: "FV / share", type: "money" },
          { key: "expectedTerm", header: "Expected term (yrs)", type: "number" },
          { key: "volatility", header: "Volatility", type: "percent" },
          { key: "riskFreeRate", header: "Risk-free", type: "percent" },
          { key: "totalFairValue", header: "Total fair value", type: "money" },
          { key: "periodExpense", header: "Period expense", type: "money" },
          { key: "recognizedToDate", header: "Recognized to date", type: "money" },
          { key: "unrecognized", header: "Unrecognized", type: "money" },
          { key: "forfeited", header: "Forfeited", type: "money" },
          { key: "remainingMonths", header: "Remaining months", type: "number" },
        ],
        rows: report.grants.map((g) => ({ ...g, periodExpense: Object.values(g.byPeriod).reduce((x, y) => x + y, 0) })),
      },
      {
        name: "By month",
        columns: [
          { key: "month", header: "Month" },
          { key: "expense", header: "Expense", type: "money" },
        ],
        rows: report.byMonth,
      },
      {
        name: "By department",
        columns: [
          { key: "department", header: "Department", width: 24 },
          { key: "expense", header: "Expense", type: "money" },
        ],
        rows: report.byDepartment,
      },
      {
        name: "By type",
        columns: [
          { key: "type", header: "Type", width: 16 },
          { key: "expense", header: "Expense", type: "money" },
        ],
        rows: report.byType,
      },
    ],
    `asc-718-${period.label.toLowerCase().replace(/\s+/g, "-")}`,
  );
}
