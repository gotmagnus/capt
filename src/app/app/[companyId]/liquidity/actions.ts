"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { nextCertificateNumber } from "@/lib/equity/captable";
import { shareCertificate } from "@/lib/documents/templates";
import { tenderHolders } from "@/lib/people-tender";
import { fail, ok, parseForm, zDate, zNum, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const createSchema = z.object({
  companyId: zStr,
  name: zStr,
  buyerName: zStr,
  pricePerShare: zNum.positive(),
  maxShares: zNum.positive(),
  maxPercentPerHolder: zNum.min(1).max(100).default(20),
  startDate: zDate,
  endDate: zDate,
  eligibility: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()).min(1, "Choose who is eligible")),
  notes: zStrOpt,
});

export async function createTender(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(createSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  if (data.endDate <= data.startDate) return fail("The window must end after it starts.", { endDate: "Must be after start" });
  const t = await db.tenderOffer.create({ data: { companyId: C, name: data.name, buyerName: data.buyerName, pricePerShare: data.pricePerShare, maxShares: data.maxShares, maxPercentPerHolder: data.maxPercentPerHolder, startDate: data.startDate, endDate: data.endDate, eligibility: JSON.stringify(data.eligibility), notes: data.notes ?? null, status: "DRAFT" } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "TenderOffer", entityId: t.id, summary: `Drafted tender offer “${data.name}” — ${data.buyerName} at $${data.pricePerShare}/share, up to ${data.maxShares.toLocaleString()} shares` });
  revalidatePath(`/app/${C}/liquidity`);
  return ok({ id: t.id }, "Tender offer drafted");
}

const idSchema = z.object({ companyId: zStr, id: zStr });

async function loadTender(companyId: string, id: string) {
  const ctx = await requireEditor(companyId);
  const tender = await db.tenderOffer.findFirst({ where: { id, companyId: ctx.company.id }, include: { participants: { include: { stakeholder: true, security: true } } } });
  return { ctx, tender };
}

export async function recordElection(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema.extend({ stakeholderId: zStr, securityId: zStr, sharesOffered: zNum.positive() }), formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (!["DRAFT", "OPEN"].includes(tender.status)) return fail("Elections can only be recorded while the offer is open.");
  const C = ctx.company.id;
  const capTable = await loadCapTable(C);
  const holders = tenderHolders(capTable, JSON.parse(tender.eligibility) as string[], tender.maxPercentPerHolder);
  const holder = holders.find((h) => h.stakeholderId === data.stakeholderId);
  if (!holder) return fail("This stakeholder is not eligible for the offer.");
  const sec = holder.securities.find((s) => s.securityId === data.securityId);
  if (!sec) return fail("Security not found or not sellable.");
  const alreadyOffered = tender.participants.filter((p) => p.stakeholderId === data.stakeholderId && p.status !== "WITHDRAWN").reduce((a, p) => a + p.sharesOffered, 0);
  if (data.sharesOffered > sec.sellable) return fail(`Only ${sec.sellable.toLocaleString()} shares of ${sec.certificateNumber} are sellable.`, { sharesOffered: `Max ${sec.sellable.toLocaleString()}` });
  if (alreadyOffered + data.sharesOffered > holder.cap) return fail(`${holder.name} may offer at most ${holder.cap.toLocaleString()} shares (${tender.maxPercentPerHolder}% of holdings); ${alreadyOffered.toLocaleString()} already elected.`);
  await db.tenderParticipation.create({ data: { tenderOfferId: tender.id, stakeholderId: data.stakeholderId, securityId: data.securityId, sharesOffered: data.sharesOffered, status: "ELECTED" } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "TenderParticipation", entityId: tender.id, summary: `${holder.name} elected to sell ${data.sharesOffered.toLocaleString()} shares (${sec.certificateNumber}) in “${tender.name}”` });
  revalidatePath(`/app/${C}/liquidity/${tender.id}`);
  return ok(undefined, "Election recorded");
}

export async function withdrawElection(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema.extend({ participationId: zStr }), formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (!["DRAFT", "OPEN"].includes(tender.status)) return fail("Elections are locked once the offer closes.");
  const p = tender.participants.find((x) => x.id === data.participationId);
  if (!p) return fail("Election not found.");
  await db.tenderParticipation.update({ where: { id: p.id }, data: { status: "WITHDRAWN" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "TenderParticipation", entityId: p.id, summary: `${p.stakeholder.name} withdrew election of ${p.sharesOffered.toLocaleString()} shares from “${tender.name}”` });
  revalidatePath(`/app/${ctx.company.id}/liquidity/${tender.id}`);
  return ok(undefined, "Election withdrawn");
}

export async function openTender(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (tender.status !== "DRAFT") return fail("Only drafts can be opened.");
  const C = ctx.company.id;
  const capTable = await loadCapTable(C);
  const holders = tenderHolders(capTable, JSON.parse(tender.eligibility) as string[], tender.maxPercentPerHolder).filter((h) => h.sellable > 0);
  await db.tenderOffer.update({ where: { id: tender.id }, data: { status: "OPEN" } });
  if (holders.length) {
    await db.notification.createMany({ data: holders.map((h) => ({ companyId: C, stakeholderId: h.stakeholderId, userId: h.userId, type: "TASK", title: `Liquidity opportunity: ${tender.name}`, body: `${tender.buyerName} is offering $${tender.pricePerShare} per share. You may sell up to ${h.cap.toLocaleString()} shares before ${tender.endDate.toISOString().slice(0, 10)}.`, link: `/portal/${C}/holdings`, dueDate: tender.endDate })) });
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "TenderOffer", entityId: tender.id, summary: `Opened tender offer “${tender.name}” to ${holders.length} eligible holders` });
  revalidatePath(`/app/${C}/liquidity`);
  return ok(undefined, `Offer opened — ${holders.length} holders notified`);
}

export async function closeTender(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (tender.status !== "OPEN") return fail("Only open offers can be closed.");
  const C = ctx.company.id;
  const live = tender.participants.filter((p) => p.status === "ELECTED");
  const totalOffered = live.reduce((a, p) => a + p.sharesOffered, 0);
  const ratio = totalOffered > tender.maxShares ? tender.maxShares / totalOffered : 1;
  let accepted = 0;
  for (const p of live) {
    const sharesAccepted = Math.floor(p.sharesOffered * ratio);
    accepted += sharesAccepted;
    await db.tenderParticipation.update({ where: { id: p.id }, data: { sharesAccepted, status: ratio < 1 ? "PRORATED" : "ACCEPTED" } });
  }
  await db.tenderOffer.update({ where: { id: tender.id }, data: { status: "CLOSED" } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "TenderOffer", entityId: tender.id, summary: `Closed “${tender.name}”: ${totalOffered.toLocaleString()} offered, ${accepted.toLocaleString()} accepted${ratio < 1 ? ` (prorated ${(ratio * 100).toFixed(1)}%)` : ""}` });
  revalidatePath(`/app/${C}/liquidity`);
  return ok(undefined, ratio < 1 ? `Closed — elections prorated to ${(ratio * 100).toFixed(1)}%` : "Closed — all elections accepted");
}

export async function settleTender(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (tender.status !== "CLOSED") return fail("Close the offer before settling.");
  const C = ctx.company.id;
  const capTable = await loadCapTable(C);
  const commonClass = capTable.shareClasses.find((c) => c.type === "COMMON");
  if (!commonClass) return fail("No common share class found.");
  const existingCerts = capTable.securities.map((s) => s.certificateNumber);
  const now = new Date();
  const buyer =
    (await db.stakeholder.findFirst({ where: { companyId: C, name: tender.buyerName } })) ??
    (await db.stakeholder.create({ data: { companyId: C, name: tender.buyerName, type: "ENTITY", relationship: "INVESTOR", accredited: true, tags: JSON.stringify(["Secondary buyer"]) } }));
  const toSettle = tender.participants.filter((p) => ["ACCEPTED", "PRORATED"].includes(p.status) && (p.sharesAccepted ?? 0) > 0);
  let totalShares = 0;
  await db.$transaction(async (tx) => {
    for (const p of toSettle) {
      const qty = p.sharesAccepted ?? 0;
      const cert = nextCertificateNumber(commonClass.prefix, existingCerts);
      existingCerts.push(cert);
      const isOption = p.security.type.startsWith("OPTION") || p.security.type === "WARRANT";
      if (isOption) {
        // cashless exercise into the sale: exercise price is netted from proceeds
        await tx.security.update({ where: { id: p.securityId }, data: { exercisedQuantity: { increment: qty }, status: p.security.exercisedQuantity + qty >= p.security.quantity - p.security.cancelledQuantity ? "EXERCISED" : p.security.status } });
        await tx.transaction.create({ data: { companyId: C, type: "EXERCISE", securityId: p.securityId, toStakeholderId: p.stakeholderId, quantity: qty, pricePerShare: p.security.exercisePrice ?? 0, totalAmount: qty * (p.security.exercisePrice ?? 0), effectiveDate: now, notes: `Cashless exercise for sale in “${tender.name}”`, createdById: ctx.user.id } });
      } else {
        await tx.security.update({ where: { id: p.securityId }, data: { cancelledQuantity: { increment: qty }, notes: `${p.security.notes ? p.security.notes + "\n" : ""}${qty.toLocaleString()} shares transferred to ${tender.buyerName} on ${now.toISOString().slice(0, 10)} (${tender.name}).`, status: p.security.cancelledQuantity + qty >= p.security.quantity ? "TRANSFERRED" : p.security.status } });
      }
      const issued = await tx.security.create({ data: { companyId: C, stakeholderId: buyer.id, type: "COMMON_SHARES", certificateNumber: cert, shareClassId: commonClass.id, quantity: qty, pricePerShare: tender.pricePerShare, totalAmount: qty * tender.pricePerShare, issueDate: now, status: "OUTSTANDING", notes: `Acquired from ${p.stakeholder.name} (${p.security.certificateNumber}) in “${tender.name}”` } });
      await tx.transaction.create({ data: { companyId: C, type: "TRANSFER", securityId: issued.id, fromStakeholderId: p.stakeholderId, toStakeholderId: buyer.id, quantity: qty, pricePerShare: tender.pricePerShare, totalAmount: qty * tender.pricePerShare, effectiveDate: now, notes: `Secondary sale in “${tender.name}” — ${p.security.certificateNumber} → ${cert}`, createdById: ctx.user.id, metadata: JSON.stringify({ tenderOfferId: tender.id, participationId: p.id }) } });
      const content = shareCertificate({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }, certificateNumber: cert, holderName: buyer.name, shares: qty, className: commonClass.name, parValue: commonClass.parValue, issueDate: now, pricePerShare: tender.pricePerShare });
      await tx.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: issued.id, stakeholderId: buyer.id, visibility: "HOLDER", uploadedById: ctx.user.id } });
      await tx.tenderParticipation.update({ where: { id: p.id }, data: { status: "SETTLED" } });
      await tx.notification.create({ data: { companyId: C, stakeholderId: p.stakeholderId, userId: p.stakeholder.userId, type: "INFO", title: `Sale of ${qty.toLocaleString()} shares settled`, body: `Proceeds of $${(qty * tender.pricePerShare).toLocaleString()} from “${tender.name}” will be paid by ${tender.buyerName}.`, link: `/portal/${C}/holdings` } });
      totalShares += qty;
    }
    await tx.tenderOffer.update({ where: { id: tender.id }, data: { status: "SETTLED" } });
  });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "TRANSFER", entityType: "TenderOffer", entityId: tender.id, summary: `Settled “${tender.name}”: ${totalShares.toLocaleString()} shares transferred to ${tender.buyerName} for $${(totalShares * tender.pricePerShare).toLocaleString()}` });
  revalidatePath(`/app/${C}/liquidity`);
  revalidatePath(`/app/${C}/cap-table`);
  return ok(undefined, `Settled — ${totalShares.toLocaleString()} shares transferred to ${tender.buyerName}`);
}

