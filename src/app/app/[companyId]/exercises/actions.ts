"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { exercisableForSecurity } from "@/lib/people-data";
import { fail, ok, parseForm, zDate, zNum, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const schema = z.object({
  companyId: zStr,
  securityId: zStr,
  quantity: zNum.positive(),
  method: z.enum(["ACH", "WIRE", "CHECK", "CASHLESS", "NET_EXERCISE"]),
  date: zDate,
  notes: zStrOpt,
});

/** Records an exercise on behalf of a holder (e.g. a paper exercise notice) as an approved request. */
export async function recordExercise(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(schema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  const [capTable, valuation] = await Promise.all([loadCapTable(C), currentValuation(C)]);
  const security = capTable.securities.find((s) => s.id === data.securityId);
  if (!security) return fail("Grant not found.");
  if (!["OPTION_ISO", "OPTION_NSO", "WARRANT"].includes(security.type)) return fail("Only options and warrants can be exercised.");
  const exercisable = exercisableForSecurity(capTable, security.id, data.date);
  if (data.quantity > exercisable) return fail(`Only ${exercisable.toLocaleString()} shares are vested and unexercised on that date.`, { quantity: `Max ${exercisable.toLocaleString()}` });
  const exercisePrice = security.exercisePrice ?? 0;
  const created = await db.exerciseRequest.create({
    data: {
      companyId: C,
      securityId: security.id,
      stakeholderId: security.stakeholderId,
      quantity: data.quantity,
      exercisePrice,
      totalCost: data.quantity * exercisePrice,
      fmvAtExercise: valuation?.fairMarketValue ?? security.fmvAtGrant ?? null,
      isIso: security.type === "OPTION_ISO",
      method: data.method,
      status: "APPROVED",
      requestedAt: data.date,
      approvedAt: data.date,
      notes: data.notes ?? `Recorded by ${ctx.user.name}`,
    },
  });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "ExerciseRequest", entityId: created.id, summary: `Recorded exercise of ${data.quantity.toLocaleString()} ${security.type === "OPTION_ISO" ? "ISOs" : security.type === "OPTION_NSO" ? "NSOs" : "warrants"} (${security.certificateNumber}) for ${security.stakeholder.name}` });
  revalidatePath(`/app/${C}/exercises`);
  return ok({ id: created.id }, "Exercise recorded — mark payment received to issue shares");
}
