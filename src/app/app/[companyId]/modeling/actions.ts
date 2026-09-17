"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requireEditor, requireWorkspace } from "@/lib/auth";
import { fail, ok, parseForm, zStr, zStrOpt, type ActionResult } from "@/lib/actions";

const SCENARIO_TYPES = ["FINANCING", "EXIT", "HIRING", "REFRESH", "POOL_FORECAST"] as const;

const saveSchema = z.object({
  companyId: zStr,
  scenarioId: zStrOpt,
  name: zStr,
  description: zStrOpt,
  type: z.enum(SCENARIO_TYPES),
  params: zStr,
  results: zStrOpt,
});

/** Save-as / create from a FormDialog (name + description + hidden JSON). */
export async function saveScenarioForm(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(saveSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const ctx = await requireWorkspace(d.companyId);
  const C = ctx.company.id;
  try {
    JSON.parse(d.params);
  } catch {
    return fail("Scenario parameters are not valid JSON.");
  }
  if (d.scenarioId) {
    const existing = await db.scenario.findFirst({ where: { id: d.scenarioId, companyId: C } });
    if (!existing) return fail("Scenario not found.");
    await db.scenario.update({ where: { id: existing.id }, data: { name: d.name, description: d.description ?? null, params: d.params, results: d.results ?? null } });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Scenario", entityId: existing.id, summary: `Updated scenario “${d.name}”` });
    revalidatePath(`/app/${C}/modeling`);
    return ok({ id: existing.id }, "Scenario updated");
  }
  const created = await db.scenario.create({ data: { companyId: C, name: d.name, description: d.description ?? null, type: d.type, params: d.params, results: d.results ?? null, createdById: ctx.user.id } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Scenario", entityId: created.id, summary: `Saved ${d.type.toLowerCase()} scenario “${d.name}”` });
  revalidatePath(`/app/${C}/modeling`);
  return ok({ id: created.id }, "Scenario saved");
}

/** Overwrite params/results of an existing scenario (called directly, not via a form). */
export async function updateScenario(companyId: string, scenarioId: string, params: unknown, results?: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const existing = await db.scenario.findFirst({ where: { id: scenarioId, companyId: C } });
  if (!existing) return fail("Scenario not found.");
  await db.scenario.update({ where: { id: existing.id }, data: { params: JSON.stringify(params), results: results === undefined ? existing.results : JSON.stringify(results) } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Scenario", entityId: existing.id, summary: `Updated scenario “${existing.name}”` });
  revalidatePath(`/app/${C}/modeling`);
  return ok({ id: existing.id }, "Scenario updated");
}

export async function deleteScenario(companyId: string, scenarioId: string): Promise<ActionResult> {
  const ctx = await requireEditor(companyId);
  const C = ctx.company.id;
  const existing = await db.scenario.findFirst({ where: { id: scenarioId, companyId: C } });
  if (!existing) return fail("Scenario not found.");
  await db.scenario.delete({ where: { id: existing.id } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "DELETE", entityType: "Scenario", entityId: existing.id, summary: `Deleted scenario “${existing.name}”`, before: existing });
  revalidatePath(`/app/${C}/modeling`);
  return ok(undefined, "Scenario deleted");
}

export async function duplicateScenario(companyId: string, scenarioId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const existing = await db.scenario.findFirst({ where: { id: scenarioId, companyId: C } });
  if (!existing) return fail("Scenario not found.");
  const copy = await db.scenario.create({ data: { companyId: C, name: `${existing.name} (copy)`, description: existing.description, type: existing.type, params: existing.params, results: existing.results, createdById: ctx.user.id } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Scenario", entityId: copy.id, summary: `Duplicated scenario “${existing.name}”` });
  revalidatePath(`/app/${C}/modeling`);
  return ok({ id: copy.id }, "Scenario duplicated");
}
