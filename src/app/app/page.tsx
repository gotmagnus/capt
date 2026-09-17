import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { WORKSPACE_ROLES, type Role } from "@/lib/types";

export default async function AppIndex() {
  const user = await requireUser();
  const m = user.memberships[0];
  if (!m) redirect("/signup");
  const workspace = user.memberships.find((x) => WORKSPACE_ROLES.includes(x.role as Role)) ?? m;
  if (WORKSPACE_ROLES.includes(workspace.role as Role)) redirect(`/app/${workspace.companyId}/dashboard`);
  redirect(`/portal/${m.companyId}`);
}
