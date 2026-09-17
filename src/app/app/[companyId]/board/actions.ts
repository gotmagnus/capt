"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor, requireWorkspace } from "@/lib/auth";
import { fail, ok, parseForm, zDateOpt, zInt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { approvalState, approveConsent, loadConsent, regenerateConsentDocument, signConsentSigner, declineConsentSigner } from "@/lib/governance-consents";

async function editor(companyId: string) {
  try {
    return await requireEditor(companyId);
  } catch {
    return null;
  }
}

function paths(companyId: string, id?: string) {
  revalidatePath(`/app/${companyId}/board`);
  if (id) revalidatePath(`/app/${companyId}/board/${id}`);
  revalidatePath(`/app/${companyId}/documents`);
  revalidatePath(`/app/${companyId}/dashboard`);
}

const createSchema = z.object({
  title: zStr,
  type: zStr,
  body: zStr,
  effectiveDate: zDateOpt,
  requiredApprovals: zInt.min(0).default(0),
  mode: z.enum(["draft", "send"]).default("draft"),
  exhibit: z.array(z.string()).optional(),
  exhibitText: z.array(z.string()).optional(),
  signer: z.array(z.string()).optional(),
  extraSignerName: z.array(z.string()).optional(),
  extraSignerEmail: z.array(z.string()).optional(),
});

type ExhibitPayload = { kind: "SECURITY" | "VALUATION" | "EQUITY_PLAN" | "ROUND" | "SHARE_CLASS"; id: string; description: string };
type SignerPayload = { stakeholderId?: string; name: string; email: string };

function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? (v as string[]) : [String(v)];
}

export async function createConsent(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("You don't have permission to create board consents.");
  const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>;
  // normalise repeated fields into arrays before zod
  for (const key of ["exhibit", "exhibitText", "signer", "extraSignerName", "extraSignerEmail"]) {
    raw[key] = formData.getAll(key).map(String).filter((x) => x.trim() !== "");
  }
  const parsed = createSchema.safeParse({ ...raw, requiredApprovals: raw.requiredApprovals || 0 });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  const exhibits: ExhibitPayload[] = asArray(d.exhibit)
    .map((s) => {
      try {
        return JSON.parse(s) as ExhibitPayload;
      } catch {
        return null;
      }
    })
    .filter((x): x is ExhibitPayload => !!x);
  const signers: SignerPayload[] = asArray(d.signer)
    .map((s) => {
      try {
        return JSON.parse(s) as SignerPayload;
      } catch {
        return null;
      }
    })
    .filter((x): x is SignerPayload => !!x);
  const extraNames = asArray(d.extraSignerName);
  const extraEmails = asArray(d.extraSignerEmail);
  extraNames.forEach((name, i) => {
    const email = extraEmails[i];
    if (name && email) signers.push({ name, email });
  });
  if (d.mode === "send" && signers.length === 0) return fail("Add at least one signer before sending.");

  const letter = (i: number) => String.fromCharCode(65 + (i % 26));
  const consent = await db.boardConsent.create({
    data: {
      companyId: ctx.company.id,
      title: d.title,
      type: d.type,
      body: d.body,
      status: d.mode === "send" ? "SENT" : "DRAFT",
      effectiveDate: d.effectiveDate ?? null,
      sentAt: d.mode === "send" ? new Date() : null,
      requiredApprovals: d.requiredApprovals,
      createdById: ctx.user.id,
      signers: { create: signers.map((s) => ({ stakeholderId: s.stakeholderId ?? null, name: s.name, email: s.email })) },
      exhibits: {
        create: [
          ...exhibits.map((e, i) => ({
            label: `Exhibit ${letter(i)}`,
            description: e.description,
            securityId: e.kind === "SECURITY" ? e.id : null,
            referenceId: e.kind !== "SECURITY" ? e.id : null,
            referenceType: e.kind !== "SECURITY" ? e.kind : null,
          })),
          ...asArray(d.exhibitText).map((t, i) => ({ label: `Exhibit ${letter(exhibits.length + i)}`, description: t })),
        ],
      },
    },
    include: { signers: true },
  });
  await regenerateConsentDocument(consent.id);
  if (d.mode === "send") {
    for (const s of consent.signers) {
      await db.notification.create({
        data: { companyId: ctx.company.id, stakeholderId: s.stakeholderId, type: "TASK", title: `Signature requested: ${consent.title}`, body: `${s.name}, please review and sign the board consent.`, link: `/sign/${s.token}` },
      });
    }
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "BoardConsent", entityId: consent.id, summary: d.mode === "send" ? `Sent board consent “${consent.title}” to ${consent.signers.length} signers` : `Drafted board consent “${consent.title}”`, after: { title: d.title, type: d.type, exhibits: exhibits.length } });
  paths(ctx.company.id, consent.id);
  return ok({ id: consent.id }, d.mode === "send" ? "Consent sent for signature" : "Draft saved");
}

