import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPortal, portalUpdates } from "@/lib/portal-data";
import { date } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";

export const metadata = { title: "Update" };

export default async function PortalUpdatePage(props: PageProps<"/portal/[companyId]/updates/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  const update = (await portalUpdates(p)).find((u) => u.id === id);
  if (!update) notFound();
  const stakeholderId = p.myStakeholders[0]?.id;
  if (stakeholderId && !update.views.some((v) => v.stakeholderId && p.myIds.has(v.stakeholderId))) {
    await db.updateView.create({ data: { updateId: update.id, stakeholderId, email: ctx.user.email } });
  }

  return (
    <>
      <PageHeader title={update.title} description={`Published ${date(update.publishedAt, "long")} by ${ctx.company.name}`} breadcrumbs={[{ label: "Updates", href: `/portal/${C}/updates` }, { label: update.title }]} />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <Markdown content={update.body} className={PROSE_FIXES} />
        </CardContent>
      </Card>
    </>
  );
}
