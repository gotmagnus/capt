"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zDate, zDateOpt, zInt, zNum, zStr, type ActionResult } from "@/lib/actions";
import { loadCapTable, currentValuation } from "@/lib/data/captable";
import { election83b, form3921, rule701Disclosure } from "@/lib/documents/templates";
import { nextCertificateNumber } from "@/lib/equity/captable";
import { parseJson } from "@/lib/utils";
import { asc718Assumptions, asc718Report, fiscalPeriod, form3921For, isoLimitFor, rule701For } from "@/lib/governance-compliance";

async function editor(companyId: string) {
  try {
    return await requireEditor(companyId);
  } catch {
    return null;
  }
}

function revalidate(companyId: string) {
  revalidatePath(`/app/${companyId}/compliance`, "layout");
  revalidatePath(`/app/${companyId}/documents`);
  revalidatePath(`/app/${companyId}/dashboard`);
}

// ------------------------------------------------------------------ Rule 701

export async function updateTotalAssets(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ totalAssets: zNum.min(0) }), formData);
  if (error) return error;
  await db.company.update({ where: { id: ctx.company.id }, data: { totalAssets: data.totalAssets } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: ctx.company.id, summary: `Updated total assets for Rule 701 to $${data.totalAssets.toLocaleString()}`, before: { totalAssets: ctx.company.totalAssets }, after: { totalAssets: data.totalAssets } });
  revalidate(ctx.company.id);
  return ok(undefined, "Total assets updated");
}

export async function generateRule701Disclosure(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const data = await loadCapTable(ctx.company.id);
  const val = await currentValuation(ctx.company.id);
  const check = rule701For(data, val?.fairMarketValue ?? null);
  const planName = data.equityPlans[0]?.name ?? "Equity Incentive Plan";
  const content = rule701Disclosure({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState }, asOf: new Date(), planName, totalSalesTwelveMonths: check.totalSalesPrice });
  const doc = await db.document.create({
    data: { companyId: ctx.company.id, name: `Rule 701 disclosure statement — ${new Date().toISOString().slice(0, 10)}`, folder: "Compliance/Rule 701", type: "RULE_701", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, visibility: "HOLDER", uploadedById: ctx.user.id },
  });
  await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "RULE_701_DISCLOSURE", taxYear: new Date().getFullYear(), status: "GENERATED", documentId: doc.id, completedAt: new Date(), data: JSON.stringify({ totalSalesPrice: check.totalSalesPrice, applicableLimit: check.applicableLimit }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "Document", entityId: doc.id, summary: "Generated Rule 701 disclosure statement" });
  revalidate(ctx.company.id);
  return ok(undefined, "Disclosure statement generated");
}

// ------------------------------------------------------------------ ISO $100K

