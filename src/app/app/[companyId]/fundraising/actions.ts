"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zBool, zDateOpt, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { loadCapTable, convertibles as loadConvertibles } from "@/lib/data/captable";
import { modelRound } from "@/lib/equity/round-model";
import { nextCertificateNumber } from "@/lib/equity/captable";
import { convertibleNote, safeAgreement, shareCertificate } from "@/lib/documents/templates";
import { parseJson } from "@/lib/utils";
import { extractTerms } from "@/lib/fundraising-term-sheet";

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

const roundSchema = z.object({
  companyId: zStr,
  roundId: zStrOpt,
  name: zStr,
  roundType: z.enum(["PRICED", "SAFE", "CONVERTIBLE_NOTE", "BRIDGE", "SECONDARY"]),
  targetAmount: zNumOpt,
  preMoneyValuation: zNumOpt,
  leadInvestor: zStrOpt,
  closeDate: zDateOpt,
  shareClassId: zStrOpt,
  notes: zStrOpt,
});

export async function saveRound(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(roundSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const ctx = await requireEditor(d.companyId);
  const C = ctx.company.id;
  const data = {
    name: d.name,
    roundType: d.roundType,
    targetAmount: d.targetAmount ?? null,
    preMoneyValuation: d.preMoneyValuation ?? null,
    leadInvestor: d.leadInvestor ?? null,
    closeDate: d.closeDate ?? null,
    shareClassId: d.shareClassId ?? null,
    notes: d.notes ?? null,
  };
  if (d.roundId) {
    const existing = await db.fundingRound.findFirst({ where: { id: d.roundId, companyId: C } });
    if (!existing) return fail("Round not found.");
    if (existing.status === "CLOSED") {
      // Only descriptive fields can change after close.
      await db.fundingRound.update({ where: { id: existing.id }, data: { name: d.name, leadInvestor: data.leadInvestor, notes: data.notes } });
    } else {
      await db.fundingRound.update({ where: { id: existing.id }, data });
    }
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "FundingRound", entityId: existing.id, summary: `Updated round ${d.name}`, before: existing, after: data });
    revalidatePath(`/app/${C}/fundraising`);
    return ok({ id: existing.id }, "Round updated");
  }
  const round = await db.fundingRound.create({ data: { companyId: C, status: "PLANNED", ...data } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "FundingRound", entityId: round.id, summary: `Created planned round ${d.name}`, after: data });
  revalidatePath(`/app/${C}/fundraising`);
  return ok({ id: round.id }, "Round created");
}

