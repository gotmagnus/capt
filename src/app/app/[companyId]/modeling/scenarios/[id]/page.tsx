import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ScenarioRedirect(props: PageProps<"/app/[companyId]/modeling/scenarios/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const scenario = await db.scenario.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!scenario) notFound();
  if (scenario.type === "EXIT") redirect(`/app/${ctx.company.id}/modeling/exit?scenario=${scenario.id}`);
  if (scenario.type === "FINANCING") redirect(`/app/${ctx.company.id}/modeling?scenario=${scenario.id}`);
  redirect(`/app/${ctx.company.id}/employees?scenario=${scenario.id}`);
}
