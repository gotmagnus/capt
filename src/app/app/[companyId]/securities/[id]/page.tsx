import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, FileText, History, Info } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { accruedInterest } from "@/lib/equity/conversion";
import { PageHeader, DescriptionList, Alert, Stat } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { date, humanize, money, percent, price, shares } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, SECURITY_TYPE_LABELS, STATUS_LABELS, TRANSACTION_LABELS, type DocumentType, type SecurityType, type TransactionType } from "@/lib/types";
import { effectiveVesting, isConvertible, isExercisable, isShareType, isVestingType, securityGroup } from "@/lib/securities-utils";
import { cn, parseJson } from "@/lib/utils";
import { SecurityActions } from "./security-actions";
import { TRANSACTION_TYPE_VARIANT } from "../../transactions/type-variant";

export async function generateMetadata(props: PageProps<"/app/[companyId]/securities/[id]">) {
  const { companyId, id } = await props.params;
  const s = await db.security.findFirst({ where: { id, company: { OR: [{ id: companyId }, { slug: companyId }] } }, select: { certificateNumber: true } });
  return { title: s ? s.certificateNumber : "Security" };
}

export default async function SecurityDetailPage(props: PageProps<"/app/[companyId]/securities/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, valuation, security] = await Promise.all([
    loadCapTable(C),
    currentValuation(C),
    db.security.findFirst({
      where: { id, companyId: C },
      include: {
        stakeholder: true,
        shareClass: true,
        equityPlan: true,
        vestingSchedule: { include: { milestones: { orderBy: { sortOrder: "asc" } } } },
        transactions: { orderBy: { effectiveDate: "desc" }, include: { fromStakeholder: true, toStakeholder: true } },
        documents: { include: { signatures: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } },
        exerciseRequests: { orderBy: { requestedAt: "desc" } },
      },
    }),
  ]);
  if (!security) notFound();
  const s = security;
  const type = s.type as SecurityType;
  const group = securityGroup(type);
  const schedule = s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null;
  const hasVesting = !!schedule && isVestingType(type);
  const vest = hasVesting ? effectiveVesting(s, schedule, s.stakeholder.terminationDate) : null;
  const fmv = valuation?.fairMarketValue ?? null;
  const remaining = isExercisable(type) ? s.quantity - s.exercisedQuantity - s.cancelledQuantity : s.quantity - s.cancelledQuantity;
  const vestedAvailable = vest ? Math.max(0, Math.min(remaining, vest.vested - s.exercisedQuantity)) : remaining;
  const interest = isConvertible(type) ? accruedInterest({ id: s.id, type, stakeholderId: s.stakeholderId, principal: s.totalAmount ?? 0, interestRate: s.interestRate, interestType: s.interestType, issueDate: s.issueDate }, new Date()) : 0;
  const override = parseJson<{ acceleratedAt?: string; shares?: number; reason?: string } | null>(s.accelerationOverride, null);
  const related = s.isoLimitSplitFrom ? await db.security.findUnique({ where: { id: s.isoLimitSplitFrom }, select: { id: true, certificateNumber: true } }) : null;
  const splitChild = await db.security.findFirst({ where: { isoLimitSplitFrom: s.id }, select: { id: true, certificateNumber: true } });
  const resulting = s.exerciseRequests.filter((r) => r.resultingSecurityId).map((r) => r.resultingSecurityId as string);
  const resultingSecurities = resulting.length ? await db.security.findMany({ where: { id: { in: resulting } }, select: { id: true, certificateNumber: true } }) : [];
  const now = new Date();

  const terms: { label: string; value: React.ReactNode }[] = [];
  if (isShareType(type)) {
    terms.push(
      { label: "Share class", value: s.shareClass ? <Link href={`/app/${C}/share-classes`} className="hover:underline">{s.shareClass.name}</Link> : "—" },
      { label: "Shares issued", value: shares(s.quantity) },
      { label: "Outstanding", value: shares(remaining) },
      { label: "Price per share", value: price(s.pricePerShare) },
      { label: "Consideration", value: money((s.pricePerShare ?? 0) * s.quantity, { cents: true }) },
      { label: "FMV at issue", value: price(s.fmvAtGrant) },
      { label: "Issue date", value: date(s.issueDate) },
      { label: "Board approval", value: date(s.boardApprovalDate) },
    );
    if (type === "RSA" || s.repurchaseRight) terms.push({ label: "Repurchase right", value: s.repurchaseRight ? "Yes — lapses with vesting" : "No" });
    if (s.election83bDeadline) terms.push({ label: "83(b) election", value: s.election83bFiledDate ? `Filed ${date(s.election83bFiledDate)}` : `Due ${date(s.election83bDeadline)}` });
    if (s.equityPlan) terms.push({ label: "Plan", value: <Link href={`/app/${C}/equity-plans/${s.equityPlan.id}`} className="hover:underline">{s.equityPlan.name}</Link> });
  } else if (isExercisable(type)) {
    terms.push(
      ...(s.equityPlan ? [{ label: "Plan", value: <Link href={`/app/${C}/equity-plans/${s.equityPlan.id}`} className="hover:underline">{s.equityPlan.name}</Link> }] : []),
      { label: "Underlying class", value: s.shareClass?.name ?? "Common Stock" },
      { label: "Shares granted", value: shares(s.quantity) },
      { label: "Exercise price", value: price(s.exercisePrice) },
      { label: "FMV at grant", value: price(s.fmvAtGrant) },
      { label: "Current spread", value: fmv != null ? money(Math.max(0, (fmv - (s.exercisePrice ?? 0)) * remaining), { cents: true }) : "—" },
      { label: "Grant date", value: date(s.grantDate ?? s.issueDate) },
      { label: "Board approval", value: date(s.boardApprovalDate) },
      { label: "Expiration", value: date(s.expirationDate) },
    );
    if (type !== "WARRANT") terms.push({ label: "Post-termination exercise", value: `${s.ptepMonths ?? 3} months` }, { label: "Early exercise", value: s.earlyExercise ? "Allowed" : "Not allowed" });
    if (related) terms.push({ label: "ISO $100K split from", value: <Link href={`/app/${C}/securities/${related.id}`} className="font-mono text-xs hover:underline">{related.certificateNumber}</Link> });
    if (splitChild) terms.push({ label: "NSO split", value: <Link href={`/app/${C}/securities/${splitChild.id}`} className="font-mono text-xs hover:underline">{splitChild.certificateNumber}</Link> });
  } else if (type === "RSU") {
    terms.push(
      ...(s.equityPlan ? [{ label: "Plan", value: <Link href={`/app/${C}/equity-plans/${s.equityPlan.id}`} className="hover:underline">{s.equityPlan.name}</Link> }] : []),
      { label: "Units granted", value: shares(s.quantity) },
      { label: "Unsettled", value: shares(remaining) },
      { label: "FMV at grant", value: price(s.fmvAtGrant) },
      { label: "Current value", value: fmv != null ? money(fmv * remaining) : "—" },
      { label: "Grant date", value: date(s.grantDate ?? s.issueDate) },
      { label: "Board approval", value: date(s.boardApprovalDate) },
    );
  } else if (type === "SAFE") {
    terms.push(
      { label: "Purchase amount", value: money(s.totalAmount) },
      { label: "Form", value: s.safeType === "PRE_MONEY" ? "Pre-money valuation cap" : "Post-money valuation cap" },
      { label: "Valuation cap", value: s.valuationCap ? money(s.valuationCap) : "Uncapped" },
      { label: "Discount", value: s.discountPercent ? `${s.discountPercent}%` : "None" },
      { label: "Implied ownership at cap", value: s.valuationCap && s.safeType !== "PRE_MONEY" ? percent((s.totalAmount ?? 0) / s.valuationCap) : "—" },
      { label: "MFN", value: s.mfn ? "Yes" : "No" },
      { label: "Pro rata right", value: s.proRataRight ? "Yes" : "No" },
      { label: "Issue date", value: date(s.issueDate) },
      { label: "Board approval", value: date(s.boardApprovalDate) },
    );
  } else if (type === "CONVERTIBLE_NOTE") {
    terms.push(
      { label: "Principal", value: money(s.totalAmount) },
      { label: "Interest", value: `${s.interestRate ?? 0}% ${(s.interestType ?? "SIMPLE").toLowerCase()}` },
      { label: "Accrued to date", value: money(interest, { cents: true }) },
      { label: "Balance", value: money((s.totalAmount ?? 0) + interest, { cents: true }) },
      { label: "Maturity", value: date(s.maturityDate) },
      { label: "Valuation cap", value: s.valuationCap ? money(s.valuationCap) : "None" },
      { label: "Discount", value: s.discountPercent ? `${s.discountPercent}%` : "None" },
      { label: "Qualified financing", value: s.conversionTrigger ? money(s.conversionTrigger) : "—" },
      { label: "Issue date", value: date(s.issueDate) },
    );
  }

  const pendingSignatures = s.documents.flatMap((d) => d.signatures).filter((x) => x.status === "PENDING");
  const onlyIssuanceTx = s.transactions.every((t) => t.type === "ISSUANCE");
  const hasAgreementDoc = s.documents.some((d) => ["OPTION_AGREEMENT", "GRANT_AGREEMENT", "SAFE", "CONVERTIBLE_NOTE", "CERTIFICATE"].includes(d.type));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Securities", href: `/app/${C}/securities` }, { label: s.certificateNumber }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono">{s.certificateNumber}</span>
            <StatusBadge status={s.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="accent">{SECURITY_TYPE_LABELS[type]}</Badge>
            <span>held by</span>
            <Link href={`/app/${C}/stakeholders/${s.stakeholderId}`} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
              <Avatar name={s.stakeholder.name} size="xs" /> {s.stakeholder.name}
            </Link>
            {s.stakeholder.terminationDate ? <Badge variant="danger">Terminated {date(s.stakeholder.terminationDate)}</Badge> : null}
          </span>
        }
        actions={
          ctx.canEdit ? (
            <SecurityActions
              companyId={C}
              security={{
                id: s.id,
                certificateNumber: s.certificateNumber,
                type,
                status: s.status,
                quantity: s.quantity,
                exercised: s.exercisedQuantity,
                cancelled: s.cancelledQuantity,
                remaining,
                vestedAvailable,
                unvested: vest ? vest.unvested + vest.forfeited : 0,
                hasVesting,
                exercisePrice: s.exercisePrice,
                pricePerShare: s.pricePerShare,
                ptepMonths: s.ptepMonths,
                expirationDate: s.expirationDate?.toISOString() ?? null,
                earlyExercise: s.earlyExercise,
                election83bDeadline: s.election83bDeadline?.toISOString() ?? null,
                election83bFiledDate: s.election83bFiledDate?.toISOString() ?? null,
                hasAgreementDoc,
                onlyIssuanceTx,
                principal: s.totalAmount,
                accruedInterest: interest,
                stakeholderId: s.stakeholderId,
                stakeholderName: s.stakeholder.name,
              }}
              stakeholders={data.stakeholders.map((x) => ({ id: x.id, name: x.name }))}
              shareClasses={data.shareClasses.map((c) => ({ id: c.id, name: c.name, type: c.type, originalIssuePrice: c.originalIssuePrice }))}
              fmv={fmv}
            />
          ) : null
        }
      />

      {s.status === "PENDING_SIGNATURE" ? (
        <Alert tone="warning" icon={AlertTriangle} className="mb-5">
          Awaiting signature from {pendingSignatures.length ? pendingSignatures.map((x) => x.name).join(" and ") : "the holder"}. The cap table already reflects this security.
        </Alert>
      ) : null}
      {type === "RSA" && s.election83bDeadline && !s.election83bFiledDate ? (
        <Alert tone={s.election83bDeadline < now ? "danger" : "warning"} icon={CalendarClock} className="mb-5">
          83(b) election {s.election83bDeadline < now ? "deadline passed on" : "must be filed by"} {date(s.election83bDeadline)}.
        </Alert>
      ) : null}
      {isExercisable(type) && s.expirationDate && s.expirationDate < now && s.status === "OUTSTANDING" ? (
        <Alert tone="danger" icon={AlertTriangle} className="mb-5">
          This grant expired on {date(s.expirationDate)} with {shares(remaining)} shares unexercised.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {group === "CONVERTIBLES" ? (
          <>
            <Stat label={type === "SAFE" ? "Purchase amount" : "Principal"} value={money(s.totalAmount)} />
            <Stat label="Valuation cap" value={s.valuationCap ? money(s.valuationCap) : "None"} hint={s.discountPercent ? `${s.discountPercent}% discount` : "No discount"} />
            <Stat label={type === "SAFE" ? "Form" : "Accrued interest"} value={type === "SAFE" ? (s.safeType === "PRE_MONEY" ? "Pre-money" : "Post-money") : money(interest, { cents: true })} />
            <Stat label="Status" value={<StatusBadge status={s.status} />} hint={s.status === "CONVERTED" ? "See transactions for the conversion" : "Unconverted"} />
          </>
        ) : (
          <>
            <Stat label={type === "RSU" ? "Units" : "Shares"} value={shares(s.quantity)} hint={`${shares(remaining)} ${isExercisable(type) ? "unexercised" : type === "RSU" ? "unsettled" : "outstanding"}`} />
            <Stat label={isExercisable(type) ? "Exercise price" : "Price per share"} value={price(isExercisable(type) ? s.exercisePrice : s.pricePerShare)} hint={fmv != null ? `Current FMV ${price(fmv)}` : undefined} />
            <Stat label={isExercisable(type) ? "Intrinsic value" : "Current value"} value={fmv != null ? money(isExercisable(type) ? Math.max(0, (fmv - (s.exercisePrice ?? 0)) * remaining) : fmv * remaining) : "—"} hint="At the latest 409A" />
            <Stat label="Vested" value={vest ? percent(vest.percentVested, 0) : "100%"} hint={vest ? `${shares(vest.vested)} of ${shares(vest.total)}` : "Fully vested"} tone={vest && vest.percentVested >= 1 ? "success" : "default"} />
          </>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Key terms</CardTitle>
                <CardDescription>As recorded in the ledger</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList columns={3} className="grid-cols-2 sm:grid-cols-3 [&_dd]:whitespace-normal [&_dd]:break-words" items={terms} />
              {s.legend ? <p className="mt-4 rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">{s.legend}</p> : null}
            </CardContent>
          </Card>

          {vest && schedule ? (
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Vesting</CardTitle>
                  <CardDescription>
                    {s.vestingSchedule?.name} · commenced {date(s.vestingStartDate ?? s.issueDate)}
                    {vest.terminated ? ` · stopped at termination ${date(s.stakeholder.terminationDate)}` : ""}
                  </CardDescription>
                </div>
                <Link href={`/app/${C}/vesting-schedules`} className="shrink-0 whitespace-nowrap text-xs text-accent-foreground hover:underline">
                  Schedule templates
                </Link>
              </CardHeader>
              <CardContent>
                <Progress value={vest.percentVested * 100} tone={vest.percentVested >= 1 ? "success" : "accent"} className="h-2" />
                <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Vested</div>
                    <div className="font-medium tabular">{shares(vest.vested)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Unvested</div>
                    <div className="font-medium tabular">{shares(vest.unvested)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{vest.forfeited ? "Forfeited" : "Cliff"}</div>
                    <div className="font-medium tabular">{vest.forfeited ? shares(vest.forfeited) : vest.cliffDate ? `${date(vest.cliffDate)}${vest.cliffReached ? " ✓" : ""}` : "None"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{vest.nextVestDate ? "Next vest" : vest.terminated ? "Vesting stopped" : vest.unvested > 0 ? "Next vest" : "Fully vested"}</div>
                    <div className="font-medium tabular">
                      {vest.nextVestDate
                        ? `${shares(vest.nextVestAmount)} on ${date(vest.nextVestDate)}`
                        : vest.terminated
                          ? date(s.stakeholder.terminationDate)
                          : vest.unvested > 0
                            ? schedule.type === "MILESTONE"
                              ? "On next milestone"
                              : "—"
                            : date(vest.fullyVestedDate)}
                    </div>
                  </div>
                </div>
                {(schedule.accelerationSingleTrigger || schedule.accelerationDoubleTrigger || override?.shares) ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {schedule.accelerationSingleTrigger ? <Badge variant="neutral">{schedule.accelerationSingleTrigger}% single-trigger acceleration</Badge> : null}
                    {schedule.accelerationDoubleTrigger ? <Badge variant="neutral">{schedule.accelerationDoubleTrigger}% double-trigger acceleration</Badge> : null}
                    {override?.shares ? (
                      <Badge variant="info">
                        {shares(override.shares)} accelerated {override.acceleratedAt ? date(override.acceleratedAt) : ""}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {schedule.type === "MILESTONE" && s.vestingSchedule ? (
                  <ul className="mt-4 divide-y divide-border rounded-md border border-border">
                    {s.vestingSchedule.milestones.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                        <span className={cn("min-w-0", m.achievedAt && "text-muted-foreground")}>{m.description}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="tabular text-muted-foreground">{m.percent}%</span>
                          {m.achievedAt ? <Badge variant="success">Achieved {date(m.achievedAt)}</Badge> : <Badge variant="neutral">Pending</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-border scrollbar-thin">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Vest date</th>
                          <th className="text-right">Shares</th>
                          <th className="text-right max-sm:hidden">Cumulative</th>
                          <th className="text-right max-sm:hidden">%</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vest.events.map((e, i) => {
                          const past = e.date <= now;
                          const forfeited = !!s.stakeholder.terminationDate && e.date > s.stakeholder.terminationDate;
                          return (
                            <tr key={i} className={cn(!past && "text-muted-foreground")}>
                              <td>
                                {date(e.date)}
                                {e.label ? <span className="ml-2 text-[11px] text-accent-foreground">{e.label}</span> : null}
                              </td>
                              <td className="num">{shares(e.amount)}</td>
                              <td className="num max-sm:hidden">{shares(e.cumulative)}</td>
                              <td className="num max-sm:hidden">{percent(vest.total ? e.cumulative / vest.total : 0, 1)}</td>
                              <td>{forfeited ? <Badge variant="danger">Forfeited</Badge> : past ? <Badge variant="success">Vested</Badge> : <Badge variant="neutral">Scheduled</Badge>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" /> Transactions
                </CardTitle>
                <CardDescription>{s.transactions.length} ledger entries</CardDescription>
              </div>
              <Link href={`/app/${C}/transactions`} className="shrink-0 whitespace-nowrap text-xs text-accent-foreground hover:underline">
                Full ledger
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-5">Date</th>
                    <th>Type</th>
                    <th className="text-right">Quantity</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Amount</th>
                    <th className="pr-5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {s.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="pl-5 text-muted-foreground">{date(t.effectiveDate)}</td>
                      <td>
                        <Badge variant={TRANSACTION_TYPE_VARIANT[t.type] ?? "neutral"}>{TRANSACTION_LABELS[t.type as TransactionType] ?? humanize(t.type)}</Badge>
                      </td>
                      <td className="num">{t.quantity ? shares(t.quantity) : "—"}</td>
                      <td className="num text-muted-foreground">{t.pricePerShare != null ? price(t.pricePerShare) : "—"}</td>
                      <td className="num">{t.totalAmount != null ? money(t.totalAmount, { cents: true }) : "—"}</td>
                      <td className="min-w-[200px] max-w-[320px] whitespace-normal pr-5 text-muted-foreground">
                        {t.notes}
                        {t.type === "TRANSFER" && t.toStakeholder ? ` → ${t.toStakeholder.name}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Side column from xl; on tablets the cards sit two-up under the main column. */}
        <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          {isExercisable(type) || type === "RSU" || isShareType(type) ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Lifecycle</CardTitle>
                  <CardDescription>{isExercisable(type) ? "Grant to exercise" : type === "RSU" ? "Grant to settlement" : "Issued to date"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{isShareType(type) ? "Issued" : "Granted"}</dt>
                    <dd className="tabular font-medium">{shares(s.quantity)}</dd>
                  </div>
                  {isExercisable(type) ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Exercised</dt>
                      <dd className="tabular">{shares(s.exercisedQuantity)}</dd>
                    </div>
                  ) : null}
                  {type === "RSU" ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Settled</dt>
                      <dd className="tabular">{shares(s.exercisedQuantity)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{isShareType(type) ? "Cancelled / repurchased" : "Cancelled"}</dt>
                    <dd className="tabular">{shares(s.cancelledQuantity)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt className="font-medium">{isExercisable(type) ? "Unexercised" : type === "RSU" ? "Unsettled" : "Outstanding"}</dt>
                    <dd className="tabular font-semibold">{shares(remaining)}</dd>
                  </div>
                  {isExercisable(type) && vest ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Exercisable now</dt>
                      <dd className="tabular">{shares(vestedAvailable)}</dd>
                    </div>
                  ) : null}
                </dl>
                {s.exerciseRequests.length ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Exercise requests</div>
                    <ul className="space-y-1.5">
                      {s.exerciseRequests.map((r) => {
                        const res = resultingSecurities.find((x) => x.id === r.resultingSecurityId);
                        return (
                          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border px-2.5 py-1.5 text-xs">
                            <Link href={`/app/${C}/exercises/${r.id}`} className="hover:underline">
                              {shares(r.quantity)} @ {price(r.exercisePrice)} · {date(r.requestedAt)}
                            </Link>
                            <span className="flex items-center gap-2">
                              {res ? (
                                <Link href={`/app/${C}/securities/${res.id}`} className="font-mono hover:underline">
                                  {res.certificateNumber}
                                </Link>
                              ) : null}
                              <StatusBadge status={r.status} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" /> Documents
                </CardTitle>
                <CardDescription>{s.documents.length} in the data room</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${C}/documents?folder=${encodeURIComponent(`Securities/${s.certificateNumber}`)}`}>Open folder</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.documents.length === 0 ? <p className="text-[13px] text-muted-foreground">No documents generated.</p> : null}
              {s.documents.map((d) => (
                <Link key={d.id} href={`/app/${C}/documents/${d.id}`} className="block rounded-md border border-border p-3 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type} · {date(d.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={d.signatureStatus} />
                  </div>
                  {d.signatures.length ? (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {d.signatures.map((sig) => (
                        <li key={sig.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {sig.name} <span className="opacity-70">({sig.role.toLowerCase()})</span>
                          </span>
                          <span className={cn("shrink-0", sig.status === "SIGNED" && "text-success")}>{sig.status === "SIGNED" ? `Signed ${date(sig.signedAt)}` : STATUS_LABELS[sig.status] ?? humanize(sig.status)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Link>
              ))}
            </CardContent>
          </Card>

          {s.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-[13px] text-muted-foreground">{s.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
