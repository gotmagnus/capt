import { now } from "@/lib/utils";
import { requireWorkspace } from "@/lib/auth";
import { latestRound } from "@/lib/data/captable";
import { toInputDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { TenderForm } from "@/components/people-tender-form";

export const metadata = { title: "New tender offer" };

export default async function NewTenderPage(props: PageProps<"/app/[companyId]/liquidity/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const round = await latestRound(C);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Liquidity", href: `/app/${C}/liquidity` }, { label: "New tender offer" }]} title="New tender offer" description="Set the terms; you can open it to holders once the board and buyer have signed off." />
      <TenderForm companyId={C} lastPreferredPrice={round?.pricePerShare ?? null} defaultStart={toInputDate(new Date(now().getTime() + 14 * 86_400_000))} defaultEnd={toInputDate(new Date(now().getTime() + 44 * 86_400_000))} />
    </>
  );
}
