import { requireWorkspace } from "@/lib/auth";
import { FAQ, GLOSSARY } from "@/lib/help-content";
import { PageHeader } from "@/components/ui/page";
import { HelpCenter } from "@/components/help-center";
import { contactSupport } from "./actions";

export const metadata = { title: "Help center" };

export default async function HelpPage(props: PageProps<"/app/[companyId]/help">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  return (
    <>
      <PageHeader title="Help center" description="Answers to the questions founders, finance teams and counsel ask most, plus a glossary of equity terms." />
      <HelpCenter sections={FAQ} glossary={GLOSSARY} contactAction={contactSupport} companyId={ctx.company.id} />
    </>
  );
}
