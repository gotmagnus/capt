"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auth";
import { fail, ok, parseForm, zBool, zDateOpt, zStr, zStrOpt, type ActionResult } from "@/lib/actions";
import { editorContext } from "@/lib/captable-actions";
import { loadCapTable } from "@/lib/data/captable";
import { computeVesting } from "@/lib/equity/vesting";
import { STAKEHOLDER_RELATIONSHIPS } from "@/lib/types";

const stakeholderSchema = z.object({
  companyId: zStr,
  id: zStrOpt,
  name: zStr.max(120),
  email: z.preprocess((v) => (v === undefined ? undefined : String(v).toLowerCase()), z.string().email().optional()),
  type: z.enum(["INDIVIDUAL", "ENTITY"]).default("INDIVIDUAL"),
  relationship: z.enum(STAKEHOLDER_RELATIONSHIPS),
  title: zStrOpt,
  department: zStrOpt,
  costCenter: zStrOpt,
  employeeId: zStrOpt,
  employmentStatus: z.enum(["ACTIVE", "TERMINATED", "ON_LEAVE"]).optional(),
  startDate: zDateOpt,
  country: z.string().length(2).default("US"),
  address: zStrOpt,
  taxId: zStrOpt,
  isUsTaxpayer: zBool.default(true),
  accredited: zBool.default(false),
  tags: zStrOpt,
  notes: zStrOpt,
});

function tagsToJson(tags: string | undefined) {
  return JSON.stringify(
    (tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

export async function saveStakeholder(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseForm(stakeholderSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const { ctx, error } = await editorContext(d.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const isEmployee = ["EMPLOYEE", "FOUNDER", "FORMER_EMPLOYEE"].includes(d.relationship);
  const data = {
    name: d.name,
    email: d.email ?? null,
    type: d.type,
    relationship: d.relationship,
    title: d.title ?? null,
    department: d.department ?? null,
    costCenter: d.costCenter ?? null,
    employeeId: d.employeeId ?? null,
    employmentStatus: isEmployee ? d.employmentStatus ?? (d.relationship === "FORMER_EMPLOYEE" ? "TERMINATED" : "ACTIVE") : null,
    startDate: d.startDate ?? null,
    country: d.country.toUpperCase(),
    address: d.address ?? null,
    taxId: d.taxId ?? null,
    isUsTaxpayer: d.isUsTaxpayer,
    accredited: d.accredited,
    tags: tagsToJson(d.tags),
    notes: d.notes ?? null,
  };

  if (d.id) {
    const before = await db.stakeholder.findFirst({ where: { id: d.id, companyId: C } });
    if (!before) return fail("Stakeholder not found.");
    const after = await db.stakeholder.update({ where: { id: before.id }, data });
    await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Stakeholder", entityId: after.id, summary: `Updated stakeholder ${after.name}`, before, after });
    revalidatePath(`/app/${C}/stakeholders`);
    revalidatePath(`/app/${C}/stakeholders/${after.id}`);
    return ok({ id: after.id }, "Stakeholder updated");
  }

  const created = await db.stakeholder.create({ data: { ...data, companyId: C } });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "CREATE", entityType: "Stakeholder", entityId: created.id, summary: `Added stakeholder ${created.name} (${created.relationship.toLowerCase().replace(/_/g, " ")})`, after: created });
  revalidatePath(`/app/${C}/stakeholders`);
  revalidatePath(`/app/${C}/cap-table`);
  return ok({ id: created.id }, "Stakeholder added");
}

const idSchema = z.object({ companyId: zStr, id: zStr });

export async function invitePortal(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(idSchema, formData);
  if (parsed.error) return parsed.error;
  const { ctx, error } = await editorContext(parsed.data.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const sh = await db.stakeholder.findFirst({ where: { id: parsed.data.id, companyId: C } });
  if (!sh) return fail("Stakeholder not found.");
  if (!sh.email) return fail("Add an email address before inviting this stakeholder to the portal.");

  let user = await db.user.findUnique({ where: { email: sh.email } });
  let created = false;
  if (!user) {
    user = await db.user.create({ data: { email: sh.email, name: sh.name, passwordHash: await bcrypt.hash("welcome123", 10) } });
    created = true;
  }
  const role = sh.relationship === "INVESTOR" ? "INVESTOR" : sh.relationship === "BOARD_MEMBER" ? "BOARD" : "EMPLOYEE";
  const membership = await db.companyMembership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: C } } });
  if (!membership) await db.companyMembership.create({ data: { userId: user.id, companyId: C, role } });
  await db.stakeholder.update({ where: { id: sh.id }, data: { userId: user.id, portalInvitedAt: new Date() } });
  await db.notification.create({
    data: { companyId: C, userId: user.id, stakeholderId: sh.id, type: "INFO", title: `Welcome to the ${ctx.company.name} equity portal`, body: created ? "Sign in with the temporary password shared by your equity administrator and review your holdings." : "Your existing account now has access to this company's portal.", link: `/portal/${C}` },
  });
  await logAudit({ companyId: C, userId: ctx.user.id, action: "INVITE", entityType: "Stakeholder", entityId: sh.id, summary: `Invited ${sh.name} to the portal as ${role.toLowerCase()}${created ? " (new account created)" : ""}` });
  revalidatePath(`/app/${C}/stakeholders/${sh.id}`);
  revalidatePath(`/app/${C}/stakeholders`);
  return ok(undefined, created ? `Invitation sent to ${sh.email}. Temporary password: welcome123` : `${sh.name} now has portal access.`);
}

