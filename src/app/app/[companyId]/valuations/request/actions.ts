"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor } from "@/lib/auth";
import { ok, parseForm, zDate, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const schema = z.object({
  companyId: zStr,
  purpose: z.enum(["ANNUAL", "MATERIAL_EVENT", "FINANCING", "INITIAL"]),
  valuationDate: zDate,
  provider: zStrOpt,
  revenueTtm: zNumOpt,
  revenueForward: zNumOpt,
  cashBalance: zNumOpt,
  burnMonthly: zNumOpt,
  headcount: zNumOpt,
  totalDebt: zNumOpt,
  materialEvents: zStrOpt,
  recentFinancing: zStrOpt,
  expectedLiquidity: zStrOpt,
  notes: zStrOpt,
});

export async function requestValuation(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const ctx = await requireEditor(d.companyId);
  const C = ctx.company.id;
  const intake = {
    revenueTtm: d.revenueTtm ?? null,
    revenueForward: d.revenueForward ?? null,
    cashBalance: d.cashBalance ?? null,
    burnMonthly: d.burnMonthly ?? null,
    headcount: d.headcount ?? null,
    totalDebt: d.totalDebt ?? null,
    materialEvents: d.materialEvents ?? null,
    recentFinancing: d.recentFinancing ?? null,
    expectedLiquidity: d.expectedLiquidity ?? null,
    submittedBy: ctx.user.name,
    submittedAt: new Date().toISOString(),
  };
  const valuation = await db.valuation.create({
    data: { companyId: C, status: "REQUESTED", purpose: d.purpose, valuationDate: d.valuationDate, provider: d.provider || "Capt Valuations", intake: JSON.stringify(intake), notes: d.notes ?? null },
  });
  await db.notification.create({ data: { companyId: C, type: "INFO", title: "409A valuation requested", body: `${ctx.user.name} requested a ${d.purpose.toLowerCase().replace("_", " ")} valuation as of ${d.valuationDate.toLocaleDateString("en-US")}. Expect a draft within 3–5 business days.`, link: `/app/${C}/valuations/${valuation.id}` } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Valuation", entityId: valuation.id, summary: `Requested ${d.purpose.toLowerCase().replace("_", " ")} 409A valuation as of ${d.valuationDate.toISOString().slice(0, 10)}`, after: intake });
  revalidatePath(`/app/${C}/valuations`);
  return ok({ id: valuation.id }, "Valuation requested");
}
