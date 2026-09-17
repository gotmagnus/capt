import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { importTemplateCsv } from "@/lib/import-csv";

export async function GET(_request: Request, ctx: RouteContext<"/api/companies/[companyId]/import-template">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !user.memberships.some((m) => m.companyId === companyId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return new Response(importTemplateCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="cap-table-import-template.csv"' } });
}
