"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, parseForm, zBool, zInt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

export async function acceptOffer(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ token: zStr, selectedPackage: zInt.min(0), signature: zStr, agree: zBool }), formData);
  if (error) return error;
  if (!data.agree) return fail("Please confirm you have read the offer.");
  const offer = await db.offerLetter.findUnique({ where: { token: data.token } });
  if (!offer) return fail("This offer link is no longer valid.");
  if (!["SENT", "VIEWED"].includes(offer.status)) return fail("This offer can no longer be accepted.");
  if (offer.expiresAt && offer.expiresAt < new Date()) return fail("This offer has expired. Please contact the company.");
  if (data.signature.trim().toLowerCase() !== offer.candidateName.trim().toLowerCase()) return fail("Type your full name exactly as it appears on the offer to sign.", { signature: "Must match the name on the offer" });
  const packages = (() => {
    try {
      return JSON.parse(offer.packages) as { label: string; equityQuantity: number; salary: number }[];
    } catch {
      return [];
    }
  })();
  if (packages.length && data.selectedPackage >= packages.length) return fail("Choose a package.");
  const chosen = packages[data.selectedPackage];
  await db.offerLetter.update({ where: { id: offer.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), selectedPackage: packages.length ? data.selectedPackage : null, equityQuantity: chosen?.equityQuantity ?? offer.equityQuantity, salary: chosen?.salary ?? offer.salary } });
  await db.notification.create({ data: { companyId: offer.companyId, type: "TASK", title: `${offer.candidateName} accepted their offer`, body: `${offer.title} — ${(chosen?.equityQuantity ?? offer.equityQuantity).toLocaleString()} ${offer.equityType.replace("OPTION_", "")}s${chosen ? ` (${chosen.label} package)` : ""}. Create the stakeholder and issue the grant.`, link: `/app/${offer.companyId}/offers/${offer.id}` } });
  await db.auditLog.create({ data: { companyId: offer.companyId, action: "SIGN", entityType: "OfferLetter", entityId: offer.id, summary: `${offer.candidateName} accepted offer${chosen ? ` (${chosen.label})` : ""}` } });
  revalidatePath(`/app/${offer.companyId}/offers`);
  return ok(undefined, "Offer accepted — welcome aboard!");
}

export async function declineOffer(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ token: zStr, reason: zStrOpt }), formData);
  if (error) return error;
  const offer = await db.offerLetter.findUnique({ where: { token: data.token } });
  if (!offer) return fail("This offer link is no longer valid.");
  if (!["SENT", "VIEWED"].includes(offer.status)) return fail("This offer can no longer be answered.");
  await db.offerLetter.update({ where: { id: offer.id }, data: { status: "DECLINED", acceptedAt: new Date(), message: data.reason ? `${offer.message ?? ""}\n\nCandidate note: ${data.reason}`.trim() : offer.message } });
  await db.notification.create({ data: { companyId: offer.companyId, type: "INFO", title: `${offer.candidateName} declined their offer`, body: data.reason ?? null, link: `/app/${offer.companyId}/offers/${offer.id}` } });
  await db.auditLog.create({ data: { companyId: offer.companyId, action: "UPDATE", entityType: "OfferLetter", entityId: offer.id, summary: `${offer.candidateName} declined offer` } });
  revalidatePath(`/app/${offer.companyId}/offers`);
  return ok(undefined, "Thanks for letting us know.");
}
