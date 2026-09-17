import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";
import { SafeBuilder, type SafeTemplate } from "./safe-builder";

export const metadata = { title: "New SAFE" };

export default async function NewSafePage(props: PageProps<"/app/[companyId]/fundraising/safes/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  if (!ctx.canEdit) redirect(`/app/${C}/fundraising`);
  const [data, planned] = await Promise.all([loadCapTable(C), db.fundingRound.findFirst({ where: { companyId: C, status: { not: "CLOSED" }, preMoneyValuation: { not: null } }, orderBy: { createdAt: "desc" } })]);
  const settings = parseJson<{ safeTemplates?: SafeTemplate[] }>(ctx.company.settings, {});
  const stakeholders = data.stakeholders
    .map((s) => ({ id: s.id, name: s.name, relationship: s.relationship }))
    .sort((a, b) => (a.relationship === "INVESTOR" ? 0 : 1) - (b.relationship === "INVESTOR" ? 0 : 1) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Fundraising", href: `/app/${C}/fundraising` }, { label: "New SAFE" }]} title="Issue a SAFE" description="Y Combinator post-money or pre-money SAFE with a live document preview and conversion math." />
      <SafeBuilder
        companyId={C}
        company={{ legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState, address: ctx.company.address }}
        stakeholders={stakeholders}
        templates={settings.safeTemplates ?? []}
        preRoundFullyDiluted={data.summary.totals.fullyDilutedShares}
        defaultPreMoney={planned?.preMoneyValuation ?? 30_000_000}
        nextCertificate={`SAFE-${data.securities.filter((s) => s.certificateNumber.startsWith("SAFE-")).length + 1}`}
      />
    </>
  );
}
