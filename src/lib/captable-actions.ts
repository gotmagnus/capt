import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, requireCompany, type CompanyContext } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/actions";

/** Loads company context for a server action and turns a missing edit permission into a failure result. */
export async function editorContext(companyId: string): Promise<{ ctx: CompanyContext; error?: undefined } | { ctx?: undefined; error: ActionResult<never> }> {
  const ctx = await requireCompany(companyId);
  if (!ctx.canEdit) return { error: fail("You don't have permission to make changes in this company.") };
  return { ctx };
}

/** Membership check for route handlers (exports); returns a 401/403 response when access is denied. */
export async function routeAccess(companyId: string) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const membership = user.memberships.find((m) => m.companyId === companyId);
  if (!membership) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, membership };
}

export function parseAsOf(value: string | string[] | undefined): Date {
  if (typeof value !== "string" || !value) return new Date();
  const d = new Date(`${value}T23:59:59`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
