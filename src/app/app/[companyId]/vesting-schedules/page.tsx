import { CalendarClock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { date, toInputDate } from "@/lib/format";
import { vestingDescription } from "@/lib/documents/templates";
import { DeleteScheduleButton, EditScheduleButton, MilestoneAchievedButton, ScheduleDialog } from "./schedule-dialog";

export const metadata = { title: "Vesting schedules" };

const FREQ: Record<string, string> = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", ANNUALLY: "Annually", DAILY: "Daily" };
const TYPE: Record<string, string> = { TIME: "Time-based", MILESTONE: "Milestone", IMMEDIATE: "Immediate", HYBRID: "Hybrid", CUSTOM: "Custom" };

export default async function VestingSchedulesPage(props: PageProps<"/app/[companyId]/vesting-schedules">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const schedules = await db.vestingSchedule.findMany({
    where: { companyId: C },
    include: { milestones: { orderBy: { sortOrder: "asc" } }, _count: { select: { securities: true } } },
    orderBy: [{ type: "asc" }, { totalMonths: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader title="Vesting schedules" description="Reusable templates applied to option, RSU, RSA and warrant grants. Each grant sets its own vesting commencement date." actions={ctx.canEdit ? <ScheduleDialog companyId={C} /> : null} />
      {schedules.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No vesting schedules" description="Create a template such as “4 years, 1 year cliff, monthly” to use when granting equity." action={ctx.canEdit ? <ScheduleDialog companyId={C} /> : null} />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-5">Schedule</th>
                <th>Type</th>
                <th className="text-right">Period</th>
                <th className="text-right">Cliff</th>
                <th>Frequency</th>
                <th>Acceleration</th>
                <th className="text-right">Used by</th>
                <th className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const input = {
                  id: s.id,
                  name: s.name,
                  type: s.type,
                  totalMonths: s.totalMonths,
                  cliffMonths: s.cliffMonths,
                  cliffPercent: s.cliffPercent,
                  frequency: s.frequency,
                  accelerationSingleTrigger: s.accelerationSingleTrigger,
                  accelerationDoubleTrigger: s.accelerationDoubleTrigger,
                  description: s.description,
                  milestones: s.milestones.map((m) => ({ id: m.id, description: m.description, percent: m.percent, achievedAt: toInputDate(m.achievedAt) || null })),
                };
                return (
                  <tr key={s.id} className="[&>td]:align-top">
                    <td className="min-w-[280px] whitespace-normal pl-5 sm:min-w-[360px]">
                      <div className="font-medium">{s.name}</div>
                      <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{s.description ?? vestingDescription(s)}</div>
                      {s.type === "MILESTONE" && s.milestones.length ? (
                        <ul className="mt-2 space-y-1">
                          {s.milestones.map((m) => (
                            <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <span className="w-10 shrink-0 text-right tabular text-muted-foreground">{m.percent}%</span>
                              <span className="min-w-0 flex-1">{m.description}</span>
                              {/* On phones the status and its action always take their own line under the description. */}
                              <span className="flex items-center gap-2 max-sm:basis-full max-sm:pl-12">
                                {m.achievedAt ? <Badge variant="success">Achieved {date(m.achievedAt)}</Badge> : <Badge variant="neutral">Pending</Badge>}
                                {ctx.canEdit ? <MilestoneAchievedButton companyId={C} milestoneId={m.id} description={m.description} achieved={!!m.achievedAt} /> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td>
                      <Badge variant="outline">{TYPE[s.type] ?? s.type}</Badge>
                    </td>
                    <td className="num">{s.type === "TIME" ? `${s.totalMonths} mo` : "—"}</td>
                    <td className="num">{s.type === "TIME" && s.cliffMonths ? `${s.cliffMonths} mo${s.cliffPercent ? ` (${s.cliffPercent}%)` : ""}` : "—"}</td>
                    <td>{s.type === "TIME" ? FREQ[s.frequency] ?? s.frequency : "—"}</td>
                    <td className="text-xs text-muted-foreground">
                      {s.accelerationSingleTrigger ? <div>{s.accelerationSingleTrigger}% single-trigger</div> : null}
                      {s.accelerationDoubleTrigger ? <div>{s.accelerationDoubleTrigger}% double-trigger</div> : null}
                      {!s.accelerationSingleTrigger && !s.accelerationDoubleTrigger ? "None" : null}
                    </td>
                    <td className="num">
                      {s._count.securities ? (
                        <a href={`/app/${C}/securities`} className="hover:underline">
                          {s._count.securities} grant{s._count.securities === 1 ? "" : "s"}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Unused</span>
                      )}
                    </td>
                    <td className="pr-5">
                      {ctx.canEdit ? (
                        <div className="flex items-center justify-end gap-1">
                          <EditScheduleButton companyId={C} schedule={input} />
                          {s._count.securities === 0 ? <DeleteScheduleButton companyId={C} scheduleId={s.id} name={s.name} /> : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
