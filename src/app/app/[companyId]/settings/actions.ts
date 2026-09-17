"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, logAudit, requireCompany, requireEditor, requireUser, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { fail, formToObject, ok, parseForm, zBool, zDateOpt, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { INTEGRATION_PROVIDERS, PLANS, ROLES } from "@/lib/types";
import { parseJson } from "@/lib/utils";
import { toRawRows, validateRows, type ValidatedImportRow } from "@/lib/import-csv";
import { nextCertificateNumber } from "@/lib/equity/captable";

const PREFIX: Record<string, string> = { OPTION_ISO: "ES", OPTION_NSO: "ES", RSU: "RSU", WARRANT: "W", SAFE: "SAFE", CONVERTIBLE_NOTE: "CN", PROFITS_INTEREST: "PI" };

// ------------------------------------------------------------------ company

const companySchema = z.object({
  companyId: zStr,
  name: zStr,
  legalName: zStr,
  entityType: z.enum(["C_CORP", "S_CORP", "LLC", "PBC"]),
  incorporationState: zStr,
  incorporationDate: zDateOpt,
  fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/, "Use MM-DD"),
  ein: zStrOpt,
  website: zStrOpt,
  address: zStrOpt,
  authorizedShares: zNumOpt,
  parValue: zNumOpt,
  totalAssets: zNumOpt,
  stage: z.enum(["PRE_SEED", "SEED", "SERIES_A", "SERIES_B", "SERIES_C_PLUS", "LATE"]),
  currency: z.string().length(3).default("USD"),
});

export async function updateCompany(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(companySchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const { companyId, ...rest } = data;
  const before = ctx.company;
  await db.company.update({ where: { id: companyId }, data: { ...rest, incorporationDate: rest.incorporationDate ?? null, ein: rest.ein ?? null, website: rest.website ?? null, address: rest.address ?? null, authorizedShares: rest.authorizedShares ?? null, parValue: rest.parValue ?? 0.0001, totalAssets: rest.totalAssets ?? null } });
  await logAudit({ companyId, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: companyId, summary: `Updated company profile`, before: { name: before.name, legalName: before.legalName, stage: before.stage }, after: { name: rest.name, legalName: rest.legalName, stage: rest.stage } });
  revalidatePath(`/app/${companyId}`, "layout");
  return ok(undefined, "Company profile saved");
}

// ------------------------------------------------------------------ users

const inviteSchema = z.object({ companyId: zStr, name: zStr, email: z.string().email(), role: z.enum(ROLES), stakeholderId: zStrOpt });

export async function inviteUser(_prev: ActionResult<{ tempPassword: string | null }> | undefined, formData: FormData): Promise<ActionResult<{ tempPassword: string | null }>> {
  const { data, error } = parseForm(inviteSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN" && data.role === "ADMIN") return fail("Only admins can invite other admins.");
  const email = data.email.toLowerCase();
  let user = await db.user.findUnique({ where: { email } });
  let tempPassword: string | null = null;
  if (!user) {
    tempPassword = "welcome123";
    user = await db.user.create({ data: { email, name: data.name, passwordHash: await hashPassword(tempPassword) } });
  }
  const existing = await db.companyMembership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: ctx.company.id } } });
  if (existing) return fail("That person is already a member of this company.");
  await db.companyMembership.create({ data: { userId: user.id, companyId: ctx.company.id, role: data.role } });
  const stakeholder = data.stakeholderId
    ? await db.stakeholder.findFirst({ where: { id: data.stakeholderId, companyId: ctx.company.id } })
    : await db.stakeholder.findFirst({ where: { companyId: ctx.company.id, email, userId: null } });
  if (stakeholder) await db.stakeholder.update({ where: { id: stakeholder.id }, data: { userId: user.id, portalInvitedAt: new Date(), portalAcceptedAt: stakeholder.portalAcceptedAt ?? null } });
  await db.notification.create({ data: { companyId: ctx.company.id, userId: user.id, type: "INFO", title: `Welcome to ${ctx.company.name}`, body: `You were added as ${data.role.toLowerCase()} by ${ctx.user.name}.`, status: "OPEN" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "INVITE", entityType: "CompanyMembership", entityId: user.id, summary: `Invited ${data.name} (${email}) as ${data.role.toLowerCase()}${stakeholder ? ` linked to ${stakeholder.name}` : ""}` });
  revalidatePath(`/app/${ctx.company.id}/settings/users`);
  return ok({ tempPassword }, tempPassword ? `Invited ${data.name}. Temporary password: ${tempPassword}` : `Invited ${data.name}; they can sign in with their existing password.`);
}

