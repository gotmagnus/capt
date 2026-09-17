import Link from "next/link";
import { requireCompany } from "@/lib/auth";
import { loadPortal } from "@/lib/portal-data";
import { vestingForecast } from "@/lib/equity/vesting";
import { vestingDescription } from "@/lib/documents/templates";
import { date, percent, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { PageHeader, Stat, EmptyState } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VestingAreaChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { NoHoldings } from "../no-holdings";

export const metadata = { title: "Vesting" };

export default async function VestingPage(props: PageProps<"/portal/[companyId]/vesting">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const vesting = p.live.filter((h) => h.security.vestingScheduleId && !h.isConvertible && !(h.isShares && h.security.type !== "RSA"));
  const earliest = vesting.reduce<Date | null>((a, h) => {
    const d = h.security.vestingStartDate ?? h.security.issueDate;
    return !a || d < a ? d : a;
  }, null);
  const start = earliest ?? new Date();
  const months = Math.max(24, Math.min(84, Math.round((new Date().getTime() - start.getTime()) / (30 * 86_400_000)) + 60));
  const forecast = vestingForecast(
    vesting.map((h) => ({ quantity: h.security.quantity - h.security.cancelledQuantity, vestingStart: h.security.vestingStartDate ?? h.security.issueDate, schedule: h.security.vestingScheduleId ? p.data.schedules[h.security.vestingScheduleId] : null, terminationDate: h.security.stakeholder.terminationDate })),
    new Date(start.getFullYear(), start.getMonth(), 1),
    months,
  );
  const s = p.stats;
  // Percent for the "Vested so far" tile must use the same grants as the tile's value (p.stats also counts fully vested shares).
  const vestedSoFar = vesting.reduce((a, h) => a + h.vesting.vested, 0);
  const stillToVest = vesting.reduce((a, h) => a + h.vesting.unvested, 0);
  const upcomingSchedules = [...new Map(vesting.map((h) => [h.security.vestingScheduleId as string, h.security.vestingSchedule!])).values()];

  return (
    <>
      <PageHeader title="Vesting" description="How your equity vests over time across every grant. Dates are based on each grant's vesting commencement date." />
      {vesting.length === 0 ? (
        <EmptyState title="Nothing is vesting" description="All of your holdings are fully vested or have no vesting schedule." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Vested so far" value={shares(vestedSoFar)} hint={`${percent(vestedSoFar + stillToVest ? vestedSoFar / (vestedSoFar + stillToVest) : 0, 0)} of vesting grants`} tone="success" />
            <Stat label="Still to vest" value={shares(stillToVest)} />
            <Stat label="Next vesting" value={s.nextVest ? date(s.nextVest.date) : "—"} hint={s.nextVest ? `${shares(s.nextVest.amount)} from ${s.nextVest.certificateNumber}` : undefined} />
            <Stat label="Fully vested by" value={date(vesting.reduce<Date | null>((a, h) => (!h.vesting.terminated && h.vesting.fullyVestedDate && (!a || h.vesting.fullyVestedDate > a) ? h.vesting.fullyVestedDate : a), null))} />
          </div>
          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Cumulative vesting</CardTitle>
                <CardDescription>Total shares and options vested across all grants, month by month.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <VestingAreaChart data={forecast} height={240} />
            </CardContent>
          </Card>
          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Per grant</CardTitle>
              </div>
            </CardHeader>
            {/* Phones: one block per grant; the 8-column table returns from md up. */}
            <CardContent className="space-y-3 md:hidden">
              {vesting.map((h) => (
                <Link key={h.security.id} href={`/portal/${C}/holdings/${h.security.id}`} className="block rounded-md border border-border p-3 hover:border-border-strong">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium">
                      <span className="font-mono text-xs">{h.security.certificateNumber}</span> · {SECURITY_TYPE_LABELS[h.security.type as SecurityType]}
                    </span>
                    {h.vesting.terminated ? <Badge variant="warning">Stopped</Badge> : h.vesting.nextVestDate ? null : <Badge variant="success">Complete</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{h.security.vestingSchedule?.name}</div>
                  <div className="mt-2.5 flex justify-between text-xs text-muted-foreground tabular">
                    <span>
                      {shares(h.vesting.vested)} / {shares(h.vesting.total)} vested
                    </span>
                    <span>{percent(h.vesting.percentVested, 0)}</span>
                  </div>
                  <Progress value={h.vesting.percentVested * 100} className="mt-1" tone={h.vesting.terminated ? "warning" : "success"} />
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Vesting start</dt>
                      <dd className="mt-0.5 font-medium tabular">{date(h.security.vestingStartDate ?? h.security.issueDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cliff</dt>
                      <dd className={`mt-0.5 font-medium tabular ${h.vesting.cliffDate && h.vesting.cliffReached ? "text-success" : ""}`}>{h.vesting.cliffDate ? date(h.vesting.cliffDate) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next vest</dt>
                      <dd className="mt-0.5 font-medium tabular">{h.vesting.nextVestDate && !h.vesting.terminated ? `${shares(h.vesting.nextVestAmount)} on ${date(h.vesting.nextVestDate)}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Fully vested</dt>
                      <dd className="mt-0.5 font-medium tabular">{date(h.vesting.fullyVestedDate)}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </CardContent>
            <CardContent className="hidden px-0 pb-0 md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Grant</th>
                    <th>Type</th>
                    <th>Schedule</th>
                    <th>Vesting start</th>
                    <th>Cliff</th>
                    <th className="text-right">Vested</th>
                    <th>Next vest</th>
                    <th>Fully vested</th>
                  </tr>
                </thead>
                <tbody>
                  {vesting.map((h) => (
                    <tr key={h.security.id}>
                      <td>
                        <Link href={`/portal/${C}/holdings/${h.security.id}`} className="font-mono text-xs font-medium hover:underline">
                          {h.security.certificateNumber}
                        </Link>
                      </td>
                      <td>{SECURITY_TYPE_LABELS[h.security.type as SecurityType]}</td>
                      <td className="text-muted-foreground">{h.security.vestingSchedule?.name}</td>
                      <td>{date(h.security.vestingStartDate ?? h.security.issueDate)}</td>
                      <td>{h.vesting.cliffDate ? <span className={h.vesting.cliffReached ? "text-success" : ""}>{date(h.vesting.cliffDate)}</span> : "—"}</td>
                      <td className="num">
                        {shares(h.vesting.vested)} / {shares(h.vesting.total)}
                      </td>
                      <td>{h.vesting.terminated ? <Badge variant="warning">Stopped</Badge> : h.vesting.nextVestDate ? `${shares(h.vesting.nextVestAmount)} on ${date(h.vesting.nextVestDate)}` : <Badge variant="success">Complete</Badge>}</td>
                      <td>{date(h.vesting.fullyVestedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Acceleration terms</CardTitle>
                <CardDescription>What happens to unvested equity if the company is acquired.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {upcomingSchedules.map((sch) => (
                <div key={sch.id} className="rounded-md border border-border px-3 py-2.5">
                  <div className="font-medium">{sch.name}</div>
                  <p className="text-muted-foreground">{vestingDescription(sch)}</p>
                  <p className="mt-1">
                    {sch.accelerationSingleTrigger > 0 ? (
                      <>
                        <span className="font-medium">Single trigger:</span> {sch.accelerationSingleTrigger}% of unvested equity vests immediately on a change of control.{" "}
                      </>
                    ) : null}
                    {sch.accelerationDoubleTrigger > 0 ? (
                      <>
                        <span className="font-medium">Double trigger:</span> {sch.accelerationDoubleTrigger}% of unvested equity vests if you are terminated without cause (or resign for good reason) within the window after a change of control.
                      </>
                    ) : null}
                    {!sch.accelerationSingleTrigger && !sch.accelerationDoubleTrigger ? <span className="text-muted-foreground">No acceleration — vesting continues on its normal schedule after an acquisition, subject to the acquirer's terms.</span> : null}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