export async function deleteRound(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const ctx = await requireEditor(companyId);
  const round = await db.fundingRound.findFirst({ where: { id: roundId, companyId: ctx.company.id } });
  if (!round) return fail("Round not found.");
  if (round.status === "CLOSED") return fail("Closed rounds cannot be deleted; they are part of the ledger.");
  await db.fundingRound.delete({ where: { id: round.id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "FundingRound", entityId: round.id, summary: `Deleted planned round ${round.name}`, before: round });
  revalidatePath(`/app/${ctx.company.id}/fundraising`);
  return ok(undefined, "Round deleted");
}

// ---------------------------------------------------------------------------
// Close round
// ---------------------------------------------------------------------------

const closeRoundSchema = z.object({
  preMoneyValuation: z.number().positive(),
  closeDate: z.string().min(1),
  targetPoolPct: z.number().min(0).max(50).nullable(),
  poolTiming: z.enum(["PRE", "POST"]),
  convertSafes: z.boolean(),
  convertNotes: z.boolean(),
  applyMfn: z.boolean(),
  investors: z
    .array(z.object({ name: z.string().min(1), amount: z.number().positive(), stakeholderId: z.string().nullable().optional(), email: z.string().optional() }))
    .min(1),
  shareClassId: z.string().nullable().optional(),
  newShareClass: z
    .object({
      name: z.string().min(1),
      prefix: z.string().min(1),
      authorizedShares: z.number().positive(),
      liquidationMultiple: z.number().min(0),
      participating: z.boolean(),
      participationCap: z.number().nullable(),
      conversionRatio: z.number().positive(),
      dividendRate: z.number().nullable(),
      dividendType: z.enum(["NON_CUMULATIVE", "CUMULATIVE", "NONE"]),
      antiDilution: z.enum(["NONE", "BROAD_BASED", "NARROW_BASED", "FULL_RATCHET"]),
    })
    .nullable()
    .optional(),
});

export type CloseRoundInput = z.infer<typeof closeRoundSchema>;

const ENTITY_HINT = /\b(fund|l\.?p\.?|llc|ventures|capital|partners|holdings|inc\.?|ltd\.?|trust|group)\b/i;

export async function closeRound(companyId: string, roundId: string, raw: unknown): Promise<ActionResult<{ roundId: string; shareClassId: string }>> {
  const ctx = await requireEditor(companyId);
  const C = ctx.company.id;
  const parsed = closeRoundSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const input = parsed.data;
  const round = await db.fundingRound.findFirst({ where: { id: roundId, companyId: C } });
  if (!round) return fail("Round not found.");
  if (round.status === "CLOSED") return fail("This round is already closed.");

  const data = await loadCapTable(C);
  const convs = loadConvertibles(data);
  const closeDate = new Date(input.closeDate);
  const model = modelRound({
    capTable: data.summary,
    preMoneyValuation: input.preMoneyValuation,
    investors: input.investors.map((i) => ({ name: i.name, amount: i.amount, stakeholderId: i.stakeholderId ?? null })),
    targetPoolPct: input.targetPoolPct,
    poolTiming: input.poolTiming,
    convertibles: convs,
    convertSafes: input.convertSafes,
    convertNotes: input.convertNotes,
    applyMfn: input.applyMfn,
    asOf: closeDate,
  });
  if (model.pricePerShare <= 0) return fail("Could not derive a price per share. Check the pre-money valuation.");

  // Share class
  let shareClassId = input.shareClassId ?? round.shareClassId ?? null;
  const certs = data.securities.map((s) => s.certificateNumber);
  const existingClass = shareClassId ? data.shareClasses.find((c) => c.id === shareClassId) : null;
  if (!existingClass) {
    const nc = input.newShareClass;
    if (!nc) return fail("Choose an existing preferred class or define a new one.");
    // New class is senior to everything issued before it.
    await db.shareClass.updateMany({ where: { companyId: C, type: "PREFERRED" }, data: { seniority: { increment: 1 } } });
    const created = await db.shareClass.create({
      data: {
        companyId: C,
        name: nc.name,
        prefix: nc.prefix.toUpperCase(),
        type: "PREFERRED",
        authorizedShares: nc.authorizedShares,
        originalIssuePrice: model.pricePerShare,
        liquidationMultiple: nc.liquidationMultiple,
        participating: nc.participating,
        participationCap: nc.participationCap,
        seniority: 1,
        conversionRatio: nc.conversionRatio,
        dividendRate: nc.dividendRate,
        dividendType: nc.dividendType,
        antiDilution: nc.antiDilution,
        boardApprovalDate: closeDate,
      },
    });
    shareClassId = created.id;
    await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "ShareClass", entityId: created.id, summary: `Created ${created.name} at ${model.pricePerShare.toFixed(4)}/share`, after: created });
  } else if (existingClass.type !== "PREFERRED") {
    return fail("A priced round must issue a preferred share class.");
  }
  const cls = await db.shareClass.findUniqueOrThrow({ where: { id: shareClassId! } });
  const info = { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address };

  async function issuePreferred(stakeholderId: string, holderName: string, quantity: number, pps: number, amount: number, notes: string | null) {
    const cert = nextCertificateNumber(cls.prefix, certs);
    certs.push(cert);
    const security = await db.security.create({
      data: {
        companyId: C,
        stakeholderId,
        type: "PREFERRED_SHARES",
        certificateNumber: cert,
        shareClassId: cls.id,
        quantity,
        pricePerShare: pps,
        fmvAtGrant: pps,
        totalAmount: amount,
        issueDate: closeDate,
        grantDate: closeDate,
        boardApprovalDate: closeDate,
        status: "OUTSTANDING",
        notes,
      },
    });
    await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: security.id, toStakeholderId: stakeholderId, quantity, pricePerShare: pps, totalAmount: amount, effectiveDate: closeDate, notes: `Issued ${cert} (${round!.name})`, createdById: ctx.user.id } });
    const content = shareCertificate({ company: info, certificateNumber: cert, holderName, shares: quantity, className: cls.name, parValue: cls.parValue, issueDate: closeDate, pricePerShare: pps });
    await db.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: security.id, stakeholderId, visibility: "HOLDER", uploadedById: ctx.user.id } });
    return security;
  }

  // New money
  let issuedShares = 0;
  for (const inv of input.investors) {
    let stakeholderId = inv.stakeholderId ?? null;
    if (stakeholderId && !data.stakeholders.some((s) => s.id === stakeholderId)) stakeholderId = null;
    if (!stakeholderId) {
      const created = await db.stakeholder.create({ data: { companyId: C, name: inv.name, email: inv.email || null, type: ENTITY_HINT.test(inv.name) ? "ENTITY" : "INDIVIDUAL", relationship: "INVESTOR", accredited: true } });
      stakeholderId = created.id;
      await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Stakeholder", entityId: created.id, summary: `Added investor ${created.name}` });
    }
    const qty = Math.floor(inv.amount / model.pricePerShare);
    if (qty <= 0) continue;
    const holder = data.stakeholders.find((s) => s.id === stakeholderId)?.name ?? inv.name;
    await issuePreferred(stakeholderId, holder, qty, model.pricePerShare, qty * model.pricePerShare, null);
    issuedShares += qty;
  }

  // Conversions
  for (const conv of model.conversions) {
    const source = data.securities.find((s) => s.id === conv.id);
    if (!source || conv.shares <= 0) continue;
    const sec = await issuePreferred(source.stakeholderId, source.stakeholder.name, conv.shares, conv.conversionPrice, conv.amount, `Issued on conversion of ${source.certificateNumber} (${conv.method === "CAP" ? "valuation cap" : conv.method === "DISCOUNT" ? "discount" : "round price"})`);
    await db.transaction.create({ data: { companyId: C, type: "CONVERSION", securityId: source.id, toStakeholderId: source.stakeholderId, quantity: conv.shares, pricePerShare: conv.conversionPrice, totalAmount: conv.amount, effectiveDate: closeDate, notes: `${source.certificateNumber} converted into ${conv.shares.toLocaleString()} shares of ${cls.name} (${sec.certificateNumber})`, createdById: ctx.user.id } });
    await db.security.update({ where: { id: source.id }, data: { status: "CONVERTED", notes: `${source.notes ? source.notes + "\n" : ""}Converted into ${conv.shares.toLocaleString()} shares of ${cls.name} (${sec.certificateNumber}) on ${closeDate.toLocaleDateString("en-US")}.` } });
  }

  // Pool top-up
  if (model.poolIncrease > 0) {
    const plan = data.equityPlans.find((p) => p.status === "ACTIVE") ?? data.equityPlans[0];
    if (plan) {
      await db.equityPlan.update({ where: { id: plan.id }, data: { authorizedShares: { increment: model.poolIncrease }, notes: `${plan.notes ? plan.notes + "\n" : ""}Reserve increased by ${model.poolIncrease.toLocaleString()} shares in connection with ${round.name}.` } });
      await db.transaction.create({ data: { companyId: C, type: "MODIFICATION", quantity: model.poolIncrease, effectiveDate: closeDate, notes: `${plan.name} reserve increased by ${model.poolIncrease.toLocaleString()} shares (${round.name} pool top-up)`, createdById: ctx.user.id, metadata: JSON.stringify({ equityPlanId: plan.id, roundId: round.id }) } });
    }
  }

  await db.fundingRound.update({
    where: { id: round.id },
    data: {
      status: "CLOSED",
      roundType: "PRICED",
      shareClassId: cls.id,
      pricePerShare: model.pricePerShare,
      preMoneyValuation: model.preMoneyValuation,
      postMoneyValuation: model.postMoneyValuation,
      amountRaised: model.totalRaised,
      optionPoolIncrease: model.poolIncrease,
      closeDate,
      leadInvestor: round.leadInvestor ?? input.investors.slice().sort((a, b) => b.amount - a.amount)[0]?.name ?? null,
    },
  });

  // Board consent draft
  const directors = data.stakeholders.filter((s) => s.relationship === "BOARD_MEMBER" || s.relationship === "FOUNDER");
  const consent = await db.boardConsent.create({
    data: {
      companyId: C,
      title: `Approval of ${round.name} financing`,
      type: "ROUND_APPROVAL",
      status: "DRAFT",
      effectiveDate: closeDate,
      createdById: ctx.user.id,
      body: `**WHEREAS**, the Company proposes to sell shares of ${cls.name} at $${model.pricePerShare.toFixed(4)} per share for aggregate proceeds of $${model.totalRaised.toLocaleString("en-US")} on a pre-money valuation of $${model.preMoneyValuation.toLocaleString("en-US")} (the "Financing");\n\n**RESOLVED**, that the Financing, the issuance of ${issuedShares.toLocaleString()} shares of ${cls.name} to the investors, and the conversion of outstanding convertible instruments into ${model.convertedShares.toLocaleString()} shares of ${cls.name} are hereby approved;\n\n**RESOLVED FURTHER**, that the number of shares reserved under the Company's equity incentive plan is increased by ${model.poolIncrease.toLocaleString()} shares.`,
      signers: { create: directors.map((s) => ({ stakeholderId: s.id, name: s.name, email: s.email ?? "" })) },
      exhibits: { create: [{ label: "Exhibit A", description: `${round.name} pro-forma capitalization`, referenceId: round.id, referenceType: "ROUND" }] },
    },
  });
  await db.notification.create({ data: { companyId: C, type: "TASK", title: `Board consent drafted for ${round.name}`, body: "Review the resolutions and send to directors for signature.", link: `/app/${C}/board/${consent.id}` } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "FundingRound", entityId: round.id, summary: `Closed ${round.name}: ${model.totalRaised.toLocaleString("en-US")} raised at $${model.pricePerShare.toFixed(4)}/share; ${model.conversions.length} instruments converted; pool +${model.poolIncrease.toLocaleString()}`, after: { pricePerShare: model.pricePerShare, postMoney: model.postMoneyValuation, issuedShares, converted: model.convertedShares, poolIncrease: model.poolIncrease } });

  revalidatePath(`/app/${C}`, "layout");
  return ok({ roundId: round.id, shareClassId: cls.id }, `${round.name} closed`);
}