const terminateSchema = z.object({
  companyId: zStr,
  id: zStr,
  terminationDate: z.coerce.date(),
  terminationReason: z.enum(["Voluntary", "Involuntary", "For cause", "Death or disability", "Other"]).default("Voluntary"),
  notes: zStrOpt,
});

export async function terminateStakeholder(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(terminateSchema, formData);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const { ctx, error } = await editorContext(d.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const sh = await db.stakeholder.findFirst({ where: { id: d.id, companyId: C }, include: { securities: true } });
  if (!sh) return fail("Stakeholder not found.");
  if (sh.employmentStatus === "TERMINATED") return fail("This stakeholder is already terminated.");
  const data = await loadCapTable(C);

  let cancelledTotal = 0;
  let vestedRemaining = 0;
  let ptepMonths = 3;
  const ops = [];
  for (const s of sh.securities) {
    if (!["OPTION_ISO", "OPTION_NSO", "RSU", "WARRANT"].includes(s.type) || s.status !== "OUTSTANDING") continue;
    const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf: d.terminationDate, terminationDate: d.terminationDate, cancelled: s.cancelledQuantity });
    const unexercised = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
    const unvested = Math.max(0, Math.min(unexercised, vest.total - vest.vested));
    const stillExercisable = unexercised - unvested;
    if (unvested > 0) {
      cancelledTotal += unvested;
      ops.push(
        db.transaction.create({ data: { companyId: C, type: "CANCELLATION", securityId: s.id, fromStakeholderId: sh.id, quantity: unvested, effectiveDate: d.terminationDate, createdById: ctx.user.id, notes: `Unvested ${s.type === "RSU" ? "RSUs" : "options"} cancelled on termination (${s.certificateNumber})` } }),
      );
    }
    const newStatus = stillExercisable > 0 ? "OUTSTANDING" : s.exercisedQuantity > 0 ? "EXERCISED" : "CANCELLED";
    ops.push(db.security.update({ where: { id: s.id }, data: { cancelledQuantity: s.cancelledQuantity + unvested, status: newStatus } }));
    vestedRemaining += stillExercisable;
    if (s.ptepMonths) ptepMonths = s.ptepMonths;
  }
  const relationship = sh.relationship === "EMPLOYEE" ? "FORMER_EMPLOYEE" : sh.relationship;
  ops.push(db.stakeholder.update({ where: { id: sh.id }, data: { employmentStatus: "TERMINATED", terminationDate: d.terminationDate, terminationReason: d.terminationReason, relationship } }));
  ops.push(db.transaction.create({ data: { companyId: C, type: "TERMINATION", fromStakeholderId: sh.id, quantity: 0, effectiveDate: d.terminationDate, createdById: ctx.user.id, notes: `${sh.name} terminated (${d.terminationReason.toLowerCase()})${d.notes ? ` — ${d.notes}` : ""}` } }));
  if (vestedRemaining > 0) {
    const deadline = new Date(d.terminationDate);
    deadline.setMonth(deadline.getMonth() + ptepMonths);
    ops.push(
      db.notification.create({
        data: { companyId: C, stakeholderId: sh.id, type: "DEADLINE", title: `Post-termination exercise window for ${sh.name}`, body: `${vestedRemaining.toLocaleString()} vested options remain exercisable for ${ptepMonths} months after termination. Unexercised options expire and return to the pool.`, link: `/app/${C}/stakeholders/${sh.id}`, dueDate: deadline },
      }),
    );
  }
  await db.$transaction(ops);
  await logAudit({ companyId: C, userId: ctx.user.id, action: "UPDATE", entityType: "Stakeholder", entityId: sh.id, summary: `Terminated ${sh.name} effective ${d.terminationDate.toISOString().slice(0, 10)}: ${cancelledTotal.toLocaleString()} unvested cancelled, ${vestedRemaining.toLocaleString()} vested remain exercisable`, before: { employmentStatus: sh.employmentStatus, relationship: sh.relationship }, after: { employmentStatus: "TERMINATED", relationship, terminationDate: d.terminationDate } });
  for (const p of ["stakeholders", `stakeholders/${sh.id}`, "cap-table", "transactions", "securities", "equity-plans", "dashboard"]) revalidatePath(`/app/${C}/${p}`);
  return ok(undefined, `${sh.name} terminated. ${cancelledTotal.toLocaleString()} unvested cancelled; ${vestedRemaining.toLocaleString()} vested remain exercisable.`);
}

