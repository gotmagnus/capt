"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor, requireWorkspace } from "@/lib/auth";
import { fail, ok, parseForm, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { DOCUMENT_TYPES } from "@/lib/types";
import { declineDocumentSignature, refreshDocumentSignatureStatus, signDocumentSignature } from "@/lib/governance-consents";

const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json", "text/html"];
const MAX_TEXT_BYTES = 800_000;

async function editor(companyId: string) {
  try {
    return await requireEditor(companyId);
  } catch {
    return null;
  }
}

function revalidate(companyId: string, id?: string) {
  revalidatePath(`/app/${companyId}/documents`);
  if (id) revalidatePath(`/app/${companyId}/documents/${id}`);
  revalidatePath(`/app/${companyId}/dashboard`);
}

function cleanFolder(f: string | undefined) {
  const v = (f ?? "").trim().replace(/^\/+|\/+$/g, "").replace(/\s*\/\s*/g, "/");
  return v || "General";
}

async function readUpload(file: File | null) {
  if (!file || file.size === 0) return null;
  const mimeType = file.type || (file.name.endsWith(".md") ? "text/markdown" : "application/octet-stream");
  const isText = TEXT_TYPES.includes(mimeType) || /\.(md|txt|csv|json)$/i.test(file.name);
  if (isText && file.size <= MAX_TEXT_BYTES) {
    const content = Buffer.from(await file.arrayBuffer()).toString("utf8");
    return { name: file.name, mimeType: mimeType === "application/octet-stream" ? "text/plain" : mimeType, sizeBytes: file.size, content, storagePath: null as string | null };
  }
  return {
    name: file.name,
    mimeType,
    sizeBytes: file.size,
    content: `> **${file.name}** (${(file.size / 1024).toFixed(1)} KB, ${mimeType}) was uploaded. Binary files are stored in the company's document store; this preview shows metadata only.`,
    storagePath: `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
  };
}

export async function uploadDocument(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("You don't have permission to upload documents.");
  const { data, error } = parseForm(
    z.object({ name: zStrOpt, folder: zStrOpt, newFolder: zStrOpt, type: z.enum(DOCUMENT_TYPES).default("OTHER"), visibility: z.enum(["COMPANY", "HOLDER", "INVESTORS", "BOARD", "PUBLIC"]).default("COMPANY"), securityId: zStrOpt, stakeholderId: zStrOpt, content: zStrOpt }),
    formData,
  );
  if (error) return error;
  const file = formData.get("file");
  const upload = await readUpload(file instanceof File ? file : null);
  if (!upload && !data.content) return fail("Choose a file or paste content.");
  const name = data.name ?? upload?.name ?? "Untitled document";
  const folder = cleanFolder(data.newFolder || data.folder);
  const security = data.securityId ? await db.security.findFirst({ where: { id: data.securityId, companyId: ctx.company.id } }) : null;
  const doc = await db.document.create({
    data: {
      companyId: ctx.company.id,
      name,
      folder,
      type: data.type,
      mimeType: upload?.mimeType ?? "text/markdown",
      sizeBytes: upload?.sizeBytes ?? Buffer.byteLength(data.content ?? ""),
      content: upload?.content ?? data.content ?? null,
      storagePath: upload?.storagePath ?? null,
      securityId: security?.id ?? null,
      stakeholderId: data.stakeholderId ?? security?.stakeholderId ?? null,
      uploadedById: ctx.user.id,
      visibility: data.visibility,
    },
  });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "Document", entityId: doc.id, summary: `Uploaded “${name}” to ${folder}`, after: { folder, type: data.type, visibility: data.visibility } });
  revalidate(ctx.company.id, doc.id);
  return ok({ id: doc.id }, "Document uploaded");
}

export async function updateDocument(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ id: zStr, name: zStrOpt, folder: zStrOpt, type: z.enum(DOCUMENT_TYPES).optional(), visibility: z.enum(["COMPANY", "HOLDER", "INVESTORS", "BOARD", "PUBLIC"]).optional() }), formData);
  if (error) return error;
  const doc = await db.document.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!doc) return fail("Document not found.");
  const patch = { name: data.name ?? doc.name, folder: data.folder ? cleanFolder(data.folder) : doc.folder, type: data.type ?? doc.type, visibility: data.visibility ?? doc.visibility };
  await db.document.update({ where: { id: doc.id }, data: patch });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Document", entityId: doc.id, summary: `Updated document “${patch.name}”`, before: { name: doc.name, folder: doc.folder, type: doc.type, visibility: doc.visibility }, after: patch });
  revalidate(ctx.company.id, doc.id);
  return ok(undefined, "Document updated");
}

export async function replaceDocument(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const doc = await db.document.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!doc) return fail("Document not found.");
  const file = formData.get("file");
  const pasted = String(formData.get("content") ?? "");
  const upload = await readUpload(file instanceof File ? file : null);
  if (!upload && !pasted.trim()) return fail("Choose a file or paste new content.");
  const content = upload?.content ?? pasted;
  await db.document.update({
    where: { id },
    data: { content, mimeType: upload?.mimeType ?? doc.mimeType, sizeBytes: upload?.sizeBytes ?? Buffer.byteLength(content), storagePath: upload?.storagePath ?? doc.storagePath, version: doc.version + 1, signatureStatus: doc.signatureStatus === "NOT_REQUIRED" ? "NOT_REQUIRED" : "PENDING" },
  });
  if (doc.signatureStatus !== "NOT_REQUIRED") {
    await db.signature.updateMany({ where: { documentId: id }, data: { status: "PENDING", signedAt: null } });
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Document", entityId: id, summary: `Uploaded version ${doc.version + 1} of “${doc.name}”${note ? `: ${note}` : ""}`, before: { version: doc.version }, after: { version: doc.version + 1, note } });
  revalidate(ctx.company.id, id);
  return ok(undefined, `Version ${doc.version + 1} saved${doc.signatureStatus !== "NOT_REQUIRED" ? " — signatures reset" : ""}`);
}

export async function deleteDocument(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const doc = await db.document.findFirst({ where: { id, companyId: ctx.company.id }, include: { security: true } });
  if (!doc) return fail("Document not found.");
  if (doc.type === "CERTIFICATE" && doc.security && ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(doc.security.status)) return fail("Certificates for outstanding securities can't be deleted.");
  const linkedConsent = await db.boardConsent.findFirst({ where: { documentId: id } });
  if (linkedConsent && linkedConsent.status !== "DRAFT") return fail("This document is the executed record of a board consent and can't be deleted.");
  await db.document.delete({ where: { id } });
  if (linkedConsent) await db.boardConsent.update({ where: { id: linkedConsent.id }, data: { documentId: null } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "Document", entityId: id, summary: `Deleted document “${doc.name}”`, before: { name: doc.name, folder: doc.folder, type: doc.type } });
  revalidate(ctx.company.id);
  return ok(undefined, "Document deleted");
}

export async function requestSignatures(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const doc = await db.document.findFirst({ where: { id, companyId: ctx.company.id }, include: { signatures: true } });
  if (!doc) return fail("Document not found.");
  const raw = formData.getAll("signer").map(String).filter(Boolean);
  const manualName = String(formData.get("manualName") ?? "").trim();
  const manualEmail = String(formData.get("manualEmail") ?? "").trim();
  const manualRole = String(formData.get("manualRole") ?? "HOLDER");
  const signers: { stakeholderId?: string; name: string; email: string; role: string }[] = raw
    .map((s) => {
      try {
        return JSON.parse(s) as { stakeholderId?: string; name: string; email: string; role: string };
      } catch {
        return null;
      }
    })
    .filter((x): x is { stakeholderId?: string; name: string; email: string; role: string } => !!x);
  if (manualName && manualEmail) signers.push({ name: manualName, email: manualEmail, role: manualRole });
  if (!signers.length) return fail("Pick at least one signer.");
  let added = 0;
  for (const s of signers) {
    if (doc.signatures.some((x) => x.email.toLowerCase() === s.email.toLowerCase())) continue;
    const sig = await db.signature.create({ data: { documentId: doc.id, stakeholderId: s.stakeholderId ?? null, name: s.name, email: s.email, role: s.role || "HOLDER", sortOrder: doc.signatures.length + added } });
    await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: s.stakeholderId ?? null, type: "TASK", title: `Signature requested: ${doc.name}`, body: `${s.name}, please review and sign.`, link: `/sign/${sig.token}` } });
    added++;
  }
  await refreshDocumentSignatureStatus(doc.id);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Document", entityId: doc.id, summary: `Requested ${added} signature${added === 1 ? "" : "s"} on “${doc.name}”` });
  revalidate(ctx.company.id, doc.id);
  return ok(undefined, added ? `Signature request sent to ${added} signer${added === 1 ? "" : "s"}` : "Those signers were already added");
}

export async function remindSignature(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signatureId = String(formData.get("signatureId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig || sig.document.companyId !== ctx.company.id) return fail("Signature not found.");
  await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: sig.stakeholderId, type: "TASK", title: `Reminder: sign “${sig.document.name}”`, body: `${sig.name}, your signature is still needed.`, link: `/sign/${sig.token}` } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Document", entityId: sig.documentId, summary: `Reminder sent to ${sig.name} for “${sig.document.name}”` });
  revalidate(ctx.company.id, sig.documentId);
  return ok(undefined, `Reminder sent to ${sig.name}`);
}

export async function removeSignature(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signatureId = String(formData.get("signatureId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig || sig.document.companyId !== ctx.company.id) return fail("Signature not found.");
  if (sig.status === "SIGNED") return fail("Completed signatures can't be removed.");
  await db.signature.delete({ where: { id: signatureId } });
  await refreshDocumentSignatureStatus(sig.documentId);
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Document", entityId: sig.documentId, summary: `Removed signer ${sig.name} from “${sig.document.name}”` });
  revalidate(ctx.company.id, sig.documentId);
  return ok(undefined, "Signer removed");
}

export async function signDocumentAs(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signatureId = String(formData.get("signatureId") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();
  const agree = formData.get("agree") === "on";
  let ctx;
  try {
    ctx = await requireWorkspace(companyId);
  } catch {
    return fail("No permission.");
  }
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig || sig.document.companyId !== ctx.company.id) return fail("Signature not found.");
  const isSelf = sig.email.toLowerCase() === ctx.user.email.toLowerCase();
  if (!isSelf && ctx.role !== "ADMIN") return fail("Only the signer or an admin can record this signature.");
  if (!agree) return fail("You must agree to sign electronically.");
  if (!typedName) return fail("Type the signer's full name.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    await signDocumentSignature(signatureId, { ipAddress: ip, userId: ctx.user.id });
    revalidate(ctx.company.id, sig.documentId);
    revalidatePath(`/app/${ctx.company.id}/securities`);
    return ok(undefined, "Signature recorded");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not sign.");
  }
}

export async function declineDocumentAs(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const signatureId = String(formData.get("signatureId") ?? "");
  let ctx;
  try {
    ctx = await requireWorkspace(companyId);
  } catch {
    return fail("No permission.");
  }
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig || sig.document.companyId !== ctx.company.id) return fail("Signature not found.");
  const isSelf = sig.email.toLowerCase() === ctx.user.email.toLowerCase();
  if (!isSelf && ctx.role !== "ADMIN") return fail("Only the signer or an admin can record this.");
  await declineDocumentSignature(signatureId, ctx.user.id);
  revalidate(ctx.company.id, sig.documentId);
  return ok(undefined, "Decline recorded");
}
