"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zDate, zDateOpt, zNum, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { buildCapTable } from "@/lib/equity/captable";

type R = ActionResult<{ id: string }>;
type RV = ActionResult<undefined>;

function errorResult(e: unknown) {
  return fail(e instanceof Error ? e.message : "Something went wrong.");
}

async function classAvailability(companyId: string, shareClassId: string, excludePlanId?: string) {
  const [shareClasses, stakeholders, equityPlans, securities] = await Promise.all([
    db.shareClass.findMany({ where: { companyId } }),
    db.stakeholder.findMany({ where: { companyId } }),
    db.equityPlan.findMany({ where: { companyId } }),
    db.security.findMany({ where: { companyId } }),
  ]);
  const summary = buildCapTable({ shareClasses, stakeholders, equityPlans: equityPlans.filter((p) => p.id !== excludePlanId), securities });
  return summary.classTotals.find((c) => c.shareClassId === shareClassId) ?? null;
}

export async function createPlan(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(
    z.object({ companyId: zStr, name: zStr, shareClassId: zStr, authorizedShares: zNum.min(1), adoptionDate: zDateOpt, boardApprovalDate: zDateOpt, stockholderApprovalDate: zDateOpt, expirationDate: zDateOpt, notes: zStrOpt }),
    formData,
  );
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const cls = await db.shareClass.findFirst({ where: { id: parsed.data.shareClassId, companyId: C } });
    if (!cls) return fail("Select the share class the plan draws from.");
    const avail = await classAvailability(C, cls.id);
    if (avail && parsed.data.authorizedShares > avail.available) return fail(`Only ${Math.round(avail.available).toLocaleString()} unreserved ${cls.name} shares are available. Increase the class's authorized shares first.`);
    const plan = await db.equityPlan.create({
      data: {
        companyId: C,
        shareClassId: cls.id,
        name: parsed.data.name,
        authorizedShares: parsed.data.authorizedShares,
        adoptionDate: parsed.data.adoptionDate,
        boardApprovalDate: parsed.data.boardApprovalDate,
        stockholderApprovalDate: parsed.data.stockholderApprovalDate,
        expirationDate: parsed.data.expirationDate ?? (parsed.data.adoptionDate ? new Date(parsed.data.adoptionDate.getFullYear() + 10, parsed.data.adoptionDate.getMonth(), parsed.data.adoptionDate.getDate()) : undefined),
        notes: parsed.data.notes,
        status: "ACTIVE",
      },
    });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "EquityPlan", entityId: plan.id, summary: `Created ${plan.name} with ${Math.round(plan.authorizedShares).toLocaleString()} shares reserved`, after: { name: plan.name, authorizedShares: plan.authorizedShares } });
    revalidatePath(`/app/${C}`, "layout");
    return ok({ id: plan.id }, `Created ${plan.name}.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function updatePlan(_p: RV | undefined, formData: FormData): Promise<RV> {
  const parsed = parseForm(z.object({ companyId: zStr, planId: zStr, name: zStr, adoptionDate: zDateOpt, boardApprovalDate: zDateOpt, stockholderApprovalDate: zDateOpt, expirationDate: zDateOpt, notes: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const plan = await db.equityPlan.findFirst({ where: { id: parsed.data.planId, companyId: C } });
    if (!plan) return fail("Plan not found.");
    const { planId: _planId, companyId: _c, ...data } = parsed.data;
    void _planId;
    void _c;
    await db.equityPlan.update({ where: { id: plan.id }, data: { ...data, notes: data.notes ?? null } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "EquityPlan", entityId: plan.id, summary: `Updated ${plan.name}`, before: { name: plan.name, adoptionDate: plan.adoptionDate, expirationDate: plan.expirationDate }, after: data });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, "Plan updated.");
  } catch (e) {
    return errorResult(e);
  }
}

export async function increaseReserve(_p: RV | undefined, formData: FormData): Promise<RV> {
  const parsed = parseForm(z.object({ companyId: zStr, planId: zStr, sharesToAdd: zNum.min(1), boardApprovalDate: zDate, notes: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const plan = await db.equityPlan.findFirst({ where: { id: parsed.data.planId, companyId: C }, include: { shareClass: true } });
    if (!plan) return fail("Plan not found.");
    if (plan.status === "TERMINATED") return fail("This plan has been terminated.");
    const avail = await classAvailability(C, plan.shareClassId);
    if (avail && parsed.data.sharesToAdd > avail.available) return fail(`Only ${Math.round(avail.available).toLocaleString()} unreserved ${plan.shareClass.name} shares are available. Increase the authorized shares of the class first.`);
    const before = plan.authorizedShares;
    const after = before + parsed.data.sharesToAdd;
    await db.$transaction([
      db.equityPlan.update({ where: { id: plan.id }, data: { authorizedShares: after, notes: `${plan.notes ? plan.notes + "\n" : ""}Reserve increased by ${Math.round(parsed.data.sharesToAdd).toLocaleString()} to ${Math.round(after).toLocaleString()} shares (board approval ${parsed.data.boardApprovalDate.toISOString().slice(0, 10)}).${parsed.data.notes ? ` ${parsed.data.notes}` : ""}` } }),
      db.transaction.create({ data: { companyId: C, type: "MODIFICATION", quantity: parsed.data.sharesToAdd, effectiveDate: parsed.data.boardApprovalDate, notes: `${plan.name}: reserve increased from ${Math.round(before).toLocaleString()} to ${Math.round(after).toLocaleString()} shares`, metadata: JSON.stringify({ entity: "EquityPlan", planId: plan.id, from: before, to: after }), createdById: ctx.user.id } }),
      db.notification.create({ data: { companyId: C, userId: ctx.user.id, type: "TASK", title: `Document the ${plan.name} increase with a board consent`, body: `The reserve was increased by ${Math.round(parsed.data.sharesToAdd).toLocaleString()} shares. Plan increases typically require board and stockholder approval — attach or create the consent.`, link: `/app/${C}/board/new?type=EQUITY_PLAN&planId=${plan.id}` } }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "EquityPlan", entityId: plan.id, summary: `Increased ${plan.name} reserve by ${Math.round(parsed.data.sharesToAdd).toLocaleString()} shares to ${Math.round(after).toLocaleString()}`, before: { authorizedShares: before }, after: { authorizedShares: after } });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `Reserve increased to ${Math.round(after).toLocaleString()} shares.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function terminatePlan(_p: RV | undefined, formData: FormData): Promise<RV> {
  const parsed = parseForm(z.object({ companyId: zStr, planId: zStr }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const plan = await db.equityPlan.findFirst({ where: { id: parsed.data.planId, companyId: C } });
    if (!plan) return fail("Plan not found.");
    await db.equityPlan.update({ where: { id: plan.id }, data: { status: "TERMINATED" } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "EquityPlan", entityId: plan.id, summary: `Terminated ${plan.name}; outstanding grants remain in effect, no new grants may be made` });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `${plan.name} terminated.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function reactivatePlan(_p: RV | undefined, formData: FormData): Promise<RV> {
  const parsed = parseForm(z.object({ companyId: zStr, planId: zStr }), formData);
  if (parsed.error) return parsed.error;
  try {
    const ctx = await requireEditor(parsed.data.companyId);
    const C = ctx.company.id;
    const plan = await db.equityPlan.findFirst({ where: { id: parsed.data.planId, companyId: C } });
    if (!plan) return fail("Plan not found.");
    await db.equityPlan.update({ where: { id: plan.id }, data: { status: "ACTIVE" } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "EquityPlan", entityId: plan.id, summary: `Reactivated ${plan.name}` });
    revalidatePath(`/app/${C}`, "layout");
    return ok(undefined, `${plan.name} reactivated.`);
  } catch (e) {
    return errorResult(e);
  }
}
