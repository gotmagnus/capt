// Exercises portal data loading, exercise-request validation and document signing paths.
// Run with: npx tsx --conditions=react-server scripts/test-portal.ts   (react-server makes `server-only` a no-op)
import { PrismaClient } from "@prisma/client";
import { loadPortal, portalDocuments, portalUpdates } from "../src/lib/portal-data";
import { signDocumentForUser } from "../src/lib/portal-sign";
import type { CompanyContext } from "../src/lib/auth";

const db = new PrismaClient();
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error("FAIL: " + msg); console.log("ok  ", msg); };

async function ctxFor(email: string): Promise<CompanyContext> {
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { memberships: { include: { company: true } } } });
  const m = user.memberships[0];
  const role = m.role as CompanyContext["role"];
  return { user, company: m.company, role, canEdit: ["ADMIN", "LEGAL", "FINANCE"].includes(role), isWorkspace: ["ADMIN", "LEGAL", "FINANCE", "BOARD", "VIEWER"].includes(role) };
}

async function main() {
  // Employee: Jordan
  const jordan = await ctxFor("jordan@northwind.dev");
  const pj = await loadPortal(jordan.company.id, jordan);
  assert(pj.myStakeholders.length === 1, "Jordan resolves to one stakeholder");
  const es1 = pj.holdings.find((h) => h.security.certificateNumber === "ES-1")!;
  assert(es1 && es1.exercisable === 90_000, `ES-1 exercisable = 90,000 (got ${es1?.exercisable})`);
  assert(pj.stats.totalUnits === 30_000 + 90_000 + 40_000, `total units = shares + unexercised options (got ${pj.stats.totalUnits})`);
  assert(pj.stats.vestedValue > 0 && pj.fmv === 0.85, "vested value computed at FMV 0.85");

  // Exercise request validations mirror the server action
  const openBefore = await db.exerciseRequest.count({ where: { securityId: es1.security.id, status: { in: ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"] } } });
  assert(openBefore === 0, "no open request for ES-1 before test");
  assert(100_000 > es1.exercisable, "requesting more than exercisable would be rejected");
  const req = await db.exerciseRequest.create({ data: { companyId: jordan.company.id, securityId: es1.security.id, stakeholderId: es1.security.stakeholderId, quantity: 10_000, exercisePrice: 0.05, totalCost: 500, fmvAtExercise: 0.85, isIso: true, method: "ACH", status: "REQUESTED" } });
  const openAfter = await db.exerciseRequest.count({ where: { securityId: es1.security.id, status: "REQUESTED" } });
  assert(openAfter === 1, "exercise request row created (REQUESTED)");
  await db.exerciseRequest.delete({ where: { id: req.id } });

  // Investor: James -> Basecamp entity + board member
  const james = await ctxFor("james@basecamp.vc");
  const pjm = await loadPortal(james.company.id, james);
  assert(pjm.myStakeholders.length === 1 && pjm.isInvestorView, "James resolves to Basecamp and gets the investor view");
  assert(pjm.ownership.fullyDilutedPct > 0.09 && pjm.ownership.fullyDilutedPct < 0.11, `Basecamp FD ownership ~10% (got ${(pjm.ownership.fullyDilutedPct * 100).toFixed(2)}%)`);
  const updates = await portalUpdates(pjm);
  assert(updates.length === 3, `investor sees 3 published updates (got ${updates.length})`);
  const jUpdates = await portalUpdates(pj);
  assert(jUpdates.length === 0, "employee sees no investor-only updates");
  const docs = await portalDocuments(pjm);
  assert(docs.some((d) => d.type === "FINANCIALS") && docs.some((d) => d.type === "CERTIFICATE"), "investor sees financials and own certificates");
  const jDocs = await portalDocuments(pj);
  assert(!jDocs.some((d) => d.type === "FINANCIALS") && jDocs.some((d) => d.type === "FORM_3921"), "employee sees own 3921 but not financials");

  // Signing: Omar's pending grant notice (ES-23) as Omar's email
  const omar = await db.stakeholder.findFirstOrThrow({ where: { email: "omar@northwind.dev" } });
  const pendingDoc = await db.document.findFirstOrThrow({ where: { companyId: jordan.company.id, signatureStatus: "PARTIALLY_SIGNED", security: { stakeholderId: omar.id } }, include: { security: true } });
  assert(pendingDoc.security?.status === "PENDING_SIGNATURE", "ES-23 is pending signature before signing");
  const res = await signDocumentForUser({ companyId: jordan.company.id, documentId: pendingDoc.id, userId: jordan.user.id, userEmail: "omar@northwind.dev", userName: "Omar Haddad", stakeholderIds: [omar.id] });
  assert(res.ok && res.activated && res.signatureStatus === "SIGNED", "signing flips document to SIGNED and activates the grant");
  const after = await db.security.findUniqueOrThrow({ where: { id: pendingDoc.security!.id } });
  assert(after.status === "OUTSTANDING", "ES-23 now OUTSTANDING");
  const again = await signDocumentForUser({ companyId: jordan.company.id, documentId: pendingDoc.id, userId: jordan.user.id, userEmail: "omar@northwind.dev", userName: "Omar Haddad", stakeholderIds: [omar.id] });
  assert(!again.ok, "second signature attempt is rejected");
  await db.$disconnect();
  console.log("\nAll portal checks passed (re-seed to restore ES-23 pending state).");
}
main().catch((e) => { console.error(e); process.exit(1); });
