import Link from "next/link";
import { ArrowRight, BarChart3, Briefcase, CalendarClock, Clock, FileBadge, FileText, History, Layers, List, Rocket, ShieldCheck, Table2, Trash2, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { REPORTS, REPORT_GROUPS, type ReportDef, type ScheduledReport } from "@/lib/reports";
import { parseJson } from "@/lib/utils";
import { date } from "@/lib/format";
import { PageHeader, Section } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormDialog, ConfirmButton } from "@/components/forms";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { addScheduledReport, removeScheduledReport } from "./actions";
import { db } from "@/lib/db";

export const metadata = { title: "Reports" };

const ICONS: Record<ReportDef["icon"], typeof Table2> = { table: Table2, layers: Layers, badge: FileBadge, calendar: CalendarClock, rocket: Rocket, users: Users, briefcase: Briefcase, chart: BarChart3, shield: ShieldCheck, file: FileText, history: History, list: List };

export default async function ReportsPage(props: PageProps<"/app/[companyId]/reports">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const settings = parseJson<{ scheduledReports?: ScheduledReport[]; reportRuns?: Record<string, string> }>(ctx.company.settings, {});
  const schedules = settings.scheduledReports ?? [];
  const runs = settings.reportRuns ?? {};
  const exportLogs = await db.auditLog.findMany({ where: { companyId: C, action: "EXPORT" }, orderBy: { createdAt: "desc" }, take: 50 });
  const lastExport = new Map<string, Date>();
  for (const l of exportLogs) if (l.entityId && !lastExport.has(l.entityId)) lastExport.set(l.entityId, l.createdAt);

  return (
    <>
      <PageHeader title="Reports" description="Audit-ready exports of your cap table, equity ledgers, compliance data and activity. Every report can be downloaded as CSV or Excel." />
      {REPORT_GROUPS.map((group) => (
        <Section key={group} title={group} className="mb-6 sm:mb-8">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {REPORTS.filter((r) => r.group === group).map((r) => {
              const Icon = ICONS[r.icon];
              const last = lastExport.get(r.id) ?? (runs[r.id] ? new Date(runs[r.id]) : null);
              return (
                <Link key={r.id} href={`/app/${C}/reports/${r.id}`} className="group relative flex gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-border-strong hover:bg-muted/30 sm:flex-col sm:gap-0 sm:p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft">
                    <Icon className="size-4 text-accent-foreground" />
                  </div>
                  <ArrowRight className="absolute right-4 top-4 hidden size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="text-[14px] font-semibold sm:mt-3">{r.name}</h3>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground sm:mt-1">{r.description}</p>
                    <div className="mt-auto flex min-h-[22px] items-center gap-2 pt-2 text-[11px] text-muted-foreground sm:pt-3">
                      <Clock className="size-3 shrink-0" />
                      {last ? `Last exported ${date(last)}` : "Never exported"}
                      {r.params.length ? <Badge variant="neutral" className="ml-auto">{r.params.includes("asOf") ? "As-of date" : r.params.includes("year") ? "Tax year" : "Date range"}</Badge> : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      ))}

      <Card>
        <CardHeader className="flex-col sm:flex-row">
          <div className="min-w-0">
            <CardTitle>Scheduled reports</CardTitle>
            <CardDescription>Email a report on a recurring schedule. Delivery uses your configured email provider.</CardDescription>
          </div>
          {ctx.canEdit ? (
            <FormDialog trigger={<Button variant="secondary" size="sm" className="shrink-0">Add schedule</Button>} title="Schedule a report" action={addScheduledReport} hidden={{ companyId: C }} submitLabel="Schedule" successMessage="Schedule added">
              <Field label="Report">
                <Select name="reportId" defaultValue="cap-table-summary">
                  {REPORTS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frequency">
                  <Select name="frequency" defaultValue="MONTHLY">
                    <option value="WEEKLY">Weekly (Mondays)</option>
                    <option value="MONTHLY">Monthly (1st)</option>
                    <option value="QUARTERLY">Quarterly</option>
                  </Select>
                </Field>
                <Field label="Format">
                  <Select name="format" defaultValue="xlsx">
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                  </Select>
                </Field>
              </div>
              <Field label="Recipients" hint="Comma-separated email addresses.">
                <Input name="recipients" placeholder="finance@example.com, counsel@example.com" defaultValue={ctx.user.email} required />
              </Field>
            </FormDialog>
          ) : null}
        </CardHeader>
        <CardContent className={schedules.length ? "max-sm:px-0 max-sm:pb-0" : undefined}>
          {schedules.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No scheduled reports yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Frequency</th>
                  <th>Format</th>
                  <th>Recipients</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{REPORTS.find((r) => r.id === s.reportId)?.name ?? s.reportId}</td>
                    <td className="capitalize">{s.frequency.toLowerCase()}</td>
                    <td className="uppercase text-xs">{s.format}</td>
                    <td className="text-muted-foreground">{s.recipients.join(", ")}</td>
                    <td className="text-muted-foreground">{date(s.createdAt)}</td>
                    <td className="text-right">
                      {ctx.canEdit ? (
                        <ConfirmButton action={removeScheduledReport} hidden={{ companyId: C, id: s.id }} title="Remove schedule?" variant="ghost" size="xs" confirmLabel="Remove" successMessage="Schedule removed">
                          <Trash2 className="size-3.5" />
                        </ConfirmButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
