"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zDate, zDateOpt, zNum, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { nextCertificateNumber } from "@/lib/equity/captable";
import { accruedInterest } from "@/lib/equity/conversion";
import { election83b, shareCertificate } from "@/lib/documents/templates";
import { effectiveVesting, isConvertible, isExercisable, isShareType, type AccelerationOverride } from "@/lib/securities-utils";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { parseJson } from "@/lib/utils";
import type { VestingScheduleInput } from "@/lib/equity/vesting";

type R = ActionResult<undefined>;
const base = { companyId: zStr, securityId: zStr };

async function load(companyId: string, securityId: string) {
  const ctx = await requireEditor(companyId);
  const security = await db.security.findFirst({
    where: { id: securityId, companyId: ctx.company.id },
    include: { stakeholder: true, shareClass: true, equityPlan: true, vestingSchedule: { include: { milestones: true } }, transactions: true },
  });
  if (!security) throw new Error("Security not found.");
  const schedule: VestingScheduleInput | null = security.vestingSchedule ? { ...security.vestingSchedule, milestones: security.vestingSchedule.milestones } : null;
  const info = { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address };
  return { ctx, security, schedule, info, C: ctx.company.id };
}

function done(companyId: string) {
  revalidatePath(`/app/${companyId}`, "layout");
}

function errorResult(e: unknown): R {
  return fail(e instanceof Error ? e.message : "Something went wrong.");
}

const label = (t: string) => SECURITY_TYPE_LABELS[t as SecurityType] ?? t;

// ---------------------------------------------------------------------------

