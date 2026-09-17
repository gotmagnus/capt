import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader, Stat } from "@/components/ui/page";
import { shares } from "@/lib/format";
import { StakeholderTable, type StakeholderListRow } from "./stakeholder-table";

export const metadata = { title: "Stakeholders" };

export default async function StakeholdersPage(props: PageProps<"/app/[companyId]/stakeholders">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const byId = new Map(data.summary.rows.map((r) => [r.stakeholderId, r]));

  const rows: StakeholderListRow[] = data.stakeholders.map((s) => {
    const r = byId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      type: s.type,
      relationship: s.relationship,
      title: s.title,
      department: s.department,
      employmentStatus: s.employmentStatus,
      outstandingShares: r?.outstandingShares ?? 0,
      fullyDilutedShares: r?.fullyDilutedShares ?? 0,
      fullyDilutedPct: r?.fullyDilutedPct ?? 0,
      optionsOutstanding: r?.optionsOutstanding ?? 0,
      invested: r?.invested ?? 0,
      portalStatus: s.portalAcceptedAt ? "ACCEPTED" : s.portalInvitedAt ? "INVITED" : "NOT_INVITED",
      createdAt: s.createdAt.toISOString(),
    };
  });

  const counts = {
    employees: data.stakeholders.filter((s) => s.relationship === "EMPLOYEE" || s.relationship === "FOUNDER").length,
    investors: data.stakeholders.filter((s) => s.relationship === "INVESTOR").length,
    other: data.stakeholders.filter((s) => !["EMPLOYEE", "FOUNDER", "INVESTOR"].includes(s.relationship)).length,
    portal: data.stakeholders.filter((s) => s.portalAcceptedAt).length,
  };

  return (
    <>
      <PageHeader title="Stakeholders" description="Everyone who holds — or will hold — equity in the company." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        <Stat className="sm:col-span-2 xl:col-span-1" label="Stakeholders" value={data.stakeholders.length} hint={`${data.summary.totals.stakeholderCount} with holdings`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Employees & founders" value={counts.employees} hint={`${data.stakeholders.filter((s) => s.employmentStatus === "ACTIVE").length} active`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Investors" value={counts.investors} hint={`${shares(data.summary.totals.preferredOutstanding)} preferred shares`} />
        <Stat className="sm:col-span-3 xl:col-span-1" label="Advisors, board & other" value={counts.other} />
        <Stat className="col-span-2 sm:col-span-3 xl:col-span-1" label="Portal adoption" value={`${data.stakeholders.length ? Math.round((counts.portal / data.stakeholders.length) * 100) : 0}%`} hint={`${counts.portal} accepted invitations`} />
      </div>
      <StakeholderTable companyId={C} rows={rows} canEdit={ctx.canEdit} />
    </>
  );
}
