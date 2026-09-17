"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireCompany } from "@/lib/auth";
import { fail, ok, parseForm, zBool, zNum, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { loadPortal } from "@/lib/portal-data";
import { signDocumentForUser } from "@/lib/portal-sign";
import { currentValuation } from "@/lib/data/captable";

const exerciseSchema = z.object({
  companyId: zStr,
  securityId: zStr,
  quantity: zNum.int().positive(),
  method: z.enum(["ACH", "WIRE", "CHECK", "CASHLESS", "NET_EXERCISE"]).default("ACH"),
  election83b: zBool.optional(),
  notes: zStrOpt,
});

export async function requestExercise(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(exerciseSchema, formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  const portal = await loadPortal(ctx.company.id, ctx);
  const holding = portal.holdings.find((h) => h.security.id === data.securityId);
  if (!holding || !holding.isExercisable) return fail("That grant isn't yours or can't be exercised.");
  if (holding.security.status !== "OUTSTANDING") return fail("This grant is not outstanding.");
  if (data.quantity > holding.exercisable) return fail(`You can exercise at most ${holding.exercisable.toLocaleString()} options right now.`);
  const open = await db.exerciseRequest.findFirst({ where: { securityId: holding.security.id, status: { in: ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"] } } });
  if (open) return fail("There is already an exercise request in progress for this grant.");
  const valuation = await currentValuation(ctx.company.id);
  const strike = holding.security.exercisePrice ?? 0;
  const isEarly = data.quantity > Math.max(0, holding.vesting.vested - holding.security.exercisedQuantity);
  const req = await db.exerciseRequest.create({
    data: {
      companyId: ctx.company.id,
      securityId: holding.security.id,
      stakeholderId: holding.security.stakeholderId,
      quantity: data.quantity,
      exercisePrice: strike,
      totalCost: data.quantity * strike,
      fmvAtExercise: valuation?.fairMarketValue ?? null,
      isIso: holding.security.type === "OPTION_ISO",
      method: data.method,
      status: "REQUESTED",
      election83b: isEarly ? !!data.election83b : false,
      notes: data.notes ?? null,
    },
  });
  await db.notification.create({ data: { companyId: ctx.company.id, type: "TASK", title: `Exercise request from ${holding.security.stakeholder.name}`, body: `${data.quantity.toLocaleString()} ${holding.security.type === "OPTION_ISO" ? "ISOs" : holding.security.type === "OPTION_NSO" ? "NSOs" : "warrants"} at $${strike} — total $${(data.quantity * strike).toLocaleString()}. Review and approve.`, link: `/app/${ctx.company.id}/exercises/${req.id}`, status: "OPEN" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "ExerciseRequest", entityId: req.id, summary: `${holding.security.stakeholder.name} requested to exercise ${data.quantity.toLocaleString()} of ${holding.security.certificateNumber}` });
  revalidatePath(`/portal/${ctx.company.id}`, "layout");
  revalidatePath(`/app/${ctx.company.id}`, "layout");
  return ok({ id: req.id }, "Exercise request submitted — your equity team will review it.");
}

export async function cancelExerciseRequest(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, id: zStr }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  const portal = await loadPortal(ctx.company.id, ctx);
  const req = await db.exerciseRequest.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!req || !portal.myIds.has(req.stakeholderId)) return fail("Request not found.");
  if (!["REQUESTED", "APPROVED"].includes(req.status)) return fail("This request can no longer be cancelled.");
  await db.exerciseRequest.update({ where: { id: req.id }, data: { status: "CANCELLED" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CANCEL", entityType: "ExerciseRequest", entityId: req.id, summary: `${ctx.user.name} cancelled their exercise request` });
  revalidatePath(`/portal/${ctx.company.id}`, "layout");
  return ok(undefined, "Request cancelled");
}

export async function signDocument(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, documentId: zStr, agree: zBool }), formData);
  if (error) return error;
  if (!data.agree) return fail("Confirm that you have read the document.");
  const ctx = await requireCompany(data.companyId);
  const portal = await loadPortal(ctx.company.id, ctx);
  const res = await signDocumentForUser({ companyId: ctx.company.id, documentId: data.documentId, userId: ctx.user.id, userEmail: ctx.user.email, userName: ctx.user.name, stakeholderIds: [...portal.myIds] });
  if (!res.ok) return fail(res.error);
  revalidatePath(`/portal/${ctx.company.id}`, "layout");
  revalidatePath(`/app/${ctx.company.id}`, "layout");
  return ok(undefined, res.activated ? "Signed — your grant is now outstanding." : res.remaining ? `Signed. Waiting on ${res.remaining} more signature${res.remaining === 1 ? "" : "s"}.` : "Signed.");
}

export async function updatePortalProfile(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, name: zStr, email: z.string().email(), address: zStrOpt, country: z.string().length(2).default("US"), taxId: zStrOpt, accredited: zBool.optional() }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  const mine = await db.stakeholder.findMany({ where: { companyId: ctx.company.id, userId: ctx.user.id } });
  if (mine.length === 0) return fail("No stakeholder profile is linked to your account.");
  for (const s of mine) {
    await db.stakeholder.update({ where: { id: s.id }, data: { name: s.type === "ENTITY" ? s.name : data.name, email: data.email.toLowerCase(), address: data.address ?? null, country: data.country.toUpperCase(), taxId: data.taxId && !data.taxId.includes("•") ? data.taxId : s.taxId, accredited: data.accredited ?? s.accredited } });
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Stakeholder", entityId: mine[0].id, summary: `${ctx.user.name} updated their contact details via the portal` });
  revalidatePath(`/portal/${ctx.company.id}`, "layout");
  return ok(undefined, "Profile saved");
}
