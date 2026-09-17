import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, FileText } from "lucide-react";
import { requireCompany } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPortal } from "@/lib/portal-data";
import { vestingDescription } from "@/lib/documents/templates";
import { date, money, percent, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { PageHeader, Stat, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";

export const metadata = { title: "Holding" };

export default async function HoldingDetailPage(props: PageProps<"/portal/[companyId]/holdings/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  const h = p.holdings.find((x) => x.security.id === id);
  if (!h) notFound();
  const s = h.security;
  const [documents, requests] = await Promise.all([
    db.document.findMany({ where: { companyId: C, securityId: s.id }, orderBy: { createdAt: "desc" } }),
    db.exerciseRequest.findMany({ where: { securityId: s.id }, orderBy: { requestedAt: "desc" } }),
  ]);
  const now = new Date();
  const typeLabel = SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type;
  // Sentence form of the type for the header ("40,000 ISO options", "30,000 shares of common stock") — never lower-case acronyms.
  const typeNoun = s.type.startsWith("OPTION") ? `${typeLabel} options` : s.type === "RSU" ? "RSUs" : s.type === "WARRANT" ? "warrant shares" : s.type === "PROFITS_INTEREST" ? "profits interest units" : `shares of ${typeLabel.toLowerCase()}`;
  const schedule = s.vestingSchedule;

  return (
    <>
      <PageHeader
        title={`${s.certificateNumber} · ${typeLabel}`}
        description={`${h.isConvertible ? money(s.totalAmount) : shares(s.quantity)} ${h.isConvertible ? "invested" : typeNoun} issued ${date(s.issueDate, "long")}`}
        breadcrumbs={[{ label: "Holdings", href: `/portal/${C}/holdings` }, { label: s.certificateNumber }]}
        actions={
          <>
            <StatusBadge status={s.status} />
            {h.isExercisable && h.exercisable > 0 && s.status === "OUTSTANDING" ? (
              <Button asChild>
                <Link href={`/portal/${C}/exercise?grant=${s.id}`}>
                  <Calculator /> Request exercise
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {h.isConvertible ? (
          <>
            <Stat label="Principal" value={money(s.totalAmount)} />
            <Stat label="Valuation cap" value={s.valuationCap ? money(s.valuationCap) : "None"} />
            <Stat label="Discount" value={s.discountPercent ? `${s.discountPercent}%` : "None"} />
            <Stat label={s.type === "SAFE" ? "SAFE type" : "Interest"} value={s.type === "SAFE" ? (s.safeType === "PRE_MONEY" ? "Pre-money" : "Post-money") : `${s.interestRate ?? 0}%`} />
          </>
        ) : (
          <>
            <Stat label={h.isShares ? "Shares held" : "Granted"} value={shares(h.isShares ? h.sharesHeld : s.quantity)} hint={s.cancelledQuantity ? `${shares(s.cancelledQuantity)} cancelled` : undefined} />
            <Stat label="Vested" value={shares(h.vesting.vested)} hint={percent(h.vesting.percentVested, 0)} tone="success" />
            {h.isExercisable ? <Stat label="Exercisable now" value={shares(h.exercisable)} hint={`${shares(s.exercisedQuantity)} already exercised`} /> : <Stat label="Unvested" value={shares(h.vesting.unvested)} hint={h.vesting.forfeited ? `${shares(h.vesting.forfeited)} forfeited` : undefined} />}
            <Stat label="Estimated value" value={p.fmv ? money(h.totalValue) : "—"} hint={p.fmv ? `${money(h.vestedValue)} vested · at ${price(p.fmv)} FMV` : "No FMV on file"} />
          </>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Terms</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <DescriptionList
              columns={3}
              className="grid-cols-2 sm:grid-cols-3"
              items={[
                { label: "Holder", value: <span className="block whitespace-normal">{s.stakeholder.name}</span> },
                { label: "Type", value: typeLabel },
                { label: s.equityPlan ? "Equity plan" : "Share class", value: <span className="block whitespace-normal">{s.equityPlan?.name ?? s.shareClass?.name ?? "—"}</span> },
                { label: "Grant date", value: date(s.grantDate ?? s.issueDate) },
                { label: "Vesting start", value: date(s.vestingStartDate) },
                { label: "Expiration", value: date(s.expirationDate) },
                ...(h.isExercisable ? [{ label: "Exercise price", value: price(s.exercisePrice) }, { label: "Total exercise cost", value: money((s.exercisePrice ?? 0) * h.unexercised) }, { label: "Post-termination window", value: s.ptepMonths ? `${s.ptepMonths} months` : "Per plan" }] : []),
                ...(h.isShares ? [{ label: "Price paid", value: price(s.pricePerShare) }, { label: "Total paid", value: money((s.pricePerShare ?? 0) * s.quantity) }, { label: "Repurchase right", value: s.repurchaseRight ? "Yes, lapses as shares vest" : "No" }] : []),
                { label: "Early exercise", value: s.earlyExercise ? "Permitted" : "Not permitted" },
                { label: "Board approval", value: date(s.boardApprovalDate) },
                { label: "FMV at grant", value: price(s.fmvAtGrant) },
              ]}
            />
            {schedule ? (
              <div className="mt-4 rounded-md bg-muted px-3 py-2.5 text-[13px]">
                <div className="font-medium">{schedule.name}</div>
                <p className="mt-0.5 text-muted-foreground">{vestingDescription(schedule)}</p>
                {schedule.accelerationSingleTrigger || schedule.accelerationDoubleTrigger ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acceleration: {schedule.accelerationSingleTrigger ? `${schedule.accelerationSingleTrigger}% on a change of control (single trigger)` : ""}
                    {schedule.accelerationSingleTrigger && schedule.accelerationDoubleTrigger ? "; " : ""}
                    {schedule.accelerationDoubleTrigger ? `${schedule.accelerationDoubleTrigger}% if terminated without cause after a change of control (double trigger)` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {s.notes ? <p className="mt-3 text-xs text-muted-foreground">{s.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" /> Documents
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 ? <p className="text-[13px] text-muted-foreground">No documents attached.</p> : null}
            {documents.map((d) => (
              <Link key={d.id} href={`/portal/${C}/documents/${d.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-[13px] hover:bg-muted/50">
                <span className="min-w-0 truncate">{d.name}</span>
                <StatusBadge status={d.signatureStatus} className="shrink-0" />
              </Link>
            ))}
            {requests.length ? (
              <div className="pt-2">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Exercise history</div>
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1 text-[13px]">
                    <span>
                      {shares(r.quantity)} · {date(r.requestedAt)}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {schedule && !h.isConvertible ? (
        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Vesting schedule</CardTitle>
              <CardDescription>
                {shares(h.vesting.vested)} of {shares(h.vesting.total)} vested · {h.vesting.terminated ? "vesting stopped at termination" : h.vesting.nextVestDate ? `next ${shares(h.vesting.nextVestAmount)} on ${date(h.vesting.nextVestDate)}` : "fully vested"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="max-sm:px-0 max-sm:pb-0">
            <div className="mb-4 max-sm:px-5">
              <Progress value={h.vesting.percentVested * 100} tone={h.vesting.terminated ? "warning" : "success"} />
            </div>
            <div className="max-h-80 overflow-auto rounded-md border border-border scrollbar-thin max-sm:rounded-none max-sm:rounded-b-lg max-sm:border-x-0 max-sm:border-b-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Vesting</th>
                    <th className="text-right">Cumulative</th>
                    <th className="text-right max-sm:hidden">% vested</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {h.vesting.events.map((e, i) => {
                    const past = e.date <= now;
                    const forfeited = h.vesting.terminated && s.stakeholder.terminationDate && e.date > s.stakeholder.terminationDate;
                    return (
                      <tr key={i} className={!past ? "text-muted-foreground" : ""}>
                        <td>{date(e.date)}</td>
                        <td className="num">{shares(e.amount)}</td>
                        <td className="num">{shares(e.cumulative)}</td>
                        <td className="num max-sm:hidden">{percent(h.vesting.total ? e.cumulative / h.vesting.total : 0, 1)}</td>
                        <td>{forfeited ? <Badge variant="danger">Forfeited</Badge> : e.label ? <Badge variant="accent">{e.label}</Badge> : past ? <Badge variant="success">Vested</Badge> : <Badge variant="neutral">Upcoming</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