export async function updateConsentDraft(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ id: zStr, title: zStr, body: zStr, effectiveDate: zDateOpt, requiredApprovals: zInt.min(0).default(0) }), formData);
  if (error) return error;
  const consent = await db.boardConsent.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!consent) return fail("Consent not found.");
  if (consent.status !== "DRAFT") return fail("Only drafts can be edited.");
  await db.boardConsent.update({ where: { id: consent.id }, data: { title: data.title, body: data.body, effectiveDate: data.effectiveDate ?? null, requiredApprovals: data.requiredApprovals } });
  await regenerateConsentDocument(consent.id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: consent.id, summary: `Edited draft consent “${data.title}”`, before: { title: consent.title }, after: { title: data.title } });
  paths(ctx.company.id, consent.id);
  return ok(undefined, "Draft updated");
}

export async function sendConsent(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const consent = await db.boardConsent.findFirst({ where: { id, companyId: ctx.company.id }, include: { signers: true } });
  if (!consent) return fail("Consent not found.");
  if (consent.status !== "DRAFT" && consent.status !== "WITHDRAWN") return fail("Only drafts can be sent.");
  if (consent.signers.length === 0) return fail("Add at least one signer first.");
  await db.boardConsent.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await db.consentSigner.updateMany({ where: { consentId: id, status: "DECLINED" }, data: { status: "PENDING", comment: null } });
  for (const s of consent.signers) {
    await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: s.stakeholderId, type: "TASK", title: `Signature requested: ${consent.title}`, body: `${s.name}, please review and sign the board consent.`, link: `/sign/${s.token}` } });
  }
  await regenerateConsentDocument(id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: id, summary: `Sent board consent “${consent.title}” to ${consent.signers.length} signers` });
  paths(ctx.company.id, id);
  return ok(undefined, "Consent sent for signature");
}

export async function withdrawConsent(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const consent = await db.boardConsent.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!consent) return fail("Consent not found.");
  if (consent.status === "APPROVED") return fail("Approved consents cannot be withdrawn.");
  await db.boardConsent.update({ where: { id }, data: { status: "WITHDRAWN" } });
  await regenerateConsentDocument(id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: id, summary: `Withdrew board consent “${consent.title}”` });
  paths(ctx.company.id, id);
  return ok(undefined, "Consent withdrawn");
}

export async function reopenConsent(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const consent = await db.boardConsent.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!consent || !["WITHDRAWN", "REJECTED", "EXPIRED"].includes(consent.status)) return fail("This consent cannot be reopened.");
  await db.boardConsent.update({ where: { id }, data: { status: "DRAFT", sentAt: null } });
  await db.consentSigner.updateMany({ where: { consentId: id }, data: { status: "PENDING", signedAt: null, comment: null } });
  await regenerateConsentDocument(id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: id, summary: `Reopened board consent “${consent.title}” as a draft` });
  paths(ctx.company.id, id);
  return ok(undefined, "Consent reopened as draft");
}

export async function approveConsentNow(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const consent = await db.boardConsent.findFirst({ where: { id, companyId: ctx.company.id }, include: { signers: true } });
  if (!consent) return fail("Consent not found.");
  if (consent.status !== "SENT") return fail("Only consents out for signature can be approved.");
  const state = approvalState(consent);
  if (!state.approved) return fail(`${state.signed} of ${state.required} required signatures collected.`);
  await approveConsent(id, ctx.user.id);
  paths(ctx.company.id, id);
  return ok(undefined, "Consent approved and effects applied");
}

export async function signConsentAs(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signerId = String(formData.get("signerId") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();
  const agree = formData.get("agree") === "on";
  let ctx;
  try {
    ctx = await requireWorkspace(companyId);
  } catch {
    return fail("No permission.");
  }
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: true } });
  if (!signer || signer.consent.companyId !== ctx.company.id) return fail("Signer not found.");
  const isSelf = signer.email.toLowerCase() === ctx.user.email.toLowerCase();
  if (!isSelf && ctx.role !== "ADMIN") return fail("Only the signer or an admin can record this signature.");
  if (!agree) return fail("You must agree to sign electronically.");
  if (!typedName) return fail("Type the signer's full name to sign.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const r = await signConsentSigner(signerId, { ipAddress: ip, userId: ctx.user.id, typedName: isSelf ? typedName : `${typedName} (recorded by ${ctx.user.name})` });
    paths(ctx.company.id, signer.consentId);
    return ok(undefined, r.approved ? "Signed — consent is now approved" : "Signature recorded");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not sign.");
  }
}

