import { Download, Camera } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { asc718Assumptions, asc718Report, fiscalPeriod } from "@/lib/governance-compliance";
import { PageHeader, Stat, Section } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, ConfirmButton } from "@/components/forms";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { MonthlyBarChart } from "@/components/charts";
import { date, money, number, percent, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { saveAsc718Assumptions, snapshotAsc718 } from "../actions";
import { Asc718GrantTable } from "./grant-table";

export const metadata = { title: "ASC 718 reporting" };

export default async function Asc718Page(props: PageProps<"/app/[companyId]/compliance/asc-718">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const a = asc718Assumptions(ctx.company);
  const now = new Date();
  const fy = typeof sp.fy === "string" && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : now.getFullYear();
  const quarter = typeof sp.q === "string" && /^[1-4]$/.test(sp.q) ? Number(sp.q) : null;
  const method = sp.method === "GRADED" ? "GRADED" : sp.method === "STRAIGHT_LINE" ? "STRAIGHT_LINE" : a.method;
  const period = fiscalPeriod(ctx.company.fiscalYearEnd, fy, quarter);
  const data = await loadCapTable(C);
  const report = asc718Report(data, period.start, period.end, a, method);
  const weightedRemaining = report.grants.reduce((s, g) => s + g.unrecognized * g.remainingMonths, 0) / Math.max(1, report.unrecognized);
  const query = `fy=${fy}${quarter ? `&q=${quarter}` : ""}&method=${method}`;
  const grantRows = report.grants.map((g) => ({
    grantId: g.grantId,
    stakeholderId: g.stakeholderId,
    stakeholderName: g.stakeholderName,
    department: g.department,
    type: g.type,
    quantity: g.quantity,
    fairValuePerShare: g.fairValuePerShare,
    totalFairValue: g.totalFairValue,
    periodExpense: Object.values(g.byPeriod).reduce((x, y) => x + y, 0),
    recognizedToDate: g.recognizedToDate,
    unrecognized: g.unrecognized,
    forfeited: g.forfeited,
    remainingMonths: g.remainingMonths,
    expectedTerm: g.expectedTerm,
  }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Compliance", href: `/app/${C}/compliance` }, { label: "ASC 718" }]}
        title="Stock-based compensation (ASC 718)"
        description="Grant-date fair value via Black-Scholes, attributed over the requisite service period. Modifications, forfeitures and terminations flow through from the ledger."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <a href={`/api/companies/${C}/exports/asc-718?${query}`}>
                <Download /> Export XLSX
              </a>
            </Button>
            {ctx.canEdit ? (
              <ConfirmButton action={snapshotAsc718} hidden={{ companyId: C, fy, quarter: quarter ?? undefined, method }} title={`Snapshot ${period.label} report?`} description="Saves a dated copy of this report to Documents for your auditors." confirmLabel="Snapshot" variant="default">
                <Camera /> Snapshot report
              </ConfirmButton>
            ) : null}
          </div>
        }
      />
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <form method="get" className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap">
            <Field label="Fiscal year">
              <Select name="fy" defaultValue={String(fy)} className="sm:w-32">
                {[now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3].map((y) => (
                  <option key={y} value={y}>
                    FY{y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Period">
              <Select name="q" defaultValue={quarter ? String(quarter) : ""} className="sm:w-32">
                <option value="">Full year</option>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Attribution">
              <Select name="method" defaultValue={method} className="sm:w-40">
                <option value="STRAIGHT_LINE">Straight-line</option>
                <option value="GRADED">Graded (FIN 28)</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Run
            </Button>
          </form>
          <div className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
            {period.label}: {date(period.start)} – {date(period.end)} · fiscal year ends {ctx.company.fiscalYearEnd}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Expense — ${period.label}`} value={money(report.periodExpense)} hint={`${report.grants.length} awards · ${method === "GRADED" ? "graded" : "straight-line"}`} />
        <Stat label="Cumulative recognized" value={money(report.cumulativeExpense)} hint="Through period end" />
        <Stat label="Unrecognized cost" value={money(report.unrecognized)} hint={`Weighted remaining ${number(weightedRemaining / 12)} yrs`} />
        <Stat label="Forfeited in period" value={money(report.grants.reduce((s, g) => s + g.forfeited, 0))} hint="Unvested awards of terminated holders" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Monthly expense</CardTitle>
              <CardDescription>{period.label}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={report.byMonth.map((m) => ({ month: m.month, value: Math.round(m.expense) }))} height={220} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Valuation assumptions</CardTitle>
              <CardDescription>Applied to all option grants</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {ctx.canEdit ? (
              <ActionForm action={saveAsc718Assumptions} hidden={{ companyId: C }} className="space-y-3" successMessage="Saved">
                <Field label="Expected volatility">
                  <Input type="number" name="volatility" step={0.5} min={0} defaultValue={(a.volatility * 100).toFixed(1)} suffix="%" />
                </Field>
                <Field label="Risk-free rate">
                  <Input type="number" name="riskFreeRate" step={0.05} min={0} defaultValue={(a.riskFreeRate * 100).toFixed(2)} suffix="%" />
                </Field>
                <Field label="Forfeiture rate" hint="0% = account for forfeitures as they occur">
                  <Input type="number" name="forfeitureRate" step={0.5} min={0} defaultValue={(a.forfeitureRate * 100).toFixed(1)} suffix="%" />
                </Field>
                <Field label="Default attribution">
                  <Select name="method" defaultValue={a.method}>
                    <option value="STRAIGHT_LINE">Straight-line</option>
                    <option value="GRADED">Graded (FIN 28)</option>
                  </Select>
                </Field>
                <SubmitButton size="sm">Save assumptions</SubmitButton>
              </ActionForm>
            ) : (
              <ul className="space-y-1 text-[13px]">
                <li>Volatility: {percent(a.volatility, 1)}</li>
                <li>Risk-free rate: {percent(a.riskFreeRate, 2)}</li>
                <li>Forfeiture rate: {percent(a.forfeitureRate, 1)}</li>
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Expected term uses the SAB 107 simplified method; dividend yield is 0%.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By department / cost center</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="text-right">Expense</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {report.byDepartment.map((d) => (
                  <tr key={d.department}>
                    <td>{d.department}</td>
                    <td className="num">{money(d.expense)}</td>
                    <td className="num text-muted-foreground">{percent(report.periodExpense ? d.expense / report.periodExpense : 0, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By award type</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="text-right">Expense</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {report.byType.map((t) => (
                  <tr key={t.type}>
                    <td>
                      <Badge variant="outline">{SECURITY_TYPE_LABELS[t.type as SecurityType] ?? t.type}</Badge>
                    </td>
                    <td className="num">{money(t.expense)}</td>
                    <td className="num text-muted-foreground">{percent(report.periodExpense ? t.expense / report.periodExpense : 0, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Section title="By grant" description="Fair value, attribution and remaining cost per award" className="mt-6">
        <Asc718GrantTable companyId={C} rows={grantRows} />
      </Section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Disclosure footnote (draft)</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] leading-relaxed text-muted-foreground">
          <p>
            The Company recognized stock-based compensation expense of <strong className="text-foreground">{money(report.periodExpense)}</strong> for {period.label} under ASC 718, using the {method === "GRADED" ? "graded-vesting (accelerated)" : "straight-line"} attribution method over the requisite service period. The fair value of option awards was estimated on the grant date using the Black-Scholes model with an expected volatility of {percent(report.assumptions.volatility, 1)}, a risk-free rate of {percent(report.assumptions.riskFreeRate, 2)}, an expected dividend yield of 0% and expected terms derived from the simplified method. Forfeitures are {report.assumptions.forfeitureRate > 0 ? `estimated at ${percent(report.assumptions.forfeitureRate, 1)} annually` : "recognized as they occur"}. As of period end, total unrecognized compensation cost related to unvested awards was <strong className="text-foreground">{money(report.unrecognized)}</strong>, expected to be recognized over a weighted-average period of {number(weightedRemaining / 12)} years. During the period, {shares(report.grants.reduce((s, g) => s + g.quantity, 0))} shares underlying awards were outstanding across {report.grants.length} grants.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
