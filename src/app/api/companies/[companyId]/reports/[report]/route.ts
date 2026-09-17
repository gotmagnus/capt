import { NextResponse } from "next/server";
import { getCurrentUser, logAudit } from "@/lib/auth";
import { getReport, resolveParams, runReport } from "@/lib/reports";
import { csvResponse, xlsxResponse } from "@/lib/export";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";
import { toInputDate } from "@/lib/format";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/reports/[report]">) {
  const { companyId, report: reportId } = await ctx.params;
  const user = await getCurrentUser();
  const membership = user?.memberships.find((m) => m.companyId === companyId);
  if (!user || !membership || !WORKSPACE_ROLES.includes(membership.role as Role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = getReport(reportId);
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (sp[k] = v));
  const params = resolveParams(sp);
  const { data, rows } = await runReport(companyId, report, params);
  const format = sp.format === "csv" ? "csv" : "xlsx";
  const subtitleParts = [data.company.legalName];
  if (report.params.includes("asOf")) subtitleParts.push(`as of ${toInputDate(params.asOf)}`);
  if (report.params.includes("year")) subtitleParts.push(`tax year ${params.year}`);
  if (report.params.includes("range")) subtitleParts.push(`${toInputDate(params.from)} to ${toInputDate(params.to)}`);
  const sheet = { name: report.name.slice(0, 31), title: report.name, subtitle: subtitleParts.join(" · "), columns: report.columns, rows };
  const filename = `${data.company.slug}-${report.id}-${toInputDate(new Date())}`;
  await logAudit({ companyId, userId: user.id, action: "EXPORT", entityType: "Report", entityId: report.id, summary: `Exported ${report.name} (${format.toUpperCase()})` });
  return format === "csv" ? csvResponse(sheet, filename) : xlsxResponse([sheet], filename);
}
