"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor, requireWorkspace } from "@/lib/auth";
import { fail, ok, parseForm, zJson, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const scenarioSchema = z.object({
  companyId: zStr,
  id: zStrOpt,
  name: zStr,
  type: z.enum(["HIRING", "REFRESH", "POOL_FORECAST"]),
  description: zStrOpt,
  params: zJson(z.record(z.string(), z.unknown())),
  results: zJson(z.record(z.string(), z.unknown())).optional(),
});

export async function saveScenario(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { data, error } = parseForm(scenarioSchema, formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const C = ctx.company.id;
  const payload = {
    name: data.name,
    type: data.type,
    description: data.description ?? null,
    params: JSON.stringify(data.params),
    results: data.results ? JSON.stringify(data.results) : null,
  };
  let id: string;
  if (data.id) {
    const existing = await db.scenario.findFirst({ where: { id: data.id, companyId: C } });
    if (!existing) return fail("Scenario not found.");
    await db.scenario.update({ where: { id: existing.id }, data: payload });
    id = existing.id;
  } else {
    const created = await db.scenario.create({ data: { ...payload, companyId: C, createdById: ctx.user.id } });
    id = created.id;
  }
  await logAudit({ companyId: C, userId: ctx.user.id, action: data.id ? "UPDATE" : "CREATE", entityType: "Scenario", entityId: id, summary: `${data.id ? "Updated" : "Saved"} ${data.type.toLowerCase().replace("_", " ")} scenario “${data.name}”` });
  revalidatePath(`/app/${C}/employees`);
  return ok({ id }, `Scenario “${data.name}” saved`);
}

export async function deleteScenario(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { data, error } = parseForm(z.object({ companyId: zStr, id: zStr }), formData);
  if (error) return error;
  const ctx = await requireEditor(data.companyId);
  const existing = await db.scenario.findFirst({ where: { id: data.id, companyId: ctx.company.id } });
  if (!existing) return fail("Scenario not found.");
  await db.scenario.delete({ where: { id: existing.id } });
  await logAudit({ companyId: ctx.company.id, userId: ctx.user.id, action: "DELETE", entityType: "Scenario", entityId: existing.id, summary: `Deleted scenario “${existing.name}”` });
  revalidatePath(`/app/${ctx.company.id}/employees`);
  return ok(undefined, "Scenario deleted");
}

export async function syncHris(_prev: ActionResult<{ discrepancies: string[] }> | undefined, formData: FormData): Promise<ActionResult<{ discrepancies: string[] }>> {
  const { data, error } = parseForm(z.object({ companyId: zStr, provider: zStr }), formData);
  if (error) return error;
  const ctx = await requireWorkspace(data.companyId);
  const C = ctx.company.id;
  const integration = await db.integration.findFirst({ where: { companyId: C, provider: data.provider } });
  if (!integration || integration.status !== "CONNECTED") return fail("This integration is not connected. Connect it under Settings → Integrations.");
  const stakeholders = await db.stakeholder.findMany({ where: { companyId: C, relationship: { in: ["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER"] } } });
  const discrepancies: string[] = [];
  for (const s of stakeholders) {
    if (s.employmentStatus === "ACTIVE" && s.terminationDate) discrepancies.push(`${s.name}: marked active but has a termination date (${s.terminationDate.toISOString().slice(0, 10)}).`);
    if (s.relationship === "EMPLOYEE" && !s.startDate) discrepancies.push(`${s.name}: employee without a start date.`);
    if (s.relationship === "FORMER_EMPLOYEE" && !s.terminationDate) discrepancies.push(`${s.name}: former employee without a termination date.`);
    if (s.relationship === "EMPLOYEE" && s.employmentStatus === "TERMINATED") discrepancies.push(`${s.name}: terminated status but still an employee — update relationship.`);
  }
  const config = (() => {
    try {
      return JSON.parse(integration.config) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  await db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), status: "CONNECTED", config: JSON.stringify({ ...config, employeesSynced: stakeholders.filter((s) => s.employmentStatus === "ACTIVE").length, lastDiscrepancies: discrepancies.length }) } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Integration", entityId: integration.id, summary: `Ran ${data.provider} sync — ${stakeholders.length} records checked, ${discrepancies.length} discrepancies` });
  revalidatePath(`/app/${C}/employees`);
  return ok({ discrepancies }, discrepancies.length ? `Sync complete — ${discrepancies.length} discrepanc${discrepancies.length === 1 ? "y" : "ies"} found` : "Sync complete — HRIS and cap table agree");
}
