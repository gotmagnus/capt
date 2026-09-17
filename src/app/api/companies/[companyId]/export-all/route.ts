import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, logAudit } from "@/lib/auth";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/companies/[companyId]/export-all">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  const membership = user?.memberships.find((m) => m.companyId === companyId);
  if (!user || !membership || !WORKSPACE_ROLES.includes(membership.role as Role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [company, stakeholders, shareClasses, equityPlans, vestingSchedules, securities, transactions, valuations, rounds, boardConsents, documents, exerciseRequests] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.stakeholder.findMany({ where: { companyId } }),
    db.shareClass.findMany({ where: { companyId } }),
    db.equityPlan.findMany({ where: { companyId } }),
    db.vestingSchedule.findMany({ where: { companyId }, include: { milestones: true } }),
    db.security.findMany({ where: { companyId } }),
    db.transaction.findMany({ where: { companyId } }),
    db.valuation.findMany({ where: { companyId } }),
    db.fundingRound.findMany({ where: { companyId } }),
    db.boardConsent.findMany({ where: { companyId }, include: { signers: true, exhibits: true } }),
    db.document.findMany({ where: { companyId }, select: { id: true, name: true, folder: true, type: true, mimeType: true, sizeBytes: true, securityId: true, stakeholderId: true, signatureStatus: true, visibility: true, version: true, createdAt: true } }),
    db.exerciseRequest.findMany({ where: { companyId } }),
  ]);
  const { settings: _settings, ...companyPublic } = company;
  void _settings;
  const payload = { exportedAt: new Date().toISOString(), exportedBy: user.email, company: companyPublic, stakeholders: stakeholders.map(({ taxId, ...s }) => ({ ...s, taxId: taxId ? "REDACTED" : null })), shareClasses, equityPlans, vestingSchedules, securities, transactions, valuations, rounds, boardConsents, documents, exerciseRequests };
  await logAudit({ companyId, userId: user.id, action: "EXPORT", entityType: "Company", entityId: "export-all", summary: "Exported the full company dataset (JSON)" });
  return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${company.slug}-export.json"` } });
}
