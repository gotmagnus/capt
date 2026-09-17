import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { toInputDate } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";
import { OffersForm } from "@/components/offers-form";

export const metadata = { title: "Edit offer" };

export default async function EditOfferPage(props: PageProps<"/app/[companyId]/offers/[id]/edit">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const offer = await db.offerLetter.findFirst({ where: { id, companyId: C } });
  if (!offer) notFound();
  const [data, valuation, schedules] = await Promise.all([loadCapTable(C), currentValuation(C), db.vestingSchedule.findMany({ where: { companyId: C, isTemplate: true }, orderBy: { name: "asc" } })]);
  const departments = [...new Set(data.stakeholders.map((s) => s.department).filter(Boolean))] as string[];
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Offer letters", href: `/app/${C}/offers` }, { label: offer.candidateName, href: `/app/${C}/offers/${offer.id}` }, { label: "Edit" }]} title={`Edit offer — ${offer.candidateName}`} />
      <OffersForm
        companyId={C}
        company={{ legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState }}
        fmv={valuation?.fairMarketValue ?? null}
        fullyDiluted={data.summary.totals.fullyDilutedShares}
        schedules={schedules.map((s) => ({ id: s.id, name: s.name, type: s.type, totalMonths: s.totalMonths, cliffMonths: s.cliffMonths, frequency: s.frequency, cliffPercent: s.cliffPercent }))}
        departments={departments}
        initial={{
          id: offer.id,
          candidateName: offer.candidateName,
          candidateEmail: offer.candidateEmail,
          title: offer.title,
          department: offer.department ?? "",
          level: offer.level ?? "L5",
          salary: offer.salary ?? 0,
          bonus: offer.bonus,
          equityQuantity: offer.equityQuantity,
          equityType: offer.equityType,
          strikePrice: offer.strikePrice,
          vestingScheduleId: offer.vestingScheduleId ?? "",
          startDate: offer.startDate ? toInputDate(offer.startDate) : null,
          expiresAt: offer.expiresAt ? toInputDate(offer.expiresAt) : null,
          message: offer.message ?? "",
          packages: parseJson<{ label: string; salary: number; equityQuantity: number }[]>(offer.packages, []),
        }}
      />
    </>
  );
}