// ---------------------------------------------------------------------------
// SAFEs & notes
// ---------------------------------------------------------------------------

const investorFields = {
  companyId: zStr,
  stakeholderId: zStrOpt,
  investorName: zStrOpt,
  investorEmail: zStrOpt,
  issueDate: z.coerce.date(),
  boardApprovalDate: zDateOpt,
  sendForSignature: zBool,
  notes: zStrOpt,
};

const safeSchema = z.object({
  ...investorFields,
  amount: z.coerce.number().positive(),
  safeType: z.enum(["POST_MONEY", "PRE_MONEY"]),
  valuationCap: zNumOpt,
  discountPercent: zNumOpt,
  mfn: zBool,
  proRataRight: zBool,
});

async function resolveInvestor(companyId: string, d: { stakeholderId?: string; investorName?: string; investorEmail?: string }) {
  if (d.stakeholderId) {
    const s = await db.stakeholder.findFirst({ where: { id: d.stakeholderId, companyId } });
    if (s) return s;
  }
  if (!d.investorName) return null;
  return db.stakeholder.create({ data: { companyId, name: d.investorName, email: d.investorEmail || null, type: ENTITY_HINT.test(d.investorName) ? "ENTITY" : "INDIVIDUAL", relationship: "INVESTOR", accredited: true } });
}

