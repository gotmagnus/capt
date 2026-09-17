// Dev helper for the board-consent signing flow. Creates a throwaway consent in the
// second seeded company (Acme Labs), prints signer tokens, and with `verify` checks the
// approval effects and removes the test rows.
// Usage: npx tsx scripts/e2e-consent-flow.ts setup | verify
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const TITLE = "__e2e__ Option grant approval";

async function setup() {
  const company = await db.company.findUniqueOrThrow({ where: { slug: "acme-labs" } });
  const holder = await db.stakeholder.findFirstOrThrow({ where: { companyId: company.id, relationship: "FOUNDER" } });
  const plan = await db.equityPlan.findFirstOrThrow({ where: { companyId: company.id } });
  const common = await db.shareClass.findFirstOrThrow({ where: { companyId: company.id, type: "COMMON" } });
  const security = await db.security.create({
    data: { companyId: company.id, stakeholderId: holder.id, type: "OPTION_ISO", certificateNumber: "ES-E2E-1", shareClassId: common.id, equityPlanId: plan.id, quantity: 1000, exercisePrice: 0.1, issueDate: new Date(), status: "DRAFT" },
  });
  const consent = await db.boardConsent.create({
    data: {
      companyId: company.id,
      title: TITLE,
      type: "OPTION_GRANT",
      body: "**RESOLVED**, that the grant on Exhibit A is approved.",
      status: "SENT",
      sentAt: new Date(),
      effectiveDate: new Date(),
      requiredApprovals: 0,
      signers: { create: [{ name: "E2E Director One", email: "one@e2e.test" }, { name: "E2E Director Two", email: "two@e2e.test" }] },
      exhibits: { create: [{ label: "Exhibit A", description: "E2E grant", securityId: security.id }] },
    },
    include: { signers: true },
  });
  console.log(JSON.stringify({ consentId: consent.id, securityId: security.id, tokens: consent.signers.map((s) => ({ name: s.name, token: s.token })) }));
}

async function verify() {
  const consent = await db.boardConsent.findFirstOrThrow({ where: { title: TITLE }, include: { signers: true, exhibits: true } });
  const security = await db.security.findUniqueOrThrow({ where: { id: consent.exhibits[0].securityId! } });
  const doc = consent.documentId ? await db.document.findUnique({ where: { id: consent.documentId } }) : null;
  const result = {
    consentStatus: consent.status,
    approvedAt: !!consent.approvedAt,
    signers: consent.signers.map((s) => `${s.name}:${s.status}`),
    securityStatus: security.status,
    boardApprovalDate: !!security.boardApprovalDate,
    documentSignatureStatus: doc?.signatureStatus ?? null,
    documentHasSignedLine: doc?.content?.includes("Signed") ?? false,
  };
  console.log(JSON.stringify(result));
  const pass = result.consentStatus === "APPROVED" && result.securityStatus === "OUTSTANDING" && result.boardApprovalDate && result.documentSignatureStatus === "SIGNED" && result.signers.every((s) => s.endsWith(":SIGNED"));
  // cleanup
  if (consent.documentId) await db.document.deleteMany({ where: { id: consent.documentId } });
  await db.notification.deleteMany({ where: { companyId: consent.companyId, title: { contains: "ES-E2E-1" } } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [consent.id, security.id] } } });
  await db.boardConsent.delete({ where: { id: consent.id } });
  await db.security.delete({ where: { id: security.id } });
  console.log(pass ? "PASS" : "FAIL");
  process.exitCode = pass ? 0 : 1;
}

(process.argv[2] === "verify" ? verify() : setup()).finally(() => db.$disconnect());
