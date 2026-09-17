"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zDateOpt, zJson, zNum, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const packageSchema = z.object({ label: z.string().min(1), salary: z.coerce.number().min(0), equityQuantity: z.coerce.number().min(0) });

const offerSchema = z.object({
  companyId: zStr,
  id: zStrOpt,
  candidateName: zStr,
  candidateEmail: z.string().email(),
  title: zStr,
  department: zStrOpt,
  level: zStrOpt,
  salary: zNumOpt,
  bonus: zNumOpt,
  equityQuantity: zNum.min(0),
  equityType: z.enum(["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"]),
  strikePrice: zNumOpt,
  vestingScheduleId: zStrOpt,
  startDate: zDateOpt,
  expiresAt: zDateOpt,
  message: zStrOpt,
  packages: zJson(z.array(packageSchema)).optional(),
});

export async function saveOffer(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(offerSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  if (data.vestingScheduleId) {
    const v = await db.vestingSchedule.findFirst({ where: { id: data.vestingScheduleId, companyId: C } });
    if (!v) return fail("Vesting schedule not found.");
  }
  const packages = data.packages && data.packages.length ? data.packages : [{ label: "Standard", salary: data.salary ?? 0, equityQuantity: data.equityQuantity }];
  const payload = {
    candidateName: data.candidateName,
    candidateEmail: data.candidateEmail.toLowerCase(),
    title: data.title,
    department: data.department ?? null,
    level: data.level ?? null,
    salary: data.salary ?? null,
    bonus: data.bonus ?? null,
    equityQuantity: data.equityQuantity,
    equityType: data.equityType,
    strikePrice: data.strikePrice ?? null,
    vestingScheduleId: data.vestingScheduleId ?? null,
    startDate: data.startDate ?? null,
    expiresAt: data.expiresAt ?? null,
    message: data.message ?? null,
    packages: JSON.stringify(packages),
  };
  let id: string;
  if (data.id) {
    const existing = await db.offerLetter.findFirst({ where: { id: data.id, companyId: C } });
    if (!existing) return fail("Offer not found.");
    if (["ACCEPTED", "DECLINED"].includes(existing.status)) return fail("Accepted or declined offers can't be edited.");
    await db.offerLetter.update({ where: { id: existing.id }, data: payload });
    id = existing.id;
  } else {
    const created = await db.offerLetter.create({ data: { ...payload, companyId: C, status: "DRAFT", createdById: ctx.user.id } });
    id = created.id;
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: data.id ? "UPDATE" : "CREATE", entityType: "OfferLetter", entityId: id, summary: `${data.id ? "Updated" : "Drafted"} offer for ${data.candidateName} — ${data.title}, ${data.equityQuantity.toLocaleString()} ${data.equityType.replace("OPTION_", "")}s` });
  revalidatePath(`/app/${C}/offers`);
  return ok({ id }, data.id ? "Offer updated" : "Offer drafted");
}

const idSchema = z.object({ companyId: zStr, id: zStr });

async function loadOffer(companyId: string, id: string) {
  const ctx = await requireEditor(companyId);
  const offer = await db.offerLetter.findFirst({ where: { id, companyId: ctx.company.id } });
  return { ctx, offer };
}

export async function sendOffer(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, offer } = await loadOffer(data.companyId, data.id);
  if (!offer) return fail("Offer not found.");
  if (["ACCEPTED", "DECLINED"].includes(offer.status)) return fail("This offer has already been answered.");
  const C = ctx.company.id;
  const resend = offer.status !== "DRAFT";
  await db.offerLetter.update({ where: { id: offer.id }, data: { status: "SENT", sentAt: new Date(), expiresAt: offer.expiresAt && offer.expiresAt < new Date() ? new Date(Date.now() + 7 * 86_400_000) : offer.expiresAt } });
  await db.notification.create({ data: { companyId: C, type: "INFO", title: `Offer ${resend ? "re-sent" : "sent"} to ${offer.candidateName}`, body: `${offer.title} — ${offer.equityQuantity.toLocaleString()} ${offer.equityType.replace("OPTION_", "")}s. Candidate link: /offer/${offer.token}`, link: `/app/${C}/offers/${offer.id}`, status: "DONE" } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "OfferLetter", entityId: offer.id, summary: `${resend ? "Re-sent" : "Sent"} offer letter to ${offer.candidateName} <${offer.candidateEmail}>` });
  revalidatePath(`/app/${C}/offers`);
  return ok(undefined, `Offer ${resend ? "re-sent" : "sent"} to ${offer.candidateEmail}`);
}

