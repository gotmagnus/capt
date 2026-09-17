"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zDate, zInt, zJson, zNum, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

type R = ActionResult<undefined>;

function errorResult(e: unknown): R {
  return fail(e instanceof Error ? e.message : "Something went wrong.");
}

const milestoneSchema = z.array(z.object({ id: z.string().optional(), description: z.string().min(1), percent: z.coerce.number().min(0).max(100), achievedAt: z.string().nullable().optional() }));

const scheduleSchema = z.object({
  companyId: zStr,
  scheduleId: zStrOpt,
  name: zStr,
  type: z.enum(["TIME", "MILESTONE", "IMMEDIATE"]),
  totalMonths: zInt.min(0).default(48),
  cliffMonths: zInt.min(0).default(0),
  cliffPercent: zNumOpt,
  frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY", "DAILY"]).default("MONTHLY"),
  accelerationSingleTrigger: zNum.min(0).max(100).default(0),
  accelerationDoubleTrigger: zNum.min(0).max(100).default(0),
  description: zStrOpt,
  milestones: zJson(milestoneSchema).default([]),
});

export async function saveSchedule(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(scheduleSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  try {
    const ctx = await requireEditor(d.companyId);
    const C = ctx.company.id;
    if (d.type === "TIME") {
      if (d.totalMonths < 1) return fail("Time-based schedules need a total vesting period of at least one month.");
      if (d.cliffMonths > d.totalMonths) return fail("The cliff cannot be longer than the total vesting period.");
    }
    if (d.type === "MILESTONE") {
      if (!d.milestones.length) return fail("Add at least one milestone.");
      const total = d.milestones.reduce((a, m) => a + m.percent, 0);
      if (Math.round(total) !== 100) return fail(`Milestone percentages must add up to 100% (currently ${total}%).`);
    }
    const base = {
      name: d.name,
      type: d.type,
      totalMonths: d.type === "TIME" ? d.totalMonths : 0,
      cliffMonths: d.type === "TIME" ? d.cliffMonths : 0,
      cliffPercent: d.type === "TIME" && d.cliffPercent ? d.cliffPercent : null,
      frequency: d.frequency,
      accelerationSingleTrigger: d.accelerationSingleTrigger,
      accelerationDoubleTrigger: d.accelerationDoubleTrigger,
      description: d.description ?? null,
    };
    if (d.scheduleId) {
      const existing = await db.vestingSchedule.findFirst({ where: { id: d.scheduleId, companyId: C }, include: { milestones: true } });
      if (!existing) return fail("Schedule not found.");
      await db.$transaction(async (tx) => {
        await tx.vestingSchedule.update({ where: { id: existing.id }, data: base });
        if (d.type === "MILESTONE") {
          const keep = new Set<string>();
          for (const [i, m] of d.milestones.entries()) {
            const match = (m.id && existing.milestones.find((x) => x.id === m.id)) || existing.milestones.find((x) => x.description === m.description);
            if (match) {
              keep.add(match.id);
              await tx.vestingMilestone.update({ where: { id: match.id }, data: { description: m.description, percent: m.percent, sortOrder: i } });
            } else {
              const created = await tx.vestingMilestone.create({ data: { scheduleId: existing.id, description: m.description, percent: m.percent, sortOrder: i } });
              keep.add(created.id);
            }
          }
          await tx.vestingMilestone.deleteMany({ where: { scheduleId: existing.id, id: { notIn: [...keep] } } });
        } else {
          await tx.vestingMilestone.deleteMany({ where: { scheduleId: existing.id } });
        }
      });
      await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "VestingSchedule", entityId: existing.id, summary: `Updated vesting schedule “${d.name}”`, before: { name: existing.name, totalMonths: existing.totalMonths, cliffMonths: existing.cliffMonths, frequency: existing.frequency }, after: base });
      revalidatePath(`/app/${C}`, "layout");
      return ok(undefined, "Schedule updated. Existing grants keep their computed vesting from the updated terms.");
    }
    const created = await db.vestingSchedule.create({
      data: { companyId: C, ...base, isTemplate: true, milestones: d.type === "MILESTONE" ? { create: d.milestones.map((m, i) => ({ description: m.description, percent: m.percent, sortOrder: i })) } : undefined },
    });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "VestingSchedule", entityId: created.id, summary: `Created vesting schedule “${d.name}”`, after: base });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `Created “${d.name}”.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteSchedule(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ companyId: zStr, scheduleId: zStr }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const schedule = await db.vestingSchedule.findFirst({ where: { id: parsed.data.scheduleId, companyId: C }, include: { _count: { select: { securities: true } } } });
    if (!schedule) return fail("Schedule not found.");
    if (schedule._count.securities > 0) return fail(`“${schedule.name}” is used by ${schedule._count.securities} securit${schedule._count.securities === 1 ? "y" : "ies"} and cannot be deleted.`);
    await db.vestingSchedule.delete({ where: { id: schedule.id } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "DELETE", entityType: "VestingSchedule", entityId: schedule.id, summary: `Deleted vesting schedule “${schedule.name}”` });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `Deleted “${schedule.name}”.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function markMilestoneAchieved(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ companyId: zStr, milestoneId: zStr, achievedAt: zDate }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const m = await db.vestingMilestone.findFirst({ where: { id: parsed.data.milestoneId, schedule: { companyId: C } }, include: { schedule: { include: { securities: { include: { stakeholder: true } } } } } });
    if (!m) return fail("Milestone not found.");
    await db.vestingMilestone.update({ where: { id: m.id }, data: { achievedAt: parsed.data.achievedAt } });
    const affected = m.schedule.securities.filter((s) => ["OUTSTANDING", "PENDING_SIGNATURE"].includes(s.status));
    if (affected.length) {
      await db.transaction.createMany({
        data: affected.map((s) => ({ companyId: C, type: "VESTING", securityId: s.id, toStakeholderId: s.stakeholderId, quantity: Math.floor(((s.quantity - s.cancelledQuantity) * m.percent) / 100), effectiveDate: parsed.data.achievedAt, notes: `Milestone achieved: ${m.description} (${m.percent}%)`, createdById: ctx.user.id })),
      });
      await db.notification.createMany({
        data: affected.map((s) => ({ companyId: C, stakeholderId: s.stakeholderId, userId: s.stakeholder.userId, type: "INFO", title: `Milestone achieved: ${m.description}`, body: `${m.percent}% of ${s.certificateNumber} has vested.`, link: `/portal/${C}/vesting` })),
      });
    }
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "VestingMilestone", entityId: m.id, summary: `Marked milestone “${m.description}” (${m.percent}%) achieved on ${parsed.data.achievedAt.toISOString().slice(0, 10)} — ${affected.length} grant${affected.length === 1 ? "" : "s"} affected` });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `Milestone marked achieved; ${affected.length} grant${affected.length === 1 ? "" : "s"} updated.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function clearMilestone(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ companyId: zStr, milestoneId: zStr }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const m = await db.vestingMilestone.findFirst({ where: { id: parsed.data.milestoneId, schedule: { companyId: C } } });
    if (!m) return fail("Milestone not found.");
    await db.vestingMilestone.update({ where: { id: m.id }, data: { achievedAt: null } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "VestingMilestone", entityId: m.id, summary: `Reverted milestone “${m.description}” to not achieved` });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, "Milestone reverted.");
  } catch (e) {
    return errorResult(e);
  }
}
