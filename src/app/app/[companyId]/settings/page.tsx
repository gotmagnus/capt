import { requireWorkspace } from "@/lib/auth";
import { toInputDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { CompanyForm } from "@/components/settings-company-form";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage(props: PageProps<"/app/[companyId]/settings">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const c = ctx.company;
  return (
    <>
      <PageHeader title="Company" description="Legal details used on certificates, agreements, board consents and tax forms." />
      <CompanyForm
        canEdit={ctx.canEdit}
        company={{
          id: c.id,
          name: c.name,
          legalName: c.legalName,
          entityType: c.entityType,
          stage: c.stage,
          incorporationState: c.incorporationState,
          incorporationDate: toInputDate(c.incorporationDate),
          ein: c.ein,
          website: c.website,
          address: c.address,
          authorizedShares: c.authorizedShares,
          parValue: c.parValue,
          totalAssets: c.totalAssets,
          fiscalYearEnd: c.fiscalYearEnd,
          currency: c.currency,
        }}
      />
    </>
  );
}