export async function deleteStakeholder(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(idSchema, formData);
  if (parsed.error) return parsed.error;
  const { ctx, error } = await editorContext(parsed.data.companyId);
  if (error) return error;
  const C = ctx.company.id;
  const sh = await db.stakeholder.findFirst({ where: { id: parsed.data.id, companyId: C }, include: { _count: { select: { securities: true, exerciseRequests: true, signers: true, documents: true } } } });
  if (!sh) return fail("Stakeholder not found.");
  if (sh._count.securities > 0) return fail("Stakeholders with securities can't be deleted. Cancel or transfer their securities first.");
  await db.$transaction([
    db.notification.deleteMany({ where: { stakeholderId: sh.id } }),
    db.updateView.deleteMany({ where: { stakeholderId: sh.id } }),
    db.signature.updateMany({ where: { stakeholderId: sh.id }, data: { stakeholderId: null } }),
    db.consentSigner.updateMany({ where: { stakeholderId: sh.id }, data: { stakeholderId: null } }),
    db.document.updateMany({ where: { stakeholderId: sh.id }, data: { stakeholderId: null } }),
    db.offerLetter.updateMany({ where: { stakeholderId: sh.id }, data: { stakeholderId: null } }),
    db.transaction.updateMany({ where: { fromStakeholderId: sh.id }, data: { fromStakeholderId: null } }),
    db.transaction.updateMany({ where: { toStakeholderId: sh.id }, data: { toStakeholderId: null } }),
    db.stakeholder.delete({ where: { id: sh.id } }),
  ]);
  await logAudit({ companyId: C, userId: ctx.user.id, action: "DELETE", entityType: "Stakeholder", entityId: sh.id, summary: `Deleted stakeholder ${sh.name}`, before: sh });
  revalidatePath(`/app/${C}/stakeholders`);
  return ok(undefined, `${sh.name} deleted`);
}
