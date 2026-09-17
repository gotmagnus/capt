import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { IssueWizard } from "./issue-wizard";

export const metadata = { title: "Issue equity" };

export default async function NewSecurityPage(props: PageProps<"/app/[companyId]/securities/new">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  if (!ctx.canEdit) redirect(`/app/${C}/securities`);
  const [data, valuation] = await Promise.all([loadCapTable(C), currentValuation(C)]);
  const s = data.summary;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

  return (
    <>
      <PageHeader title="Issue equity" description="Issue shares, grant options or units, or record a SAFE, note or warrant. Documents are generated and the ledger updates when you finish." breadcrumbs={[{ label: "Securities", href: `/app/${C}/securities` }, { label: "Issue equity" }]} />
      <IssueWizard
        companyId={C}
        currentUser={{ name: ctx.user.name, email: ctx.user.email }}
        fmv={valuation?.fairMarketValue ?? null}
        fmvDate={valuation?.valuationDate.toISOString() ?? null}
        fullyDiluted={s.totals.fullyDilutedShares}
        stakeholders={data.stakeholders.map((x) => ({ id: x.id, name: x.name, email: x.email, relationship: x.relationship }))}
        shareClasses={data.shareClasses.map((c) => {
          const ct = s.classTotals.find((x) => x.shareClassId === c.id);
          return { id: c.id, name: c.name, prefix: c.prefix, type: c.type, authorized: c.authorizedShares, issued: ct?.issued ?? 0, available: ct?.available ?? c.authorizedShares, originalIssuePrice: c.originalIssuePrice, parValue: c.parValue };
        })}
        equityPlans={data.equityPlans.map((p) => {
          const ps = s.plans.find((x) => x.id === p.id);
          return { id: p.id, name: p.name, shareClassId: p.shareClassId, authorized: p.authorizedShares, available: ps?.available ?? p.authorizedShares, status: p.status };
        })}
        vestingSchedules={data.vestingSchedules.map((v) => ({ id: v.id, name: v.name, type: v.type, totalMonths: v.totalMonths, cliffMonths: v.cliffMonths, cliffPercent: v.cliffPercent, frequency: v.frequency, accelerationSingleTrigger: v.accelerationSingleTrigger, accelerationDoubleTrigger: v.accelerationDoubleTrigger, description: v.description }))}
        isoGrants={data.securities
          .filter((x) => x.type === "OPTION_ISO" && ["OUTSTANDING", "PENDING_SIGNATURE", "EXERCISED"].includes(x.status))
          .map((x) => ({ securityId: x.id, stakeholderId: x.stakeholderId, grantDate: (x.grantDate ?? x.issueDate).toISOString(), vestingStart: (x.vestingStartDate ?? x.issueDate).toISOString(), quantity: x.quantity - x.cancelledQuantity, fmvAtGrant: x.fmvAtGrant ?? x.exercisePrice ?? 0, scheduleId: x.vestingScheduleId }))}
        prefill={{
          stakeholderId: str(sp.stakeholderId),
          type: str(sp.type),
          quantity: str(sp.quantity),
          vestingScheduleId: str(sp.vestingScheduleId),
          exercisePrice: str(sp.exercisePrice),
          equityPlanId: str(sp.equityPlanId),
          shareClassId: str(sp.shareClassId),
        }}
      />
    </>
  );
}