export async function declineConsentAs(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signerId = String(formData.get("signerId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || undefined;
  let ctx;
  try {
    ctx = await requireWorkspace(companyId);
  } catch {
    return fail("No permission.");
  }
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: true } });
  if (!signer || signer.consent.companyId !== ctx.company.id) return fail("Signer not found.");
  const isSelf = signer.email.toLowerCase() === ctx.user.email.toLowerCase();
  if (!isSelf && ctx.role !== "ADMIN") return fail("Only the signer or an admin can record this.");
  try {
    await declineConsentSigner(signerId, comment, ctx.user.id);
    paths(ctx.company.id, signer.consentId);
    return ok(undefined, "Decline recorded");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not record decline.");
  }
}

export async function remindSigner(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signerId = String(formData.get("signerId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: true } });
  if (!signer || signer.consent.companyId !== ctx.company.id) return fail("Signer not found.");
  await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: signer.stakeholderId, type: "TASK", title: `Reminder: sign “${signer.consent.title}”`, body: `${signer.name}, your signature is still needed.`, link: `/sign/${signer.token}` } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: signer.consentId, summary: `Reminder sent to ${signer.name} for “${signer.consent.title}”` });
  paths(ctx.company.id, signer.consentId);
  return ok(undefined, `Reminder sent to ${signer.name}`);
}

export async function addConsentSigner(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ id: zStr, name: zStr, email: z.string().email(), stakeholderId: zStrOpt }), formData);
  if (error) return error;
  const consent = await db.boardConsent.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!consent || consent.status === "APPROVED") return fail("Signers can't be added to this consent.");
  const signer = await db.consentSigner.create({ data: { consentId: consent.id, name: data.name, email: data.email, stakeholderId: data.stakeholderId ?? null } });
  if (consent.status === "SENT") {
    await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: signer.stakeholderId, type: "TASK", title: `Signature requested: ${consent.title}`, link: `/sign/${signer.token}` } });
  }
  await regenerateConsentDocument(consent.id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: consent.id, summary: `Added signer ${data.name} to “${consent.title}”` });
  paths(ctx.company.id, consent.id);
  return ok(undefined, "Signer added");
}

export async function removeConsentSigner(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signerId = String(formData.get("signerId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: true } });
  if (!signer || signer.consent.companyId !== ctx.company.id) return fail("Signer not found.");
  if (signer.status === "SIGNED") return fail("Signed signers can't be removed.");
  await db.consentSigner.delete({ where: { id: signerId } });
  await regenerateConsentDocument(signer.consentId);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "BoardConsent", entityId: signer.consentId, summary: `Removed signer ${signer.name} from “${signer.consent.title}”` });
  paths(ctx.company.id, signer.consentId);
  return ok(undefined, "Signer removed");
}

export async function duplicateConsent(companyId: string, id: string) {
  const ctx = await editor(companyId);
  if (!ctx) throw new Error("No permission.");
  const consent = await loadConsent(id);
  if (!consent || consent.companyId !== ctx.company.id) throw new Error("Consent not found.");
  const copy = await db.boardConsent.create({
    data: {
      companyId: ctx.company.id,
      title: `${consent.title} (copy)`,
      type: consent.type,
      body: consent.body,
      status: "DRAFT",
      requiredApprovals: consent.requiredApprovals,
      createdById: ctx.user.id,
      signers: { create: consent.signers.map((s) => ({ stakeholderId: s.stakeholderId, name: s.name, email: s.email })) },
      exhibits: { create: consent.exhibits.map((e) => ({ label: e.label, description: e.description, securityId: e.securityId, referenceId: e.referenceId, referenceType: e.referenceType })) },
    },
  });
  await regenerateConsentDocument(copy.id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "BoardConsent", entityId: copy.id, summary: `Duplicated “${consent.title}”` });
  paths(ctx.company.id, copy.id);
  redirect(`/app/${ctx.company.id}/board/${copy.id}`);
}

export async function deleteConsent(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const consent = await db.boardConsent.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!consent) return fail("Consent not found.");
  if (consent.status !== "DRAFT") return fail("Only drafts can be deleted.");
  if (consent.documentId) await db.document.deleteMany({ where: { id: consent.documentId } });
  await db.boardConsent.delete({ where: { id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "BoardConsent", entityId: id, summary: `Deleted draft consent “${consent.title}”` });
  paths(ctx.company.id);
  return ok(undefined, "Draft deleted");
}
