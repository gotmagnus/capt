import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { NoteBuilder } from "./note-builder";

export const metadata = { title: "New convertible note" };

export default async function NewNotePage(props: PageProps<"/app/[companyId]/fundraising/notes/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  if (!ctx.canEdit) redirect(`/app/${C}/fundraising`);
  const [data, planned] = await Promise.all([loadCapTable(C), db.fundingRound.findFirst({ where: { companyId: C, status: { not: "CLOSED" }, preMoneyValuation: { not: null } }, orderBy: { createdAt: "desc" } })]);
  const stakeholders = data.stakeholders
    .map((s) => ({ id: s.id, name: s.name, relationship: s.relationship }))
    .sort((a, b) => (a.relationship === "INVESTOR" ? 0 : 1) - (b.relationship === "INVESTOR" ? 0 : 1) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Fundraising", href: `/app/${C}/fundraising` }, { label: "New convertible note" }]} title="Issue a convertible note" description="Interest-bearing debt that converts at the next qualified financing." />
      <NoteBuilder
        companyId={C}
        company={{ legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }}
        stakeholders={stakeholders}
        preRoundFullyDiluted={data.summary.totals.fullyDilutedShares}
        defaultPreMoney={planned?.preMoneyValuation ?? 30_000_000}
        nextCertificate={`CN-${data.securities.filter((s) => s.certificateNumber.startsWith("CN-")).length + 1}`}
      />
    </>
  );
}
