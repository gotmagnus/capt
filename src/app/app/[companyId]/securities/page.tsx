import Link from "next/link";
import { Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { compactMoney, shares } from "@/lib/format";
import { effectiveVesting, isVestingType, securityGroup } from "@/lib/securities-utils";
import { SecuritiesList, type SecurityRow } from "./securities-list";

export const metadata = { title: "Securities" };

export default async function SecuritiesPage(props: PageProps<"/app/[companyId]/securities">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const s = data.summary;

  const rows: SecurityRow[] = data.securities.map((x) => {
    const schedule = x.vestingScheduleId ? data.schedules[x.vestingScheduleId] : null;
    const v = schedule && isVestingType(x.type) ? effectiveVesting(x, schedule, x.stakeholder.terminationDate) : null;
    const group = securityGroup(x.type);
    return {
      id: x.id,
      certificateNumber: x.certificateNumber,
      stakeholderId: x.stakeholderId,
      holderName: x.stakeholder.name,
      type: x.type,
      group,
      className: x.shareClass?.name ?? null,
      planName: x.equityPlan?.name ?? null,
      planId: x.equityPlanId ?? null,
      quantity: x.quantity,
      exercised: x.exercisedQuantity,
      cancelled: x.cancelledQuantity,
      principal: x.totalAmount ?? null,
      price: group === "CONVERTIBLES" ? null : group === "OPTIONS" || group === "WARRANTS" ? x.exercisePrice ?? null : x.pricePerShare ?? null,
      issueDate: x.issueDate.toISOString(),
      vestedPct: v ? v.percentVested : null,
      vested: v ? v.vested : null,
      status: x.status,
    };
  });

  const outstandingCount = data.securities.filter((x) => x.status === "OUTSTANDING").length;
  const pendingSignature = data.securities.filter((x) => x.status === "PENDING_SIGNATURE").length;
  const initialType = typeof sp.type === "string" ? sp.type : "all";

  return (
    <>
      <PageHeader
        title="Securities"
        description="Every share, option, unit, warrant and convertible instrument issued by the company."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/securities/new`}>
                <Plus /> Issue equity
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Outstanding securities" value={outstandingCount} hint={`${rows.length} total issued`} />
        <Stat label="Options outstanding" value={shares(s.totals.optionsOutstanding)} hint={`${shares(s.totals.optionsVested)} vested & unexercised`} />
        <Stat label="Pending signature" value={pendingSignature} hint="Awaiting holder acceptance" tone={pendingSignature ? "warning" : "default"} />
        <Stat label="Unconverted principal" value={compactMoney(s.totals.safePrincipal + s.totals.notePrincipal)} hint={`${s.totals.safeCount} SAFE${s.totals.safeCount === 1 ? "" : "s"} · ${s.totals.noteCount} note${s.totals.noteCount === 1 ? "" : "s"}`} />
      </div>
      <SecuritiesList
        companyId={C}
        rows={rows}
        stakeholders={data.stakeholders.map((x) => ({ id: x.id, name: x.name }))}
        plans={data.equityPlans.map((p) => ({ id: p.id, name: p.name }))}
        initialType={initialType}
        initialStakeholder={typeof sp.stakeholderId === "string" ? sp.stakeholderId : ""}
        initialStatus={typeof sp.status === "string" ? sp.status : ""}
        canEdit={ctx.canEdit}
      />
    </>
  );
}
