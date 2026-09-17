import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse } from "@/lib/export";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/audit-log">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  const m = user?.memberships.find((x) => x.companyId === companyId);
  if (!m || !WORKSPACE_ROLES.includes(m.role as Role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const logs = await db.auditLog.findMany({ where: { companyId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } });
  await db.auditLog.create({ data: { companyId, userId: user!.id, action: "EXPORT", entityType: "AuditLog", summary: `Exported audit log (${logs.length} entries)` } });
  return csvResponse(
    {
      name: "Audit log",
      columns: [
        { key: "createdAt", header: "Timestamp (UTC)" },
        { key: "action", header: "Action" },
        { key: "entityType", header: "Entity" },
        { key: "entityId", header: "Entity ID" },
        { key: "summary", header: "Summary" },
        { key: "user", header: "Actor" },
        { key: "email", header: "Actor email" },
        { key: "before", header: "Before (JSON)" },
        { key: "after", header: "After (JSON)" },
        { key: "ipAddress", header: "IP" },
      ],
      rows: logs.map((l) => ({ createdAt: l.createdAt.toISOString(), action: l.action, entityType: l.entityType, entityId: l.entityId, summary: l.summary, user: l.user?.name ?? "System", email: l.user?.email ?? "", before: l.before, after: l.after, ipAddress: l.ipAddress })),
    },
    `audit-log-${new Date().toISOString().slice(0, 10)}`,
  );
}