async function createInstrumentDocument(input: { companyId: string; userId: string; securityId: string; stakeholder: { id: string; name: string; email: string | null }; cert: string; name: string; type: "SAFE" | "CONVERTIBLE_NOTE"; content: string; sendForSignature: boolean; companySigner: { name: string; email: string }; issueDate: Date }) {
  return db.document.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      folder: `Securities/${input.cert}`,
      type: input.type,
      mimeType: "text/markdown",
      sizeBytes: Buffer.byteLength(input.content),
      content: input.content,
      securityId: input.securityId,
      stakeholderId: input.stakeholder.id,
      visibility: "HOLDER",
      uploadedById: input.userId,
      signatureStatus: input.sendForSignature ? "PENDING" : "SIGNED",
      signatures: {
        create: [
          { name: input.companySigner.name, email: input.companySigner.email, role: "COMPANY", status: input.sendForSignature ? "PENDING" : "SIGNED", signedAt: input.sendForSignature ? null : input.issueDate, sortOrder: 0 },
          { stakeholderId: input.stakeholder.id, name: input.stakeholder.name, email: input.stakeholder.email ?? "", role: "INVESTOR", status: input.sendForSignature ? "PENDING" : "SIGNED", signedAt: input.sendForSignature ? null : input.issueDate, sortOrder: 1 },
        ],
      },
    },
  });
}