export async function splitIsoExcess(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data: input, error } = parseForm(z.object({ stakeholderId: zStr, year: zInt }), formData);
  if (error) return error;
  const data = await loadCapTable(ctx.company.id);
  const holder = isoLimitFor(data).find((h) => h.stakeholderId === input.stakeholderId);
  const year = holder?.years.find((y) => y.year === input.year);
  if (!holder || !year || year.excessShares <= 0) return fail("No excess ISO shares for this holder and year.");
  const existingCerts = data.securities.map((s) => s.certificateNumber);
  let created = 0;
  for (const g of year.grants.filter((x) => x.excessShares > 0)) {
    const src = data.securities.find((s) => s.id === g.securityId);
    if (!src) continue;
    const already = data.securities.some((s) => s.isoLimitSplitFrom === src.id);
    if (already) continue;
    const cert = nextCertificateNumber("ES", existingCerts);
    existingCerts.push(cert);
    const nso = await db.security.create({
      data: {
        companyId: ctx.company.id,
        stakeholderId: src.stakeholderId,
        type: "OPTION_NSO",
        certificateNumber: cert,
        shareClassId: src.shareClassId,
        equityPlanId: src.equityPlanId,
        vestingScheduleId: src.vestingScheduleId,
        quantity: g.excessShares,
        exercisePrice: src.exercisePrice,
        fmvAtGrant: src.fmvAtGrant,
        issueDate: src.issueDate,
        grantDate: src.grantDate,
        vestingStartDate: src.vestingStartDate,
        expirationDate: src.expirationDate,
        boardApprovalDate: src.boardApprovalDate,
        status: src.status === "EXERCISED" ? "OUTSTANDING" : src.status,
        ptepMonths: src.ptepMonths,
        earlyExercise: src.earlyExercise,
        isoLimitSplitFrom: src.id,
        notes: `Split from ${src.certificateNumber}: ${g.excessShares.toLocaleString()} shares exceed the $100,000 ISO limit for ${year.year} and are treated as NSOs.`,
      },
    });
    await db.security.update({ where: { id: src.id }, data: { quantity: src.quantity - g.excessShares, notes: `${src.notes ? src.notes + " " : ""}${g.excessShares.toLocaleString()} shares reclassified to NSO (${cert}) under IRC §422(d).` } });
    await db.transaction.create({ data: { companyId: ctx.company.id, type: "MODIFICATION", securityId: src.id, toStakeholderId: src.stakeholderId, quantity: g.excessShares, effectiveDate: new Date(), notes: `ISO $100K limit: ${g.excessShares.toLocaleString()} shares of ${src.certificateNumber} reclassified as NSO ${cert}`, metadata: JSON.stringify({ nsoSecurityId: nso.id, year: year.year }) } });
    await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: src.id, summary: `Reclassified ${g.excessShares.toLocaleString()} ISO shares of ${src.certificateNumber} as NSO (${cert}) for the ${year.year} $100K limit`, before: { quantity: src.quantity }, after: { quantity: src.quantity - g.excessShares, nso: cert } });
    created++;
  }
  if (!created) return fail("These grants have already been split.");
  await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "ISO_100K_REVIEW", taxYear: year.year, referenceId: input.stakeholderId, status: "COMPLETED", completedAt: new Date(), data: JSON.stringify({ stakeholderName: holder.stakeholderName, excessShares: year.excessShares, grants: created }) } });
  revalidate(ctx.company.id);
  revalidatePath(`/app/${ctx.company.id}/securities`);
  return ok(undefined, `${created} NSO grant${created === 1 ? "" : "s"} created for the excess`);
}

// ------------------------------------------------------------------ 83(b)

export async function mark83bFiled(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ securityId: zStr, filedDate: zDate }), formData);
  if (error) return error;
  const sec = await db.security.findFirst({ where: { id: data.securityId, companyId: ctx.company.id }, include: { stakeholder: true } });
  if (!sec) return fail("Security not found.");
  await db.security.update({ where: { id: sec.id }, data: { election83bFiledDate: data.filedDate } });
  await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "ELECTION_83B", taxYear: data.filedDate.getFullYear(), referenceId: sec.id, status: "FILED", completedAt: data.filedDate, dueDate: sec.election83bDeadline, data: JSON.stringify({ stakeholderName: sec.stakeholder.name, certificateNumber: sec.certificateNumber }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: sec.id, summary: `83(b) election for ${sec.certificateNumber} (${sec.stakeholder.name}) marked filed on ${data.filedDate.toISOString().slice(0, 10)}` });
  revalidate(ctx.company.id);
  return ok(undefined, "83(b) election marked as filed");
}

export async function generate83bForm(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ securityId: zStr }), formData);
  if (error) return error;
  const sec = await db.security.findFirst({ where: { id: data.securityId, companyId: ctx.company.id }, include: { stakeholder: true, shareClass: true } });
  if (!sec) return fail("Security not found.");
  const val = await db.valuation.findFirst({ where: { companyId: ctx.company.id, status: { in: ["ACCEPTED", "SUPERSEDED"] }, valuationDate: { lte: sec.issueDate } }, orderBy: { valuationDate: "desc" } });
  const fmv = sec.fmvAtGrant ?? val?.fairMarketValue ?? sec.pricePerShare ?? 0;
  const content = election83b({
    company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState },
    holderName: sec.stakeholder.name,
    holderAddress: sec.stakeholder.address,
    taxId: sec.stakeholder.taxId,
    shares: sec.quantity - sec.cancelledQuantity,
    className: sec.shareClass?.name ?? "Common Stock",
    transferDate: sec.issueDate,
    fmvPerShare: fmv,
    pricePaidPerShare: sec.pricePerShare ?? sec.exercisePrice ?? 0,
    taxYear: sec.issueDate.getFullYear(),
  });
  const doc = await db.document.create({
    data: { companyId: ctx.company.id, name: `83(b) election — ${sec.stakeholder.name} (${sec.certificateNumber})`, folder: "Tax/83(b) elections", type: "ELECTION_83B", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: sec.id, stakeholderId: sec.stakeholderId, visibility: "HOLDER", uploadedById: ctx.user.id },
  });
  await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: sec.stakeholderId, type: "DEADLINE", title: `File your 83(b) election for ${sec.certificateNumber}`, body: "Your election form is ready in Documents. It must be postmarked within 30 days of the transfer date.", link: `/portal/${ctx.company.id}/tax`, dueDate: sec.election83bDeadline } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "Document", entityId: doc.id, summary: `Generated 83(b) election form for ${sec.stakeholder.name} (${sec.certificateNumber})` });
  revalidate(ctx.company.id);
  return ok(undefined, "83(b) election form generated");
}

