import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auth";
import { boardConsentDocument } from "@/lib/documents/templates";

/** Shared board-consent + e-signature workflow used by the workspace pages and the public /sign route. */

export async function loadConsent(consentId: string) {
  return db.boardConsent.findUnique({
    where: { id: consentId },
    include: {
      company: true,
      signers: { orderBy: { name: "asc" } },
      exhibits: { include: { security: { include: { stakeholder: true } } } },
    },
  });
}

export function consentSignatureStatus(consent: { status: string; signers: { status: string }[] }) {
  const signed = consent.signers.filter((s) => s.status === "SIGNED").length;
  if (consent.status === "DRAFT") return "NOT_REQUIRED";
  if (signed === 0) return "PENDING";
  if (signed < consent.signers.length) return "PARTIALLY_SIGNED";
  return "SIGNED";
}

/** Re-renders the consent's markdown document to reflect current signers/status. */
export async function regenerateConsentDocument(consentId: string) {
  const consent = await loadConsent(consentId);
  if (!consent) return null;
  const content = boardConsentDocument({
    company: { legalName: consent.company.legalName, incorporationState: consent.company.incorporationState, address: consent.company.address },
    title: consent.title,
    body: consent.body,
    effectiveDate: consent.effectiveDate,
    signers: consent.signers.map((s) => ({ name: s.name, status: s.status, signedAt: s.signedAt })),
    exhibits: consent.exhibits.map((e) => ({ label: e.label, description: e.description })),
  });
  const data = {
    companyId: consent.companyId,
    name: `Board consent — ${consent.title}`,
    folder: "Board",
    type: "BOARD_CONSENT",
    mimeType: "text/markdown",
    sizeBytes: Buffer.byteLength(content),
    content,
    visibility: "BOARD",
    signatureStatus: consentSignatureStatus(consent),
  };
  if (consent.documentId) {
    const existing = await db.document.findUnique({ where: { id: consent.documentId } });
    if (existing) {
      await db.document.update({ where: { id: consent.documentId }, data });
      return consent.documentId;
    }
  }
  const created = await db.document.create({ data });
  await db.boardConsent.update({ where: { id: consentId }, data: { documentId: created.id } });
  return created.id;
}

export function approvalState(consent: { requiredApprovals: number; signers: { status: string }[] }) {
  const total = consent.signers.length;
  const signed = consent.signers.filter((s) => s.status === "SIGNED").length;
  const declined = consent.signers.filter((s) => s.status === "DECLINED").length;
  const required = consent.requiredApprovals > 0 ? Math.min(consent.requiredApprovals, total) : total;
  const approved = total > 0 && signed >= required;
  const impossible = total - declined < required;
  return { total, signed, declined, required, approved, impossible };
}

/**
 * Applies the effects of an approved consent: status, document refresh, exhibit securities
 * (board approval date + DRAFT → OUTSTANDING / PENDING_SIGNATURE), valuations (linked + accepted).
 */
export async function approveConsent(consentId: string, userId?: string | null) {
  const consent = await loadConsent(consentId);
  if (!consent || consent.status === "APPROVED") return consent;
  const now = new Date();
  const approvalDate = consent.effectiveDate ?? now;
  await db.boardConsent.update({ where: { id: consentId }, data: { status: "APPROVED", approvedAt: now } });

  for (const ex of consent.exhibits) {
    if (ex.securityId && ex.security) {
      const pendingDocs = await db.document.count({ where: { securityId: ex.securityId, signatureStatus: { in: ["PENDING", "PARTIALLY_SIGNED"] } } });
      const nextStatus = ex.security.status === "DRAFT" ? (pendingDocs > 0 ? "PENDING_SIGNATURE" : "OUTSTANDING") : ex.security.status;
      await db.security.update({ where: { id: ex.securityId }, data: { boardApprovalDate: approvalDate, status: nextStatus } });
      if (nextStatus !== ex.security.status) {
        await db.notification.create({
          data: {
            companyId: consent.companyId,
            stakeholderId: ex.security.stakeholderId,
            type: "INFO",
            title: `Grant ${ex.security.certificateNumber} approved by the board`,
            body: nextStatus === "PENDING_SIGNATURE" ? "Your grant agreement is ready to sign." : "Your grant is now outstanding.",
            link: `/app/${consent.companyId}/securities/${ex.securityId}`,
          },
        });
      }
    }
    if (ex.referenceType === "VALUATION" && ex.referenceId) {
      const val = await db.valuation.findUnique({ where: { id: ex.referenceId } });
      if (val) {
        await db.valuation.update({
          where: { id: val.id },
          data: {
            boardConsentId: consentId,
            acceptedAt: val.acceptedAt ?? now,
            status: val.status === "ACCEPTED" || val.status === "SUPERSEDED" ? val.status : "ACCEPTED",
          },
        });
        await db.valuation.updateMany({
          where: { companyId: consent.companyId, status: "ACCEPTED", id: { not: val.id }, valuationDate: { lt: val.valuationDate } },
          data: { status: "SUPERSEDED" },
        });
      }
    }
  }
  await regenerateConsentDocument(consentId);
  await logAudit({ companyId: consent.companyId, userId, action: "APPROVE", entityType: "BoardConsent", entityId: consentId, summary: `Board consent “${consent.title}” approved` });
  return loadConsent(consentId);
}

