import { now } from "@/lib/utils";
import { Download, Lock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { AuditTable, type AuditRow } from "./audit-table";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage(props: PageProps<"/app/[companyId]/audit-log">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [logs, total] = await Promise.all([db.auditLog.findMany({ where: { companyId: C }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 1000 }), db.auditLog.count({ where: { companyId: C } })]);
  const rows: AuditRow[] = logs.map((l) => ({ id: l.id, action: l.action, entityType: l.entityType, entityId: l.entityId, summary: l.summary, before: l.before, after: l.after, user: l.user?.name ?? "System", email: l.user?.email ?? null, createdAt: l.createdAt.toISOString(), ipAddress: l.ipAddress }));
  const last30 = logs.filter((l) => now().getTime() - l.createdAt.getTime() < 30 * 86_400_000).length;
  const users = new Set(logs.map((l) => l.user?.email ?? "system")).size;
  const exports = logs.filter((l) => l.action === "EXPORT").length;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Immutable record of every change, approval, signature and export in this company. Entries cannot be edited or deleted."
        actions={
          <Button variant="secondary" asChild>
            <a href={`/api/companies/${C}/exports/audit-log`}>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total entries" value={total.toLocaleString()} hint={total > 1000 ? "Showing the latest 1,000" : "All entries shown"} />
        <Stat label="Last 30 days" value={last30} hint="Entries recorded" />
        <Stat label="Actors" value={users} hint="Distinct users incl. system" />
        <Stat label="Exports & downloads" value={exports} icon={Lock} hint="Data access is logged too" />
      </div>
      <AuditTable rows={rows} />
      <p className="mt-4 text-xs text-muted-foreground">Retention: audit entries are retained for the life of the company and included in full data exports. Timestamps are recorded server-side in UTC and displayed in your local time zone.</p>
    </>
  );
}
