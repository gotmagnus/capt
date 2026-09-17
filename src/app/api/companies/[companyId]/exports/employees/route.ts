import { getCurrentUser } from "@/lib/auth";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { buildEmployeeRows } from "@/lib/people-data";
import { csvResponse, xlsxResponse } from "@/lib/export";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";
import { db } from "@/lib/db";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/employees">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  const membership = user?.memberships.find((m) => m.companyId === companyId);
  if (!user || !membership || !WORKSPACE_ROLES.includes(membership.role as Role)) return new Response("Unauthorized", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  const [data, valuation] = await Promise.all([loadCapTable(companyId), currentValuation(companyId)]);
  const rows = buildEmployeeRows(data, valuation?.fairMarketValue ?? null);
  const sheet = {
    name: "Employees",
    title: `${data.company.legalName} — Employee equity`,
    subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
    columns: [
      { key: "name", header: "Name" },
      { key: "email", header: "Email" },
      { key: "title", header: "Title" },
      { key: "department", header: "Department" },
      { key: "relationship", header: "Relationship" },
      { key: "employmentStatus", header: "Status" },
      { key: "startDate", header: "Start date", type: "date" as const },
      { key: "terminationDate", header: "Termination date", type: "date" as const },
      { key: "grantCount", header: "Grants", type: "number" as const },
      { key: "granted", header: "Granted", type: "shares" as const },
      { key: "vested", header: "Vested", type: "shares" as const },
      { key: "unvested", header: "Unvested", type: "shares" as const },
      { key: "exercisable", header: "Exercisable", type: "shares" as const },
      { key: "exercised", header: "Exercised", type: "shares" as const },
      { key: "forfeited", header: "Forfeited", type: "shares" as const },
      { key: "nextVestDate", header: "Next vest date", type: "date" as const },
      { key: "nextVestAmount", header: "Next vest amount", type: "shares" as const },
      { key: "avgStrike", header: "Avg strike", type: "money" as const },
      { key: "vestedValue", header: "Vested value (FMV)", type: "money" as const },
    ],
    rows: rows.map((r) => ({ ...r, grants: undefined })),
  };
  await db.auditLog.create({ data: { companyId, userId: user.id, action: "EXPORT", entityType: "Employees", summary: `Exported employee equity report (${format.toUpperCase()})` } });
  const filename = `${data.company.slug}-employees-${new Date().toISOString().slice(0, 10)}`;
  return format === "xlsx" ? xlsxResponse([sheet], filename) : csvResponse(sheet, filename);
}
