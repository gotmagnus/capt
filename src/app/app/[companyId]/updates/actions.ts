"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const saveSchema = z.object({
  companyId: zStr,
  id: zStrOpt,
  title: zStr,
  body: zStr,
  audience: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string())),
  externalEmails: zStrOpt,
  intent: z.enum(["draft", "publish"]).default("draft"),
});

function parseEmails(raw: string | undefined) {
  return [...new Set((raw ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

export async function saveUpdate(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(saveSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  const emails = parseEmails(data.externalEmails);
  const publish = data.intent === "publish";
  if (publish && data.audience.length === 0 && emails.length === 0) return fail("Choose at least one audience or add an external recipient before publishing.");
  const existing = data.id ? await db.investorUpdate.findFirst({ where: { id: data.id, companyId: C } }) : null;
  if (data.id && !existing) return fail("Update not found.");
  const payload = {
    title: data.title,
    body: data.body,
    audience: JSON.stringify(data.audience),
    externalEmails: JSON.stringify(emails),
    status: publish ? "PUBLISHED" : existing?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    publishedAt: publish ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null,
    publicToken: publish ? existing?.publicToken ?? randomBytes(9).toString("base64url") : existing?.publicToken ?? null,
  };
  const row = existing ? await db.investorUpdate.update({ where: { id: existing.id }, data: payload }) : await db.investorUpdate.create({ data: { ...payload, companyId: C, createdById: ctx.user.id } });
  const firstPublish = publish && existing?.status !== "PUBLISHED";
  if (firstPublish) {
    const recipients = await db.stakeholder.findMany({ where: { companyId: C, relationship: { in: data.audience } } });
    if (recipients.length) {
      await db.notification.createMany({ data: recipients.map((r) => ({ companyId: C, stakeholderId: r.id, userId: r.userId, type: "INFO", title: `New update from ${ctx.company.name}: ${data.title}`, body: data.body.slice(0, 160), link: `/u/${row.publicToken}${r.email ? `?e=${encodeURIComponent(r.email)}` : ""}` })) });
    }
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: existing ? "UPDATE" : "CREATE", entityType: "InvestorUpdate", entityId: row.id, summary: `${firstPublish ? "Published" : existing ? "Updated" : "Drafted"} investor update “${data.title}”${firstPublish ? ` to ${data.audience.map((a) => a.toLowerCase().replace("_", " ")).join(", ")}${emails.length ? ` + ${emails.length} external` : ""}` : ""}` });
  revalidatePath(`/app/${C}/updates`);
  return ok({ id: row.id }, firstPublish ? "Update published" : "Update saved");
}

const idSchema = z.object({ companyId: zStr, id: zStr });

export async function unpublishUpdate(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const row = await db.investorUpdate.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!row) return fail("Update not found.");
  await db.investorUpdate.update({ where: { id: row.id }, data: { status: "DRAFT" } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "UPDATE", entityType: "InvestorUpdate", entityId: row.id, summary: `Unpublished “${row.title}”` });
  revalidatePath(`/app/${ctx.company.id}/updates`);
  return ok(undefined, "Update unpublished — the public link no longer works");
}

export async function deleteUpdate(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const row = await db.investorUpdate.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!row) return fail("Update not found.");
  await db.investorUpdate.delete({ where: { id: row.id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "InvestorUpdate", entityId: row.id, summary: `Deleted update “${row.title}”` });
  revalidatePath(`/app/${ctx.company.id}/updates`);
  return ok(undefined, "Update deleted");
}

export async function sendReminder(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  const row = await db.investorUpdate.findFirst({ where: { id: data.id, companyId: C }, include: { views: true } });
  if (!row || row.status !== "PUBLISHED") return fail("Only published updates can be re-sent.");
  const audience = JSON.parse(row.audience) as string[];
  const recipients = await db.stakeholder.findMany({ where: { companyId: C, relationship: { in: audience } } });
  const viewed = new Set(row.views.map((v) => v.stakeholderId ?? v.email?.toLowerCase()).filter(Boolean));
  const unopened = recipients.filter((r) => !viewed.has(r.id) && !(r.email && viewed.has(r.email.toLowerCase())));
  if (unopened.length) {
    await db.notification.createMany({ data: unopened.map((r) => ({ companyId: C, stakeholderId: r.id, userId: r.userId, type: "INFO", title: `Reminder: ${row.title}`, body: "You haven't opened this update yet.", link: `/u/${row.publicToken}${r.email ? `?e=${encodeURIComponent(r.email)}` : ""}` })) });
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "InvestorUpdate", entityId: row.id, summary: `Sent reminder for “${row.title}” to ${unopened.length} recipients` });
  revalidatePath(`/app/${C}/updates/${row.id}`);
  return ok(undefined, unopened.length ? `Reminder sent to ${unopened.length} recipient${unopened.length === 1 ? "" : "s"}` : "Everyone has already opened this update");
}
