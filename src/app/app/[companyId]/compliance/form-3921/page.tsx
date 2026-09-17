import Link from "next/link";
import { Download, FileText, Check } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { form3921For } from "@/lib/governance-compliance";
import { PageHeader, Stat, Alert, Section } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/forms";
import { date, money, price, shares } from "@/lib/format";
import { generate3921Forms, mark3921Filed } from "../actions";

export const metadata = { title: "Form 3921" };

export default async function Form3921Page(props: PageProps<"/app/[companyId]/compliance/form-3921">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const defaultYear = new Date().getFullYear() - 1;
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : defaultYear;
  const { records, complianceRecords, years } = await form3921For(C, year);
  const yearOptions = [...new Set([...years, defaultYear, new Date().getFullYear()])].sort((a, b) => b - a);
  const statusFor = (exerciseId: string) => complianceRecords.find((c) => c.referenceId === exerciseId);
  const generated = records.filter((r) => statusFor(r.exerciseId)?.documentId).length;
  const filed = records.filter((r) => statusFor(r.exerciseId)?.status === "FILED").length;
  const copyBDue = new Date(year + 1, 0, 31);
  const copyADue = new Date(year + 1, 2, 31);
  const overdue = new Date() > copyADue && filed < records.length && records.length > 0;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Compliance", href: `/app/${C}/compliance` }, { label: "Form 3921" }]}
        title="Form 3921 — ISO exercises"
        description="Every ISO exercise must be reported to the employee (Copy B) and the IRS (Copy A) after year end. Records are built automatically from completed exercises."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <select name="year" aria-label="Tax year" defaultValue={String(year)} className="h-9 rounded-md border border-border-strong bg-input px-2 text-[13px]">
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Tax year {y}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                View
              </Button>
            </form>
            <Button variant="secondary" asChild>
              <a href={`/api/companies/${C}/exports/form-3921?year=${year}`}>
                <Download /> Export CSV
              </a>
            </Button>
          </div>
        }
      />
      {overdue ? <Alert tone="danger" className="mb-5">Copy A for {year} was due {date(copyADue)} and {records.length - filed} filing{records.length - filed === 1 ? " is" : "s are"} not marked filed.</Alert> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`ISO exercises in ${year}`} value={records.length} hint={`${shares(records.reduce((a, r) => a + r.sharesTransferred, 0))} shares`} />
        <Stat label="Copy B generated" value={`${generated}/${records.length}`} hint={`Due to employees ${date(copyBDue)}`} tone={records.length && generated < records.length ? "warning" : "default"} />
        <Stat label="Filed with IRS" value={`${filed}/${records.length}`} hint={`Copy A due ${date(copyADue)} (electronic)`} tone={records.length && filed < records.length ? "warning" : "success"} />
        <Stat label="Aggregate spread" value={money(records.reduce((a, r) => a + r.spread, 0))} hint="FMV − exercise price, all exercises" />
      </div>
      <Section
        title={`Exercises — tax year ${year}`}
        className="mt-6"
        actions={
          ctx.canEdit && records.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmButton action={generate3921Forms} hidden={{ companyId: C, year }} title={`Generate Copy B for ${records.length} exercise(s)?`} description="Creates a Form 3921 document per employee in Documents (visible to the holder) and notifies them." confirmLabel="Generate" variant="secondary" size="sm">
                <FileText /> Generate Copy B
              </ConfirmButton>
              <ConfirmButton action={mark3921Filed} hidden={{ companyId: C, year }} title={`Mark ${year} Copy A as filed?`} description="Records that all forms for this tax year were transmitted to the IRS." confirmLabel="Mark filed" variant="default" size="sm">
                <Check /> Mark filed with IRS
              </ConfirmButton>
            </div>
          ) : null
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="max-sm:hidden">Grant date (Box 1)</th>
                <th className="max-sm:hidden">Exercise date (Box 2)</th>
                <th className="text-right max-sm:hidden">Exercise price (Box 3)</th>
                <th className="text-right max-sm:hidden">FMV at exercise (Box 4)</th>
                <th className="text-right max-sm:hidden">Shares (Box 5)</th>
                <th className="text-right max-sm:hidden">Spread</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const rec = statusFor(r.exerciseId);
                return (
                  <tr key={r.exerciseId}>
                    <td>
                      <div className="font-medium">{r.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{r.employeeTin ? "TIN on file" : <Badge variant="warning">TIN missing</Badge>}</div>
                      {/* Phones: the box values fold under the employee. */}
                      <div className="mt-1 text-xs tabular text-muted-foreground sm:hidden">
                        {shares(r.sharesTransferred)} sh · exercised {date(r.exerciseDate)}
                        <br />
                        {price(r.exercisePricePerShare)} → {price(r.fmvPerShareOnExercise)} FMV · {money(r.spread, { cents: true })} spread
                      </div>
                    </td>
                    <td className="text-muted-foreground max-sm:hidden">{date(r.grantDate)}</td>
                    <td className="text-muted-foreground max-sm:hidden">{date(r.exerciseDate)}</td>
                    <td className="num max-sm:hidden">{price(r.exercisePricePerShare)}</td>
                    <td className="num max-sm:hidden">{price(r.fmvPerShareOnExercise)}</td>
                    <td className="num max-sm:hidden">{shares(r.sharesTransferred)}</td>
                    <td className="num max-sm:hidden">{money(r.spread, { cents: true })}</td>
                    <td>
                      <StatusBadge status={rec?.status ?? "PENDING"} />
                    </td>
                    <td className="text-right">
                      {rec?.documentId ? (
                        <Link href={`/app/${C}/documents/${rec.documentId}`} className="text-xs text-accent-foreground hover:underline">
                          Copy B
                        </Link>
                      ) : (
                        <Link href={`/app/${C}/exercises/${r.exerciseId}`} className="text-xs text-muted-foreground hover:underline">
                          Exercise
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted-foreground">
                    No ISO exercises completed in {year}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Filing requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-[13px] text-muted-foreground md:grid-cols-3">
          <div>
            <div className="font-medium text-foreground">Copy B — employee</div>
            Furnish by January 31 following the year of exercise. Employees use it to compute AMT and holding periods.
          </div>
          <div>
            <div className="font-medium text-foreground">Copy A — IRS</div>
            File by February 28 (paper) or March 31 (electronic) with Form 1096. Electronic filing is required for 10+ returns.
          </div>
          <div>
            <div className="font-medium text-foreground">Penalties</div>
            $60–$330 per form depending on lateness, capped annually; intentional disregard is uncapped.
          </div>
        </CardContent>
      </Card>
    </>
  );
}
