import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CalendarClock, CheckCircle2, ClipboardCheck, FileSignature, Gavel, Info, Plus, Rocket, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, currentValuation, latestRound } from "@/lib/data/captable";
import { valuationFreshness } from "@/lib/equity/compliance";
import { vestingForecast } from "@/lib/equity/vesting";
import { compactMoney, date, humanize, money, percent, price, relative, shares } from "@/lib/format";
import { PageHeader, Stat, Section, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { OwnershipDonut, LegendList, VestingAreaChart } from "@/components/charts";
import { TaskList } from "./task-list";
import { SECURITY_TYPE_LABELS, TRANSACTION_LABELS, type SecurityType, type TransactionType } from "@/lib/types";
import { TRANSACTION_TYPE_VARIANT } from "../transactions/type-variant";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/app/[companyId]/dashboard">) {
  const { companyId } = await params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, valuation, round, tasks, consents, exercises, recentTx, pendingSigs, offers] = await Promise.all([
    loadCapTable(C),
    currentValuation(C),
    latestRound(C),
    db.notification.findMany({ where: { companyId: C, status: "OPEN" }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 8 }),
    db.boardConsent.findMany({ where: { companyId: C, status: "SENT" }, include: { signers: true }, take: 3 }),
    db.exerciseRequest.findMany({ where: { companyId: C, status: { in: ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"] } }, include: { stakeholder: true, security: true }, take: 5, orderBy: { requestedAt: "desc" } }),
    db.transaction.findMany({ where: { companyId: C }, orderBy: { effectiveDate: "desc" }, take: 8, include: { security: { include: { stakeholder: true } }, toStakeholder: true, fromStakeholder: true } }),
    db.document.count({ where: { companyId: C, signatureStatus: { in: ["PENDING", "PARTIALLY_SIGNED"] } } }),
    db.offerLetter.findMany({ where: { companyId: C, status: { in: ["SENT", "VIEWED"] } }, take: 3 }),
  ]);
  const s = data.summary;
  const fmv = valuation?.fairMarketValue ?? null;
  const fresh = valuationFreshness(valuation?.valuationDate ?? null);
  const impliedValue = round?.pricePerShare ? round.pricePerShare * s.totals.fullyDilutedShares : null;

  const forecast = vestingForecast(
    data.securities
      .filter((x) => ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"].includes(x.type) && x.status === "OUTSTANDING")
      .map((x) => ({ quantity: x.quantity - x.cancelledQuantity, vestingStart: x.vestingStartDate ?? x.issueDate, schedule: x.vestingScheduleId ? data.schedules[x.vestingScheduleId] : null, terminationDate: x.stakeholder.terminationDate })),
    new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1),
    36,
  );

  const groupData = s.groups.map((g) => ({ name: g.label, value: g.fullyDilutedShares }));
  const topHolders = s.rows.slice(0, TOP_HOLDERS);
  const otherHolders = s.rows.slice(TOP_HOLDERS).filter((r) => r.fullyDilutedShares > 0);
  const otherShares = otherHolders.reduce((a, r) => a + r.fullyDilutedShares, 0);
  const otherPct = otherHolders.reduce((a, r) => a + r.fullyDilutedPct, 0);
  const plan = s.plans[0];

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${ctx.user.name.split(" ")[0]}`}
        description={`${ctx.company.legalName} · ${ctx.company.incorporationState} ${entityLabel(ctx.company.entityType)} · ${stageLabel(ctx.company.stage)}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/app/${C}/modeling`}>
                <TrendingUp /> Model a round
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/app/${C}/securities/new`}>
                <Plus /> Issue equity
              </Link>
            </Button>
          </>
        }
      />

      {fresh.status !== "CURRENT" ? (
        <Alert tone={fresh.status === "EXPIRED" || fresh.status === "MISSING" ? "danger" : "warning"} icon={AlertTriangle} className="mb-5">
          {fresh.status === "MISSING" ? (
            <>No accepted 409A valuation on file. Option grants need a current fair market value. <Link href={`/app/${C}/valuations/request`} className="font-medium underline">Request a valuation</Link>.</>
          ) : fresh.status === "EXPIRED" ? (
            <>Your 409A valuation expired {date(fresh.expiresOn)}. New grants are outside the safe harbor until a refresh is accepted.</>
          ) : (
            <>Your 409A valuation ({price(fmv)}/share) expires in {fresh.daysRemaining} days on {date(fresh.expiresOn)}. <Link href={`/app/${C}/valuations`} className="font-medium underline">View refresh status</Link>.</>
          )}
        </Alert>
      ) : null}

      {/* 2-up on phones (last tile spans the row), 3 + 2 up to xl, 5-up beyond — never an orphan tile. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        <Stat className="sm:col-span-2 xl:col-span-1" label="Fully diluted shares" value={shares(s.totals.fullyDilutedShares)} hint={`${shares(s.totals.outstandingShares)} outstanding`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Stakeholders" value={s.totals.stakeholderCount} hint={`${s.groups.find((g) => g.key === "employees")?.holders ?? 0} employees · ${s.groups.find((g) => g.key === "investors")?.holders ?? 0} investors`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Common FMV (409A)" value={price(fmv)} hint={valuation ? `Valued ${date(valuation.valuationDate)}` : "No valuation"} tone={fresh.status === "CURRENT" ? "default" : "warning"} />
        <Stat className="sm:col-span-3 xl:col-span-1" label="Last round price" value={price(round?.pricePerShare)} hint={round ? `${round.name} · ${compactMoney(round.amountRaised)} raised` : "No priced round"} />
        <Stat className="col-span-2 sm:col-span-3 xl:col-span-1" label="Implied valuation" value={compactMoney(impliedValue)} hint="Fully diluted × last preferred price" />
      </div>

      {/* Side by side only from xl: beside the sidebar an lg viewport leaves too little room for the holders table. */}
      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Ownership</CardTitle>
              <CardDescription>Fully diluted, including the unallocated pool</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${C}/cap-table`}>
                Open cap table <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {/* Stacks on phones; donut and legend sit side by side on large phones; chart beside the table from md. */}
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-5">
              <div className="grid items-center gap-x-6 gap-y-3 sm:grid-cols-2 md:col-span-2 md:block md:space-y-3">
                <OwnershipDonut data={groupData} height={200} />
                <LegendList data={groupData} />
              </div>
              <div className="md:col-span-3">
                {/* Fixed layout so long holder names truncate instead of pushing the numbers out of the card. */}
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th>Top holders</th>
                      <th className="hidden w-[104px] text-right sm:table-cell">Fully diluted</th>
                      <th className="w-[76px] text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topHolders.map((r) => (
                      <tr key={r.stakeholderId}>
                        <td>
                          <Link href={`/app/${C}/stakeholders/${r.stakeholderId}`} className="group/holder flex items-center gap-2" title={r.name}>
                            <Avatar name={r.name} size="xs" />
                            <span className="min-w-0">
                              <span className="block truncate group-hover/holder:underline">{r.name}</span>
                              <span className="block text-xs tabular text-muted-foreground sm:hidden">{shares(r.fullyDilutedShares)} shares</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num hidden sm:table-cell">{shares(r.fullyDilutedShares)}</td>
                        <td className="num">{percent(r.fullyDilutedPct)}</td>
                      </tr>
                    ))}
                    {otherHolders.length > 0 ? (
                      <tr>
                        <td className="text-muted-foreground">
                          <Link href={`/app/${C}/cap-table`} className="flex items-center gap-2 hover:underline">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">+{otherHolders.length}</span>
                            <span className="min-w-0">
                              <span className="block truncate">
                                {otherHolders.length} other {otherHolders.length === 1 ? "holder" : "holders"}
                              </span>
                              <span className="block text-xs tabular sm:hidden">{shares(otherShares)} shares</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num hidden text-muted-foreground sm:table-cell">{shares(otherShares)}</td>
                        <td className="num text-muted-foreground">{percent(otherPct)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* From xl the row height is set by the Ownership card; a long task list scrolls inside its card instead of stretching the row. */}
        <Card id="tasks" className="xl:relative">
          <div className="xl:absolute xl:inset-0 xl:flex xl:flex-col">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="size-4 text-muted-foreground" /> Tasks
                </CardTitle>
                <CardDescription>{tasks.length} open</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-2 scrollbar-thin xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:rounded-b-lg xl:pb-0">
              <TaskList companyId={C} tasks={tasks.map((t) => ({ id: t.id, type: t.type, title: t.title, body: t.body, link: t.link, dueDate: t.dueDate?.toISOString() ?? null }))} />
              {/* Sticks to the bottom edge while there is more to scroll, and scrolls out of the way at the end. */}
              <div aria-hidden className="pointer-events-none sticky bottom-0 hidden h-7 bg-linear-to-t from-card to-transparent xl:block" />
            </CardContent>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Option pool</CardTitle>
              <CardDescription>{plan?.name ?? "No equity plan"}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${C}/equity-plans`}>Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {plan ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-2xl font-semibold tabular">{shares(plan.available)}</span>
                  <span className="text-xs text-muted-foreground tabular">available of {shares(plan.authorized)}</span>
                </div>
                <Progress value={plan.utilizationPct * 100} className="mt-3" tone={plan.utilizationPct > 0.85 ? "danger" : plan.utilizationPct > 0.7 ? "warning" : "accent"} />
                <dl className="mt-4 divide-y divide-border text-[13px]">
                  {[
                    { label: "Granted & outstanding", value: shares(plan.granted) },
                    { label: "Exercised", value: shares(plan.exercised) },
                    { label: "Returned to pool", value: shares(plan.cancelled) },
                    { label: "Available, % of fully diluted", value: percent(s.totals.fullyDilutedShares ? plan.available / s.totals.fullyDilutedShares : 0, 1) },
                  ].map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5 last:pb-0">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium tabular">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">Create an equity incentive plan to start granting options.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Vesting outlook</CardTitle>
              <CardDescription>Cumulative shares vesting across all outstanding grants</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${C}/reports`}>Reports</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <VestingAreaChart data={forecast} height={190} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="size-4 text-muted-foreground" /> Board consents
              </CardTitle>
              <CardDescription>{consents.length} awaiting signatures</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${C}/board`}>All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {consents.length === 0 ? <p className="text-[13px] text-muted-foreground">No consents out for signature.</p> : null}
            {consents.map((c) => {
              const signed = c.signers.filter((x) => x.status === "SIGNED").length;
              return (
                <Link key={c.id} href={`/app/${C}/board/${c.id}`} className="block rounded-md border border-border p-3 hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium truncate">{c.title}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={(signed / Math.max(1, c.signers.length)) * 100} className="flex-1" tone="success" />
                    <span className="text-xs text-muted-foreground tabular">
                      {signed}/{c.signers.length} signed
                    </span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-muted-foreground" /> Exercise requests
              </CardTitle>
              <CardDescription>{exercises.length} in progress</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/${C}/exercises`}>All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {exercises.length === 0 ? <p className="text-[13px] text-muted-foreground">No pending exercises.</p> : null}
            {exercises.map((e) => (
              <Link key={e.id} href={`/app/${C}/exercises/${e.id}`} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted/50">
                <Avatar name={e.stakeholder.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{e.stakeholder.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {shares(e.quantity)} {SECURITY_TYPE_LABELS[e.security.type as SecurityType]} · {money(e.totalCost, { cents: true })}
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="size-4 text-muted-foreground" /> Signatures & offers
              </CardTitle>
              <CardDescription>
                {pendingSigs} documents · {offers.length} offers outstanding
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href={`/app/${C}/documents?status=pending`} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/50">
              <span className="text-[13px]">Documents awaiting signature</span>
              <Badge variant={pendingSigs ? "warning" : "success"}>{pendingSigs}</Badge>
            </Link>
            {offers.map((o) => (
              <Link key={o.id} href={`/app/${C}/offers/${o.id}`} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{o.candidateName}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.title} · {shares(o.equityQuantity)} options
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </Link>
            ))}
            <Link href={`/app/${C}/fundraising`} className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-[13px] text-muted-foreground hover:bg-muted/50">
              <Rocket className="size-4" /> {s.totals.safeCount + s.totals.noteCount} unconverted instruments · {compactMoney(s.totals.safePrincipal + s.totals.notePrincipal)}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Section title="Recent activity" className="mt-6" actions={<Button variant="ghost" size="sm" asChild><Link href={`/app/${C}/transactions`}>All transactions</Link></Button>}>
        <div className="rounded-lg border border-border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Stakeholder</th>
                <th>Security</th>
                <th className="text-right">Quantity</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <td className="text-muted-foreground">{date(t.effectiveDate)}</td>
                  <td>
                    <Badge variant={TRANSACTION_TYPE_VARIANT[t.type] ?? "neutral"}>{TRANSACTION_LABELS[t.type as TransactionType] ?? humanize(t.type)}</Badge>
                  </td>
                  <td>{t.toStakeholder?.name ?? t.fromStakeholder?.name ?? t.security?.stakeholder.name ?? "—"}</td>
                  <td>{t.security ? <Link href={`/app/${C}/securities/${t.security.id}`} className="font-mono text-xs hover:underline">{t.security.certificateNumber}</Link> : "—"}</td>
                  <td className="num">{t.quantity ? shares(t.quantity) : t.totalAmount ? money(t.totalAmount) : "—"}</td>
                  <td className="text-muted-foreground truncate max-w-[320px]">{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-start gap-1.5">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            Figures are computed live from the ledger as of {date(new Date(), "long")}. Last activity {relative(recentTx[0]?.createdAt)}.
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 md:ml-auto">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <CheckCircle2 className="size-3.5 shrink-0 text-success" /> Ledger reconciled
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <CalendarClock className="size-3.5 shrink-0" /> Fiscal year ends {fiscalYearEndLabel(ctx.company.fiscalYearEnd)}
          </span>
        </span>
      </div>
    </>
  );
}

/** Holders listed by name in the Ownership card; the rest roll up into one "other holders" row. */
const TOP_HOLDERS = 8;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
function stageLabel(stage: string) {
  return { PRE_SEED: "Pre-seed", SEED: "Seed", SERIES_A: "Series A", SERIES_B: "Series B", SERIES_C_PLUS: "Series C+", LATE: "Late stage" }[stage] ?? stage;
}
function entityLabel(entityType: string) {
  return { C_CORP: "C-Corp", S_CORP: "S-Corp", LLC: "LLC", PBC: "PBC" }[entityType] ?? humanize(entityType);
}
/** `fiscalYearEnd` is stored as "MM-DD"; show it as "Dec 31". */
function fiscalYearEndLabel(value: string) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!m) return value;
  return new Date(2000, Number(m[1]) - 1, Number(m[2])).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