export async function changeRole(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, userId: zStr, role: z.enum(ROLES) }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can change roles.");
  const m = await db.companyMembership.findUnique({ where: { userId_companyId: { userId: data.userId, companyId: ctx.company.id } }, include: { user: true } });
  if (!m) return fail("Membership not found.");
  if (m.role === "ADMIN" && data.role !== "ADMIN") {
    const admins = await db.companyMembership.count({ where: { companyId: ctx.company.id, role: "ADMIN" } });
    if (admins <= 1) return fail("A company needs at least one admin.");
  }
  await db.companyMembership.update({ where: { id: m.id }, data: { role: data.role } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "CompanyMembership", entityId: m.id, summary: `Changed ${m.user.name}'s role from ${m.role.toLowerCase()} to ${data.role.toLowerCase()}`, before: { role: m.role }, after: { role: data.role } });
  revalidatePath(`/app/${ctx.company.id}/settings/users`);
  return ok(undefined, "Role updated");
}

export async function removeMember(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, userId: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can remove members.");
  if (data.userId === ctx.user.id) return fail("You can't remove yourself.");
  const m = await db.companyMembership.findUnique({ where: { userId_companyId: { userId: data.userId, companyId: ctx.company.id } }, include: { user: true } });
  if (!m) return fail("Membership not found.");
  await db.companyMembership.delete({ where: { id: m.id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "CompanyMembership", entityId: m.id, summary: `Removed ${m.user.name} from the company` });
  revalidatePath(`/app/${ctx.company.id}/settings/users`);
  return ok(undefined, "Member removed");
}

// ------------------------------------------------------------------ integrations

export async function connectIntegration(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const obj = formToObject(formData);
  const { data, error } = parseForm(z.object({ companyId: zStr, provider: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const provider = INTEGRATION_PROVIDERS.find((p) => p.id === data.provider);
  if (!provider) return fail("Unknown provider");
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (k !== "companyId" && k !== "provider" && v !== undefined) config[k] = v;
  await db.integration.upsert({
    where: { companyId_provider: { companyId: ctx.company.id, provider: provider.id } },
    update: { status: "CONNECTED", connectedAt: new Date(), lastSyncAt: new Date(), config: JSON.stringify(config) },
    create: { companyId: ctx.company.id, provider: provider.id, category: provider.category, status: "CONNECTED", connectedAt: new Date(), lastSyncAt: new Date(), config: JSON.stringify(config) },
  });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Integration", entityId: provider.id, summary: `Connected ${provider.name}` });
  revalidatePath(`/app/${ctx.company.id}/settings/integrations`);
  return ok(undefined, `${provider.name} connected`);
}

export async function disconnectIntegration(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, provider: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  await db.integration.updateMany({ where: { companyId: ctx.company.id, provider: data.provider }, data: { status: "DISCONNECTED", config: "{}" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Integration", entityId: data.provider, summary: `Disconnected ${INTEGRATION_PROVIDERS.find((p) => p.id === data.provider)?.name ?? data.provider}` });
  revalidatePath(`/app/${ctx.company.id}/settings/integrations`);
  return ok(undefined, "Disconnected");
}

export async function syncIntegration(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, provider: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const integ = await db.integration.findUnique({ where: { companyId_provider: { companyId: ctx.company.id, provider: data.provider } } });
  if (!integ || integ.status !== "CONNECTED") return fail("Integration is not connected.");
  const config = parseJson<Record<string, unknown>>(integ.config, {});
  if (integ.category === "HRIS") {
    const employees = await db.stakeholder.count({ where: { companyId: ctx.company.id, relationship: "EMPLOYEE" } });
    config.employeesSynced = employees;
  }
  await db.integration.update({ where: { id: integ.id }, data: { lastSyncAt: new Date(), config: JSON.stringify(config) } });
  await db.notification.create({ data: { companyId: ctx.company.id, type: "INFO", title: `${INTEGRATION_PROVIDERS.find((p) => p.id === data.provider)?.name ?? data.provider} sync completed`, body: "No changes detected.", status: "DONE" } });
  revalidatePath(`/app/${ctx.company.id}/settings/integrations`);
  return ok(undefined, "Sync complete — no changes detected");
}

export async function createApiKey(_prev: ActionResult<{ key: string }> | undefined, formData: FormData): Promise<ActionResult<{ key: string }>> {
  const { data, error } = parseForm(z.object({ companyId: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can manage API keys.");
  const key = `capt_live_${randomBytes(18).toString("hex")}`;
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  settings.apiKey = { prefix: key.slice(0, 16), hash: await hashPassword(key), createdAt: new Date().toISOString(), createdBy: ctx.user.email, scope: "read" };
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify(settings) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "ApiKey", summary: "Generated a read-only API key" });
  revalidatePath(`/app/${ctx.company.id}/settings/integrations`);
  return ok({ key }, "API key generated. Copy it now — it won't be shown again.");
}

export async function revokeApiKey(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can manage API keys.");
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  delete settings.apiKey;
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify(settings) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "ApiKey", summary: "Revoked the API key" });
  revalidatePath(`/app/${ctx.company.id}/settings/integrations`);
  return ok(undefined, "API key revoked");
}

// ------------------------------------------------------------------ billing

export async function changePlan(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, plan: z.enum(["STARTUP", "GROWTH", "ENTERPRISE"]) }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can change the plan.");
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  const invoices = (settings.invoices as unknown[] | undefined) ?? [];
  const plan = PLANS[data.plan];
  if (plan.price) invoices.unshift({ id: `inv_${Date.now().toString(36)}`, date: new Date().toISOString(), description: `${plan.name} plan — annual`, amount: plan.price, status: "PAID" });
  settings.invoices = invoices;
  settings.renewsAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
  await db.company.update({ where: { id: ctx.company.id }, data: { plan: data.plan, settings: JSON.stringify(settings) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: ctx.company.id, summary: `Changed plan from ${ctx.company.plan} to ${data.plan}`, before: { plan: ctx.company.plan }, after: { plan: data.plan } });
  revalidatePath(`/app/${ctx.company.id}/settings/billing`);
  return ok(undefined, `Switched to the ${plan.name} plan`);
}

// ------------------------------------------------------------------ notifications

export async function saveNotificationPrefs(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, digest: z.enum(["NONE", "DAILY", "WEEKLY"]), slack: zBool, events: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string())) }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  settings.notifications = { digest: data.digest, slack: data.slack, events: data.events };
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify(settings) } });
  revalidatePath(`/app/${ctx.company.id}/settings/notifications`);
  return ok(undefined, "Notification preferences saved");
}

