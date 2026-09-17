import { addDays, addYears } from "date-fns";
import { db } from "@/lib/db";
import { buildCapTable, nextCertificateNumber } from "@/lib/equity/captable";
import { isoLimitCheck } from "@/lib/equity/compliance";
import type { VestingScheduleInput } from "@/lib/equity/vesting";
import { convertibleNote, election83b, optionGrantNotice, safeAgreement, shareCertificate, vestingDescription } from "@/lib/documents/templates";
import { rsuAwardNotice, warrantCertificate } from "@/lib/securities-docs";
import { certPrefixFor } from "@/lib/securities-utils";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";

export interface IssueActor {
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
}

export type TermValue = string | number | boolean | null | undefined;

export interface IssueInput {
  type: SecurityType;
  stakeholderId?: string | null;
  newHolder?: { name?: string; email?: string; relationship?: string } | null;
  terms: Record<string, TermValue>;
  generateDocument: boolean;
  sendForSignature: boolean;
  splitIso?: boolean;
}

export interface IssueResult {
  id: string;
  certificateNumber: string;
  splitId?: string;
  splitCertificateNumber?: string;
}

export class IssueError extends Error {}

const num = (v: TermValue) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const dateOf = (v: TermValue) => {
  if (v === undefined || v === null || v === "" || typeof v === "boolean") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const bool = (v: TermValue) => v === true || v === "true" || v === "on" || v === 1 || v === "1";
const str = (v: TermValue) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function requireNum(v: TermValue, label: string, opts: { min?: number; allowZero?: boolean } = {}) {
  const n = num(v);
  if (n === undefined) throw new IssueError(`${label} is required.`);
  if (opts.min !== undefined && n < opts.min) throw new IssueError(`${label} must be at least ${opts.min}.`);
  if (!opts.allowZero && n <= 0) throw new IssueError(`${label} must be greater than zero.`);
  return n;
}
function requireDate(v: TermValue, label: string) {
  const d = dateOf(v);
  if (!d) throw new IssueError(`${label} is required.`);
  return d;
}

/**
 * Issues a security: creates the row, its issuance transaction, generated documents,
 * signature requests, a holder notification and an audit entry. Throws IssueError for
 * validation problems. Returns the new security id (and the NSO split id for ISO grants
 * that exceed the $100K limit when `splitIso` is set).
 */
export async function createIssuance(actor: IssueActor, input: IssueInput): Promise<IssueResult> {
  const C = actor.companyId;
  const company = await db.company.findUniqueOrThrow({ where: { id: C } });
  const [securities, shareClasses, equityPlans, vestingSchedules, stakeholders] = await Promise.all([
    db.security.findMany({ where: { companyId: C }, include: { stakeholder: true } }),
    db.shareClass.findMany({ where: { companyId: C } }),
    db.equityPlan.findMany({ where: { companyId: C } }),
    db.vestingSchedule.findMany({ where: { companyId: C }, include: { milestones: true } }),
    db.stakeholder.findMany({ where: { companyId: C } }),
  ]);
  const schedules: Record<string, VestingScheduleInput> = Object.fromEntries(vestingSchedules.map((v) => [v.id, { ...v, milestones: v.milestones }]));
  const summary = buildCapTable({ shareClasses, stakeholders, equityPlans, securities, vestingSchedules: schedules });
  const info = { legalName: company.legalName, incorporationState: company.incorporationState, address: company.address };
  const t = input.terms;
  const type = input.type;
  const label = SECURITY_TYPE_LABELS[type] ?? type;

  // ---- holder
  let holder = input.stakeholderId ? stakeholders.find((s) => s.id === input.stakeholderId) ?? null : null;
  if (!holder) {
    const name = input.newHolder?.name?.trim();
    if (!name) throw new IssueError("Select an existing stakeholder or enter a name for a new one.");
    holder = await db.stakeholder.create({
      data: {
        companyId: C,
        name,
        email: input.newHolder?.email?.trim() || null,
        relationship: input.newHolder?.relationship || (type === "SAFE" || type === "CONVERTIBLE_NOTE" || type === "PREFERRED_SHARES" ? "INVESTOR" : "EMPLOYEE"),
        type: "INDIVIDUAL",
      },
    });
  }

  // ---- common fields
  const issueDate = requireDate(t.issueDate ?? t.grantDate, "Issue date");
  const boardApprovalDate = dateOf(t.boardApprovalDate) ?? issueDate;
  const notes = str(t.notes) ?? null;
  const existingCerts = securities.map((s) => s.certificateNumber);
  const isShares = type === "COMMON_SHARES" || type === "PREFERRED_SHARES" || type === "RSA";
  const isOption = type === "OPTION_ISO" || type === "OPTION_NSO";
  const usesPlan = isOption || type === "RSU" || type === "RSA";

  const shareClass = str(t.shareClassId) ? shareClasses.find((c) => c.id === str(t.shareClassId)) : undefined;
  const commonClass = shareClasses.find((c) => c.type === "COMMON");
  const plan = str(t.equityPlanId) ? equityPlans.find((p) => p.id === str(t.equityPlanId)) : undefined;
  const scheduleId = str(t.vestingScheduleId);
  const schedule = scheduleId ? vestingSchedules.find((v) => v.id === scheduleId) : undefined;
  if (scheduleId && !schedule) throw new IssueError("Unknown vesting schedule.");

  const data: Record<string, unknown> = {
    companyId: C,
    stakeholderId: holder.id,
    type,
    issueDate,
    grantDate: issueDate,
    boardApprovalDate,
    notes,
    status: input.sendForSignature ? "PENDING_SIGNATURE" : "OUTSTANDING",
  };
  let prefix = "SEC";
  let quantity = 0;
  let planCheckQuantity = 0;

  if (isShares) {
    if (!shareClass) throw new IssueError("Select a share class.");
    if (type === "PREFERRED_SHARES" && shareClass.type !== "PREFERRED") throw new IssueError("Preferred shares must be issued from a preferred share class.");
    if (type !== "PREFERRED_SHARES" && shareClass.type !== "COMMON") throw new IssueError("Common and restricted shares must be issued from a common share class.");
    quantity = requireNum(t.quantity, "Number of shares");
    const pps = requireNum(t.pricePerShare, "Price per share", { allowZero: true });
    const classTotal = summary.classTotals.find((c) => c.shareClassId === shareClass.id);
    if (classTotal && quantity > classTotal.available + (type === "RSA" && plan ? plan.authorizedShares : 0)) {
      throw new IssueError(`Only ${Math.round(classTotal.available).toLocaleString()} ${shareClass.name} shares are available to issue (authorized ${Math.round(classTotal.authorized).toLocaleString()}, issued ${Math.round(classTotal.issued).toLocaleString()}, reserved ${Math.round(classTotal.reservedForPlans).toLocaleString()}).`);
    }
    prefix = certPrefixFor(type, shareClass.prefix);
    Object.assign(data, {
      shareClassId: shareClass.id,
      quantity,
      pricePerShare: pps,
      totalAmount: pps * quantity,
      fmvAtGrant: num(t.fmvAtGrant) ?? pps,
      legend: str(t.legend) ?? null,
    });
    if (type === "RSA") {
      if (plan) {
        data.equityPlanId = plan.id;
        planCheckQuantity = quantity;
      }
      data.vestingScheduleId = schedule?.id ?? null;
      data.vestingStartDate = dateOf(t.vestingStartDate) ?? issueDate;
      data.repurchaseRight = !!schedule;
      data.election83bDeadline = dateOf(t.election83bDeadline) ?? addDays(issueDate, 30);
    }
  } else if (isOption || type === "RSU") {
    if (!plan) throw new IssueError("Select an equity plan.");
    if (plan.status === "TERMINATED") throw new IssueError("That plan has been terminated; grants cannot be made from it.");
    quantity = requireNum(t.quantity, "Number of shares");
    planCheckQuantity = quantity;
    prefix = certPrefixFor(type);
    Object.assign(data, {
      equityPlanId: plan.id,
      shareClassId: plan.shareClassId,
      vestingScheduleId: schedule?.id ?? null,
      vestingStartDate: dateOf(t.vestingStartDate) ?? issueDate,
      quantity,
      fmvAtGrant: num(t.fmvAtGrant) ?? num(t.exercisePrice) ?? null,
    });
    if (isOption) {
      const strike = requireNum(t.exercisePrice, "Exercise price");
      Object.assign(data, {
        exercisePrice: strike,
        expirationDate: dateOf(t.expirationDate) ?? addYears(issueDate, 10),
        ptepMonths: num(t.ptepMonths) ?? 3,
        earlyExercise: bool(t.earlyExercise),
      });
    }
  } else if (type === "WARRANT") {
    const cls = shareClass ?? commonClass;
    if (!cls) throw new IssueError("Select a share class for the warrant.");
    quantity = requireNum(t.quantity, "Number of warrant shares");
    prefix = certPrefixFor(type);
    Object.assign(data, {
      shareClassId: cls.id,
      quantity,
      exercisePrice: requireNum(t.exercisePrice, "Exercise price", { allowZero: true }),
      expirationDate: dateOf(t.expirationDate) ?? addYears(issueDate, 10),
      vestingScheduleId: schedule?.id ?? null,
      vestingStartDate: schedule ? dateOf(t.vestingStartDate) ?? issueDate : null,
    });
  } else if (type === "SAFE") {
    const amount = requireNum(t.totalAmount, "Purchase amount");
    prefix = certPrefixFor(type);
    Object.assign(data, {
      quantity: 0,
      totalAmount: amount,
      safeType: str(t.safeType) ?? "POST_MONEY",
      valuationCap: num(t.valuationCap) ?? null,
      discountPercent: num(t.discountPercent) ?? null,
      mfn: bool(t.mfn),
      proRataRight: bool(t.proRataRight),
    });
    if (!data.valuationCap && !data.discountPercent && !data.mfn) throw new IssueError("A SAFE needs a valuation cap, a discount, or an MFN clause.");
  } else if (type === "CONVERTIBLE_NOTE") {
    const principal = requireNum(t.totalAmount, "Principal amount");
    prefix = certPrefixFor(type);
    Object.assign(data, {
      quantity: 0,
      totalAmount: principal,
      interestRate: num(t.interestRate) ?? 0,
      interestType: str(t.interestType) ?? "SIMPLE",
      maturityDate: dateOf(t.maturityDate) ?? addYears(issueDate, 2),
      valuationCap: num(t.valuationCap) ?? null,
      discountPercent: num(t.discountPercent) ?? null,
      conversionTrigger: num(t.conversionTrigger) ?? null,
      mfn: bool(t.mfn),
      proRataRight: bool(t.proRataRight),
    });
  } else {
    throw new IssueError(`Unsupported security type ${type}.`);
  }

  if (usesPlan && plan && planCheckQuantity > 0) {
    const ps = summary.plans.find((p) => p.id === plan.id);
    const available = ps ? ps.available : plan.authorizedShares;
    if (planCheckQuantity > available) {
      throw new IssueError(`Only ${Math.round(available).toLocaleString()} shares remain available under ${plan.name}. Increase the plan reserve before granting ${Math.round(planCheckQuantity).toLocaleString()} shares.`);
    }
  }

  // ---- ISO $100K split
  let splitQuantity = 0;
  if (type === "OPTION_ISO" && input.splitIso) {
    const fmv = (data.fmvAtGrant as number | null) ?? (data.exercisePrice as number);
    const existing = securities
      .filter((s) => s.type === "OPTION_ISO" && s.stakeholderId === holder!.id && ["OUTSTANDING", "PENDING_SIGNATURE", "EXERCISED"].includes(s.status))
      .map((s) => ({
        securityId: s.id,
        stakeholderId: s.stakeholderId,
        stakeholderName: holder!.name,
        grantDate: s.grantDate ?? s.issueDate,
        vestingStart: s.vestingStartDate ?? s.issueDate,
        quantity: s.quantity - s.cancelledQuantity,
        fmvAtGrant: s.fmvAtGrant ?? s.exercisePrice ?? 0,
        schedule: s.vestingScheduleId ? schedules[s.vestingScheduleId] : null,
      }));
    const res = isoLimitCheck([
      ...existing,
      { securityId: "new", stakeholderId: holder.id, stakeholderName: holder.name, grantDate: issueDate, vestingStart: data.vestingStartDate as Date, quantity, fmvAtGrant: fmv, schedule: schedule ? schedules[schedule.id] : null },
    ]);
    const excess = res[0]?.years.flatMap((y) => y.grants).filter((g) => g.securityId === "new").reduce((a, g) => a + g.excessShares, 0) ?? 0;
    if (excess > 0 && excess < quantity) splitQuantity = excess;
  }

  const holderRef = holder;
  const result = await db.$transaction(async (tx) => {
    const created: IssueResult[] = [];
    const variants: { type: SecurityType; quantity: number; splitFrom?: string }[] = splitQuantity > 0 ? [{ type: "OPTION_ISO", quantity: quantity - splitQuantity }, { type: "OPTION_NSO", quantity: splitQuantity }] : [{ type, quantity }];
    const certs = [...existingCerts];

    for (const variant of variants) {
      const cert = nextCertificateNumber(prefix, certs);
      certs.push(cert);
      const sec = await tx.security.create({
        data: {
          ...(data as object),
          type: variant.type,
          quantity: variant.quantity,
          totalAmount: isShares ? (data.pricePerShare as number) * variant.quantity : (data.totalAmount as number | undefined) ?? null,
          certificateNumber: cert,
          isoLimitSplitFrom: variant.type === "OPTION_NSO" && splitQuantity > 0 ? created[0]?.id ?? null : null,
        } as never,
      });
      await tx.transaction.create({
        data: {
          companyId: C,
          type: "ISSUANCE",
          securityId: sec.id,
          toStakeholderId: holderRef.id,
          quantity: variant.quantity,
          pricePerShare: (data.pricePerShare as number | undefined) ?? (data.exercisePrice as number | undefined) ?? null,
          totalAmount: (sec.totalAmount as number | null) ?? null,
          effectiveDate: issueDate,
          notes: `Issued ${cert}`,
          createdById: actor.userId,
        },
      });

      if (input.generateDocument) {
        const vd = vestingDescription(schedule ?? null);
        let content: string | null = null;
        let docType = "OTHER";
        let docName = `${cert} — ${label}`;
        if (isShares) {
          content = shareCertificate({ company: info, certificateNumber: cert, holderName: holderRef.name, shares: variant.quantity, className: shareClass!.name, parValue: shareClass!.parValue, issueDate, pricePerShare: data.pricePerShare as number, legend: (data.legend as string | null) ?? undefined });
          docType = "CERTIFICATE";
          docName = `${cert} — Stock certificate`;
        } else if (variant.type === "OPTION_ISO" || variant.type === "OPTION_NSO") {
          content = optionGrantNotice({ company: info, planName: plan!.name, grantNumber: cert, holderName: holderRef.name, type: variant.type, quantity: variant.quantity, exercisePrice: data.exercisePrice as number, grantDate: issueDate, vestingStart: data.vestingStartDate as Date, vestingDescription: vd, expirationDate: data.expirationDate as Date, ptepMonths: data.ptepMonths as number, earlyExercise: data.earlyExercise as boolean });
          docType = "OPTION_AGREEMENT";
          docName = `${cert} — Option grant notice`;
        } else if (variant.type === "RSU") {
          content = rsuAwardNotice({ company: info, planName: plan!.name, awardNumber: cert, holderName: holderRef.name, quantity: variant.quantity, grantDate: issueDate, vestingStart: data.vestingStartDate as Date, vestingDescription: vd });
          docType = "GRANT_AGREEMENT";
          docName = `${cert} — RSU award notice`;
        } else if (variant.type === "WARRANT") {
          const cls = shareClasses.find((c) => c.id === data.shareClassId)!;
          content = warrantCertificate({ company: info, warrantNumber: cert, holderName: holderRef.name, quantity: variant.quantity, className: cls.name, exercisePrice: data.exercisePrice as number, issueDate, expirationDate: data.expirationDate as Date });
          docType = "CERTIFICATE";
          docName = `${cert} — Warrant`;
        } else if (variant.type === "SAFE") {
          content = safeAgreement({ company: info, investorName: holderRef.name, amount: data.totalAmount as number, valuationCap: data.valuationCap as number | null, discountPercent: data.discountPercent as number | null, safeType: data.safeType as string, mfn: data.mfn as boolean, proRata: data.proRataRight as boolean, date: issueDate });
          docType = "SAFE";
          docName = `${cert} — ${data.safeType === "PRE_MONEY" ? "Pre-money" : "Post-money"} SAFE`;
        } else if (variant.type === "CONVERTIBLE_NOTE") {
          content = convertibleNote({ company: info, investorName: holderRef.name, principal: data.totalAmount as number, interestRate: data.interestRate as number, maturityDate: data.maturityDate as Date, valuationCap: data.valuationCap as number | null, discountPercent: data.discountPercent as number | null, qualifiedFinancing: data.conversionTrigger as number | null, date: issueDate });
          docType = "CONVERTIBLE_NOTE";
          docName = `${cert} — Convertible promissory note`;
        }
        if (content) {
          const signerRole = variant.type === "SAFE" || variant.type === "CONVERTIBLE_NOTE" || variant.type === "PREFERRED_SHARES" ? "INVESTOR" : "HOLDER";
          await tx.document.create({
            data: {
              companyId: C,
              name: docName,
              folder: `Securities/${cert}`,
              type: docType,
              mimeType: "text/markdown",
              sizeBytes: Buffer.byteLength(content),
              content,
              securityId: sec.id,
              stakeholderId: holderRef.id,
              uploadedById: actor.userId,
              visibility: "HOLDER",
              signatureStatus: input.sendForSignature ? "PENDING" : "NOT_REQUIRED",
              signatures: input.sendForSignature
                ? {
                    create: [
                      { name: actor.userName, email: actor.userEmail, role: "COMPANY", status: "PENDING", sortOrder: 0 },
                      { name: holderRef.name, email: holderRef.email ?? "", role: signerRole, status: "PENDING", sortOrder: 1, stakeholderId: holderRef.id },
                    ],
                  }
                : undefined,
            },
          });
        }
        if (variant.type === "RSA") {
          await tx.document.create({
            data: {
              companyId: C,
              name: `83(b) election — ${holderRef.name}`,
              folder: "Tax/83(b) elections",
              type: "ELECTION_83B",
              mimeType: "text/markdown",
              content: election83b({ company: info, holderName: holderRef.name, holderAddress: holderRef.address, taxId: holderRef.taxId, shares: variant.quantity, className: shareClass!.name, transferDate: issueDate, fmvPerShare: (data.fmvAtGrant as number) ?? (data.pricePerShare as number), pricePaidPerShare: data.pricePerShare as number, taxYear: issueDate.getFullYear() }),
              securityId: sec.id,
              stakeholderId: holderRef.id,
              uploadedById: actor.userId,
              visibility: "HOLDER",
            },
          });
          await tx.complianceRecord.create({
            data: { companyId: C, type: "ELECTION_83B", referenceId: sec.id, status: "PENDING", dueDate: data.election83bDeadline as Date, data: JSON.stringify({ stakeholder: holderRef.name, certificateNumber: cert, shares: variant.quantity }) },
          });
        }
      }

      await tx.notification.create({
        data: {
          companyId: C,
          stakeholderId: holderRef.id,
          userId: holderRef.userId,
          type: input.sendForSignature ? "TASK" : "INFO",
          title: input.sendForSignature ? `Review and sign your ${SECURITY_TYPE_LABELS[variant.type]} agreement (${cert})` : `${SECURITY_TYPE_LABELS[variant.type]} ${cert} issued to you`,
          body: isShares || isOption || variant.type === "RSU" || variant.type === "WARRANT" ? `${Math.round(variant.quantity).toLocaleString()} ${SECURITY_TYPE_LABELS[variant.type]}${data.exercisePrice ? ` at $${Number(data.exercisePrice).toFixed(2)}` : ""}` : `$${Math.round(data.totalAmount as number).toLocaleString()} ${SECURITY_TYPE_LABELS[variant.type]}`,
          link: `/portal/${C}/holdings`,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: C,
          userId: actor.userId,
          action: "ISSUE",
          entityType: "Security",
          entityId: sec.id,
          summary: `Issued ${cert}: ${isShares || isOption || variant.type === "RSU" || variant.type === "WARRANT" ? `${Math.round(variant.quantity).toLocaleString()} ${SECURITY_TYPE_LABELS[variant.type]}` : `$${Math.round(data.totalAmount as number).toLocaleString()} ${SECURITY_TYPE_LABELS[variant.type]}`} to ${holderRef.name}${input.sendForSignature ? " (sent for signature)" : ""}${variant.splitFrom ? " (ISO $100K split)" : ""}`,
          after: JSON.stringify({ certificateNumber: cert, type: variant.type, quantity: variant.quantity, holder: holderRef.name }),
        },
      });
      created.push({ id: sec.id, certificateNumber: cert });
    }
    return created;
  });

  const [main, split] = result;
  return { id: main.id, certificateNumber: main.certificateNumber, splitId: split?.id, splitCertificateNumber: split?.certificateNumber };
}
