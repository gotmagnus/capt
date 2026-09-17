"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/auth";
import { fail, ok, parseForm, zJson, zStr, type ActionResult } from "@/lib/actions";
import { createIssuance, IssueError } from "@/lib/securities-issue";
import { SECURITY_TYPES } from "@/lib/types";

const payloadSchema = z.object({
  type: z.enum(SECURITY_TYPES),
  holderMode: z.enum(["existing", "new"]).default("existing"),
  stakeholderId: z.string().optional().nullable(),
  newHolder: z.object({ name: z.string().optional(), email: z.string().optional(), relationship: z.string().optional() }).optional().nullable(),
  terms: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()).default({}),
  generateDocument: z.boolean().default(true),
  sendForSignature: z.boolean().default(false),
  splitIso: z.boolean().default(false),
});

const schema = z.object({ companyId: zStr, payload: zJson(payloadSchema) });

export async function issueSecurity(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;
  const { companyId, payload } = parsed.data;
  let ctx;
  try {
    ctx = await requireEditor(companyId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Not allowed");
  }
  try {
    const res = await createIssuance(
      { companyId: ctx.company.id, userId: ctx.user.id, userName: ctx.user.name, userEmail: ctx.user.email },
      {
        type: payload.type,
        stakeholderId: payload.holderMode === "existing" ? payload.stakeholderId : null,
        newHolder: payload.holderMode === "new" ? payload.newHolder : null,
        terms: payload.terms,
        generateDocument: payload.generateDocument,
        sendForSignature: payload.sendForSignature,
        splitIso: payload.splitIso,
      },
    );
    revalidatePath(`/app/${ctx.company.id}`, "layout");
    return ok({ id: res.id }, res.splitId ? `Issued ${res.certificateNumber} and split ${res.splitCertificateNumber} as an NSO for the ISO $100K limit.` : `Issued ${res.certificateNumber}.`);
  } catch (e) {
    if (e instanceof IssueError) return fail(e.message);
    console.error(e);
    return fail("Something went wrong while issuing the security.");
  }
}
