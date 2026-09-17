"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth";

export async function completeTask(companyId: string, id: string) {
  const ctx = await requireWorkspace(companyId);
  await db.notification.updateMany({ where: { id, companyId: ctx.company.id }, data: { status: "DONE" } });
  revalidatePath(`/app/${ctx.company.id}/dashboard`);
}