/** Marks a signer as signed, then approves the consent if the threshold is met. */
export async function signConsentSigner(signerId: string, opts: { ipAddress?: string | null; userId?: string | null; typedName?: string }) {
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: { include: { signers: true } } } });
  if (!signer) throw new Error("Signer not found");
  if (signer.consent.status !== "SENT") throw new Error("This consent is not open for signature.");
  if (signer.status === "SIGNED") return { alreadySigned: true, consentId: signer.consentId, approved: false };
  await db.consentSigner.update({ where: { id: signerId }, data: { status: "SIGNED", signedAt: new Date(), comment: opts.typedName ? `Signed as ${opts.typedName}${opts.ipAddress ? ` from ${opts.ipAddress}` : ""}` : signer.comment } });
  await logAudit({ companyId: signer.consent.companyId, userId: opts.userId, action: "SIGN", entityType: "BoardConsent", entityId: signer.consentId, summary: `${signer.name} signed “${signer.consent.title}”` });
  const refreshed = await db.boardConsent.findUniqueOrThrow({ where: { id: signer.consentId }, include: { signers: true } });
  const state = approvalState(refreshed);
  if (state.approved) {
    await approveConsent(signer.consentId, opts.userId);
    return { alreadySigned: false, consentId: signer.consentId, approved: true };
  }
  await regenerateConsentDocument(signer.consentId);
  return { alreadySigned: false, consentId: signer.consentId, approved: false };
}

export async function declineConsentSigner(signerId: string, comment: string | undefined, userId?: string | null) {
  const signer = await db.consentSigner.findUnique({ where: { id: signerId }, include: { consent: { include: { signers: true } } } });
  if (!signer) throw new Error("Signer not found");
  if (signer.consent.status !== "SENT") throw new Error("This consent is not open for signature.");
  await db.consentSigner.update({ where: { id: signerId }, data: { status: "DECLINED", comment: comment ?? null, signedAt: null } });
  await logAudit({ companyId: signer.consent.companyId, userId, action: "UPDATE", entityType: "BoardConsent", entityId: signer.consentId, summary: `${signer.name} declined “${signer.consent.title}”${comment ? `: ${comment}` : ""}` });
  const refreshed = await db.boardConsent.findUniqueOrThrow({ where: { id: signer.consentId }, include: { signers: true } });
  if (approvalState(refreshed).impossible) {
    await db.boardConsent.update({ where: { id: signer.consentId }, data: { status: "REJECTED" } });
  }
  await regenerateConsentDocument(signer.consentId);
  return { consentId: signer.consentId };
}

/** Recomputes a document's aggregate signature status and releases a pending security when fully signed. */
export async function refreshDocumentSignatureStatus(documentId: string) {
  const doc = await db.document.findUnique({ where: { id: documentId }, include: { signatures: true, security: true } });
  if (!doc) return null;
  const total = doc.signatures.length;
  const signed = doc.signatures.filter((s) => s.status === "SIGNED").length;
  const status = total === 0 ? "NOT_REQUIRED" : signed === 0 ? "PENDING" : signed < total ? "PARTIALLY_SIGNED" : "SIGNED";
  await db.document.update({ where: { id: documentId }, data: { signatureStatus: status } });
  if (status === "SIGNED" && doc.security && doc.security.status === "PENDING_SIGNATURE") {
    await db.security.update({ where: { id: doc.security.id }, data: { status: "OUTSTANDING" } });
    await db.notification.create({
      data: {
        companyId: doc.companyId,
        stakeholderId: doc.security.stakeholderId,
        type: "INFO",
        title: `${doc.security.certificateNumber} fully executed`,
        body: `${doc.name} has been signed by all parties; the security is now outstanding.`,
        link: `/app/${doc.companyId}/securities/${doc.security.id}`,
      },
    });
    await logAudit({ companyId: doc.companyId, action: "UPDATE", entityType: "Security", entityId: doc.security.id, summary: `${doc.security.certificateNumber} became outstanding after all signatures were collected` });
  }
  return status;
}

export async function signDocumentSignature(signatureId: string, opts: { ipAddress?: string | null; userId?: string | null }) {
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig) throw new Error("Signature request not found");
  if (sig.status === "SIGNED") return { alreadySigned: true, documentId: sig.documentId };
  await db.signature.update({ where: { id: signatureId }, data: { status: "SIGNED", signedAt: new Date(), ipAddress: opts.ipAddress ?? null } });
  await logAudit({ companyId: sig.document.companyId, userId: opts.userId, action: "SIGN", entityType: "Document", entityId: sig.documentId, summary: `${sig.name} signed “${sig.document.name}”` });
  await refreshDocumentSignatureStatus(sig.documentId);
  return { alreadySigned: false, documentId: sig.documentId };
}

export async function declineDocumentSignature(signatureId: string, userId?: string | null) {
  const sig = await db.signature.findUnique({ where: { id: signatureId }, include: { document: true } });
  if (!sig) throw new Error("Signature request not found");
  await db.signature.update({ where: { id: signatureId }, data: { status: "DECLINED", signedAt: null } });
  await logAudit({ companyId: sig.document.companyId, userId, action: "UPDATE", entityType: "Document", entityId: sig.documentId, summary: `${sig.name} declined to sign “${sig.document.name}”` });
  await refreshDocumentSignatureStatus(sig.documentId);
  return { documentId: sig.documentId };
}

/** Resolves a public signing token to either a consent signer or a document signature. */
export async function resolveSigningToken(token: string) {
  const signer = await db.consentSigner.findUnique({
    where: { token },
    include: { consent: { include: { company: true, signers: true, exhibits: true } } },
  });
  if (signer) {
    const document = signer.consent.documentId ? await db.document.findUnique({ where: { id: signer.consent.documentId } }) : null;
    return { kind: "CONSENT" as const, signer, consent: signer.consent, document, company: signer.consent.company };
  }
  const signature = await db.signature.findUnique({
    where: { token },
    include: { document: { include: { company: true, signatures: { orderBy: { sortOrder: "asc" } }, security: true } } },
  });
  if (signature) return { kind: "DOCUMENT" as const, signature, document: signature.document, company: signature.document.company };
  return null;
}
