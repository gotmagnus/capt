import { requireCompany } from "@/lib/auth";
import { FAQ, GLOSSARY } from "@/lib/help-content";
import { PageHeader } from "@/components/ui/page";
import { HelpCenter } from "@/components/help-center";
import { contactSupport } from "@/app/app/[companyId]/help/actions";

export const metadata = { title: "Help" };

export default async function PortalHelpPage(props: PageProps<"/portal/[companyId]/help">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const order = ["exercising", "vesting", "iso-nso", "83b", "409a", "cap-table", "safes", "compliance", "board"];
  const sections = FAQ.filter((s) => s.audience !== "company" || ["cap-table", "safes"].includes(s.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <>
      <PageHeader title="Help" description="Plain-language answers about your equity. Your company's equity team can answer anything specific to your grants." />
      <HelpCenter sections={sections} glossary={GLOSSARY} contactAction={contactSupport} companyId={ctx.company.id} portal />
    </>
  );
}
