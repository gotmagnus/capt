"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auth";
import { fail, ok, parseForm, zBool, zDateOpt, zNum, zNumOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { editorContext } from "@/lib/captable-actions";

const schema = z.object({
  companyId: zStr,
  id: zStrOpt,
  name: zStr.max(80),
  prefix: zStr.max(12).regex(/^[A-Z0-9-]+$/i, "Letters, numbers and dashes only"),
  type: z.enum(["COMMON", "PREFERRED"]),
  authorizedShares: zNum.positive(),
  parValue: zNum.min(0).default(0.0001),
  originalIssuePrice: zNumOpt,
  liquidationMultiple: zNum.min(0).default(1),
  participating: zBool.default(false),
  participationCap: zNumOpt,
  seniority: z.coerce.number().int().min(1).default(1),
  conversionRatio: zNum.positive().default(1),
  dividendRate: zNumOpt,
  dividendType: z.enum(["NON_CUMULATIVE", "CUMULATIVE", "NONE"]).default("NON_CUMULATIVE"),
  antiDilution: z.enum(["NONE", "BROAD_BASED", "NARROW_BASED", "FULL_RATCHET"]).default("BROAD_BASED"),
  votesPerShare: zNum.min(0).default(1),
  boardApprovalDate: zDateOpt,
});

export async function saveShareClass(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const { ctx, error } = await editorContext(d.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const isCommon = d.type === "COMMON";
  const data = {
    name: d.name,
    prefix: d.prefix.toUpperCase(),
    type: d.type,
    authorizedShares: d.authorizedShares,
    parValue: d.parValue,
    originalIssuePrice: isCommon ? null : d.originalIssuePrice ?? null,
    liquidationMultiple: isCommon ? 1 : d.liquidationMultiple,
    participating: isCommon ? false : d.participating,
    participationCap: isCommon || !d.participating ? null : d.participationCap ?? null,
    seniority: isCommon ? 99 : d.seniority,
    conversionRatio: isCommon ? 1 : d.conversionRatio,
    dividendRate: isCommon ? null : d.dividendRate ?? null,
    dividendType: isCommon ? "NONE" : d.dividendType,
    antiDilution: isCommon ? "NONE" : d.antiDilution,
    votesPerShare: d.votesPerShare,
    boardApprovalDate: d.boardApprovalDate ?? null,
  };
  const dup = await db.shareClass.findFirst({ where: { companyId: C, prefix: data.prefix, NOT: d.id ? { id: d.id } : undefined } });
  if (dup) return fail(`Prefix ${data.prefix} is already used by ${dup.name}.`, { prefix: "Already in use" });

  if (d.id) {
    const before = await db.shareClass.findFirst({ where: { id: d.id, companyId: C }, include: { _count: { select: { securities: true } } } });
    if (!before) return fail("Share class not found.");
    if (before._count.securities > 0 && before.type !== data.type) return fail("The type of a share class with issued securities can't be changed.");
    const issued = await db.security.aggregate({ where: { shareClassId: before.id, status: { in: ["OUTSTANDING", "EXERCISED"] }, type: { in: ["COMMON_SHARES", "PREFERRED_SHARES", "RSA"] } }, _sum: { quantity: true } });
    if ((issued._sum.quantity ?? 0) > data.authorizedShares) return fail(`Authorized shares can't be below the ${Math.round(issued._sum.quantity ?? 0).toLocaleString()} already issued.`, { authorizedShares: "Below issued" });
    const after = await db.shareClass.update({ where: { id: before.id }, data });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "ShareClass", entityId: after.id, summary: `Updated share class ${after.name}`, before, after });
    revalidatePath(`/app/${C}/share-classes`);
    revalidatePath(`/app/${C}/cap-table`);
    return ok({ id: after.id }, "Share class updated");
  }
  const created = await db.shareClass.create({ data: { ...data, companyId: C } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "ShareClass", entityId: created.id, summary: `Created share class ${created.name} (${created.prefix}) with ${Math.round(created.authorizedShares).toLocaleString()} authorized shares`, after: created });
  revalidatePath(`/app/${C}/share-classes`);
  revalidatePath(`/app/${C}/cap-table`);
  return ok({ id: created.id }, "Share class created");
}

export async function deleteShareClass(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(z.object({ companyId: zStr, id: zStr }), formData);
  if (parsed.error) return parsed.error;
  const { ctx, error } = await editorContext(parsed.data.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const cls = await db.shareClass.findFirst({ where: { id: parsed.data.id, companyId: C }, include: { _count: { select: { securities: true, equityPlans: true, rounds: true } } } });
  if (!cls) return fail("Share class not found.");
  if (cls._count.securities || cls._count.equityPlans || cls._count.rounds) return fail("This share class is in use by securities, equity plans or rounds and can't be deleted.");
  await db.shareClass.delete({ where: { id: cls.id } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "DELETE", entityType: "ShareClass", entityId: cls.id, summary: `Deleted share class ${cls.name}`, before: cls });
  revalidatePath(`/app/${C}/share-classes`);
  revalidatePath(`/app/${C}/cap-table`);
  return ok(undefined, `${cls.name} deleted`);
}
