import Link from "next/link";
import { ArrowRight, CalendarClock, Calculator, FileSignature, FolderOpen, Megaphone, PenLine, PieChart } from "lucide-react";
import { requireCompany } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPortal, portalDocuments, portalUpdates } from "@/lib/portal-data";
import { election83bStatus } from "@/lib/equity/compliance";
import { date, money, percent, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { PageHeader, Stat, EmptyState, Alert } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { markdownPreview } from "@/components/people-labels";
import { NoHoldings } from "./no-holdings";

export const metadata = { title: "My equity" };

export default async function PortalOverview(props: PageProps<"/portal/[companyId]">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;

  const [docs, updates, requests] = await Promise.all([
    portalDocuments(p),
    portalUpdates(p),
    db.exerciseRequest.findMany({ where: { companyId: C, stakeholderId: { in: [...p.myIds] }, status: { in: ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"] } }, include: { security: true }, orderBy: { requestedAt: "desc" } }),
  ]);
  const email = ctx.user.email.toLowerCase();
  const awaitingMe = docs.filter((d) => d.signatures.some((s) => s.status === "PENDING" && (s.email.toLowerCase() === email || (s.stakeholderId && p.myIds.has(s.stakeholderId)))));
  const elections = election83bStatus(
    p.holdings.filter((h) => h.security.type === "RSA" || (h.isExercisable && h.security.earlyExercise && h.security.exercisedQuantity > 0)).map((h) => ({ securityId: h.security.id, certificateNumber: h.security.certificateNumber, stakeholderName: h.security.stakeholder.name, type: h.security.type, issueDate: h.security.issueDate, filedDate: h.security.election83bFiledDate, deadline: h.security.election83bDeadline })),
  ).filter((e) => e.status === "DUE" || e.status === "OVERDUE");
  const grants = p.live.filter((h) => !h.isConvertible);
  // Investors hold fully vested shares: don't push option/vesting language or shortcuts at them.
  const hasExercisable = p.live.some((h) => h.isExercisable);
  const hasVesting = p.live.some((h) => h.security.vestingScheduleId && !h.isConvertible && !(h.isShares && h.security.type !== "RSA"));
  const quickActions = [
    ...(hasExercisable ? [{ href: "exercise", label: "Simulate an exercise", icon: Calculator }] : []),
    ...(p.isInvestorView ? [{ href: "ownership", label: "Company ownership", icon: PieChart }] : []),
    { href: "documents", label: "View documents", icon: FolderOpen },
    ...(hasVesting ? [{ href: "vesting", label: "Vesting timeline", icon: CalendarClock }] : [{ href: "updates", label: "Company updates", icon: Megaphone }]),
  ];
  const updatePreview = updates[0] ? markdownPreview(updates[0].body) : "";
  const s = p.stats;
  const first = ctx.user.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Hi ${first}, here's your equity in ${ctx.company.name}`} description={p.fmv ? `Values are estimates based on the latest 409A fair market value of ${price(p.fmv)} per share (${date(p.valuation?.valuationDate)}). They are not a guarantee of what your equity is worth.` : "No fair market value is on file yet, so estimated values are unavailable."} />

      {awaitingMe.length ? (
        <Alert tone="warning" icon={PenLine} className="mb-5">
          You have {awaitingMe.length} document{awaitingMe.length === 1 ? "" : "s"} waiting for your signature.{" "}
          <Link href={`/portal/${C}/documents`} className="font-medium underline">
            Review and sign
          </Link>
        </Alert>
      ) : null}
      {elections.length ? (
        <Alert tone="danger" icon={CalendarClock} className="mb-5">
          An 83(b) election for {elections[0].certificateNumber} is {elections[0].status === "OVERDUE" ? "past due" : `due ${date(elections[0].deadline)} (${elections[0].daysRemaining} days)`}.{" "}
          <Link href={`/portal/${C}/tax`} className="font-medium underline">
            Open the tax center
          </Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Total equity" value={shares(s.totalUnits)} hint="shares and options" />
        <Stat label="Vested" value={percent(s.vestedPct, 0)} hint={`${shares(s.vestedUnits)} vested`} tone="success" />
        <Stat label="Estimated vested value" value={p.fmv ? money(s.vestedValue) : "—"} hint={p.fmv ? `of ${money(s.totalValue)} total at FMV` : "No FMV on file"} />
        <Stat label="Next vesting" value={s.nextVest ? date(s.nextVest.date) : "—"} hint={s.nextVest ? `${shares(s.nextVest.amount)} from ${s.nextVest.certificateNumber}` : "Nothing scheduled"} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight">{hasExercisable || hasVesting ? "Your grants" : "Your holdings"}</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/portal/${C}/holdings`}>
                All holdings <ArrowRight />
              </Link>
            </Button>
          </div>
          {grants.length === 0 ? <EmptyState title="No equity yet" description="Grants will appear here once your company issues them." /> : null}
          {grants.map((h) => {
            const sec = h.security;
            const units = h.isShares ? h.sharesHeld : h.unexercised;
            return (
              <Link key={sec.id} href={`/portal/${C}/holdings/${sec.id}`} className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold tabular">{shares(units)}</span>
                      <span className="text-[13px] text-muted-foreground">{SECURITY_TYPE_LABELS[sec.type as SecurityType] ?? sec.type}</span>
                      <StatusBadge status={sec.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {sec.certificateNumber} · granted {date(sec.grantDate ?? sec.issueDate)}
                      {sec.exercisePrice != null ? ` · strike ${price(sec.exercisePrice)}` : sec.pricePerShare != null ? ` · paid ${price(sec.pricePerShare)}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-medium tabular">{p.fmv ? money(h.vestedValue) : "—"}</div>
                    <div className="text-xs text-muted-foreground">vested value</div>
                  </div>
                </div>
                {sec.vestingScheduleId && !(h.isShares && sec.type !== "RSA") ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {shares(h.vesting.vested)} of {shares(h.vesting.total)} vested
                      </span>
                      <span>{h.vesting.nextVestDate ? `Next: ${shares(h.vesting.nextVestAmount)} on ${date(h.vesting.nextVestDate)}` : h.vesting.terminated ? "Vesting stopped" : "Fully vested"}</span>
                    </div>
                    <Progress value={h.vesting.percentVested * 100} className="mt-1.5" tone={h.vesting.terminated ? "warning" : "success"} />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quick actions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map((a) => (
                <Button key={a.href} variant="secondary" className="w-full justify-start" asChild>
                  <Link href={`/portal/${C}/${a.href}`}>
                    <a.icon /> {a.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pending</CardTitle>
                <CardDescription>Things that need attention</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-[13px]">
              {awaitingMe.length === 0 && requests.length === 0 && elections.length === 0 ? <p className="text-muted-foreground">Nothing pending.</p> : null}
              {awaitingMe.map((d) => (
                <Link key={d.id} href={`/portal/${C}/documents/${d.id}`} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                  <FileSignature className="size-4 text-warning" />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-warning">Sign</span>
                </Link>
              ))}
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <Calculator className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    Exercise {shares(r.quantity)} of {r.security.certificateNumber}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              ))}
              {elections.map((e) => (
                <Link key={e.securityId} href={`/portal/${C}/tax`} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                  <CalendarClock className="size-4 text-danger" />
                  <span className="flex-1 truncate">83(b) for {e.certificateNumber}</span>
                  <span className="text-xs text-danger">{e.status === "OVERDUE" ? "Overdue" : `${e.daysRemaining}d left`}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          {updates[0] ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="size-4 text-muted-foreground" /> Latest update
                  </CardTitle>
                  <CardDescription>{date(updates[0].publishedAt)}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Link href={`/portal/${C}/updates/${updates[0].id}`} className="text-[13px] font-medium hover:underline">
                  {updates[0].title}
                </Link>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{updatePreview}…</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
