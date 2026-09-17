import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";
import { UpdateEditor } from "@/components/people-update-editor";

export const metadata = { title: "Edit update" };

export default async function EditUpdatePage(props: PageProps<"/app/[companyId]/updates/[id]/edit">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [update, documents] = await Promise.all([
    db.investorUpdate.findFirst({ where: { id, companyId: C } }),
    db.document.findMany({ where: { companyId: C, visibility: { in: ["INVESTORS", "COMPANY", "PUBLIC"] } }, select: { id: true, name: true, folder: true }, orderBy: [{ folder: "asc" }, { name: "asc" }], take: 200 }),
  ]);
  if (!update) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Investor updates", href: `/app/${C}/updates` }, { label: update.title, href: `/app/${C}/updates/${update.id}` }, { label: "Edit" }]} title={`Edit — ${update.title}`} />
      <UpdateEditor companyId={C} documents={documents} initial={{ id: update.id, title: update.title, body: update.body, audience: parseJson<string[]>(update.audience, []), externalEmails: parseJson<string[]>(update.externalEmails, []), status: update.status }} />
    </>
  );
}
