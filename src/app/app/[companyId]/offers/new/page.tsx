import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { OffersForm } from "@/components/offers-form";

export const metadata = { title: "New offer" };

export default async function NewOfferPage(props: PageProps<"/app/[companyId]/offers/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, valuation, schedules] = await Promise.all([loadCapTable(C), currentValuation(C), db.vestingSchedule.findMany({ where: { companyId: C, isTemplate: true }, orderBy: { name: "asc" } })]);
  const departments = [...new Set(data.stakeholders.map((s) => s.department).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Offer letters", href: `/app/${C}/offers` }, { label: "New offer" }]} title="New offer letter" description="Build the package, preview the letter, then send the candidate a private link." />
      <OffersForm
        companyId={C}
        company={{ legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState }}
        fmv={valuation?.fairMarketValue ?? null}
        fullyDiluted={data.summary.totals.fullyDilutedShares}
        schedules={schedules.map((s) => ({ id: s.id, name: s.name, type: s.type, totalMonths: s.totalMonths, cliffMonths: s.cliffMonths, frequency: s.frequency, cliffPercent: s.cliffPercent }))}
        departments={departments}
      />
    </>
  );
}
