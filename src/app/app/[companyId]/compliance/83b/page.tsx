import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { election83bFor } from "@/lib/governance-compliance";
import { PageHeader, Stat, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { Election83bActions } from "./election-actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "83(b) elections" };

export default async function Election83bPage(props: PageProps<"/app/[companyId]/compliance/83b">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const items = election83bFor(data);
  const docs = await db.document.findMany({ where: { companyId: C, type: "ELECTION_83B" }, select: { id: true, securityId: true } });
  const docBySecurity = new Map(docs.map((d) => [d.securityId, d.id]));
  const due = items.filter((i) => i.status === "DUE");
  const overdue = items.filter((i) => i.status === "OVERDUE");
  const missed = items.filter((i) => i.status === "MISSED");
  const filed = items.filter((i) => i.status === "FILED");

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Compliance", href: `/app/${C}/compliance` }, { label: "83(b) elections" }]} title="83(b) elections" description="Restricted stock and early-exercised options must be elected under IRC §83(b) within 30 days of transfer to lock in tax on today's value." />
      {overdue.length || missed.length ? (
        <Alert tone="danger" className="mb-5">
          {overdue.length + missed.length} election{overdue.length + missed.length === 1 ? " is" : "s are"} past the 30-day window. Late elections cannot be filed; the holder will recognize income as shares vest.
        </Alert>
      ) : due.length ? (
        <Alert tone="warning" className="mb-5">
          {due.length} election{due.length === 1 ? "" : "s"} due. Send the pre-filled form and confirm the postmark date.
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Filed" value={filed.length} tone="success" hint="Postmark on file" />
        <Stat label="Due" value={due.length} tone={due.length ? "warning" : "default"} hint={due[0] ? `Next: ${date(due[0].deadline)}` : "Inside the 30-day window"} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : "default"} hint="Past the deadline" />
        <Stat label="Missed" value={missed.length} hint="More than 30 days late" />
      </div>
      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
        <table className="data-table">
          <thead>
            <tr>
              <th>Holder</th>
              <th className="max-sm:hidden">Security</th>
              <th className="max-sm:hidden">Transfer date</th>
              <th className="max-sm:hidden">Deadline</th>
              <th className="text-right max-sm:hidden">Days left</th>
              <th>Status</th>
              <th className="max-sm:hidden">Filed</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.securityId}>
                <td className="font-medium">
                  {i.stakeholderName}
                  {/* Phones: the hidden columns fold under the holder. */}
                  <div className="mt-0.5 text-xs font-normal text-muted-foreground sm:hidden">
                    <Link href={`/app/${C}/securities/${i.securityId}`} className="font-mono hover:underline">
                      {i.certificateNumber}
                    </Link>{" "}
                    · {SECURITY_TYPE_LABELS[i.type as SecurityType] ?? i.type}
                  </div>
                  <div className={cn("text-xs font-normal text-muted-foreground sm:hidden", (i.status === "OVERDUE" || i.status === "MISSED") && "text-danger")}>{i.filedDate ? `Filed ${date(i.filedDate)}` : `Deadline ${date(i.deadline)}${i.status === "DUE" ? ` · ${i.daysRemaining}d left` : ""}`}</div>
                </td>
                <td className="max-sm:hidden">
                  <Link href={`/app/${C}/securities/${i.securityId}`} className="font-mono text-xs hover:underline">
                    {i.certificateNumber}
                  </Link>
                  <Badge variant="outline" className="ml-2">
                    {SECURITY_TYPE_LABELS[i.type as SecurityType] ?? i.type}
                  </Badge>
                </td>
                <td className="text-muted-foreground max-sm:hidden">{date(i.issueDate)}</td>
                <td className="max-sm:hidden">{date(i.deadline)}</td>
                <td className={cn("num max-sm:hidden", i.status === "DUE" && i.daysRemaining <= 7 && "font-semibold text-warning", (i.status === "OVERDUE" || i.status === "MISSED") && "text-danger")}>{i.status === "FILED" ? "—" : i.daysRemaining}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td className="text-muted-foreground max-sm:hidden">{i.filedDate ? date(i.filedDate) : "—"}</td>
                <td className="text-right">
                  <Election83bActions companyId={C} securityId={i.securityId} status={i.status} documentId={docBySecurity.get(i.securityId) ?? null} canEdit={ctx.canEdit} holderName={i.stakeholderName} />
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground">
                  No restricted stock or early exercises to track.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>About the 83(b) election</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-[13px] text-muted-foreground md:grid-cols-3">
          <div>
            <div className="font-medium text-foreground">Who files</div>
            Holders of stock subject to vesting (founder shares, RSAs) and employees who early-exercise unvested options.
          </div>
          <div>
            <div className="font-medium text-foreground">Deadline</div>
            Postmarked to the IRS within 30 days of the transfer date. There are no extensions.
          </div>
          <div>
            <div className="font-medium text-foreground">Effect</div>
            Ordinary income is recognized on the spread at transfer (often $0) instead of at each vesting date; future gains are capital gains.
          </div>
        </CardContent>
      </Card>
    </>
  );
}
