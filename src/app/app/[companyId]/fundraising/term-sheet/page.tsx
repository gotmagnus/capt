import { requireWorkspace } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page";
import { TermSheetScanner } from "./term-sheet-scanner";

export const metadata = { title: "Term sheet scanner" };

export default async function TermSheetPage(props: PageProps<"/app/[companyId]/fundraising/term-sheet">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Fundraising", href: `/app/${ctx.company.id}/fundraising` }, { label: "Term sheet scanner" }]} title="Term sheet scanner" description="Paste a term sheet to extract the economic and control terms and benchmark them against market standard for Seed and Series A rounds." />
      <TermSheetScanner companyId={ctx.company.id} canEdit={ctx.canEdit} />
    </>
  );
}
