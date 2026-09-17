import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page";
import { UpdateEditor } from "@/components/people-update-editor";

export const metadata = { title: "New update" };

export default async function NewUpdatePage(props: PageProps<"/app/[companyId]/updates/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const documents = await db.document.findMany({ where: { companyId: C, visibility: { in: ["INVESTORS", "COMPANY", "PUBLIC"] } }, select: { id: true, name: true, folder: true }, orderBy: [{ folder: "asc" }, { name: "asc" }], take: 200 });
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Investor updates", href: `/app/${C}/updates` }, { label: "New update" }]} title="New update" />
      <UpdateEditor companyId={C} documents={documents} />
    </>
  );
}
