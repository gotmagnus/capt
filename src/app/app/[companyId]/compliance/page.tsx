import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, CheckCircle2, FileText, Percent, Receipt, ShieldCheck, Stamp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, currentValuation } from "@/lib/data/captable";
import { valuationFreshness } from "@/lib/equity/compliance";
import { asc718Assumptions, asc718Report, complianceCalendar, election83bFor, fiscalPeriod, isoLimitFor, rule701For } from "@/lib/governance-compliance";
import { PageHeader, Section } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { compactMoney, date, money, percent, price } from "@/lib/format";
import { cn, parseJson } from "@/lib/utils";

export const metadata = { title: "Compliance" };

const RECORD_LABELS: Record<string, string> = {
  FORM_3921: "Form 3921",
  RULE_701_DISCLOSURE: "Rule 701 disclosure",
  ELECTION_83B: "83(b) election",
  ISO_100K_REVIEW: "ISO $100K review",
  ASC_718_REPORT: "ASC 718 report",
};

/** Who a filing is about, when the record carries it (two Form 3921 rows otherwise read identically). */
function recordSubject(data: string | null) {
  const d = parseJson<{ employee?: string; stakeholderName?: string }>(data, {});
  return d.employee ?? d.stakeholderName ?? null;
}

export default async function CompliancePage(props: PageProps<"/app/[companyId]/compliance">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const now = new Date();
  const [data, valuation, pending3921, records] = await Promise.all([
    loadCapTable(C),
    currentValuation(C),
    db.complianceRecord.count({ where: { companyId: C, type: "FORM_3921", taxYear: now.getFullYear() - 1, status: { in: ["PENDING", "GENERATED"] } } }),
    db.complianceRecord.findMany({ where: { companyId: C }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const fmv = valuation?.fairMarketValue ?? null;
  const fresh = valuationFreshness(valuation?.valuationDate ?? null, now);
  const r701 = rule701For(data, fmv, now);
  const iso = isoLimitFor(data);
  const isoExcess = iso.filter((h) => h.hasExcess);
  const isoExcessShares = isoExcess.reduce((a, h) => a + h.totalExcessShares, 0);
  const e83 = election83bFor(data, now);
  const due83 = e83.filter((x) => x.status === "DUE");
  const overdue83 = e83.filter((x) => x.status === "OVERDUE" || x.status === "MISSED");
  const lastYearExercises = data.transactions.filter((t) => t.type === "EXERCISE" && t.effectiveDate.getFullYear() === now.getFullYear() - 1).length;
  const assumptions = asc718Assumptions(ctx.company);
  const fyPeriod = fiscalPeriod(ctx.company.fiscalYearEnd, now.getFullYear());
  const asc = asc718Report(data, fyPeriod.start, fyPeriod.end, assumptions);
  const filed3921 = !pending3921 && lastYearExercises > 0;
  const calendar = complianceCalendar(data, valuation?.valuationDate ?? null, now).filter((i) => i.daysAway <= 400 || i.overdue).slice(0, 14);

  const cards = [
    {
      title: "409A valuation",
      icon: Stamp,
      status: fresh.status === "CURRENT" ? "OK" : fresh.status === "EXPIRING" ? "WARNING" : "EXCEEDED",
      statusLabel: fresh.status === "CURRENT" ? "Current" : fresh.status === "EXPIRING" ? "Expiring soon" : fresh.status === "EXPIRED" ? "Expired" : "Missing",
      headline: fmv ? `${price(fmv)} / share` : "No valuation",
      detail: fresh.expiresOn ? `Safe harbor until ${date(fresh.expiresOn)} (${fresh.daysRemaining} days)` : "Request a valuation before granting options.",
      href: `/app/${C}/valuations`,
    },
    {
      title: "Rule 701",
      icon: Percent,
      status: r701.status,
      statusLabel: r701.status === "OK" ? "Within limits" : r701.status === "WARNING" ? "Approaching limit" : "Limit exceeded",
      headline: `${money(r701.totalSalesPrice)} of ${compactMoney(r701.applicableLimit)}`,
      detail: `${percent(r701.utilizationPct, 0)} of the 12-month limit used${r701.requiresEnhancedDisclosure ? " · enhanced disclosure required" : ""}`,
      href: `/app/${C}/compliance/rule-701`,
      progress: Math.min(100, r701.utilizationPct * 100),
    },
    {
      title: "ISO $100K limit",
      icon: BarChart3,
      status: isoExcess.length ? "WARNING" : "OK",
      statusLabel: isoExcess.length ? `${isoExcess.length} holder${isoExcess.length === 1 ? "" : "s"} over` : "No excess",
      headline: `${iso.length} ISO holders reviewed`,
      detail: isoExcess.length ? `${isoExcessShares.toLocaleString()} share${isoExcessShares === 1 ? "" : "s"} should be treated as NSOs` : "All grants within the annual first-exercisable limit.",
      href: `/app/${C}/compliance/iso-limit`,
    },
    {
      title: "83(b) elections",
      icon: FileText,
      status: overdue83.length ? "EXCEEDED" : due83.length ? "WARNING" : "OK",
      statusLabel: overdue83.length ? `${overdue83.length} overdue` : due83.length ? `${due83.length} due` : "All filed",
      headline: `${e83.filter((x) => x.status === "FILED").length} of ${e83.length} filed`,
      detail: due83.length ? `Next deadline ${date(due83[0].deadline)}` : "Restricted stock and early exercises are tracked automatically.",
      href: `/app/${C}/compliance/83b`,
    },
    {
      title: `Form 3921 (${now.getFullYear() - 1})`,
      icon: Receipt,
      status: pending3921 ? "WARNING" : "OK",
      statusLabel: pending3921 ? `${pending3921} not filed` : lastYearExercises ? "Filed" : "Nothing to file",
      headline: `${lastYearExercises} ISO exercise${lastYearExercises === 1 ? "" : "s"} last year`,
      detail: `Copy B due Jan 31, Copy A due Mar 31, ${now.getFullYear()}.`,
      href: `/app/${C}/compliance/form-3921?year=${now.getFullYear() - 1}`,
    },
    {
      title: `ASC 718 (${fyPeriod.label})`,
      icon: ShieldCheck,
      status: "OK",
      statusLabel: assumptions.method === "GRADED" ? "Graded" : "Straight-line",
      headline: money(asc.periodExpense),
      detail: `${money(asc.unrecognized)} unrecognized · ${asc.grants.length} awards`,
      href: `/app/${C}/compliance/asc-718`,
    },
  ];

  return (
    <>
      <PageHeader title="Compliance" description="Automated checks across tax, securities and accounting rules, with the documents your auditors and employees need." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.title} href={c.href} className="group">
            <Card className="h-full transition-colors group-hover:border-border-strong">
              <CardContent className="flex h-full flex-col pb-4 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <c.icon className="size-4 shrink-0 text-muted-foreground" /> {c.title}
                  </div>
                  <Badge variant={c.status === "OK" ? "success" : c.status === "WARNING" ? "warning" : "danger"} dot>
                    {c.statusLabel}
                  </Badge>
                </div>
                <div className="mt-3 text-xl font-semibold tabular">{c.headline}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.detail}</div>
                {c.progress !== undefined ? <Progress value={c.progress} className="mt-3" tone={c.status === "OK" ? "accent" : c.status === "WARNING" ? "warning" : "danger"} /> : null}
                <div className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-accent-foreground">
                  Review <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Section title="Compliance calendar" description="Upcoming deadlines derived from the ledger" className="lg:col-span-2">
          <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th className="max-sm:hidden">Detail</th>
                  <th className="text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((i, idx) => {
                  // The ledger-derived deadline does not know about filings; don't call a filed form overdue.
                  const filed = i.kind === "3921" && i.overdue && filed3921;
                  return (
                    <tr key={idx}>
                      <td className={cn("tabular max-sm:align-top", i.overdue && !filed && "text-danger")}>{date(i.date)}</td>
                      <td className="max-sm:min-w-[9.5rem] max-sm:whitespace-normal">
                        <Link href={i.href} className="font-medium hover:underline">
                          {i.title}
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">{i.detail}</div>
                      </td>
                      <td className="min-w-[14rem] whitespace-normal text-muted-foreground max-sm:hidden">{i.detail}</td>
                      <td className="num max-sm:align-top">
                        {filed ? (
                          <Badge variant="success">Filed</Badge>
                        ) : i.overdue ? (
                          <Badge variant="danger">{Math.abs(i.daysAway)}d overdue</Badge>
                        ) : i.daysAway <= 30 ? (
                          <Badge variant="warning">in {i.daysAway}d</Badge>
                        ) : (
                          <span className="text-muted-foreground">in {i.daysAway}d</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {calendar.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-muted-foreground">
                      <CheckCircle2 className="mr-1 inline size-4 text-success" /> No upcoming deadlines.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Recent filings" description="Generated forms and reviews">
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="font-medium">
                    {RECORD_LABELS[r.type] ?? r.type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                    {r.taxYear ? ` · ${r.taxYear}` : ""}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {recordSubject(r.data) ? `${recordSubject(r.data)} · ` : ""}
                    {r.completedAt ? `Completed ${date(r.completedAt)}` : r.dueDate ? `Due ${date(r.dueDate)}` : date(r.createdAt)}
                  </div>
                </div>
                {r.documentId ? (
                  <Link href={`/app/${C}/documents/${r.documentId}`} className="shrink-0">
                    <StatusBadge status={r.status} />
                  </Link>
                ) : (
                  <StatusBadge status={r.status} />
                )}
              </div>
            ))}
            {records.length === 0 ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">No filings recorded yet.</div> : null}
          </div>
          <div className="rounded-md border border-amber-200 bg-warning-soft px-4 py-3 text-xs text-warning">
            <AlertTriangle className="mr-1 inline size-3.5" /> Checks are computed from ledger data and IRS/SEC thresholds as of 2025. They are not legal or tax advice.
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" /> Fiscal year ends {ctx.company.fiscalYearEnd} · Total assets on file {money(ctx.company.totalAssets)}
          </div>
        </Section>
      </div>
    </>
  );
}
