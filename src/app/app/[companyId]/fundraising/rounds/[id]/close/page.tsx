import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable, convertibles } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { CloseRoundWizard } from "./close-round-wizard";

export const metadata = { title: "Close round" };

export default async function CloseRoundPage(props: PageProps<"/app/[companyId]/fundraising/rounds/[id]/close">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  if (!ctx.canEdit) redirect(`/app/${C}/fundraising/rounds/${id}`);
  const round = await db.fundingRound.findFirst({ where: { id, companyId: C }, include: { shareClass: true } });
  if (!round) notFound();
  if (round.status === "CLOSED") redirect(`/app/${C}/fundraising/rounds/${id}`);
  const data = await loadCapTable(C);
  const convs = convertibles(data).map((c) => {
    const sec = data.securities.find((x) => x.id === c.id)!;
    return { ...c, issueDate: sec.issueDate.toISOString(), certificateNumber: sec.certificateNumber, holderName: sec.stakeholder.name };
  });
  const usedPrefixes = new Set(data.shareClasses.map((c) => c.prefix));
  const letter = String.fromCharCode(65 + data.shareClasses.filter((c) => c.type === "PREFERRED").length - (data.shareClasses.some((c) => c.name.toLowerCase().includes("seed")) ? 1 : 0));
  let prefix = `PS-${letter}`;
  for (let i = 0; usedPrefixes.has(prefix) && i < 26; i++) prefix = `PS-${String.fromCharCode(66 + i)}`;

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Fundraising", href: `/app/${C}/fundraising` }, { label: round.name, href: `/app/${C}/fundraising/rounds/${round.id}` }, { label: "Close" }]} title={`Close ${round.name}`} description="Set terms, add investors, review the pro-forma, then commit. Nothing is written until the final step." />
      <CloseRoundWizard
        companyId={C}
        round={{ id: round.id, name: round.name, preMoneyValuation: round.preMoneyValuation, targetAmount: round.targetAmount, leadInvestor: round.leadInvestor, closeDate: round.closeDate?.toISOString() ?? null, shareClassId: round.shareClassId }}
        summary={JSON.parse(JSON.stringify(data.summary))}
        convertibles={convs}
        stakeholders={data.summary.rows.map((r) => ({ id: r.stakeholderId, name: r.name, relationship: r.relationship, fdPct: r.fullyDilutedPct }))}
        shareClasses={data.shareClasses.filter((c) => c.type === "PREFERRED").map((c) => ({ id: c.id, name: c.name, prefix: c.prefix, originalIssuePrice: c.originalIssuePrice }))}
        suggestedName={`Series ${letter} Preferred`}
        suggestedPrefix={prefix}
        planName={data.equityPlans.find((p) => p.status === "ACTIVE")?.name ?? null}
      />
    </>
  );
}
