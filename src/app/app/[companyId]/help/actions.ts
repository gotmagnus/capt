"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { ok, parseForm, zStr, type ActionResult } from "@/lib/actions";

export async function contactSupport(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, subject: zStr, message: zStr }), formData);
  if (error) return error;
  const ctx = await requireCompany(data.companyId);
  await db.notification.create({ data: { companyId: ctx.company.id, userId: ctx.user.id, type: "INFO", title: `Support request: ${data.subject}`, body: `${ctx.user.name} <${ctx.user.email}>: ${data.message}`, status: "OPEN" } });
  return ok(undefined, "Message sent — we'll be in touch");
}
