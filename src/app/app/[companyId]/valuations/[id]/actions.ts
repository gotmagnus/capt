"use server";

import { revalidatePath } from "next/cache";
import { addYears } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zNum, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { valuationReportSummary } from "@/lib/documents/templates";
import { latestRound } from "@/lib/data/captable";

async function load(companyId: string, valuationId: string) {
  const ctx = await requireEditor(companyId);
  const valuation = await db.valuation.findFirst({ where: { id: valuationId, companyId: ctx.company.id } });
  return { ctx, valuation };
}

function ids(formData: FormData) {
  return { companyId: String(formData.get("companyId") ?? ""), valuationId: String(formData.get("valuationId") ?? "") };
}

export async function markInProgress(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { companyId, valuationId } = ids(formData);
  const { ctx, valuation } = await load(companyId, valuationId);
  if (!valuation) return fail("Valuation not found.");
  if (valuation.status !== "REQUESTED") return fail("Only requested valuations can be started.");
  const analyst = String(formData.get("analyst") ?? "") || null;
  await db.valuation.update({ where: { id: valuation.id }, data: { status: "IN_PROGRESS", analyst } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Valuation", entityId: valuation.id, summary: `409A valuation (${valuation.valuationDate.toISOString().slice(0, 10)}) marked in progress${analyst ? ` — analyst ${analyst}` : ""}` });
  revalidatePath(`/app/${ctx.company.id}/valuations`);
  return ok(undefined, "Marked in progress");
}

const deliverSchema = z.object({
  companyId: zStr,
  valuationId: zStr,
  fairMarketValue: zNum.positive(),
  preferredPrice: zNumOpt,
  enterpriseValue: zNumOpt,
  equityValue: zNumOpt,
  methodology: z.enum(["OPM", "PWERM", "BACKSOLVE", "HYBRID", "MARKET", "INCOME", "ASSET"]),
  dlomPercent: zNumOpt,
  volatility: zNumOpt,
  riskFreeRate: zNumOpt,
  timeToLiquidity: zNumOpt,
  analyst: zStrOpt,
  notes: zStrOpt,
});

export async function deliverDraft(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(deliverSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const { ctx, valuation } = await load(d.companyId, d.valuationId);
  if (!valuation) return fail("Valuation not found.");
  if (!["REQUESTED", "IN_PROGRESS", "DRAFT_DELIVERED"].includes(valuation.status)) return fail("This valuation is no longer open.");
  const C = ctx.company.id;
  const round = await latestRound(C);
  const preferredPrice = d.preferredPrice ?? round?.pricePerShare ?? null;
  const volatility = d.volatility != null ? (d.volatility > 1 ? d.volatility / 100 : d.volatility) : null;
  const riskFreeRate = d.riskFreeRate != null ? (d.riskFreeRate > 1 ? d.riskFreeRate / 100 : d.riskFreeRate) : null;
  const content = valuationReportSummary({
    company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address },
    valuationDate: valuation.valuationDate,
    fmv: d.fairMarketValue,
    preferredPrice,
    enterpriseValue: d.enterpriseValue,
    equityValue: d.equityValue,
    methodology: d.methodology,
    dlomPercent: d.dlomPercent,
    volatility,
    riskFreeRate,
    timeToLiquidity: d.timeToLiquidity,
    provider: valuation.provider,
    analyst: d.analyst ?? valuation.analyst,
  });
  const label = valuation.valuationDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  let reportDocumentId = valuation.reportDocumentId;
  if (reportDocumentId) {
    const existing = await db.document.findFirst({ where: { id: reportDocumentId, companyId: C } });
    if (existing) {
      await db.document.update({ where: { id: existing.id }, data: { content, sizeBytes: Buffer.byteLength(content), version: { increment: 1 } } });
    } else reportDocumentId = null;
  }
  if (!reportDocumentId) {
    const doc = await db.document.create({ data: { companyId: C, name: `409A valuation report — ${label}`, folder: "Valuations", type: "VALUATION_REPORT", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, visibility: "BOARD", uploadedById: ctx.user.id } });
    reportDocumentId = doc.id;
  }
  await db.valuation.update({
    where: { id: valuation.id },
    data: {
      status: "DRAFT_DELIVERED",
      fairMarketValue: d.fairMarketValue,
      preferredPrice,
      enterpriseValue: d.enterpriseValue ?? null,
      equityValue: d.equityValue ?? null,
      methodology: d.methodology,
      dlomPercent: d.dlomPercent ?? null,
      volatility,
      riskFreeRate,
      timeToLiquidity: d.timeToLiquidity ?? null,
      analyst: d.analyst ?? valuation.analyst,
      notes: d.notes ?? valuation.notes,
      reportDocumentId,
      deliveredAt: new Date(),
    },
  });
  await db.notification.create({ data: { companyId: C, type: "TASK", title: `409A draft delivered: ${d.fairMarketValue.toFixed(2)} per share`, body: `Review the ${label} valuation report and accept it to update the FMV used for grants.`, link: `/app/${C}/valuations/${valuation.id}` } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Valuation", entityId: valuation.id, summary: `Draft 409A delivered for ${label}: FMV $${d.fairMarketValue.toFixed(2)} (${d.methodology})`, after: { fmv: d.fairMarketValue, methodology: d.methodology } });
  revalidatePath(`/app/${C}/valuations`);
  return ok(undefined, "Draft delivered");
}

export async function acceptValuation(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { companyId, valuationId } = ids(formData);
  const { ctx, valuation } = await load(companyId, valuationId);
  if (!valuation) return fail("Valuation not found.");
  if (valuation.status !== "DRAFT_DELIVERED") return fail("Only delivered drafts can be accepted.");
  if (valuation.fairMarketValue == null) return fail("The draft has no fair market value.");
  const C = ctx.company.id;
  const label = valuation.valuationDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const directors = await db.stakeholder.findMany({ where: { companyId: C, relationship: { in: ["BOARD_MEMBER", "FOUNDER"] } }, orderBy: { name: "asc" } });
  const consent = await db.boardConsent.create({
    data: {
      companyId: C,
      title: `Approval of 409A valuation (${label})`,
      type: "VALUATION_409A",
      status: "DRAFT",
      effectiveDate: new Date(),
      createdById: ctx.user.id,
      body: `**WHEREAS**, the Board has received the independent valuation report prepared by ${valuation.provider} as of ${label}, concluding a fair market value of **$${valuation.fairMarketValue.toFixed(2)} per share** of Common Stock;\n\n**RESOLVED**, that the Board hereby determines, in good faith and in reliance on the report, that the fair market value of the Common Stock is $${valuation.fairMarketValue.toFixed(2)} per share for purposes of Section 409A, effective until the earlier of twelve months from the valuation date or a material event.`,
      signers: { create: directors.map((s) => ({ stakeholderId: s.id, name: s.name, email: s.email ?? "" })) },
      exhibits: { create: [{ label: "Exhibit A", description: `409A valuation report dated ${label}`, referenceId: valuation.id, referenceType: "VALUATION", documentId: valuation.reportDocumentId }] },
    },
  });
  await db.valuation.updateMany({ where: { companyId: C, status: "ACCEPTED", id: { not: valuation.id } }, data: { status: "SUPERSEDED", effectiveTo: valuation.valuationDate } });
  await db.valuation.update({ where: { id: valuation.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), effectiveFrom: valuation.valuationDate, effectiveTo: addYears(valuation.valuationDate, 1), boardConsentId: consent.id } });
  await db.notification.updateMany({ where: { companyId: C, link: `/app/${C}/valuations/${valuation.id}`, status: "OPEN" }, data: { status: "DONE" } });
  await db.notification.create({ data: { companyId: C, type: "TASK", title: "Send 409A board consent for signature", body: `The ${label} valuation was accepted at $${valuation.fairMarketValue.toFixed(2)}/share. Send the ratifying consent to directors.`, link: `/app/${C}/board/${consent.id}` } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "APPROVE", entityType: "Valuation", entityId: valuation.id, summary: `Accepted 409A valuation (${label}): common FMV $${valuation.fairMarketValue.toFixed(2)}/share`, after: { fmv: valuation.fairMarketValue, consentId: consent.id } });
  revalidatePath(`/app/${C}`, "layout");
  return ok(undefined, "Valuation accepted — board consent drafted");
}

export async function requestRevision(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { companyId, valuationId } = ids(formData);
  const { ctx, valuation } = await load(companyId, valuationId);
  if (!valuation) return fail("Valuation not found.");
  if (valuation.status !== "DRAFT_DELIVERED") return fail("Only delivered drafts can be sent back.");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return fail("Tell the analyst what to revisit.", { note: "Required" });
  const stamped = `${valuation.notes ? valuation.notes + "\n\n" : ""}Revision requested ${new Date().toLocaleDateString("en-US")} by ${ctx.user.name}: ${note}`;
  await db.valuation.update({ where: { id: valuation.id }, data: { status: "IN_PROGRESS", notes: stamped } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Valuation", entityId: valuation.id, summary: `Requested revision of 409A draft: ${note.slice(0, 120)}` });
  revalidatePath(`/app/${ctx.company.id}/valuations`);
  return ok(undefined, "Revision requested");
}

export async function withdrawValuation(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { companyId, valuationId } = ids(formData);
  const { ctx, valuation } = await load(companyId, valuationId);
  if (!valuation) return fail("Valuation not found.");
  if (!["REQUESTED", "IN_PROGRESS", "DRAFT_DELIVERED"].includes(valuation.status)) return fail("Only open requests can be withdrawn.");
  await db.valuation.update({ where: { id: valuation.id }, data: { status: "EXPIRED" } });
  await db.notification.updateMany({ where: { companyId: ctx.company.id, link: `/app/${ctx.company.id}/valuations/${valuation.id}`, status: "OPEN" }, data: { status: "DISMISSED" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Valuation", entityId: valuation.id, summary: `Withdrew 409A request (${valuation.valuationDate.toISOString().slice(0, 10)})` });
  revalidatePath(`/app/${ctx.company.id}/valuations`);
  return ok(undefined, "Request withdrawn");
}
