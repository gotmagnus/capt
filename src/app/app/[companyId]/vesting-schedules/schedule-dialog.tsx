"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { buildVestingEvents } from "@/lib/equity/vesting";
import { date, percent, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { clearMilestone, deleteSchedule, markMilestoneAchieved, saveSchedule } from "./actions";

export interface ScheduleInput {
  id?: string;
  name: string;
  type: string;
  totalMonths: number;
  cliffMonths: number;
  cliffPercent: number | null;
  frequency: string;
  accelerationSingleTrigger: number;
  accelerationDoubleTrigger: number;
  description: string | null;
  milestones: { id?: string; description: string; percent: number; achievedAt: string | null }[];
}

const PREVIEW_SHARES = 48_000;

export function ScheduleDialog({ companyId, schedule, trigger }: { companyId: string; schedule?: ScheduleInput; trigger?: React.ReactNode }) {
  const [type, setType] = useState(schedule?.type ?? "TIME");
  const [totalMonths, setTotalMonths] = useState(schedule?.totalMonths ?? 48);
  const [cliffMonths, setCliffMonths] = useState(schedule?.cliffMonths ?? 12);
  const [cliffPercent, setCliffPercent] = useState<string>(schedule?.cliffPercent != null ? String(schedule.cliffPercent) : "");
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "MONTHLY");
  const [milestones, setMilestones] = useState(schedule?.milestones ?? [{ description: "", percent: 100, achievedAt: null }]);

  const preview = useMemo(() => {
    if (type === "IMMEDIATE") return { events: [], summary: "Fully vested on the grant date." };
    if (type === "MILESTONE") {
      const total = milestones.reduce((a, m) => a + (Number(m.percent) || 0), 0);
      return { events: [], summary: `${milestones.length} milestone${milestones.length === 1 ? "" : "s"} totalling ${total}%${Math.round(total) !== 100 ? " — must equal 100%" : ""}.` };
    }
    const start = new Date();
    const events = buildVestingEvents(PREVIEW_SHARES, start, { type: "TIME", totalMonths: Math.max(1, totalMonths), cliffMonths, cliffPercent: cliffPercent ? Number(cliffPercent) : null, frequency });
    const cliff = events.find((e) => e.label === "Cliff");
    return {
      events,
      summary: `${events.length} vesting events over ${totalMonths} months${cliff ? `; ${percent(cliff.amount / PREVIEW_SHARES, 1)} vests at the ${cliffMonths}-month cliff` : ""}. Fully vested ${events.length ? date(events[events.length - 1].date) : "—"}.`,
    };
  }, [type, totalMonths, cliffMonths, cliffPercent, frequency, milestones]);

  const milestoneTotal = milestones.reduce((a, m) => a + (Number(m.percent) || 0), 0);

  return (
    <FormDialog
      trigger={
        trigger ?? (
          <Button>
            <Plus /> New schedule
          </Button>
        )
      }
      title={schedule ? `Edit “${schedule.name}”` : "New vesting schedule"}
      description={schedule ? "Grants using this template recompute their vesting from the new terms." : "Templates are reused across grants; every grant can still set its own commencement date."}
      action={saveSchedule}
      hidden={{ companyId, scheduleId: schedule?.id, milestones: JSON.stringify(type === "MILESTONE" ? milestones : []) }}
      submitLabel={schedule ? "Save changes" : "Create schedule"}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input name="name" defaultValue={schedule?.name ?? ""} placeholder="4 years, 1 year cliff, monthly" required />
        </Field>
        <Field label="Type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="TIME">Time-based</option>
            <option value="MILESTONE">Milestone / performance</option>
            <option value="IMMEDIATE">Immediate</option>
          </Select>
        </Field>
        {type === "TIME" ? (
          <>
            <Field label="Frequency">
              <Select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
                <option value="DAILY">Daily</option>
              </Select>
            </Field>
            <Field label="Total vesting period (months)" required>
              <Input name="totalMonths" type="number" min={1} step={1} value={totalMonths} onChange={(e) => setTotalMonths(Number(e.target.value))} />
            </Field>
            <Field label="Cliff (months)" hint="0 for no cliff.">
              <Input name="cliffMonths" type="number" min={0} max={totalMonths} step={1} value={cliffMonths} onChange={(e) => setCliffMonths(Number(e.target.value))} />
            </Field>
            <Field label="Percent vesting at cliff" hint="Leave blank for pro-rata (e.g. 25% for a 12-month cliff on 48 months).">
              <Input name="cliffPercent" type="number" min={0} max={100} step="any" suffix="%" value={cliffPercent} onChange={(e) => setCliffPercent(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" name="frequency" value="MONTHLY" />
            <input type="hidden" name="totalMonths" value={0} />
            <input type="hidden" name="cliffMonths" value={0} />
          </>
        )}
        <Field label="Single-trigger acceleration" hint="% of unvested shares vesting on a change of control.">
          <Input name="accelerationSingleTrigger" type="number" min={0} max={100} step="any" suffix="%" defaultValue={schedule?.accelerationSingleTrigger ?? 0} />
        </Field>
        <Field label="Double-trigger acceleration" hint="% vesting on change of control plus termination without cause.">
          <Input name="accelerationDoubleTrigger" type="number" min={0} max={100} step="any" suffix="%" defaultValue={schedule?.accelerationDoubleTrigger ?? 0} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={schedule?.description ?? ""} placeholder="Standard employee schedule" />
        </Field>
      </div>

      {type === "MILESTONE" ? (
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Milestones</span>
            <span className={cn("text-xs tabular", Math.round(milestoneTotal) === 100 ? "text-success" : "text-danger")}>{milestoneTotal}% of 100%</span>
          </div>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <Input value={m.description} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Ship v2 to first customer" aria-label={`Milestone ${i + 1} description`} className="w-full sm:w-auto sm:flex-1" />
                <Input type="number" min={0} max={100} step="any" suffix="%" value={m.percent} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} className="w-28" />
                {m.achievedAt ? <Badge variant="success">Achieved</Badge> : null}
                <Button type="button" variant="ghost" size="icon-sm" className="max-sm:ml-auto" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} disabled={milestones.length === 1} aria-label="Remove milestone">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setMilestones([...milestones, { description: "", percent: Math.max(0, 100 - milestoneTotal), achievedAt: null }])}>
            <Plus /> Add milestone
          </Button>
        </div>
      ) : null}

      <div className="rounded-md bg-muted p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview · {shares(PREVIEW_SHARES)}-share grant starting today</div>
        <p className="text-[13px]">{preview.summary}</p>
        {preview.events.length ? (
          <>
            <div className="mt-3 flex h-6 w-full overflow-hidden rounded bg-border">
              {preview.events.map((e, i) => (
                <div key={i} title={`${date(e.date)}: ${shares(e.amount)}`} className={cn("h-full border-r border-white/60 last:border-r-0", e.label === "Cliff" ? "bg-accent" : "bg-primary/70")} style={{ width: `${(e.amount / PREVIEW_SHARES) * 100}%` }} />
              ))}
            </div>
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium">Date</th>
                  <th className="text-right font-medium">Vesting</th>
                  <th className="text-right font-medium">Cumulative</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...preview.events.slice(0, 3), ...(preview.events.length > 6 ? [null] : []), ...preview.events.slice(Math.max(3, preview.events.length - 3))].map((e, i) =>
                  e ? (
                    <tr key={i}>
                      <td className="py-0.5">
                        {date(e.date)}
                        {e.label ? <span className="ml-1 text-accent-foreground">{e.label}</span> : null}
                      </td>
                      <td className="py-0.5 text-right">{shares(e.amount)}</td>
                      <td className="py-0.5 text-right">{shares(e.cumulative)} ({percent(e.cumulative / PREVIEW_SHARES, 0)})</td>
                    </tr>
                  ) : (
                    <tr key="gap">
                      <td colSpan={3} className="py-0.5 text-center text-muted-foreground">
                        … {preview.events.length - 6} more events …
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </FormDialog>
  );
}

export function EditScheduleButton({ companyId, schedule }: { companyId: string; schedule: ScheduleInput }) {
  return (
    <ScheduleDialog
      companyId={companyId}
      schedule={schedule}
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil /> Edit
        </Button>
      }
    />
  );
}

export function DeleteScheduleButton({ companyId, scheduleId, name }: { companyId: string; scheduleId: string; name: string }) {
  return (
    <ConfirmButton action={deleteSchedule} hidden={{ companyId, scheduleId }} title={`Delete “${name}”?`} description="This template is not used by any security." confirmLabel="Delete" variant="ghost" size="sm" className="text-danger hover:bg-danger-soft">
      <Trash2 /> Delete
    </ConfirmButton>
  );
}

export function MilestoneAchievedButton({ companyId, milestoneId, description, achieved }: { companyId: string; milestoneId: string; description: string; achieved: boolean }) {
  if (achieved) {
    return (
      <ConfirmButton action={clearMilestone} hidden={{ companyId, milestoneId }} title="Revert milestone?" description={`“${description}” will be marked as not yet achieved. Grants using this schedule will show the tranche as unvested again.`} confirmLabel="Revert" variant="ghost" size="xs">
        <Undo2 /> Revert
      </ConfirmButton>
    );
  }
  return (
    <FormDialog
      trigger={
        <Button variant="secondary" size="xs">
          <CheckCircle2 /> Mark achieved
        </Button>
      }
      title="Mark milestone achieved"
      description={`“${description}” — every grant on this schedule vests this tranche as of the date below.`}
      action={markMilestoneAchieved}
      hidden={{ companyId, milestoneId }}
      submitLabel="Mark achieved"
      size="sm"
    >
      <Field label="Achievement date" required>
        <Input name="achievedAt" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} />
      </Field>
    </FormDialog>
  );
}
