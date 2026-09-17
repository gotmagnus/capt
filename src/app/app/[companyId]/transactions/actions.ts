"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auth";
import { fail, ok, parseForm, zDate, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { editorContext } from "@/lib/captable-actions";

const splitSchema = z.object({
  companyId: zStr,
  numerator: z.coerce.number().int().positive(),
  denominator: z.coerce.number().int().positive(),
  effectiveDate: zDate,
  notes: zStrOpt,
});

const SHARE_LIKE = ["COMMON_SHARES", "PREFERRED_SHARES", "RSA", "OPTION_ISO", "OPTION_NSO", "RSU", "WARRANT", "PROFITS_INTEREST"];

/**
 * Records a forward (e.g. 2-for-1) or reverse (e.g. 1-for-10) stock split across every
 * share-denominated record: securities, historical transactions, share classes, plans,
 * valuations, rounds, offers, exercise requests and tender offers.
 */
export async function recordStockSplit(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(splitSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const { ctx, error } = await editorContext(d.companyId);
  if (error) return error;
  const C = ctx.company.id;
  if (d.numerator === d.denominator) return fail("Ratio must change the share count (e.g. 2-for-1 or 1-for-10).", { numerator: "No change" });
  const factor = d.numerator / d.denominator;
  const label = `${d.numerator}-for-${d.denominator} ${factor > 1 ? "forward" : "reverse"} split`;

  const securities = await db.security.findMany({ where: { companyId: C, type: { in: SHARE_LIKE } } });
  const ops: Prisma.PrismaPromise<unknown>[] = securities.map((s) =>
    db.security.update({
      where: { id: s.id },
      data: {
        quantity: Math.round(s.quantity * factor),
        exercisedQuantity: Math.round(s.exercisedQuantity * factor),
        cancelledQuantity: Math.round(s.cancelledQuantity * factor),
        pricePerShare: s.pricePerShare != null ? s.pricePerShare / factor : undefined,
        exercisePrice: s.exercisePrice != null ? s.exercisePrice / factor : undefined,
        fmvAtGrant: s.fmvAtGrant != null ? s.fmvAtGrant / factor : undefined,
      },
    }),
  );
  const shareSecurityIds = securities.map((s) => s.id);
  const txs = await db.transaction.findMany({ where: { companyId: C, securityId: { in: shareSecurityIds } } });
  for (const t of txs) {
    ops.push(db.transaction.update({ where: { id: t.id }, data: { quantity: Math.round(t.quantity * factor), pricePerShare: t.pricePerShare != null ? t.pricePerShare / factor : undefined } }));
  }
  const classes = await db.shareClass.findMany({ where: { companyId: C } });
  for (const c of classes) {
    ops.push(db.shareClass.update({ where: { id: c.id }, data: { authorizedShares: Math.round(c.authorizedShares * factor), parValue: c.parValue / factor, originalIssuePrice: c.originalIssuePrice != null ? c.originalIssuePrice / factor : undefined } }));
  }
  const plans = await db.equityPlan.findMany({ where: { companyId: C } });
  for (const p of plans) ops.push(db.equityPlan.update({ where: { id: p.id }, data: { authorizedShares: Math.round(p.authorizedShares * factor) } }));
  ops.push(db.company.update({ where: { id: C }, data: { authorizedShares: ctx.company.authorizedShares != null ? Math.round(ctx.company.authorizedShares * factor) : undefined, parValue: ctx.company.parValue / factor } }));
  ops.push(db.valuation.updateMany({ where: { companyId: C, fairMarketValue: { not: null } }, data: { fairMarketValue: { divide: factor } } }));
  ops.push(db.valuation.updateMany({ where: { companyId: C, preferredPrice: { not: null } }, data: { preferredPrice: { divide: factor } } }));
  ops.push(db.fundingRound.updateMany({ where: { companyId: C, pricePerShare: { not: null } }, data: { pricePerShare: { divide: factor } } }));
  ops.push(db.fundingRound.updateMany({ where: { companyId: C, optionPoolIncrease: { not: null } }, data: { optionPoolIncrease: { multiply: factor } } }));
  ops.push(db.offerLetter.updateMany({ where: { companyId: C }, data: { equityQuantity: { multiply: factor } } }));
  ops.push(db.offerLetter.updateMany({ where: { companyId: C, strikePrice: { not: null } }, data: { strikePrice: { divide: factor } } }));
  ops.push(db.exerciseRequest.updateMany({ where: { companyId: C }, data: { quantity: { multiply: factor }, exercisePrice: { divide: factor } } }));
  ops.push(db.exerciseRequest.updateMany({ where: { companyId: C, fmvAtExercise: { not: null } }, data: { fmvAtExercise: { divide: factor } } }));
  ops.push(db.tenderOffer.updateMany({ where: { companyId: C }, data: { pricePerShare: { divide: factor }, maxShares: { multiply: factor } } }));
  ops.push(
    db.transaction.create({
      data: {
        companyId: C,
        type: "STOCK_SPLIT",
        quantity: 0,
        effectiveDate: d.effectiveDate,
        createdById: ctx.user.id,
        notes: `${label}${d.notes ? ` — ${d.notes}` : ""}`,
        metadata: JSON.stringify({ ratio: `${d.numerator}:${d.denominator}`, factor, securitiesAdjusted: securities.length, transactionsAdjusted: txs.length }),
      },
    }),
  );
  await db.$transaction(ops);
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Company", entityId: C, summary: `Recorded ${label} effective ${d.effectiveDate.toISOString().slice(0, 10)}: ${securities.length} securities and ${txs.length} transactions adjusted`, after: { ratio: `${d.numerator}:${d.denominator}` } });
  for (const p of ["transactions", "cap-table", "securities", "share-classes", "equity-plans", "stakeholders", "valuations", "fundraising", "dashboard"]) revalidatePath(`/app/${C}/${p}`);
  return ok(undefined, `${label} recorded across ${securities.length} securities.`);
}
