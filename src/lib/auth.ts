import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { EDITOR_ROLES, WORKSPACE_ROLES, type Role } from "./types";

export const SESSION_COOKIE = "capt_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { userId, token, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: { include: { memberships: { include: { company: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export interface CompanyContext {
  user: CurrentUser;
  company: CurrentUser["memberships"][number]["company"];
  role: Role;
  canEdit: boolean;
  isWorkspace: boolean;
}

/** Loads the current user and verifies membership in the company; redirects otherwise. */
export const requireCompany = cache(async (companyId: string): Promise<CompanyContext> => {
  const user = await requireUser();
  const membership = user.memberships.find((m) => m.companyId === companyId || m.company.slug === companyId);
  if (!membership) redirect("/app");
  const role = membership.role as Role;
  return {
    user,
    company: membership.company,
    role,
    canEdit: EDITOR_ROLES.includes(role),
    isWorkspace: WORKSPACE_ROLES.includes(role),
  };
});

export async function requireEditor(companyId: string) {
  const ctx = await requireCompany(companyId);
  if (!ctx.canEdit) throw new Error("You don't have permission to make changes in this company.");
  return ctx;
}

export async function requireWorkspace(companyId: string) {
  const ctx = await requireCompany(companyId);
  if (!ctx.isWorkspace) redirect(`/portal/${companyId}`);
  return ctx;
}

export async function logAudit(input: {
  companyId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
    },
  });
}
