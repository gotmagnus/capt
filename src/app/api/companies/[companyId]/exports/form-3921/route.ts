import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse } from "@/lib/export";
import { form3921For } from "@/lib/governance-compliance";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/form-3921">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  const m = user?.memberships.find((x) => x.companyId === companyId);
  if (!m || !WORKSPACE_ROLES.includes(m.role as Role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear() - 1;
  const { records } = await form3921For(companyId, year);
  return csvResponse(
    {
      name: `Form 3921 ${year}`,
      columns: [
        { key: "employeeName", header: "Employee" },
        { key: "employeeTin", header: "TIN" },
        { key: "employeeAddress", header: "Address" },
        { key: "grantDate", header: "Box 1 Date option granted", type: "date" },
        { key: "exerciseDate", header: "Box 2 Date option exercised", type: "date" },
        { key: "exercisePricePerShare", header: "Box 3 Exercise price per share", type: "money" },
        { key: "fmvPerShareOnExercise", header: "Box 4 FMV per share on exercise date", type: "money" },
        { key: "sharesTransferred", header: "Box 5 Number of shares transferred", type: "shares" },
        { key: "spread", header: "Spread", type: "money" },
        { key: "copyBDueDate", header: "Copy B due", type: "date" },
        { key: "copyADueDate", header: "Copy A due", type: "date" },
      ],
      rows: records as unknown as Record<string, unknown>[],
    },
    `form-3921-${year}`,
  );
}