export async function createSafe(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(safeSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const ctx = await requireEditor(d.companyId);
  const C = ctx.company.id;
  if (!d.valuationCap && !d.discountPercent && !d.mfn) return fail("A SAFE needs a valuation cap, a discount, or an MFN clause.");
  const investor = await resolveInvestor(C, d);
  if (!investor) return fail("Choose an existing investor or enter a name for a new one.", { investorName: "Required" });
  const existing = await db.security.findMany({ where: { companyId: C }, select: { certificateNumber: true } });
  const cert = nextCertificateNumber("SAFE", existing.map((s) => s.certificateNumber));
  const security = await db.security.create({
    data: {
      companyId: C,
      stakeholderId: investor.id,
      type: "SAFE",
      certificateNumber: cert,
      quantity: 0,
      totalAmount: d.amount,
      issueDate: d.issueDate,
      boardApprovalDate: d.boardApprovalDate ?? null,
      status: d.sendForSignature ? "PENDING_SIGNATURE" : "OUTSTANDING",
      valuationCap: d.valuationCap ?? null,
      discountPercent: d.discountPercent ?? null,
      safeType: d.safeType,
      mfn: d.mfn,
      proRataRight: d.proRataRight,
      notes: d.notes ?? null,
    },
  });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: security.id, toStakeholderId: investor.id, quantity: 0, totalAmount: d.amount, effectiveDate: d.issueDate, notes: `Issued ${cert}`, createdById: ctx.user.id } });
  const content = safeAgreement({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }, investorName: investor.name, amount: d.amount, valuationCap: d.valuationCap, discountPercent: d.discountPercent, safeType: d.safeType, mfn: d.mfn, proRata: d.proRataRight, date: d.issueDate });
  await createInstrumentDocument({ companyId: C, userId: ctx.user.id, securityId: security.id, stakeholder: investor, cert, name: `${cert} — ${d.safeType === "POST_MONEY" ? "Post-money" : "Pre-money"} SAFE`, type: "SAFE", content, sendForSignature: d.sendForSignature, companySigner: { name: ctx.user.name, email: ctx.user.email }, issueDate: d.issueDate });
  if (d.sendForSignature) {
    await db.notification.create({ data: { companyId: C, type: "TASK", title: `${cert} sent to ${investor.name} for signature`, body: `$${d.amount.toLocaleString("en-US")} SAFE awaiting investor and company signatures.`, link: `/app/${C}/securities/${security.id}` } });
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: "ISSUE", entityType: "Security", entityId: security.id, summary: `Issued ${cert}: $${d.amount.toLocaleString("en-US")} ${d.safeType === "POST_MONEY" ? "post-money" : "pre-money"} SAFE to ${investor.name}`, after: security });
  revalidatePath(`/app/${C}`, "layout");
  return ok({ id: security.id }, `${cert} issued to ${investor.name}`);
}

const noteSchema = z.object({
  ...investorFields,
  principal: z.coerce.number().positive(),
  interestRate: z.coerce.number().min(0).max(30),
  interestType: z.enum(["SIMPLE", "COMPOUND"]),
  maturityDate: z.coerce.date(),
  valuationCap: zNumOpt,
  discountPercent: zNumOpt,
  conversionTrigger: zNumOpt,
});

