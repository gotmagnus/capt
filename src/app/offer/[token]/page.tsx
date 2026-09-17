import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadCapTable, currentValuation } from "@/lib/data/captable";
import { offerLetterDocument, vestingDescription } from "@/lib/documents/templates";
import { date } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { CandidateOffer } from "@/components/offers-candidate";

export const metadata = { title: "Your offer" };

export default async function PublicOfferPage(props: PageProps<"/offer/[token]">) {
  const { token } = await props.params;
  const offer = await db.offerLetter.findUnique({ where: { token }, include: { company: true } });
  if (!offer || offer.status === "DRAFT") notFound();
  if (offer.status === "SENT" || !offer.viewedAt) {
    await db.offerLetter.update({ where: { id: offer.id }, data: { viewedAt: offer.viewedAt ?? new Date(), status: offer.status === "SENT" ? "VIEWED" : offer.status } });
  }
  const [data, valuation, scheduleRow] = await Promise.all([loadCapTable(offer.companyId), currentValuation(offer.companyId), offer.vestingScheduleId ? db.vestingSchedule.findUnique({ where: { id: offer.vestingScheduleId }, include: { milestones: true } }) : null]);
  const packages = parseJson<{ label: string; salary: number; equityQuantity: number }[]>(offer.packages, []);
  const pkgs = packages.length ? packages : [{ label: "Standard", salary: offer.salary ?? 0, equityQuantity: offer.equityQuantity }];
  const company = { legalName: offer.company.legalName, incorporationState: offer.company.incorporationState };
  const letter = offerLetterDocument({
    company,
    candidateName: offer.candidateName,
    title: offer.title,
    startDate: offer.startDate,
    salary: offer.salary,
    bonus: offer.bonus,
    equityQuantity: offer.equityQuantity,
    equityType: offer.equityType,
    strikePrice: offer.equityType.startsWith("OPTION") ? offer.strikePrice : null,
    vestingDescription: vestingDescription(scheduleRow),
    expiresAt: offer.expiresAt,
    fullyDiluted: data.summary.totals.fullyDilutedShares,
    message: offer.message,
  });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={22} />
            <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">Offer from {offer.company.name}</span>
          </div>
          {offer.expiresAt ? <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">Expires {date(offer.expiresAt)}</span> : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
            {offer.candidateName}, welcome to {offer.company.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Review your offer for {offer.title}, explore what your equity could be worth, and accept when you're ready.</p>
        </div>
        <CandidateOffer
          token={offer.token}
          letter={letter}
          companyName={offer.company.name}
          candidateName={offer.candidateName}
          packages={pkgs}
          status={offer.status}
          expiresAt={offer.expiresAt?.toISOString() ?? null}
          equityType={offer.equityType}
          strikePrice={offer.strikePrice}
          fmv={valuation?.fairMarketValue ?? null}
          fullyDiluted={data.summary.totals.fullyDilutedShares}
          schedule={scheduleRow ? { type: scheduleRow.type, totalMonths: scheduleRow.totalMonths, cliffMonths: scheduleRow.cliffMonths, cliffPercent: scheduleRow.cliffPercent, frequency: scheduleRow.frequency, milestones: scheduleRow.milestones.map((m) => ({ percent: m.percent, achievedAt: m.achievedAt?.toISOString() ?? null, description: m.description })) } : null}
          scheduleName={scheduleRow?.name ?? null}
          startDate={offer.startDate?.toISOString() ?? null}
          selectedPackage={offer.selectedPackage}
        />
        <p className="mt-8 text-center text-[11px] text-muted-foreground">This offer is confidential. Equity figures are illustrative and subject to board approval and the company's equity plan. Not tax or investment advice.</p>
      </main>
    </div>
  );
}