export async function revokeOffer(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, offer } = await loadOffer(data.companyId, data.id);
  if (!offer) return fail("Offer not found.");
  if (offer.status === "ACCEPTED") return fail("Accepted offers can't be revoked here — cancel the resulting grant instead.");
  const C = ctx.company.id;
  await db.offerLetter.update({ where: { id: offer.id }, data: { status: "EXPIRED", expiresAt: new Date() } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CANCEL", entityType: "OfferLetter", entityId: offer.id, summary: `Revoked offer to ${offer.candidateName}` });
  revalidatePath(`/app/${C}/offers`);
  return ok(undefined, "Offer revoked");
}

export async function deleteOffer(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, offer } = await loadOffer(data.companyId, data.id);
  if (!offer) return fail("Offer not found.");
  if (offer.status !== "DRAFT") return fail("Only drafts can be deleted.");
  await db.offerLetter.delete({ where: { id: offer.id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "OfferLetter", entityId: offer.id, summary: `Deleted draft offer for ${offer.candidateName}` });
  revalidatePath(`/app/${ctx.company.id}/offers`);
  return ok(undefined, "Draft deleted");
}

/** Turns an accepted offer into a stakeholder record and hands off to the issuance wizard. */
export async function createStakeholderFromOffer(_prev: ActionResult<{ url: string }> | undefined, formData: FormData): Promise<ActionResult<{ url: string }>> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, offer } = await loadOffer(data.companyId, data.id);
  if (!offer) return fail("Offer not found.");
  if (offer.status !== "ACCEPTED") return fail("The candidate has not accepted this offer yet.");
  const C = ctx.company.id;
  const packages = (() => {
    try {
      return JSON.parse(offer.packages) as { label: string; salary: number; equityQuantity: number }[];
    } catch {
      return [];
    }
  })();
  const chosen = offer.selectedPackage != null ? packages[offer.selectedPackage] : undefined;
  const quantity = chosen?.equityQuantity ?? offer.equityQuantity;
  let stakeholderId = offer.stakeholderId;
  if (!stakeholderId) {
    const existing = await db.stakeholder.findFirst({ where: { companyId: C, email: offer.candidateEmail } });
    const sh =
      existing ??
      (await db.stakeholder.create({
        data: { companyId: C, name: offer.candidateName, email: offer.candidateEmail, relationship: "EMPLOYEE", title: offer.title, department: offer.department, employmentStatus: "ACTIVE", startDate: offer.startDate, tags: JSON.stringify([offer.level].filter(Boolean)) },
      }));
    stakeholderId = sh.id;
    await db.offerLetter.update({ where: { id: offer.id }, data: { stakeholderId } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Stakeholder", entityId: stakeholderId, summary: `${existing ? "Linked" : "Created"} stakeholder ${offer.candidateName} from accepted offer` });
  }
  const params = new URLSearchParams({ stakeholderId, type: offer.equityType, quantity: String(quantity) });
  if (offer.vestingScheduleId) params.set("vestingScheduleId", offer.vestingScheduleId);
  if (offer.strikePrice != null) params.set("exercisePrice", String(offer.strikePrice));
  if (offer.startDate) params.set("vestingStartDate", offer.startDate.toISOString().slice(0, 10));
  revalidatePath(`/app/${C}/offers`);
  return ok({ url: `/app/${C}/securities/new?${params.toString()}` }, "Stakeholder ready — continue to issue the grant");
}