// ------------------------------------------------------------------ profile

export async function updateProfile(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, name: zStr, email: z.string().email() }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  const email = data.email.toLowerCase();
  const clash = await db.user.findUnique({ where: { email } });
  if (clash && clash.id !== ctx.user.id) return fail("That email is already in use.");
  await db.user.update({ where: { id: ctx.user.id }, data: { name: data.name, email } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "User", entityId: ctx.user.id, summary: `${data.name} updated their profile` });
  revalidatePath(`/app/${ctx.company.id}`, "layout");
  return ok(undefined, "Profile saved");
}

export async function changePassword(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, current: zStr, next: z.string().min(8, "At least 8 characters"), confirm: zStr }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  if (data.next !== data.confirm) return fail("New passwords don't match.");
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(data.current, user.passwordHash))) return fail("Current password is incorrect.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.next) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "User", entityId: user.id, summary: `${user.name} changed their password` });
  return ok(undefined, "Password changed");
}

export async function signOutOtherSessions(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  const res = await db.session.deleteMany({ where: { userId: ctx.user.id, NOT: current ? { token: current } : undefined } });
  revalidatePath(`/app/${ctx.company.id}/settings/profile`);
  return ok(undefined, `Signed out ${res.count} other session${res.count === 1 ? "" : "s"}`);
}

// ------------------------------------------------------------------ data

export async function deleteCompany(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, confirmName: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (ctx.role !== "ADMIN") return fail("Only admins can delete a company.");
  if (data.confirmName.trim() !== ctx.company.name) return fail(`Type "${ctx.company.name}" exactly to confirm.`);
  await db.company.delete({ where: { id: ctx.company.id } });
  const user = await requireUser();
  const remaining = user.memberships.filter((m) => m.companyId !== ctx.company.id);
  redirect(remaining.length ? "/app" : "/signup");
}

export type ImportPreview = { csv: string; rows: SerializedImportRow[]; missing: string[]; valid: number; invalid: number };
export type SerializedImportRow = Omit<ValidatedImportRow, "issueDate" | "vestingStart"> & { issueDate: string | null; vestingStart: string | null };

async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) return await file.text();
  const text = formData.get("csv");
  return typeof text === "string" ? text : "";
}

async function importContext(companyId: string) {
  const [shareClasses, equityPlans, vestingSchedules, stakeholders] = await Promise.all([
    db.shareClass.findMany({ where: { companyId } }),
    db.equityPlan.findMany({ where: { companyId } }),
    db.vestingSchedule.findMany({ where: { companyId } }),
    db.stakeholder.findMany({ where: { companyId }, select: { id: true, name: true, email: true } }),
  ]);
  return { shareClasses, equityPlans, vestingSchedules, stakeholders };
}

