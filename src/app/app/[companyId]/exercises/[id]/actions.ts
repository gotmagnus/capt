"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { exercisableForSecurity } from "@/lib/people-data";
import { nextCertificateNumber } from "@/lib/equity/captable";
import { shareCertificate } from "@/lib/documents/templates";
import { fail, ok, parseForm, zBool, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const base = z.object({ companyId: zStr, id: zStr });

async function load(companyId: string, id: string) {
  const ctx = await requireEditor(companyId);
  const req = await db.exerciseRequest.findFirst({
    where: { id, companyId: ctx.company.id },
    include: { security: { include: { equityPlan: { include: { shareClass: true } }, shareClass: true } }, stakeholder: true },
  });
  return { ctx, req };
}

function notify(companyId: string, stakeholder: { id: string; userId: string | null }, title: string, body: string, link: string) {
  return db.notification.create({ data: { companyId, stakeholderId: stakeholder.id, userId: stakeholder.userId, type: "INFO", title, body, link } });
}

export async function approveExercise(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(base, formData);
  if (error) return error;
  const { ctx, req } = await load(data.companyId, data.id);
  if (!req) return fail("Request not found.");
  if (req.status !== "REQUESTED") return fail("Only new requests can be approved.");
  const C = ctx.company.id;
  const capTable = await loadCapTable(C);
  const exercisable = exercisableForSecurity(capTable, req.securityId);
  if (req.quantity > exercisable) return fail(`Only ${exercisable.toLocaleString()} shares are currently exercisable under ${req.security.certificateNumber}.`);
  await db.exerciseRequest.update({ where: { id: req.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  await notify(
    C,
    req.stakeholder,
    `Exercise of ${req.quantity.toLocaleString()} options approved`,
    `Please send ${req.totalCost.toLocaleString("en-US", { style: "currency", currency: "USD" })} by ${req.method === "WIRE" ? "wire" : req.method === "ACH" ? "ACH debit" : req.method.toLowerCase()} within 10 business days. Shares are issued once payment clears.`,
    `/portal/${C}/holdings`,
  );
  await logAudit({ companyId: C, userId: ctx.user.id, action: "APPROVE", entityType: "ExerciseRequest", entityId: req.id, summary: `Approved exercise of ${req.quantity.toLocaleString()} options (${req.security.certificateNumber}) by ${req.stakeholder.name}` });
  revalidatePath(`/app/${C}/exercises`);
  return ok(undefined, "Exercise approved — payment instructions sent to the holder");
}

export async function rejectExercise(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(base.extend({ reason: zStr }), formData);
  if (error) return error;
  const { ctx, req } = await load(data.companyId, data.id);
  if (!req) return fail("Request not found.");
  if (["COMPLETED", "REJECTED", "CANCELLED"].includes(req.status)) return fail("This request is already closed.");
  const C = ctx.company.id;
  await db.exerciseRequest.update({ where: { id: req.id }, data: { status: "REJECTED", notes: [req.notes, `Rejected: ${data.reason}`].filter(Boolean).join("\n") } });
  await notify(C, req.stakeholder, "Exercise request declined", data.reason, `/portal/${C}/holdings`);
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "ExerciseRequest", entityId: req.id, summary: `Rejected exercise request from ${req.stakeholder.name}: ${data.reason}` });
  revalidatePath(`/app/${C}/exercises`);
  return ok(undefined, "Request rejected");
}

export async function markExercisePaid(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(base, formData);
  if (error) return error;
  const { ctx, req } = await load(data.companyId, data.id);
  if (!req) return fail("Request not found.");
  if (!["APPROVED", "PAYMENT_PENDING"].includes(req.status)) return fail("Approve the request before recording payment.");
  const C = ctx.company.id;
  await db.exerciseRequest.update({ where: { id: req.id }, data: { status: "PAID", paidAt: new Date() } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "ExerciseRequest", entityId: req.id, summary: `Recorded ${req.totalCost.toLocaleString("en-US", { style: "currency", currency: "USD" })} payment from ${req.stakeholder.name} for ${req.security.certificateNumber}` });
  revalidatePath(`/app/${C}/exercises`);
  return ok(undefined, "Payment recorded — ready to issue shares");
}

export async function cancelExercise(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(base, formData);
  if (error) return error;
  const { ctx, req } = await load(data.companyId, data.id);
  if (!req) return fail("Request not found.");
  if (["COMPLETED", "CANCELLED"].includes(req.status)) return fail("This request can no longer be cancelled.");
  const C = ctx.company.id;
  await db.exerciseRequest.update({ where: { id: req.id }, data: { status: "CANCELLED" } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CANCEL", entityType: "ExerciseRequest", entityId: req.id, summary: `Cancelled exercise request from ${req.stakeholder.name} (${req.security.certificateNumber})` });
  revalidatePath(`/app/${C}/exercises`);
  return ok(undefined, "Request cancelled");
}

/** Issues shares for a paid exercise: new certificate, EXERCISE transaction, grant update, 3921 record. */
export async function completeExercise(_prev: ActionResult<{ securityId: string }> | undefined, formData: FormData): Promise<ActionResult<{ securityId: string }>> {
  const { data, error } = parseForm(base.extend({ election83b: zBool.optional(), notes: zStrOpt }), formData);
  if (error) return error;
  const { ctx, req } = await load(data.companyId, data.id);
  if (!req) return fail("Request not found.");
  if (!["APPROVED", "PAID", "PAYMENT_PENDING"].includes(req.status)) return fail("Only approved or paid requests can be completed.");
  const C = ctx.company.id;
  const [capTable, valuation] = await Promise.all([loadCapTable(C), currentValuation(C)]);
  const exercisable = exercisableForSecurity(capTable, req.securityId);
  if (req.quantity > exercisable) return fail(`Only ${exercisable.toLocaleString()} shares are vested and unexercised under ${req.security.certificateNumber}.`);
  const commonClass = req.security.equityPlan?.shareClass ?? req.security.shareClass ?? capTable.shareClasses.find((c) => c.type === "COMMON");
  if (!commonClass) return fail("No common share class exists to issue shares into.");
  const cert = nextCertificateNumber(commonClass.prefix, capTable.securities.map((s) => s.certificateNumber));
  const fmv = req.fmvAtExercise ?? valuation?.fairMarketValue ?? null;
  const now = new Date();
  const fullyExercised = req.security.exercisedQuantity + req.quantity >= req.security.quantity - req.security.cancelledQuantity;
  const isShares = req.security.type !== "WARRANT";

  const result = await db.$transaction(async (tx) => {
    const issued = await tx.security.create({
      data: {
        companyId: C,
        stakeholderId: req.stakeholderId,
        type: "COMMON_SHARES",
        certificateNumber: cert,
        shareClassId: commonClass.id,
        quantity: req.quantity,
        pricePerShare: req.exercisePrice,
        fmvAtGrant: fmv,
        totalAmount: req.totalCost,
        issueDate: now,
        grantDate: now,
        status: "OUTSTANDING",
        election83bDeadline: data.election83b ? new Date(now.getTime() + 30 * 86_400_000) : null,
        notes: `Issued on exercise of ${req.security.certificateNumber}${data.notes ? ` — ${data.notes}` : ""}`,
      },
    });
    await tx.transaction.create({ data: { companyId: C, type: "EXERCISE", securityId: req.securityId, toStakeholderId: req.stakeholderId, quantity: req.quantity, pricePerShare: req.exercisePrice, totalAmount: req.totalCost, effectiveDate: now, notes: `Exercised ${req.quantity.toLocaleString()} ${isShares ? (req.isIso ? "ISOs" : "NSOs") : "warrants"} (${req.security.certificateNumber}) → ${cert}`, createdById: ctx.user.id, metadata: JSON.stringify({ exerciseRequestId: req.id, resultingSecurityId: issued.id, fmv }) } });
    await tx.security.update({ where: { id: req.securityId }, data: { exercisedQuantity: { increment: req.quantity }, status: fullyExercised ? "EXERCISED" : req.security.status } });
    await tx.exerciseRequest.update({ where: { id: req.id }, data: { status: "COMPLETED", completedAt: now, paidAt: req.paidAt ?? now, resultingSecurityId: issued.id, election83b: !!data.election83b, fmvAtExercise: fmv } });
    const content = shareCertificate({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }, certificateNumber: cert, holderName: req.stakeholder.name, shares: req.quantity, className: commonClass.name, parValue: commonClass.parValue, issueDate: now, pricePerShare: req.exercisePrice });
    await tx.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: issued.id, stakeholderId: req.stakeholderId, visibility: "HOLDER", uploadedById: ctx.user.id } });
    if (req.isIso) {
      await tx.complianceRecord.create({ data: { companyId: C, type: "FORM_3921", taxYear: now.getFullYear(), referenceId: req.id, status: "PENDING", dueDate: new Date(now.getFullYear() + 1, 0, 31), data: JSON.stringify({ employee: req.stakeholder.name, stakeholderId: req.stakeholderId, shares: req.quantity, exercisePrice: req.exercisePrice, fmv, grantDate: req.security.grantDate ?? req.security.issueDate, exerciseDate: now, certificateNumber: cert }) } });
    }
    await tx.notification.create({ data: { companyId: C, stakeholderId: req.stakeholderId, userId: req.stakeholder.userId, type: "INFO", title: `${req.quantity.toLocaleString()} shares issued (${cert})`, body: `Your exercise of ${req.security.certificateNumber} is complete. The certificate is available in your documents.${req.isIso ? " Form 3921 will be furnished by January 31." : ""}`, link: `/portal/${C}/holdings` } });
    return issued;
  });

  await logAudit({ companyId: C, userId: ctx.user.id, action: "EXERCISE", entityType: "Security", entityId: result.id, summary: `Issued ${req.quantity.toLocaleString()} shares (${cert}) to ${req.stakeholder.name} on exercise of ${req.security.certificateNumber} at $${req.exercisePrice}`, after: { certificateNumber: cert, quantity: req.quantity, exercisePrice: req.exercisePrice, fmv } });
  revalidatePath(`/app/${C}/exercises`);
  revalidatePath(`/app/${C}/cap-table`);
  revalidatePath(`/app/${C}/securities`);
  return ok({ securityId: result.id }, `Issued ${cert} — ${req.quantity.toLocaleString()} shares`);
}
