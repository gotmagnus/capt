"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export type AuthState = { error?: string } | undefined;

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") || undefined });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return { error: "Incorrect email or password." };
  await createSession(user.id);
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/app";
  redirect(next);
}

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2),
  incorporationState: z.string().default("Delaware"),
});

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const email = parsed.data.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with that email already exists." };
  const base = slugify(parsed.data.companyName);
  let slug = base;
  for (let i = 2; await db.company.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const user = await db.user.create({ data: { name: parsed.data.name, email, passwordHash: await hashPassword(parsed.data.password) } });
  const company = await db.company.create({
    data: {
      name: parsed.data.companyName,
      legalName: parsed.data.companyName.match(/,?\s*(inc\.?|corp\.?|llc|ltd\.?)$/i) ? parsed.data.companyName : `${parsed.data.companyName}, Inc.`,
      slug,
      incorporationState: parsed.data.incorporationState,
      plan: "STARTUP",
      stage: "PRE_SEED",
      memberships: { create: { userId: user.id, role: "ADMIN" } },
      shareClasses: { create: { name: "Common Stock", prefix: "CS", type: "COMMON", authorizedShares: 10_000_000, seniority: 99 } },
      vestingSchedules: {
        create: [
          { name: "4 years, 1 year cliff, monthly", type: "TIME", totalMonths: 48, cliffMonths: 12, frequency: "MONTHLY", description: "Standard employee schedule" },
          { name: "4 years, no cliff, monthly", type: "TIME", totalMonths: 48, cliffMonths: 0, frequency: "MONTHLY" },
          { name: "2 years, quarterly", type: "TIME", totalMonths: 24, cliffMonths: 0, frequency: "QUARTERLY", description: "Advisor schedule" },
          { name: "Immediate", type: "IMMEDIATE", totalMonths: 0, cliffMonths: 0, frequency: "MONTHLY" },
        ],
      },
      stakeholders: { create: { name: parsed.data.name, email, relationship: "FOUNDER", userId: user.id } },
    },
  });
  await db.auditLog.create({ data: { companyId: company.id, userId: user.id, action: "CREATE", entityType: "Company", entityId: company.id, summary: `Created ${company.name}` } });
  await createSession(user.id);
  redirect(`/app/${company.id}/dashboard`);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
