import Link from "next/link";
import { FileText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, currentValuation } from "@/lib/data/captable";
import { rule701For } from "@/lib/governance-compliance";
import { PageHeader, Stat, Section, Alert, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { ActionForm, SubmitButton, ConfirmButton } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { compactMoney, date, money, percent, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { generateRule701Disclosure, updateTotalAssets } from "../actions";

export const metadata = { title: "Rule 701" };

export default async function Rule701Page(props: PageProps<"/app/[companyId]/compliance/rule-701">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const asOfRaw = typeof sp.asOf === "string" ? new Date(sp.asOf) : null;
  const asOf = asOfRaw && !Number.isNaN(asOfRaw.getTime()) ? asOfRaw : new Date();
  const [data, valuation, disclosures] = await Promise.all([loadCapTable(C), currentValuation(C), db.complianceRecord.findMany({ where: { companyId: C, type: "RULE_701_DISCLOSURE" }, orderBy: { createdAt: "desc" } })]);
  const fmv = valuation?.fairMarketValue ?? null;
  const r = rule701For(data, fmv, asOf);
  const outstandingValue = fmv ? data.summary.totals.outstandingShares * fmv : null;
  const limits = [
    { label: "$1,000,000 floor", value: r.limitOneMillion, active: r.applicableLimit === r.limitOneMillion },
    { label: "15% of total assets", value: r.limitAssets, active: r.limitAssets !== null && r.applicableLimit === r.limitAssets, hint: ctx.company.totalAssets ? `${money(ctx.company.totalAssets)} on file` : "Total assets not set" },
    { label: "15% of outstanding securities", value: r.limitOutstanding, active: r.limitOutstanding !== null && r.applicableLimit === r.limitOutstanding, hint: outstandingValue ? `${shares(data.summary.totals.outstandingShares)} shares × ${money(fmv, { precise: true })}` : "No 409A FMV" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Compliance", href: `/app/${C}/compliance` }, { label: "Rule 701" }]}
        title="Rule 701 exemption"
        description="Compensatory issuances in any rolling 12 months must stay under the greatest of $1M, 15% of total assets, or 15% of the outstanding class. Above $10M, enhanced disclosure is required."
        actions={
          ctx.canEdit ? (
            <ConfirmButton action={generateRule701Disclosure} hidden={{ companyId: C }} title="Generate disclosure statement?" description="Creates a Rule 701(e) information statement in Documents (visible to award holders) and records the filing." confirmLabel="Generate" variant="default" successMessage="Disclosure generated">
              <FileText /> Generate disclosure statement
            </ConfirmButton>
          ) : null
        }
      />
      {r.status !== "OK" ? (
        <Alert tone={r.status === "EXCEEDED" ? "danger" : "warning"} className="mb-5">
          {r.status === "EXCEEDED" ? "Issuances in the trailing 12 months exceed the Rule 701 limit. Pause compensatory grants and consult counsel about alternative exemptions (e.g. Rule 506)." : "You have used more than 80% of the applicable limit. Plan upcoming grants carefully."}
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="12-month issuances" value={money(r.totalSalesPrice)} hint={`${date(r.windowStart)} – ${date(r.asOf)}`} />
        <Stat label="Applicable limit" value={compactMoney(r.applicableLimit)} hint="Greatest of the three tests" />
        <Stat label="Utilization" value={percent(r.utilizationPct, 1)} tone={r.status === "OK" ? "success" : r.status === "WARNING" ? "warning" : "danger"} hint={`${money(r.headroom)} headroom`} />
        <Stat label="Enhanced disclosure" value={r.requiresEnhancedDisclosure ? "Required" : "Not required"} tone={r.requiresEnhancedDisclosure ? "warning" : "default"} hint={`$10M threshold · ${percent(r.totalSalesPrice / r.enhancedDisclosureThreshold, 0)} used`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Limit tests</CardTitle>
              <CardDescription>The highest available limit applies</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {limits.map((l) => (
              <div key={l.label}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    {l.label}
                    {l.active ? <Badge variant="accent">Applies</Badge> : null}
                  </span>
                  <span className="tabular">{l.value !== null ? money(l.value) : <span className="text-muted-foreground">n/a</span>}</span>
                </div>
                {l.hint ? <div className="text-xs text-muted-foreground">{l.hint}</div> : null}
                <Progress value={l.value ? Math.min(100, (r.totalSalesPrice / l.value) * 100) : 0} className="mt-1.5" tone={l.value && r.totalSalesPrice / l.value >= 1 ? "danger" : l.value && r.totalSalesPrice / l.value >= 0.8 ? "warning" : "accent"} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inputs</CardTitle>
              <CardDescription>Adjust the as-of date or total assets</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form method="get" className="space-y-2">
              <Field label="As of date">
                <Input type="date" name="asOf" defaultValue={asOf.toISOString().slice(0, 10)} />
              </Field>
              <SubmitButton variant="secondary" size="sm">
                Recalculate
              </SubmitButton>
            </form>
            {ctx.canEdit ? (
              <ActionForm action={updateTotalAssets} hidden={{ companyId: C }} className="space-y-2 border-t border-border pt-4" successMessage="Saved">
                <Field label="Total assets (latest balance sheet)" hint="Used for the 15%-of-assets test.">
                  <Input type="number" name="totalAssets" min={0} step={1000} defaultValue={ctx.company.totalAssets ?? ""} prefix="$" />
                </Field>
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Section title="Issuances in the window" description="Options count at exercise price × shares; full-value awards at grant-date FMV × shares." className="mt-6">
        <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th className="max-sm:hidden">Date</th>
                <th>Holder</th>
                <th className="max-sm:hidden">Type</th>
                <th className="text-right max-sm:hidden">Shares</th>
                <th className="text-right">
                  <span className="max-sm:hidden">Aggregate sales price</span>
                  <span className="sm:hidden">Sales price</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {r.sales.map((s) => (
                <tr key={s.securityId}>
                  <td className="text-muted-foreground max-sm:hidden">{date(s.date)}</td>
                  <td>
                    {s.stakeholderName}
                    {/* Phones: date, type and share count fold under the holder. */}
                    <div className="text-xs tabular text-muted-foreground sm:hidden">
                      {date(s.date)} · {SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type} · {shares(s.quantity)} sh
                    </div>
                  </td>
                  <td className="max-sm:hidden">
                    <Badge variant="outline">{SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type}</Badge>
                  </td>
                  <td className="num max-sm:hidden">{shares(s.quantity)}</td>
                  <td className="num">
                    <Link href={`/app/${C}/securities/${s.securityId}`} className="hover:underline">
                      {money(s.aggregateSalesPrice, { cents: true })}
                    </Link>
                  </td>
                </tr>
              ))}
              {r.sales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground">
                    No compensatory issuances in this window.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td colSpan={3} className="max-sm:hidden" />
                <td className="num">{money(r.totalSalesPrice, { cents: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Disclosure statements</CardTitle>
          </CardHeader>
          <CardContent>
            {disclosures.length === 0 ? <p className="text-[13px] text-muted-foreground">None generated yet.</p> : null}
            <ul className="divide-y divide-border">
              {disclosures.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span>
                    {date(d.createdAt)} · {d.documentId ? <Link href={`/app/${C}/documents/${d.documentId}`} className="hover:underline">Open statement</Link> : "—"}
                  </span>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How Rule 701 works</CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] text-muted-foreground space-y-2">
            <p>Rule 701 under the Securities Act exempts compensatory securities issued to employees, directors, consultants and advisors under a written plan from registration.</p>
            <DescriptionList
              columns={1}
              items={[
                { label: "Measurement", value: <span className="block whitespace-normal">Aggregate sales price in any consecutive 12 months</span> },
                { label: "Options", value: <span className="block whitespace-normal">Measured at grant using the exercise price</span> },
                { label: "Enhanced disclosure", value: <span className="block whitespace-normal">Above $10M: financials, risk factors and plan summary a reasonable time before sale</span> },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
