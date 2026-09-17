"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zStr, type ActionResult } from "@/lib/actions";
import { parseJson } from "@/lib/utils";
import { getReport, type ScheduledReport } from "@/lib/reports";

const scheduleSchema = z.object({
  companyId: zStr,
  reportId: zStr,
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]),
  format: z.enum(["csv", "xlsx"]),
  recipients: zStr,
});

export async function addScheduledReport(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(scheduleSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  if (!getReport(data.reportId)) return fail("Unknown report");
  const recipients = data.recipients.split(",").map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));
  if (!recipients.length) return fail("Enter at least one valid email address.");
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  const existing = (settings.scheduledReports as ScheduledReport[] | undefined) ?? [];
  const schedule: ScheduledReport = { id: `sch_${Date.now().toString(36)}`, reportId: data.reportId, frequency: data.frequency, recipients, format: data.format, createdAt: new Date().toISOString() };
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify({ ...settings, scheduledReports: [...existing, schedule] }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "CREATE", entityType: "ScheduledReport", entityId: schedule.id, summary: `Scheduled ${data.frequency.toLowerCase()} ${data.reportId} report to ${recipients.join(", ")}` });
  revalidatePath(`/app/${ctx.company.id}/reports`);
  return ok(undefined, "Schedule added");
}

export async function removeScheduledReport(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, id: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const settings = parseJson<Record<string, unknown>>(ctx.company.settings, {});
  const existing = (settings.scheduledReports as ScheduledReport[] | undefined) ?? [];
  await db.company.update({ where: { id: ctx.company.id }, data: { settings: JSON.stringify({ ...settings, scheduledReports: existing.filter((s) => s.id !== data.id) }) } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "ScheduledReport", entityId: data.id, summary: "Removed a scheduled report" });
  revalidatePath(`/app/${ctx.company.id}/reports`);
  return ok(undefined, "Schedule removed");
}