export async function previewImport(_prev: ActionResult<ImportPreview> | undefined, formData: FormData): Promise<ActionResult<ImportPreview>> {
  const { data, error } = parseForm(z.object({ companyId: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const csv = await readCsv(formData);
  if (!csv.trim()) return fail("Choose a CSV file or paste CSV text.");
  if (csv.length > 900_000) return fail("File is too large; split it into batches under 1 MB.");
  const { rows, missing } = toRawRows(csv);
  if (missing.length) return fail(`Missing required columns: ${missing.join(", ")}`);
  if (rows.length === 0) return fail("No data rows found.");
  const validated = validateRows(rows, await importContext(ctx.company.id));
  const serialized = validated.map((r) => ({ ...r, issueDate: r.issueDate?.toISOString() ?? null, vestingStart: r.vestingStart?.toISOString() ?? null }));
  return ok({ csv, rows: serialized, missing, valid: validated.filter((r) => r.errors.length === 0).length, invalid: validated.filter((r) => r.errors.length > 0).length });
}

export async function commitImport(_prev: ActionResult<{ created: number }> | undefined, formData: FormData): Promise<ActionResult<{ created: number }>> {
  const { data, error } = parseForm(z.object({ companyId: zStr, csv: zStr, skipInvalid: zBool.optional() }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const { rows, missing } = toRawRows(data.csv);
  if (missing.length) return fail(`Missing required columns: ${missing.join(", ")}`);
  const context = await importContext(ctx.company.id);
  const validated = validateRows(rows, context);
  const invalid = validated.filter((r) => r.errors.length);
  if (invalid.length && !data.skipInvalid) return fail(`${invalid.length} row${invalid.length === 1 ? "" : "s"} have errors. Fix them or choose "skip invalid rows".`);
  const existingCerts = (await db.security.findMany({ where: { companyId: ctx.company.id }, select: { certificateNumber: true } })).map((s) => s.certificateNumber);
  const stakeholderCache = new Map<string, string>();
  let created = 0;
  for (const r of validated) {
    if (r.errors.length || !r.securityType || !r.issueDate) continue;
    const key = (r.email ?? r.holderName).toLowerCase();
    let stakeholderId = r.existingStakeholderId ?? stakeholderCache.get(key) ?? null;
    if (!stakeholderId) {
      const sh = await db.stakeholder.create({ data: { companyId: ctx.company.id, name: r.holderName, email: r.email, relationship: r.relationship, type: /\b(fund|ventures|capital|partners|l\.?p\.?|llc|inc\.?)\b/i.test(r.holderName) ? "ENTITY" : "INDIVIDUAL" } });
      stakeholderId = sh.id;
      stakeholderCache.set(key, sh.id);
    }
    const isConvertible = r.securityType === "SAFE" || r.securityType === "CONVERTIBLE_NOTE";
    const isOption = r.securityType === "OPTION_ISO" || r.securityType === "OPTION_NSO";
    const cls = r.shareClassId ? context.shareClasses.find((c) => c.id === r.shareClassId) : undefined;
    const prefix = PREFIX[r.securityType] ?? cls?.prefix ?? "CS";
    const certificateNumber = nextCertificateNumber(prefix, existingCerts);
    existingCerts.push(certificateNumber);
    const sec = await db.security.create({
      data: {
        companyId: ctx.company.id,
        stakeholderId,
        type: r.securityType,
        certificateNumber,
        shareClassId: r.shareClassId,
        equityPlanId: r.equityPlanId,
        vestingScheduleId: r.vestingScheduleId,
        quantity: isConvertible ? 0 : r.quantity,
        totalAmount: isConvertible ? r.quantity : r.price != null ? r.price * r.quantity : null,
        pricePerShare: !isOption && !isConvertible && r.securityType !== "WARRANT" ? r.price : null,
        exercisePrice: isOption || r.securityType === "WARRANT" ? r.price : null,
        fmvAtGrant: r.price,
        issueDate: r.issueDate,
        grantDate: r.issueDate,
        vestingStartDate: r.vestingScheduleId ? r.vestingStart ?? r.issueDate : null,
        expirationDate: isOption ? new Date(new Date(r.issueDate).setFullYear(r.issueDate.getFullYear() + 10)) : null,
        status: "OUTSTANDING",
        notes: "Imported from CSV",
      },
    });
    await db.transaction.create({ data: { companyId: ctx.company.id, type: "ISSUANCE", securityId: sec.id, toStakeholderId: stakeholderId, quantity: isConvertible ? 0 : r.quantity, pricePerShare: r.price, totalAmount: isConvertible ? r.quantity : r.price != null ? r.price * r.quantity : null, effectiveDate: r.issueDate, notes: `Imported ${certificateNumber}`, createdById: ctx.user.id } });
    created++;
  }
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "Import", summary: `Imported ${created} securities from CSV${invalid.length ? ` (${invalid.length} rows skipped)` : ""}` });
  revalidatePath(`/app/${ctx.company.id}`, "layout");
  return ok({ created }, `Imported ${created} securities`);
}
