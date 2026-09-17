"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { declineConsentSigner, declineDocumentSignature, resolveSigningToken, signConsentSigner, signDocumentSignature } from "@/lib/governance-consents";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function signByToken(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();
  const agree = formData.get("agree") === "on";
  if (!token) return fail("Missing signing token.");
  if (!agree) return fail("Please agree to sign electronically.");
  if (typedName.length < 2) return fail("Type your full name to sign.");
  const resolved = await resolveSigningToken(token);
  if (!resolved) return fail("This signing link is invalid or has expired.");
  const expected = resolved.kind === "CONSENT" ? resolved.signer.name : resolved.signature.name;
  if (typedName.toLowerCase().replace(/\s+/g, " ") !== expected.toLowerCase().replace(/\s+/g, " ")) return fail(`Please type your name exactly as it appears: ${expected}`);
  const user = await getCurrentUser();
  const ip = await clientIp();
  try {
    if (resolved.kind === "CONSENT") {
      const r = await signConsentSigner(resolved.signer.id, { ipAddress: ip, userId: user?.id ?? null, typedName });
      revalidatePath(`/sign/${token}`);
      revalidatePath(`/app/${resolved.company.id}/board/${r.consentId}`);
      revalidatePath(`/app/${resolved.company.id}/board`);
      return ok(undefined, r.approved ? "Signed. The consent is now approved." : "Signed. Thank you.");
    }
    await signDocumentSignature(resolved.signature.id, { ipAddress: ip, userId: user?.id ?? null });
    revalidatePath(`/sign/${token}`);
    revalidatePath(`/app/${resolved.company.id}/documents/${resolved.document.id}`);
    revalidatePath(`/app/${resolved.company.id}/documents`);
    return ok(undefined, "Signed. Thank you.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not record the signature.");
  }
}

export async function declineByToken(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || undefined;
  const resolved = await resolveSigningToken(token);
  if (!resolved) return fail("This signing link is invalid or has expired.");
  const user = await getCurrentUser();
  try {
    if (resolved.kind === "CONSENT") {
      await declineConsentSigner(resolved.signer.id, comment, user?.id ?? null);
      revalidatePath(`/app/${resolved.company.id}/board/${resolved.consent.id}`);
    } else {
      await declineDocumentSignature(resolved.signature.id, user?.id ?? null);
      revalidatePath(`/app/${resolved.company.id}/documents/${resolved.document.id}`);
    }
    revalidatePath(`/sign/${token}`);
    return ok(undefined, "Your response has been recorded.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not record your response.");
  }
}