export async function cancelSecurity(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, quantity: zNumOpt, effectiveDate: zDate, reason: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    const convertible = isConvertible(security.type);
    const remaining = isExercisable(security.type) ? security.quantity - security.exercisedQuantity - security.cancelledQuantity : security.quantity - security.cancelledQuantity;
    const qty = convertible ? 0 : parsed.data.quantity ?? remaining;
    if (!convertible && (qty <= 0 || qty > remaining)) return fail(`Enter a quantity between 1 and ${Math.round(remaining).toLocaleString()}.`);
    const fullyResolved = convertible || remaining - qty <= 0;
    await db.$transaction([
      db.security.update({
        where: { id: security.id },
        data: {
          cancelledQuantity: security.cancelledQuantity + qty,
          status: fullyResolved ? (security.exercisedQuantity > 0 ? "EXERCISED" : "CANCELLED") : security.status,
          notes: parsed.data.reason ? `${security.notes ? security.notes + "\n" : ""}Cancelled ${qty ? Math.round(qty).toLocaleString() + " " : ""}on ${parsed.data.effectiveDate.toISOString().slice(0, 10)}: ${parsed.data.reason}` : security.notes,
        },
      }),
      db.transaction.create({
        data: { companyId: C, type: "CANCELLATION", securityId: security.id, fromStakeholderId: security.stakeholderId, quantity: qty, totalAmount: convertible ? security.totalAmount : null, effectiveDate: parsed.data.effectiveDate, notes: parsed.data.reason ?? `Cancelled ${security.certificateNumber}`, createdById: ctx.user.id },
      }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "CANCEL", entityType: "Security", entityId: security.id, summary: `Cancelled ${convertible ? "" : Math.round(qty).toLocaleString() + " of "}${security.certificateNumber} (${label(security.type)}) held by ${security.stakeholder.name}${security.equityPlanId && !convertible ? " — shares returned to the pool" : ""}`, after: { quantity: qty, reason: parsed.data.reason } });
    done(C);
    return ok(undefined, `Cancelled ${security.certificateNumber}.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function transferSecurity(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, toStakeholderId: zStr, quantity: zNum, effectiveDate: zDate, pricePerShare: zNumOpt, notes: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, info, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!isShareType(security.type)) return fail("Only shares can be transferred.");
    if (security.status !== "OUTSTANDING") return fail("Only outstanding certificates can be transferred.");
    const remaining = security.quantity - security.cancelledQuantity;
    const qty = parsed.data.quantity;
    if (qty <= 0 || qty > remaining) return fail(`Enter a quantity between 1 and ${Math.round(remaining).toLocaleString()}.`);
    const to = await db.stakeholder.findFirst({ where: { id: parsed.data.toStakeholderId, companyId: C } });
    if (!to) return fail("Select the receiving stakeholder.");
    if (to.id === security.stakeholderId) return fail("Choose a different stakeholder to transfer to.");
    const cls = security.shareClass;
    if (!cls) return fail("This certificate has no share class.");
    const certs = (await db.security.findMany({ where: { companyId: C }, select: { certificateNumber: true } })).map((s) => s.certificateNumber);
    const price = parsed.data.pricePerShare ?? security.pricePerShare ?? 0;
    const date = parsed.data.effectiveDate;
    const newType = security.type === "RSA" ? "COMMON_SHARES" : security.type;

    await db.$transaction(async (tx) => {
      await tx.security.update({ where: { id: security.id }, data: { status: "TRANSFERRED", notes: `${security.notes ? security.notes + "\n" : ""}Transferred ${Math.round(qty).toLocaleString()} shares to ${to.name} on ${date.toISOString().slice(0, 10)}${remaining - qty > 0 ? `; remainder reissued to ${security.stakeholder.name}` : ""}.` } });
      await tx.transaction.create({ data: { companyId: C, type: "TRANSFER", securityId: security.id, fromStakeholderId: security.stakeholderId, toStakeholderId: to.id, quantity: qty, pricePerShare: price, totalAmount: price * qty, effectiveDate: date, notes: parsed.data.notes ?? `Transfer of ${security.certificateNumber}`, createdById: ctx.user.id } });
      const issue = async (holder: { id: string; name: string }, quantity: number, keepVesting: boolean) => {
        const cert = nextCertificateNumber(cls.prefix, certs);
        certs.push(cert);
        const sec = await tx.security.create({
          data: {
            companyId: C,
            stakeholderId: holder.id,
            type: keepVesting ? security.type : newType,
            certificateNumber: cert,
            shareClassId: cls.id,
            equityPlanId: keepVesting ? security.equityPlanId : null,
            vestingScheduleId: keepVesting ? security.vestingScheduleId : null,
            vestingStartDate: keepVesting ? security.vestingStartDate : null,
            quantity,
            pricePerShare: keepVesting ? security.pricePerShare : price,
            fmvAtGrant: security.fmvAtGrant,
            totalAmount: (keepVesting ? security.pricePerShare ?? 0 : price) * quantity,
            issueDate: date,
            grantDate: keepVesting ? security.grantDate : date,
            boardApprovalDate: date,
            status: "OUTSTANDING",
            repurchaseRight: keepVesting ? security.repurchaseRight : false,
            election83bDeadline: keepVesting ? security.election83bDeadline : null,
            election83bFiledDate: keepVesting ? security.election83bFiledDate : null,
            accelerationOverride: keepVesting ? security.accelerationOverride : null,
            legend: security.legend,
            notes: keepVesting ? `Remainder of ${security.certificateNumber} after transfer of ${Math.round(qty).toLocaleString()} shares to ${to.name}.` : `Transferred from ${security.certificateNumber} (${security.stakeholder.name}).`,
          },
        });
        await tx.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: sec.id, toStakeholderId: holder.id, quantity, pricePerShare: sec.pricePerShare, totalAmount: sec.totalAmount, effectiveDate: date, notes: `Issued ${cert}${keepVesting ? " (reissued remainder)" : " (transfer)"}`, createdById: ctx.user.id } });
        const content = shareCertificate({ company: info, certificateNumber: cert, holderName: holder.name, shares: quantity, className: cls.name, parValue: cls.parValue, issueDate: date, pricePerShare: sec.pricePerShare, legend: security.legend });
        await tx.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: sec.id, stakeholderId: holder.id, uploadedById: ctx.user.id, visibility: "HOLDER" } });
        return sec;
      };
      await issue(to, qty, false);
      if (remaining - qty > 0) await issue(security.stakeholder, remaining - qty, true);
    });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "TRANSFER", entityType: "Security", entityId: security.id, summary: `Transferred ${Math.round(qty).toLocaleString()} ${cls.name} shares (${security.certificateNumber}) from ${security.stakeholder.name} to ${to.name}`, after: { quantity: qty, pricePerShare: price, to: to.name } });
    done(C);
    return ok(undefined, `Transferred ${Math.round(qty).toLocaleString()} shares to ${to.name}.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function repurchaseShares(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, quantity: zNum, pricePerShare: zNum.min(0), effectiveDate: zDate, reason: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!isShareType(security.type)) return fail("Only shares can be repurchased.");
    const remaining = security.quantity - security.cancelledQuantity;
    const qty = parsed.data.quantity;
    if (qty <= 0 || qty > remaining) return fail(`Enter a quantity between 1 and ${Math.round(remaining).toLocaleString()}.`);
    const total = qty * parsed.data.pricePerShare;
    await db.$transaction([
      db.security.update({ where: { id: security.id }, data: { cancelledQuantity: security.cancelledQuantity + qty, status: remaining - qty <= 0 ? "REPURCHASED" : security.status, notes: `${security.notes ? security.notes + "\n" : ""}${Math.round(qty).toLocaleString()} shares repurchased at $${parsed.data.pricePerShare} on ${parsed.data.effectiveDate.toISOString().slice(0, 10)}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}.` } }),
      db.transaction.create({ data: { companyId: C, type: "REPURCHASE", securityId: security.id, fromStakeholderId: security.stakeholderId, quantity: qty, pricePerShare: parsed.data.pricePerShare, totalAmount: total, effectiveDate: parsed.data.effectiveDate, notes: parsed.data.reason ?? `Repurchase of ${security.certificateNumber}`, createdById: ctx.user.id } }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `Repurchased ${Math.round(qty).toLocaleString()} shares of ${security.certificateNumber} from ${security.stakeholder.name} for $${total.toLocaleString()}`, after: { quantity: qty, pricePerShare: parsed.data.pricePerShare } });
    done(C);
    return ok(undefined, `Repurchased ${Math.round(qty).toLocaleString()} shares.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function recordExercise(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, quantity: zNum, exerciseDate: zDate, method: zStr, fmvAtExercise: zNumOpt, notes: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, schedule, info, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!isExercisable(security.type)) return fail("Only options and warrants can be exercised.");
    if (!["OUTSTANDING", "PENDING_SIGNATURE"].includes(security.status)) return fail("This grant is no longer exercisable.");
    const date = parsed.data.exerciseDate;
    const vest = effectiveVesting(security, schedule, security.stakeholder.terminationDate, date);
    const unexercised = security.quantity - security.exercisedQuantity - security.cancelledQuantity;
    const vestedAvailable = Math.max(0, Math.min(unexercised, vest.vested - security.exercisedQuantity));
    const allowed = security.earlyExercise ? unexercised : vestedAvailable;
    const qty = parsed.data.quantity;
    if (qty <= 0 || qty > allowed) return fail(security.earlyExercise ? `Enter a quantity between 1 and ${Math.round(allowed).toLocaleString()}.` : `Only ${Math.round(vestedAvailable).toLocaleString()} vested shares are exercisable as of ${date.toISOString().slice(0, 10)}.`);
    const strike = security.exercisePrice ?? 0;
    const valuation = await db.valuation.findFirst({ where: { companyId: C, status: "ACCEPTED" }, orderBy: { valuationDate: "desc" } });
    const fmv = parsed.data.fmvAtExercise ?? valuation?.fairMarketValue ?? strike;
    const cls = security.shareClass ?? (await db.shareClass.findFirst({ where: { companyId: C, type: "COMMON" } }));
    if (!cls) return fail("No common share class exists to issue shares into.");
    const certs = (await db.security.findMany({ where: { companyId: C }, select: { certificateNumber: true } })).map((s) => s.certificateNumber);
    const unvestedPortion = Math.max(0, qty - vestedAvailable);
    const isIso = security.type === "OPTION_ISO";
    const total = qty * strike;

    await db.$transaction(async (tx) => {
      const cert = nextCertificateNumber(cls.prefix, certs);
      const restricted = unvestedPortion > 0;
      const shares = await tx.security.create({
        data: {
          companyId: C,
          stakeholderId: security.stakeholderId,
          type: restricted ? "RSA" : "COMMON_SHARES",
          certificateNumber: cert,
          shareClassId: cls.id,
          equityPlanId: security.equityPlanId,
          vestingScheduleId: restricted ? security.vestingScheduleId : null,
          vestingStartDate: restricted ? security.vestingStartDate ?? security.issueDate : null,
          quantity: qty,
          pricePerShare: strike,
          fmvAtGrant: fmv,
          totalAmount: total,
          issueDate: date,
          grantDate: date,
          boardApprovalDate: security.boardApprovalDate,
          status: "OUTSTANDING",
          repurchaseRight: restricted,
          election83bDeadline: restricted ? addDays(date, 30) : null,
          notes: `Issued on exercise of ${security.certificateNumber}${restricted ? " (early exercise — unvested shares subject to repurchase)" : ""}.`,
        },
      });
      await tx.transaction.create({ data: { companyId: C, type: "EXERCISE", securityId: security.id, toStakeholderId: security.stakeholderId, quantity: qty, pricePerShare: strike, totalAmount: total, effectiveDate: date, notes: `Exercised ${Math.round(qty).toLocaleString()} ${label(security.type)} (${security.certificateNumber}) → ${cert}`, createdById: ctx.user.id } });
      await tx.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: shares.id, toStakeholderId: security.stakeholderId, quantity: qty, pricePerShare: strike, totalAmount: total, effectiveDate: date, notes: `Issued ${cert} on exercise`, createdById: ctx.user.id } });
      const newExercised = security.exercisedQuantity + qty;
      await tx.security.update({ where: { id: security.id }, data: { exercisedQuantity: newExercised, status: newExercised + security.cancelledQuantity >= security.quantity ? "EXERCISED" : security.status } });
      const req = await tx.exerciseRequest.create({
        data: { companyId: C, securityId: security.id, stakeholderId: security.stakeholderId, quantity: qty, exercisePrice: strike, totalCost: total, fmvAtExercise: fmv, isIso, method: parsed.data.method, status: "COMPLETED", requestedAt: date, approvedAt: date, paidAt: date, completedAt: date, resultingSecurityId: shares.id, election83b: restricted, notes: parsed.data.notes ?? "Recorded by administrator" },
      });
      if (isIso) {
        await tx.complianceRecord.create({
          data: { companyId: C, type: "FORM_3921", taxYear: date.getFullYear(), referenceId: req.id, status: "PENDING", dueDate: new Date(date.getFullYear() + 1, 0, 31), data: JSON.stringify({ employee: security.stakeholder.name, shares: qty, exercisePrice: strike, fmv, grantDate: security.grantDate ?? security.issueDate, exerciseDate: date }) },
        });
      }
      const content = shareCertificate({ company: info, certificateNumber: cert, holderName: security.stakeholder.name, shares: qty, className: cls.name, parValue: cls.parValue, issueDate: date, pricePerShare: strike });
      await tx.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: shares.id, stakeholderId: security.stakeholderId, uploadedById: ctx.user.id, visibility: "HOLDER" } });
      if (restricted) {
        const e83 = election83b({ company: info, holderName: security.stakeholder.name, holderAddress: security.stakeholder.address, taxId: security.stakeholder.taxId, shares: qty, className: cls.name, transferDate: date, fmvPerShare: fmv, pricePaidPerShare: strike, taxYear: date.getFullYear() });
        await tx.document.create({ data: { companyId: C, name: `83(b) election — ${security.stakeholder.name} (${cert})`, folder: "Tax/83(b) elections", type: "ELECTION_83B", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(e83), content: e83, securityId: shares.id, stakeholderId: security.stakeholderId, uploadedById: ctx.user.id, visibility: "HOLDER" } });
        await tx.complianceRecord.create({ data: { companyId: C, type: "ELECTION_83B", referenceId: shares.id, status: "PENDING", dueDate: addDays(date, 30), data: JSON.stringify({ stakeholder: security.stakeholder.name, certificateNumber: cert, shares: qty }) } });
        await tx.notification.create({ data: { companyId: C, stakeholderId: security.stakeholderId, userId: security.stakeholder.userId, type: "DEADLINE", title: `File your 83(b) election for ${cert} within 30 days`, body: "Early-exercised shares are subject to vesting; an 83(b) election must reach the IRS within 30 days of exercise.", link: `/portal/${C}/tax`, dueDate: addDays(date, 30) } });
      }
    });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "EXERCISE", entityType: "Security", entityId: security.id, summary: `Recorded exercise of ${Math.round(qty).toLocaleString()} ${label(security.type)} (${security.certificateNumber}) by ${security.stakeholder.name} at $${strike} — $${total.toLocaleString()} via ${parsed.data.method}`, after: { quantity: qty, exercisePrice: strike, fmv, method: parsed.data.method } });
    done(C);
    return ok(undefined, `Recorded exercise of ${Math.round(qty).toLocaleString()} shares.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function accelerateVesting(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, mode: z.enum(["ALL", "PERCENT"]), percent: zNumOpt, effectiveDate: zDate, reason: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, schedule, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!schedule) return fail("This security has no vesting schedule.");
    const date = parsed.data.effectiveDate;
    const vest = effectiveVesting(security, schedule, security.stakeholder.terminationDate, date);
    const pool = vest.unvested + vest.forfeited;
    const accelerated = parsed.data.mode === "ALL" ? pool : Math.floor((pool * Math.min(100, Math.max(0, parsed.data.percent ?? 0))) / 100);
    if (accelerated <= 0) return fail("There are no unvested shares to accelerate.");
    const existing = parseJson<AccelerationOverride | null>(security.accelerationOverride, null);
    const override: AccelerationOverride = { acceleratedAt: date.toISOString(), shares: (existing?.shares ?? 0) + accelerated, reason: parsed.data.reason };
    await db.$transaction([
      db.security.update({ where: { id: security.id }, data: { accelerationOverride: JSON.stringify(override) } }),
      db.transaction.create({ data: { companyId: C, type: "ACCELERATION", securityId: security.id, toStakeholderId: security.stakeholderId, quantity: accelerated, effectiveDate: date, notes: parsed.data.reason ?? `Accelerated vesting of ${Math.round(accelerated).toLocaleString()} shares`, metadata: JSON.stringify({ mode: parsed.data.mode, percent: parsed.data.percent ?? null }), createdById: ctx.user.id } }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `Accelerated vesting of ${Math.round(accelerated).toLocaleString()} shares on ${security.certificateNumber} (${security.stakeholder.name})${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`, before: existing, after: override });
    done(C);
    return ok(undefined, `Accelerated ${Math.round(accelerated).toLocaleString()} shares.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function modifySecurity(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, ptepMonths: zNumOpt, expirationDate: zDateOpt, exercisePrice: zNumOpt, effectiveDate: zDate, reason: zStr }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const data: Record<string, unknown> = {};
    if (parsed.data.ptepMonths !== undefined && parsed.data.ptepMonths !== security.ptepMonths) {
      changes.ptepMonths = { from: security.ptepMonths, to: parsed.data.ptepMonths };
      data.ptepMonths = parsed.data.ptepMonths;
    }
    if (parsed.data.expirationDate && parsed.data.expirationDate.getTime() !== security.expirationDate?.getTime()) {
      changes.expirationDate = { from: security.expirationDate, to: parsed.data.expirationDate };
      data.expirationDate = parsed.data.expirationDate;
    }
    if (parsed.data.exercisePrice !== undefined && parsed.data.exercisePrice !== security.exercisePrice) {
      changes.exercisePrice = { from: security.exercisePrice, to: parsed.data.exercisePrice };
      data.exercisePrice = parsed.data.exercisePrice;
    }
    if (!Object.keys(changes).length) return fail("Nothing changed.");
    const repricing = "exercisePrice" in changes;
    await db.$transaction([
      db.security.update({ where: { id: security.id }, data: { ...data, notes: `${security.notes ? security.notes + "\n" : ""}Modified ${parsed.data.effectiveDate.toISOString().slice(0, 10)}: ${parsed.data.reason}` } }),
      db.transaction.create({ data: { companyId: C, type: repricing ? "REPRICING" : "MODIFICATION", securityId: security.id, toStakeholderId: security.stakeholderId, quantity: security.quantity - security.exercisedQuantity - security.cancelledQuantity, pricePerShare: repricing ? parsed.data.exercisePrice : null, effectiveDate: parsed.data.effectiveDate, notes: parsed.data.reason, metadata: JSON.stringify(changes), createdById: ctx.user.id } }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `${repricing ? "Repriced" : "Modified"} ${security.certificateNumber} (${security.stakeholder.name}): ${Object.keys(changes).join(", ")} — ${parsed.data.reason}`, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) });
    done(C);
    return ok(undefined, repricing ? "Grant repriced. ASC 718 modification accounting applies." : "Grant terms updated.");
  } catch (e) {
    return errorResult(e);
  }
}

export async function mark83bFiled(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, filedDate: zDate }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    await db.security.update({ where: { id: security.id }, data: { election83bFiledDate: parsed.data.filedDate } });
    const rec = await db.complianceRecord.findFirst({ where: { companyId: C, type: "ELECTION_83B", referenceId: security.id } });
    if (rec) await db.complianceRecord.update({ where: { id: rec.id }, data: { status: "FILED", completedAt: parsed.data.filedDate } });
    else await db.complianceRecord.create({ data: { companyId: C, type: "ELECTION_83B", referenceId: security.id, status: "FILED", dueDate: security.election83bDeadline, completedAt: parsed.data.filedDate, data: JSON.stringify({ stakeholder: security.stakeholder.name, certificateNumber: security.certificateNumber }) } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `Marked 83(b) election filed for ${security.certificateNumber} (${security.stakeholder.name}) on ${parsed.data.filedDate.toISOString().slice(0, 10)}` });
    done(C);
    return ok(undefined, "83(b) election recorded as filed.");
  } catch (e) {
    return errorResult(e);
  }
}

export async function resendForSignature(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object(base), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    const doc = await db.document.findFirst({ where: { companyId: C, securityId: security.id, type: { in: ["OPTION_AGREEMENT", "GRANT_AGREEMENT", "SAFE", "CONVERTIBLE_NOTE", "CERTIFICATE"] } }, orderBy: { createdAt: "desc" } });
    if (!doc) return fail("No agreement document exists for this security. Regenerate it from the documents page first.");
    const investorRole = isConvertible(security.type) || security.type === "PREFERRED_SHARES" ? "INVESTOR" : "HOLDER";
    await db.$transaction([
      db.signature.deleteMany({ where: { documentId: doc.id } }),
      db.document.update({ where: { id: doc.id }, data: { signatureStatus: "PENDING", signatures: { create: [{ name: ctx.user.name, email: ctx.user.email, role: "COMPANY", status: "PENDING", sortOrder: 0 }, { name: security.stakeholder.name, email: security.stakeholder.email ?? "", role: investorRole, status: "PENDING", sortOrder: 1, stakeholderId: security.stakeholderId }] } } }),
      db.security.update({ where: { id: security.id }, data: { status: "PENDING_SIGNATURE" } }),
      db.notification.create({ data: { companyId: C, stakeholderId: security.stakeholderId, userId: security.stakeholder.userId, type: "TASK", title: `Reminder: sign your ${label(security.type)} agreement (${security.certificateNumber})`, body: doc.name, link: `/portal/${C}/documents` } }),
    ]);
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `Re-sent ${doc.name} to ${security.stakeholder.name} for signature` });
    done(C);
    return ok(undefined, `Sent to ${security.stakeholder.name} for signature.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function convertSecurity(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object({ ...base, shareClassId: zStr, conversionPrice: zNum, effectiveDate: zDate, notes: zStrOpt }), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, info, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!isConvertible(security.type)) return fail("Only SAFEs and convertible notes can be converted.");
    if (security.status !== "OUTSTANDING") return fail("This instrument is no longer outstanding.");
    const cls = await db.shareClass.findFirst({ where: { id: parsed.data.shareClassId, companyId: C } });
    if (!cls) return fail("Select the share class to convert into.");
    const date = parsed.data.effectiveDate;
    const price = parsed.data.conversionPrice;
    if (price <= 0) return fail("Conversion price must be greater than zero.");
    const interest = accruedInterest({ id: security.id, type: security.type, stakeholderId: security.stakeholderId, principal: security.totalAmount ?? 0, interestRate: security.interestRate, interestType: security.interestType, issueDate: security.issueDate }, date);
    const amount = (security.totalAmount ?? 0) + interest;
    const sharesOut = Math.floor(amount / price);
    if (sharesOut <= 0) return fail("The conversion would produce zero shares; check the price.");
    const certs = (await db.security.findMany({ where: { companyId: C }, select: { certificateNumber: true } })).map((s) => s.certificateNumber);
    const cert = nextCertificateNumber(cls.prefix, certs);
    await db.$transaction(async (tx) => {
      const shares = await tx.security.create({
        data: { companyId: C, stakeholderId: security.stakeholderId, type: cls.type === "PREFERRED" ? "PREFERRED_SHARES" : "COMMON_SHARES", certificateNumber: cert, shareClassId: cls.id, quantity: sharesOut, pricePerShare: price, fmvAtGrant: price, totalAmount: amount, issueDate: date, grantDate: date, boardApprovalDate: date, status: "OUTSTANDING", notes: `Issued on conversion of ${security.certificateNumber}${interest > 0 ? ` (including $${interest.toFixed(2)} accrued interest)` : ""}.${parsed.data.notes ? ` ${parsed.data.notes}` : ""}` },
      });
      await tx.transaction.create({ data: { companyId: C, type: "CONVERSION", securityId: security.id, toStakeholderId: security.stakeholderId, quantity: sharesOut, pricePerShare: price, totalAmount: amount, effectiveDate: date, notes: `${security.certificateNumber} converted into ${sharesOut.toLocaleString()} ${cls.name} (${cert})`, createdById: ctx.user.id } });
      await tx.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: shares.id, toStakeholderId: security.stakeholderId, quantity: sharesOut, pricePerShare: price, totalAmount: amount, effectiveDate: date, notes: `Issued ${cert} on conversion of ${security.certificateNumber}`, createdById: ctx.user.id } });
      await tx.security.update({ where: { id: security.id }, data: { status: "CONVERTED", notes: `${security.notes ? security.notes + "\n" : ""}Converted into ${sharesOut.toLocaleString()} shares of ${cls.name} (${cert}) at $${price} on ${date.toISOString().slice(0, 10)}.` } });
      const content = shareCertificate({ company: info, certificateNumber: cert, holderName: security.stakeholder.name, shares: sharesOut, className: cls.name, parValue: cls.parValue, issueDate: date, pricePerShare: price });
      await tx.document.create({ data: { companyId: C, name: `${cert} — Stock certificate`, folder: `Securities/${cert}`, type: "CERTIFICATE", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: shares.id, stakeholderId: security.stakeholderId, uploadedById: ctx.user.id, visibility: "HOLDER" } });
    });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: security.id, summary: `Converted ${security.certificateNumber} ($${amount.toLocaleString()}) into ${sharesOut.toLocaleString()} ${cls.name} (${cert}) at $${price}`, after: { shares: sharesOut, price, amount, accruedInterest: interest } });
    done(C);
    return ok(undefined, `Converted into ${sharesOut.toLocaleString()} ${cls.name}.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteDraft(_p: R | undefined, formData: FormData): Promise<R> {
  const parsed = parseForm(z.object(base), formData);
  if (parsed.error) return parsed.error;
  try {
    const { ctx, security, C } = await load(parsed.data.companyId, parsed.data.securityId);
    if (!["DRAFT", "PENDING_SIGNATURE"].includes(security.status)) return fail("Only drafts and unsigned securities can be deleted. Cancel it instead.");
    if (security.transactions.some((t) => t.type !== "ISSUANCE")) return fail("This security has ledger activity and cannot be deleted. Cancel it instead.");
    await logAudit({ companyId: C, userId: ctx.user.id, action: "DELETE", entityType: "Security", entityId: security.id, summary: `Deleted unsigned ${label(security.type)} ${security.certificateNumber} for ${security.stakeholder.name}`, before: { certificateNumber: security.certificateNumber, quantity: security.quantity, type: security.type } });
    await db.$transaction([
      db.document.deleteMany({ where: { securityId: security.id } }),
      db.transaction.deleteMany({ where: { securityId: security.id } }),
      db.exerciseRequest.deleteMany({ where: { securityId: security.id } }),
      db.complianceRecord.deleteMany({ where: { companyId: C, referenceId: security.id } }),
      db.consentExhibit.updateMany({ where: { securityId: security.id }, data: { securityId: null } }),
      db.security.delete({ where: { id: security.id } }),
    ]);
    done(C);
    return ok(undefined, `Deleted ${security.certificateNumber}.`);
  } catch (e) {
    return errorResult(e);
  }
}
