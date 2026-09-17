import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { isoLimitFor } from "@/lib/governance-compliance";
import { PageHeader, Stat, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IsoLimitTable } from "./iso-limit-table";
import { date, money } from "@/lib/format";

export const metadata = { title: "ISO $100K limit" };

export default async function IsoLimitPage(props: PageProps<"/app/[companyId]/compliance/iso-limit">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, reviews] = await Promise.all([loadCapTable(C), db.complianceRecord.findMany({ where: { companyId: C, type: "ISO_100K_REVIEW" }, orderBy: { createdAt: "desc" }, take: 10 })]);
  const holders = isoLimitFor(data);
  const withExcess = holders.filter((h) => h.hasExcess);
  const certs = new Map(data.securities.map((s) => [s.id, s.certificateNumber]));
  const rows = holders.map((h) => ({
    stakeholderId: h.stakeholderId,
    stakeholderName: h.stakeholderName,
    totalExcessShares: h.totalExcessShares,
    hasExcess: h.hasExcess,
    years: h.years.map((y) => ({ ...y, grants: y.grants.map((g) => ({ ...g, certificateNumber: certs.get(g.securityId) ?? g.securityId, alreadySplit: data.securities.some((s) => s.isoLimitSplitFrom === g.securityId) })) })),
  }));

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Compliance", href: `/app/${C}/compliance` }, { label: "ISO $100K limit" }]} title="ISO $100,000 limit" description="Under IRC §422(d), ISOs first exercisable in a calendar year are limited to $100,000 of grant-date FMV per employee. The excess is treated as a non-qualified option." />
      {withExcess.length ? (
        <Alert tone="warning" className="mb-5">
          {withExcess.length} holder{withExcess.length === 1 ? " exceeds" : "s exceed"} the limit in at least one year. Use “Split excess to NSO” to reclassify the excess shares and keep the ISO portion qualified.
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="ISO holders" value={holders.length} hint="With outstanding ISO grants" />
        <Stat label="Holders over limit" value={withExcess.length} tone={withExcess.length ? "warning" : "success"} hint="In at least one calendar year" />
        <Stat label="Excess shares" value={withExcess.reduce((a, h) => a + h.totalExcessShares, 0).toLocaleString()} hint="To be treated as NSOs" />
        <Stat label="Annual limit" value={money(100_000)} hint="Grant-date FMV, per employee, per year" />
      </div>
      <div className="mt-5">
        <IsoLimitTable companyId={C} rows={rows} canEdit={ctx.canEdit} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Review history</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? <p className="text-[13px] text-muted-foreground">No splits recorded yet.</p> : null}
          <ul className="divide-y divide-border text-[13px]">
            {reviews.map((r) => {
              const d = JSON.parse(r.data || "{}") as { stakeholderName?: string; excessShares?: number; grants?: number };
              return (
                <li key={r.id} className="py-2">
                  {d.stakeholderName ?? "Holder"} — {d.excessShares?.toLocaleString() ?? 0} shares reclassified for {r.taxYear} ({d.grants ?? 0} grant{d.grants === 1 ? "" : "s"}) {r.completedAt ? ` · ${date(r.completedAt)}` : ""}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
