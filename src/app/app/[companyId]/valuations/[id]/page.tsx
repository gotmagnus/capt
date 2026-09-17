import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Gavel, Info } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { latestRound } from "@/lib/data/captable";
import { valuationFreshness } from "@/lib/equity/compliance";
import { parseJson } from "@/lib/utils";
import { compactMoney, date, dateTime, humanize, money, price } from "@/lib/format";
import { PageHeader, Stat, DescriptionList, Alert, Section } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { ValuationTimeline } from "./timeline";
import { ValuationActions } from "./valuation-actions";

export const metadata = { title: "409A valuation" };

const PURPOSE: Record<string, string> = { ANNUAL: "Annual refresh", MATERIAL_EVENT: "Material event", FINANCING: "Post-financing", INITIAL: "Initial" };
const LIQUIDITY: Record<string, string> = { "<2": "Less than 2 years", "2-3": "2–3 years", "3-5": "3–5 years", ">5": "More than 5 years" };

export default async function ValuationDetailPage(props: PageProps<"/app/[companyId]/valuations/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const valuation = await db.valuation.findFirst({ where: { id, companyId: C } });
  if (!valuation) notFound();
  const [report, consent, round] = await Promise.all([
    valuation.reportDocumentId ? db.document.findFirst({ where: { id: valuation.reportDocumentId, companyId: C } }) : null,
    valuation.boardConsentId ? db.boardConsent.findFirst({ where: { id: valuation.boardConsentId, companyId: C }, include: { signers: true } }) : null,
    latestRound(C),
  ]);
  const intake = parseJson<Record<string, string | number | null>>(valuation.intake, {});
  const fresh = valuation.status === "ACCEPTED" ? valuationFreshness(valuation.valuationDate) : null;
  const label = date(valuation.valuationDate, "long");
  const intakeItems = [
    { label: "TTM revenue", value: intake.revenueTtm != null ? money(Number(intake.revenueTtm)) : "—" },
    { label: "Forward revenue", value: intake.revenueForward != null ? money(Number(intake.revenueForward)) : "—" },
    { label: "Cash balance", value: intake.cashBalance != null ? money(Number(intake.cashBalance)) : "—" },
    { label: "Monthly burn", value: intake.burnMonthly != null ? money(Number(intake.burnMonthly)) : "—" },
    { label: "Total debt", value: intake.totalDebt != null ? money(Number(intake.totalDebt)) : "—" },
    { label: "Headcount", value: intake.headcount != null ? String(intake.headcount) : "—" },
    { label: "Expected liquidity", value: intake.expectedLiquidity ? LIQUIDITY[String(intake.expectedLiquidity)] ?? String(intake.expectedLiquidity) : "—" },
    { label: "Submitted", value: intake.submittedBy ? `${intake.submittedBy}${intake.submittedAt ? ` · ${date(String(intake.submittedAt))}` : ""}` : "—" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "409A valuations", href: `/app/${C}/valuations` }, { label: label }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            409A valuation — {label} <StatusBadge status={valuation.status} />
          </span>
        }
        description={`${PURPOSE[valuation.purpose] ?? valuation.purpose} · ${valuation.provider}${valuation.analyst ? ` · ${valuation.analyst}` : ""} · requested ${date(valuation.requestedAt)}`}
        actions={ctx.canEdit ? <ValuationActions companyId={C} valuation={valuation} defaults={{ preferredPrice: round?.pricePerShare ?? null }} /> : null}
      />

      <Card className="mb-5">
        <CardContent className="pt-5">
          <ValuationTimeline status={valuation.status} dates={{ REQUESTED: dateTime(valuation.requestedAt), IN_PROGRESS: valuation.status !== "REQUESTED" ? "Analyst assigned" : null, DRAFT_DELIVERED: valuation.deliveredAt ? dateTime(valuation.deliveredAt) : null, ACCEPTED: valuation.acceptedAt ? dateTime(valuation.acceptedAt) : null }} />
        </CardContent>
      </Card>

      {valuation.status === "DRAFT_DELIVERED" ? (
        <Alert tone="info" icon={Info} className="mb-5">
          Review the draft below. Accepting sets the FMV for new grants and drafts a board consent; you can also send it back to the analyst with comments.
        </Alert>
      ) : null}
      {fresh ? (
        <Alert tone={fresh.status === "CURRENT" ? "success" : fresh.status === "EXPIRING" ? "warning" : "danger"} className="mb-5">
          {fresh.status === "CURRENT" ? `Inside the safe harbor for ${fresh.daysRemaining} more days (through ${date(fresh.expiresOn)}), absent a material event.` : fresh.status === "EXPIRING" ? `Safe harbor ends in ${fresh.daysRemaining} days on ${date(fresh.expiresOn)}. Request a refresh now to avoid a gap.` : `Safe harbor ended ${date(fresh.expiresOn)}.`}
        </Alert>
      ) : null}

      {valuation.fairMarketValue != null ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Common FMV" value={price(valuation.fairMarketValue)} hint="per share" tone="accent" />
          <Stat label="Preferred price" value={price(valuation.preferredPrice)} hint={valuation.preferredPrice ? `common at ${((valuation.fairMarketValue / valuation.preferredPrice) * 100).toFixed(0)}% of preferred` : undefined} />
          <Stat label="Enterprise value" value={compactMoney(valuation.enterpriseValue)} hint={valuation.equityValue ? `equity ${compactMoney(valuation.equityValue)}` : undefined} />
          <Stat label="Methodology" value={valuation.methodology ? humanize(valuation.methodology) : "—"} hint={valuation.dlomPercent != null ? `${valuation.dlomPercent}% DLOM` : undefined} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {report?.content ? (
            <Card>
              <CardHeader className="flex-col gap-2 sm:flex-row sm:gap-4">
                <div>
                  <CardTitle>Valuation report</CardTitle>
                  <CardDescription>
                    {report.name} · version {report.version}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="max-sm:-ml-3" asChild>
                  <Link href={`/app/${C}/documents/${report.id}`}>
                    <FileText /> Open in documents
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="max-sm:px-3 max-sm:pb-3">
                <div className="rounded-md border border-border bg-white p-4 sm:p-5">
                  <Markdown content={report.content} className="max-sm:text-[13px]" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-[13px] text-muted-foreground">
                <FileText className="mx-auto mb-2 size-5 text-subtle" />
                The report appears here once the analyst delivers a draft.
              </CardContent>
            </Card>
          )}

          <Section title="Intake">
            <Card>
              <CardContent className="pt-5 space-y-4">
                {Object.keys(intake).length ? <DescriptionList columns={4} items={intakeItems} /> : null}
                {intake.recentFinancing ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Recent financing</div>
                    <p className="mt-0.5 text-[13px]">{String(intake.recentFinancing)}</p>
                  </div>
                ) : null}
                {intake.materialEvents ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Material events</div>
                    <p className="mt-0.5 text-[13px] whitespace-pre-line">{String(intake.materialEvents)}</p>
                  </div>
                ) : null}
                {!Object.keys(intake).length ? <p className="text-[13px] text-muted-foreground">No intake questionnaire on file for this valuation.</p> : null}
              </CardContent>
            </Card>
          </Section>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Assumptions</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                className="sm:grid-cols-2 lg:grid-cols-1"
                items={[
                  { label: "Valuation date", value: label },
                  { label: "Effective period", value: valuation.effectiveFrom ? `${date(valuation.effectiveFrom)} – ${date(valuation.effectiveTo)}` : "—" },
                  { label: "Volatility", value: valuation.volatility != null ? `${(valuation.volatility * 100).toFixed(1)}%` : "—" },
                  { label: "Risk-free rate", value: valuation.riskFreeRate != null ? `${(valuation.riskFreeRate * 100).toFixed(2)}%` : "—" },
                  { label: "Time to liquidity", value: valuation.timeToLiquidity != null ? `${valuation.timeToLiquidity} years` : "—" },
                  { label: "DLOM", value: valuation.dlomPercent != null ? `${valuation.dlomPercent}%` : "—" },
                  { label: "Delivered", value: date(valuation.deliveredAt) },
                  { label: "Accepted", value: date(valuation.acceptedAt) },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Board approval</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {consent ? (
                <Link href={`/app/${C}/board/${consent.id}`} className="flex items-center gap-2 rounded-md border border-border p-3 text-[13px] hover:bg-muted/50">
                  <Gavel className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{consent.title}</span>
                  <StatusBadge status={consent.status} />
                </Link>
              ) : (
                <p className="text-[13px] text-muted-foreground">{valuation.status === "ACCEPTED" ? "No consent linked." : "A ratifying board consent is drafted when the valuation is accepted."}</p>
              )}
              {consent ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {consent.signers.filter((s) => s.status === "SIGNED").length} of {consent.signers.length} directors signed
                </p>
              ) : null}
            </CardContent>
          </Card>
          {valuation.notes ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Notes</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] whitespace-pre-line text-muted-foreground">{valuation.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
