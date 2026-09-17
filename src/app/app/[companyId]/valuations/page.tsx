import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, FileText, Info, Plus, ShieldCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, latestRound } from "@/lib/data/captable";
import { valuationFreshness } from "@/lib/equity/compliance";
import { compactMoney, date, humanize, price, relative } from "@/lib/format";
import { PageHeader, Stat, Section, EmptyState, Alert, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FmvHistoryChart } from "@/components/valuations-chart";
import { ValuationTimeline } from "./[id]/timeline";

export const metadata = { title: "409A valuations" };

const PURPOSE: Record<string, string> = { ANNUAL: "Annual refresh", MATERIAL_EVENT: "Material event", FINANCING: "Post-financing", INITIAL: "Initial" };

export default async function ValuationsPage(props: PageProps<"/app/[companyId]/valuations">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [valuations, current, round] = await Promise.all([db.valuation.findMany({ where: { companyId: C }, orderBy: { valuationDate: "desc" } }), currentValuation(C), latestRound(C)]);
  const fresh = valuationFreshness(current?.valuationDate ?? null);
  const pending = valuations.find((v) => ["REQUESTED", "IN_PROGRESS", "DRAFT_DELIVERED"].includes(v.status));
  const history = valuations
    .filter((v) => v.fairMarketValue != null)
    .slice()
    .sort((a, b) => a.valuationDate.getTime() - b.valuationDate.getTime())
    .map((v) => ({ date: v.valuationDate.toISOString(), label: date(v.valuationDate), fmv: v.fairMarketValue, preferred: v.preferredPrice }));
  const ratio = current?.fairMarketValue && current.preferredPrice ? current.fairMarketValue / current.preferredPrice : null;

  return (
    <>
      <PageHeader
        title="409A valuations"
        description="Independent fair market value determinations for common stock. Grants priced at or above the current FMV fall inside the IRS safe harbor."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/valuations/request`}>
                <Plus /> Request valuation
              </Link>
            </Button>
          ) : null
        }
      />

      {fresh.status !== "CURRENT" ? (
        <Alert tone={fresh.status === "EXPIRING" ? "warning" : "danger"} icon={AlertTriangle} className="mb-5">
          {fresh.status === "MISSING" ? "No accepted valuation on file — options cannot be granted inside the safe harbor." : fresh.status === "EXPIRED" ? `The current valuation expired ${date(fresh.expiresOn)}. Grants made now are outside the safe harbor.` : `The current valuation expires in ${fresh.daysRemaining} days (${date(fresh.expiresOn)}).`}{" "}
          {pending ? (
            <>
              A refresh is <Link href={`/app/${C}/valuations/${pending.id}`} className="font-medium underline">{humanize(pending.status).toLowerCase()}</Link>.
            </>
          ) : ctx.canEdit ? (
            <Link href={`/app/${C}/valuations/request`} className="font-medium underline">
              Request a refresh
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Current fair market value</CardTitle>
              <CardDescription>{current ? `Valued as of ${date(current.valuationDate, "long")} by ${current.provider}` : "No accepted valuation"}</CardDescription>
            </div>
            {current ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${C}/valuations/${current.id}`}>
                  Details <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {current ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Common FMV" value={price(current.fairMarketValue)} tone={fresh.status === "CURRENT" ? "success" : "warning"} hint="per share" className="md:col-span-1" />
                <Stat label="Preferred price" value={price(current.preferredPrice)} hint={round ? round.name : "last round"} />
                <Stat label="Common / preferred" value={ratio != null ? `${(ratio * 100).toFixed(0)}%` : "—"} hint="typical early-stage: 20–40%" />
                <Stat label="Safe harbor" value={fresh.status === "CURRENT" ? `${fresh.daysRemaining}d left` : fresh.status === "EXPIRING" ? `${fresh.daysRemaining}d left` : "Expired"} tone={fresh.status === "CURRENT" ? "default" : fresh.status === "EXPIRING" ? "warning" : "danger"} hint={`until ${date(fresh.expiresOn)}`} icon={CalendarClock} />
                <div className="col-span-2 md:col-span-4 mt-2">
                  <DescriptionList
                    columns={4}
                    items={[
                      { label: "Methodology", value: current.methodology ? humanize(current.methodology) : "—" },
                      { label: "Enterprise value", value: compactMoney(current.enterpriseValue) },
                      { label: "DLOM", value: current.dlomPercent != null ? `${current.dlomPercent}%` : "—" },
                      { label: "Accepted", value: `${date(current.acceptedAt)}${current.boardConsentId ? " · board approved" : ""}` },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <EmptyState icon={BarChart3} title="No valuation yet" description="Request your first 409A to price option grants." action={ctx.canEdit ? <Button asChild><Link href={`/app/${C}/valuations/request`}>Request valuation</Link></Button> : undefined} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{pending ? "In-flight request" : "Safe harbor"}</CardTitle>
              <CardDescription>{pending ? `${PURPOSE[pending.purpose] ?? pending.purpose} · requested ${relative(pending.requestedAt)}` : "IRC §409A presumption of reasonableness"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {pending ? (
              <>
                <ValuationTimeline status={pending.status} compact />
                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge status={pending.status} />
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/app/${C}/valuations/${pending.id}`}>Open request</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2 text-[13px] text-muted-foreground">
                <p className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> An independent appraisal is presumed reasonable for 12 months from the valuation date, unless a material event (financing, major contract, M&A) occurs first.
                </p>
                <p className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" /> Grant exercise prices at or above the FMV to avoid §409A penalties (20% additional tax plus interest for the employee).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Section title="FMV history" description="Common fair market value versus the latest preferred price at each valuation date" className="mt-8">
        <Card>
          <CardContent className="pt-5">{history.length ? <FmvHistoryChart data={history} /> : <p className="text-[13px] text-muted-foreground">No completed valuations to chart.</p>}</CardContent>
        </Card>
      </Section>

      <Section title="All valuations" className="mt-8">
        {valuations.length === 0 ? (
          <EmptyState icon={FileText} title="No valuations" />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto scrollbar-thin">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Valuation date</th>
                  <th className="max-sm:hidden">Purpose</th>
                  <th className="text-right">Common FMV</th>
                  <th className="text-right max-sm:hidden">Preferred</th>
                  <th className="text-right max-sm:hidden">Enterprise value</th>
                  <th className="max-sm:hidden">Method</th>
                  <th className="max-sm:hidden">Provider</th>
                  <th className="max-sm:hidden">Effective</th>
                  <th>Status</th>
                  <th className="max-sm:hidden">Report</th>
                </tr>
              </thead>
              <tbody>
                {valuations.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/app/${C}/valuations/${v.id}`} className="font-medium hover:underline">
                        {date(v.valuationDate)}
                      </Link>
                      {/* Phones: purpose and method fold under the date. */}
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {PURPOSE[v.purpose] ?? v.purpose}
                        {v.methodology ? ` · ${humanize(v.methodology)}` : ""}
                      </div>
                    </td>
                    <td className="max-sm:hidden">
                      <Badge variant="outline">{PURPOSE[v.purpose] ?? v.purpose}</Badge>
                    </td>
                    <td className="num font-medium">{price(v.fairMarketValue)}</td>
                    <td className="num max-sm:hidden">{price(v.preferredPrice)}</td>
                    <td className="num max-sm:hidden">{compactMoney(v.enterpriseValue)}</td>
                    <td className="text-muted-foreground max-sm:hidden">{v.methodology ? humanize(v.methodology) : "—"}</td>
                    <td className="text-muted-foreground max-sm:hidden">{v.provider}</td>
                    <td className="text-muted-foreground max-sm:hidden">{v.effectiveFrom ? `${date(v.effectiveFrom)} – ${date(v.effectiveTo)}` : "—"}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="max-sm:hidden">
                      {v.reportDocumentId ? (
                        <Link href={`/app/${C}/documents/${v.reportDocumentId}`} className="inline-flex items-center gap-1 text-accent-foreground hover:underline">
                          <FileText className="size-3.5" /> Report
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
