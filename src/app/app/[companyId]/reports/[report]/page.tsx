import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getReport, resolveParams, runReport } from "@/lib/reports";
import { date, toInputDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ReportTable } from "../report-table";

export async function generateMetadata(props: PageProps<"/app/[companyId]/reports/[report]">) {
  const { report } = await props.params;
  return { title: getReport(report)?.name ?? "Report" };
}

export default async function ReportPage(props: PageProps<"/app/[companyId]/reports/[report]">) {
  const { companyId, report: reportId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const report = getReport(reportId);
  if (!report) notFound();
  const params = resolveParams(sp);
  const { rows } = await runReport(C, report, params);

  const qs = new URLSearchParams();
  if (report.params.includes("asOf")) qs.set("asOf", toInputDate(params.asOf));
  if (report.params.includes("year")) qs.set("year", String(params.year));
  if (report.params.includes("range")) {
    qs.set("from", toInputDate(params.from));
    qs.set("to", toInputDate(params.to));
  }
  const exportBase = `/api/companies/${C}/reports/${report.id}?${qs.toString()}`;
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <PageHeader
        title={report.name}
        description={report.description}
        breadcrumbs={[{ label: "Reports", href: `/app/${C}/reports` }, { label: report.group }, { label: report.name }]}
        actions={
          <>
            <Button variant="secondary" asChild>
              <a href={`${exportBase}&format=csv`}>
                <Download /> CSV
              </a>
            </Button>
            <Button asChild>
              <a href={`${exportBase}&format=xlsx`}>
                <FileSpreadsheet /> Excel
              </a>
            </Button>
          </>
        }
      />

      {report.params.length ? (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
          {report.params.includes("asOf") ? (
            <Field label="As of date" className="min-w-0 flex-1 sm:flex-none">
              <Input type="date" name="asOf" defaultValue={toInputDate(params.asOf)} className="sm:w-44" />
            </Field>
          ) : null}
          {report.params.includes("year") ? (
            <Field label="Tax year" className="min-w-0 flex-1 sm:w-32 sm:flex-none">
              <Select name="year" defaultValue={String(params.year)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {report.params.includes("range") ? (
            <>
              <Field label="From" className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto">
                <Input type="date" name="from" defaultValue={toInputDate(params.from)} className="sm:w-44" />
              </Field>
              <Field label="To" className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto">
                <Input type="date" name="to" defaultValue={toInputDate(params.to)} className="sm:w-44" />
              </Field>
            </>
          ) : null}
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          <span className="w-full text-xs text-muted-foreground tabular sm:ml-auto sm:w-auto">
            {rows.length.toLocaleString()} rows · generated {date(new Date(), "long")}
          </span>
        </form>
      ) : (
        <p className="mb-4 text-xs text-muted-foreground">
          {rows.length.toLocaleString()} rows · generated {date(new Date(), "long")} ·{" "}
          <Link href={`/app/${C}/reports`} className="hover:underline">
            All reports
          </Link>
        </p>
      )}

      <ReportTable columns={report.columns} rows={rows} />
    </>
  );
}