export async function remind83b(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const securityId = String(formData.get("securityId") ?? "");
  const sec = await db.security.findFirst({ where: { id: securityId, companyId: ctx.company.id }, include: { stakeholder: true } });
  if (!sec) return fail("Security not found.");
  await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: sec.stakeholderId, type: "DEADLINE", title: `Reminder: 83(b) election for ${sec.certificateNumber}`, body: `Your election must be postmarked by ${sec.election83bDeadline ? sec.election83bDeadline.toISOString().slice(0, 10) : "the 30-day deadline"}.`, link: `/portal/${ctx.company.id}/tax`, dueDate: sec.election83bDeadline } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Security", entityId: sec.id, summary: `83(b) reminder sent to ${sec.stakeholder.name}` });
  revalidate(ctx.company.id);
  return ok(undefined, `Reminder sent to ${sec.stakeholder.name}`);
}

// ------------------------------------------------------------------ Form 3921

export async function generate3921Forms(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ year: zInt }), formData);
  if (error) return error;
  const { records, complianceRecords, exercises } = await form3921For(ctx.company.id, data.year);
  if (!records.length) return fail(`No ISO exercises in ${data.year}.`);
  let created = 0;
  for (const r of records) {
    const ex = exercises.find((e) => e.id === r.exerciseId);
    if (!ex) continue;
    const existing = complianceRecords.find((c) => c.referenceId === r.exerciseId);
    if (existing?.documentId) continue;
    const content = form3921({ company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState }, ein: ctx.company.ein, taxYear: r.taxYear, employeeName: r.employeeName, employeeAddress: r.employeeAddress, employeeTin: r.employeeTin, grantDate: r.grantDate, exerciseDate: r.exerciseDate, exercisePrice: r.exercisePricePerShare, fmv: r.fmvPerShareOnExercise, shares: r.sharesTransferred });
    const doc = await db.document.create({
      data: { companyId: ctx.company.id, name: `Form 3921 (${r.taxYear}) — ${r.employeeName}`, folder: `Tax/Form 3921/${r.taxYear}`, type: "FORM_3921", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, securityId: ex.securityId, stakeholderId: ex.stakeholderId, visibility: "HOLDER", uploadedById: ctx.user.id },
    });
    if (existing) await db.complianceRecord.update({ where: { id: existing.id }, data: { documentId: doc.id, status: existing.status === "PENDING" ? "GENERATED" : existing.status } });
    else await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "FORM_3921", taxYear: r.taxYear, referenceId: r.exerciseId, status: "GENERATED", dueDate: r.copyBDueDate, documentId: doc.id, data: JSON.stringify({ employee: r.employeeName, shares: r.sharesTransferred }) } });
    await db.notification.create({ data: { companyId: ctx.company.id, stakeholderId: ex.stakeholderId, type: "INFO", title: `Your Form 3921 for ${r.taxYear} is available`, body: "Copy B has been added to your documents for your tax return.", link: `/portal/${ctx.company.id}/tax` } });
    created++;
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "ComplianceRecord", summary: `Generated ${created} Form 3921 Copy B document(s) for tax year ${data.year}` });
  revalidate(ctx.company.id);
  return ok(undefined, created ? `${created} Form 3921 document${created === 1 ? "" : "s"} generated` : "All forms were already generated");
}

export async function mark3921Filed(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ year: zInt, filedDate: zDateOpt }), formData);
  if (error) return error;
  const { records, complianceRecords } = await form3921For(ctx.company.id, data.year);
  const filedAt = data.filedDate ?? new Date();
  for (const r of records) {
    const existing = complianceRecords.find((c) => c.referenceId === r.exerciseId);
    if (existing) await db.complianceRecord.update({ where: { id: existing.id }, data: { status: "FILED", completedAt: filedAt } });
    else await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "FORM_3921", taxYear: r.taxYear, referenceId: r.exerciseId, status: "FILED", dueDate: r.copyADueDate, completedAt: filedAt, data: JSON.stringify({ employee: r.employeeName, shares: r.sharesTransferred }) } });
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "ComplianceRecord", summary: `Marked ${records.length} Form 3921 filing(s) for ${data.year} as filed with the IRS` });
  revalidate(ctx.company.id);
  return ok(undefined, `Form 3921 filings for ${data.year} marked filed`);
}