export async function createNote(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(noteSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const ctx = await requireEditor(d.companyId);
  const C = ctx.company.id;
  if (d.maturityDate <= d.issueDate) return fail("Maturity must be after the issue date.", { maturityDate: "Must be after issue date" });
  const investor = await resolveInvestor(C, d);
  if (!investor) return fail("Choose an existing investor or enter a name for a new one.", { investorName: "Required" });
  const existing = await db.security.findMany({ where: { companyId: C }, select: { certificateNumber: true } });
  const cert = nextCertificateNumber("CN", existing.map((s) => s.certificateNumber));
  const security = await db.security.create({
    data: {
      companyId: C,
      stakeholderId: investor.id,
      type: "CONVERTIBLE_NOTE",
      certificateNumber: cert,
      quantity: 0,
      totalAmount: d.principal,
      issueDate: d.issueDate,
      boardApprovalDate: d.boardApprovalDate ?? null,
      status: d.sendForSignature ? "PENDING_SIGNATURE" : "OUTSTANDING",
      valuationCap: d.valuationCap ?? null,
      discountPercent: d.discountPercent ?? null,
      interestRate: d.interestRate,
      interestType: d.interestType,
      maturityDate: d.maturityDate,
      conversionTrigger: d.conversionTrigger ?? null,
      notes: d.notes ?? null,
    },
  });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: security.id, toStakeholderId: investor.id, quantity: 0, totalAmount: d.principal, effectiveDate: d.issueDate, notes: `Issued ${cert}`, createdById: ctx.user.id } });
  const content = convertibleNote({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }, investorName: investor.name, principal: d.principal, interestRate: d.interestRate, maturityDate: d.maturityDate, valuationCap: d.valuationCap, discountPercent: d.discountPercent, qualifiedFinancing: d.conversionTrigger, date: d.issueDate });
  await createInstrumentDocument({ companyId: C, userId: ctx.user.id, securityId: security.id, stakeholder: investor, cert, name: `${cert} — Convertible promissory note`, type: "CONVERTIBLE_NOTE", content, sendForSignature: d.sendForSignature, companySigner: { name: ctx.user.name, email: ctx.user.email }, issueDate: d.issueDate });
  if (d.sendForSignature) {
    await db.notification.create({ data: { companyId: C, type: "TASK", title: `${cert} sent to ${investor.name} for signature`, body: `$${d.principal.toLocaleString("en-US")} convertible note awaiting signatures.`, link: `/app/${C}/securities/${security.id}` } });
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: "ISSUE", entityType: "Security", entityId: security.id, summary: `Issued ${cert}: $${d.principal.toLocaleString("en-US")} convertible note to ${investor.name} at ${d.interestRate}%`, after: security });
  revalidatePath(`/app/${C}`, "layout");
  return ok({ id: security.id }, `${cert} issued to ${investor.name}`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function saveSafeTemplate(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const schema = z.object({ companyId: zStr, name: zStr, terms: zStr });
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;
  const ctx = await requireEditor(parsed.data.companyId);
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  const templates = Array.isArray(settings.safeTemplates) ? (settings.safeTemplates as unknown[]) : [];
  const terms = parseJson<Record<string, unknown>>(parsed.data.terms, {});
  const next = [...templates.filter((t) => (t as { name?: string }).name !== parsed.data.name), { name: parsed.data.name, ...terms }];
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify({ ...settings, safeTemplates: next }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: ctx.company.id, summary: `Saved SAFE template "${parsed.data.name}"` });
  revalidatePath(`/app/${ctx.company.id}/fundraising/safes/new`);
  return ok(undefined, "Template saved");
}

// ---------------------------------------------------------------------------
// Term sheet scanner
// ---------------------------------------------------------------------------

export async function scanTermSheet(_prev: ActionResult<ReturnType<typeof extractTerms>> | undefined, formData: FormData): Promise<ActionResult<ReturnType<typeof extractTerms>>> {
  const companyId = String(formData.get("companyId") ?? "");
  const text = String(formData.get("text") ?? "");
  await requireEditor(companyId);
  if (text.trim().length < 40) return fail("Paste the term sheet text (at least a few sentences).");
  return ok(extractTerms(text));
}

export async function saveTermSheet(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const schema = z.object({ companyId: zStr, name: zStr, text: zStr, summary: zStrOpt });
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;
  const ctx = await requireEditor(parsed.data.companyId);
  const C = ctx.company.id;
  const content = `${parsed.data.summary ? parsed.data.summary + "\n\n---\n\n" : ""}${parsed.data.text}`;
  const docRow = await db.document.create({ data: { companyId: C, name: parsed.data.name, folder: "Fundraising", type: "TERM_SHEET", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, visibility: "COMPANY", uploadedById: ctx.user.id } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Document", entityId: docRow.id, summary: `Saved term sheet "${parsed.data.name}" to Fundraising` });
  revalidatePath(`/app/${C}/documents`);
  return ok({ id: docRow.id }, "Saved to documents");
}
