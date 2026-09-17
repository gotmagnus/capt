import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auth";

/**
 * Signs a document on behalf of the current user. Signature rows are matched by the user's
 * email (case-insensitive) or by linked stakeholder ids. When every signer has signed, the
 * document becomes SIGNED and a linked PENDING_SIGNATURE security becomes OUTSTANDING.
 */
export async function signDocumentForUser(input: { companyId: string; documentId: string; userId: string; userEmail: string; userName: string; stakeholderIds: string[] }) {
  const doc = await db.document.findFirst({ where: { id: input.documentId, companyId: input.companyId }, include: { signatures: true, security: true } });
  if (!doc) return { ok: false as const, error: "Document not found." };
  const email = input.userEmail.toLowerCase();
  const mine = doc.signatures.filter((s) => s.status === "PENDING" && (s.email.toLowerCase() === email || (s.stakeholderId && input.stakeholderIds.includes(s.stakeholderId))));
  if (mine.length === 0) return { ok: false as const, error: "There is no pending signature for you on this document." };
  const now = new Date();
  await db.signature.updateMany({ where: { id: { in: mine.map((s) => s.id) } }, data: { status: "SIGNED", signedAt: now } });
  const remaining = doc.signatures.filter((s) => s.status === "PENDING" && !mine.some((m) => m.id === s.id)).length;
  const declined = doc.signatures.some((s) => s.status === "DECLINED");
  const signatureStatus = remaining === 0 && !declined ? "SIGNED" : "PARTIALLY_SIGNED";
  await db.document.update({ where: { id: doc.id }, data: { signatureStatus } });
  let activated = false;
  if (signatureStatus === "SIGNED" && doc.security && doc.security.status === "PENDING_SIGNATURE") {
    await db.security.update({ where: { id: doc.security.id }, data: { status: "OUTSTANDING" } });
    activated = true;
  }
  await logAudit({ companyId: input.companyId, userId: input.userId, action: "SIGN", entityType: "Document", entityId: doc.id, summary: `${input.userName} signed “${doc.name}”${activated ? ` — ${doc.security?.certificateNumber} is now outstanding` : remaining ? ` (${remaining} signature${remaining === 1 ? "" : "s"} remaining)` : ""}` });
  return { ok: true as const, signatureStatus, activated, remaining };
}