// ------------------------------------------------------------------ ASC 718

export async function saveAsc718Assumptions(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data, error } = parseForm(z.object({ volatility: zNum.min(0).max(300), riskFreeRate: zNum.min(0).max(50), forfeitureRate: zNum.min(0).max(100), method: z.enum(["STRAIGHT_LINE", "GRADED"]) }), formData);
  if (error) return error;
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  const before = asc718Assumptions(ctx.company);
  settings.asc718 = { volatility: data.volatility / 100, riskFreeRate: data.riskFreeRate / 100, forfeitureRate: data.forfeitureRate / 100, method: data.method };
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify(settings) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: ctx.company.id, summary: "Updated ASC 718 valuation assumptions", before, after: settings.asc718 });
  revalidate(ctx.company.id);
  return ok(undefined, "Assumptions saved");
}

export async function snapshotAsc718(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const ctx = await editor(companyId);
  if (!ctx) return fail("No permission.");
  const { data: input, error } = parseForm(z.object({ fy: zInt, quarter: zInt.optional(), method: z.enum(["STRAIGHT_LINE", "GRADED"]).optional() }), formData);
  if (error) return error;
  const data = await loadCapTable(ctx.company.id);
  const a = asc718Assumptions(ctx.company);
  const period = fiscalPeriod(ctx.company.fiscalYearEnd, input.fy, input.quarter ?? null);
  const report = asc718Report(data, period.start, period.end, a, input.method ?? a.method);
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const content = `# ${ctx.company.legalName}\n## Stock-based compensation expense — ${period.label}\n\n**Method:** ${report.method === "GRADED" ? "Graded (FIN 28)" : "Straight-line"} · **Volatility:** ${(report.assumptions.volatility * 100).toFixed(1)}% · **Risk-free rate:** ${(report.assumptions.riskFreeRate * 100).toFixed(2)}% · **Forfeiture rate:** ${(report.assumptions.forfeitureRate * 100).toFixed(1)}%\n\n| | Amount |\n|---|---|\n| Expense recognized in period | ${fmt(report.periodExpense)} |\n| Cumulative expense recognized | ${fmt(report.cumulativeExpense)} |\n| Unrecognized compensation cost | ${fmt(report.unrecognized)} |\n\n### By department\n\n| Department | Expense |\n|---|---|\n${report.byDepartment.map((d) => `| ${d.department} | ${fmt(d.expense)} |`).join("\n")}\n\n### By award type\n\n| Type | Expense |\n|---|---|\n${report.byType.map((t) => `| ${t.type} | ${fmt(t.expense)} |`).join("\n")}\n\n### By grant\n\n| Holder | Type | Shares | FV/share | Total FV | Period expense | Recognized | Unrecognized |\n|---|---|---|---|---|---|---|---|\n${report.grants.map((g) => `| ${g.stakeholderName} | ${g.type} | ${Math.round(g.quantity).toLocaleString()} | $${g.fairValuePerShare.toFixed(4)} | ${fmt(g.totalFairValue)} | ${fmt(Object.values(g.byPeriod).reduce((x, y) => x + y, 0))} | ${fmt(g.recognizedToDate)} | ${fmt(g.unrecognized)} |`).join("\n")}\n`;
  const doc = await db.document.create({ data: { companyId: ctx.company.id, name: `ASC 718 expense report — ${period.label}`, folder: "Compliance/ASC 718", type: "FINANCIALS", mimeType: "text/markdown", sizeBytes: Buffer.byteLength(content), content, visibility: "COMPANY", uploadedById: ctx.user.id } });
  await db.complianceRecord.create({ data: { companyId: ctx.company.id, type: "ASC_718_REPORT", taxYear: input.fy, status: "GENERATED", completedAt: new Date(), documentId: doc.id, data: JSON.stringify({ period: period.label, method: report.method, periodExpense: report.periodExpense, unrecognized: report.unrecognized }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "Document", entityId: doc.id, summary: `Snapshotted ASC 718 expense report for ${period.label}` });
  revalidate(ctx.company.id);
  return ok(undefined, "Report snapshot saved to Documents");
}