export async function cancelTender(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const { ctx, tender } = await loadTender(data.companyId, data.id);
  if (!tender) return fail("Tender offer not found.");
  if (["SETTLED", "CANCELLED"].includes(tender.status)) return fail("This offer is already finished.");
  await db.tenderOffer.update({ where: { id: tender.id }, data: { status: "CANCELLED" } });
  await db.tenderParticipation.updateMany({ where: { tenderOfferId: tender.id, status: { in: ["ELECTED", "ACCEPTED", "PRORATED"] } }, data: { status: "WITHDRAWN" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CANCEL", entityType: "TenderOffer", entityId: tender.id, summary: `Cancelled tender offer “${tender.name}”` });
  revalidatePath(`/app/${ctx.company.id}/liquidity`);
  return ok(undefined, "Tender offer cancelled");
}

export async function connectLiquidityPartner(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  await db.integration.upsert({
    where: { companyId_provider: { companyId: C, provider: "NASDAQ_PRIVATE_MARKET" } },
    update: { status: "CONNECTED", connectedAt: new Date(), lastSyncAt: new Date() },
    create: { companyId: C, provider: "NASDAQ_PRIVATE_MARKET", category: "LIQUIDITY", status: "CONNECTED", connectedAt: new Date(), lastSyncAt: new Date(), config: JSON.stringify({ shareCapTable: true }) },
  });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Integration", summary: "Connected Nasdaq Private Market" });
  revalidatePath(`/app/${C}/liquidity`);
  return ok(undefined, "Connected to Nasdaq Private Market — cap table data can now be shared for a program");
}
