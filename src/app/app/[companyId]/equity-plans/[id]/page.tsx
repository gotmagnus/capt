import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader, Stat, Section, DescriptionList, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { date, humanize, percent, shares, toInputDate } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { effectiveVesting, isExercisable, isVestingType } from "@/lib/securities-utils";
import { EditPlanDialog, IncreaseReserveDialog, TerminatePlanButton } from "../plan-dialogs";
import { PlanGrantsTable, type PlanGrantRow } from "./plan-grants-table";

export async function generateMetadata(props: PageProps<"/app/[companyId]/equity-plans/[id]">) {
  const { companyId, id } = await props.params;
  const p = await db.equityPlan.findFirst({ where: { id, company: { OR: [{ id: companyId }, { slug: companyId }] } }, select: { name: true } });
  return { title: p?.name ?? "Equity plan" };
}

export default async function EquityPlanPage(props: PageProps<"/app/[companyId]/equity-plans/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const plan = data.equityPlans.find((p) => p.id === id);
  if (!plan) notFound();
  const ps = data.summary.plans.find((p) => p.id === plan.id)!;
  const cls = data.shareClasses.find((c) => c.id === plan.shareClassId);
  const classTotal = data.summary.classTotals.find((c) => c.shareClassId === plan.shareClassId);
  const planDoc = plan.planDocumentId ? await db.document.findUnique({ where: { id: plan.planDocumentId } }) : await db.document.findFirst({ where: { companyId: C, type: "PLAN_DOCUMENT" }, orderBy: { createdAt: "desc" } });
  const grants = data.securities.filter((x) => x.equityPlanId === plan.id);
  const rows: PlanGrantRow[] = grants.map((x) => {
    const schedule = x.vestingScheduleId ? data.schedules[x.vestingScheduleId] : null;
    const v = schedule && isVestingType(x.type) ? effectiveVesting(x, schedule, x.stakeholder.terminationDate) : null;
    return {
      id: x.id,
      certificateNumber: x.certificateNumber,
      stakeholderId: x.stakeholderId,
      holderName: x.stakeholder.name,
      type: x.type,
      quantity: x.quantity,
      remaining: isExercisable(x.type) ? x.quantity - x.exercisedQuantity - x.cancelledQuantity : x.quantity - x.cancelledQuantity,
      strike: x.exercisePrice,
      grantDate: (x.grantDate ?? x.issueDate).toISOString(),
      vestedPct: v ? v.percentVested : null,
      status: x.status,
    };
  });
  const byType = grants.reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] ?? 0) + 1 }), {});
  const nonOptionUnderPlan = grants.filter((x) => (x.type === "RSU" || x.type === "RSA") && ["OUTSTANDING", "PENDING_SIGNATURE"].includes(x.status)).reduce((a, x) => a + x.quantity - x.cancelledQuantity, 0);
  const fd = data.summary.totals.fullyDilutedShares;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Equity plans", href: `/app/${C}/equity-plans` }, { label: plan.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {plan.name} <StatusBadge status={plan.status} />
          </span>
        }
        description={`${cls?.name ?? "—"} · adopted ${date(plan.adoptionDate)} · expires ${date(plan.expirationDate)}`}
        actions={
          ctx.canEdit ? (
            <>
              <EditPlanDialog companyId={C} plan={{ id: plan.id, name: plan.name, adoptionDate: toInputDate(plan.adoptionDate) || null, boardApprovalDate: toInputDate(plan.boardApprovalDate) || null, stockholderApprovalDate: toInputDate(plan.stockholderApprovalDate) || null, expirationDate: toInputDate(plan.expirationDate) || null, notes: plan.notes }} />
              {plan.status !== "TERMINATED" ? <IncreaseReserveDialog companyId={C} planId={plan.id} planName={plan.name} available={ps.available} classAvailable={classTotal?.available ?? 0} /> : null}
              {plan.status !== "TERMINATED" ? (
                <Button asChild>
                  <Link href={`/app/${C}/securities/new?type=OPTION_ISO&equityPlanId=${plan.id}`}>
                    <Plus /> Grant award
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {ps.utilizationPct > 0.85 && plan.status === "ACTIVE" ? (
        <Alert tone="warning" className="mb-5">
          The pool is {percent(ps.utilizationPct, 0)} utilized. Increase the reserve before the next hiring wave — most investors expect 10–15% unallocated post-round.
        </Alert>
      ) : null}
      {plan.expirationDate && plan.expirationDate < new Date() && plan.status === "ACTIVE" ? (
        <Alert tone="danger" className="mb-5">
          This plan expired on {date(plan.expirationDate)}. New grants require a new or amended plan.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        <Stat className="sm:col-span-2 xl:col-span-1" label="Reserved" value={shares(ps.authorized)} hint={`${percent(fd ? ps.authorized / fd : 0, 1)} of fully diluted`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Outstanding grants" value={shares(ps.granted)} hint={`${grants.filter((g) => ["OUTSTANDING", "PENDING_SIGNATURE"].includes(g.status)).length} awards`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Exercised" value={shares(ps.exercised)} hint="Shares issued on exercise" />
        <Stat className="sm:col-span-3 xl:col-span-1" label="Returned to pool" value={shares(ps.cancelled)} hint="Cancelled or forfeited" />
        <Stat className="col-span-2 sm:col-span-3 xl:col-span-1" label="Available" value={shares(ps.available)} hint={`${percent(fd ? ps.available / fd : 0, 1)} of fully diluted`} tone={ps.utilizationPct > 0.85 ? "warning" : "success"} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pool utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={ps.utilizationPct * 100} className="h-2.5" tone={ps.utilizationPct > 0.85 ? "danger" : ps.utilizationPct > 0.7 ? "warning" : "accent"} />
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground tabular">{percent(ps.utilizationPct, 1)}</span> used
              </span>
              {Object.entries(byType).map(([t, n]) => (
                <span key={t}>
                  {n} {SECURITY_TYPE_LABELS[t as SecurityType] ?? humanize(t)}
                </span>
              ))}
              {nonOptionUnderPlan > 0 ? <span>{shares(nonOptionUnderPlan)} RSU/RSA shares under this plan are counted as issued/unsettled shares rather than pool grants</span> : null}
            </div>
            <DescriptionList
              className="mt-5"
              columns={4}
              items={[
                { label: "Board approval", value: date(plan.boardApprovalDate) },
                { label: "Stockholder approval", value: date(plan.stockholderApprovalDate) },
                { label: "Share class", value: cls?.name ?? "—" },
                { label: "Class unreserved", value: shares(classTotal?.available ?? 0) },
              ]}
            />
            {plan.notes ? <p className="mt-4 whitespace-pre-line text-[13px] text-muted-foreground">{plan.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" /> Plan document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planDoc ? (
              <Link href={`/app/${C}/documents/${planDoc.id}`} className="block rounded-md border border-border p-3 hover:bg-muted/50">
                <div className="text-[13px] font-medium">{planDoc.name}</div>
                <div className="text-xs text-muted-foreground">Updated {date(planDoc.updatedAt)}</div>
              </Link>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No plan document uploaded.{" "}
                <Link href={`/app/${C}/documents`} className="text-accent-foreground hover:underline">
                  Upload one
                </Link>
                .
              </p>
            )}
            {ctx.canEdit ? <TerminatePlanButton companyId={C} planId={plan.id} planName={plan.name} active={plan.status !== "TERMINATED"} /> : null}
          </CardContent>
        </Card>
      </div>

      <Section title="Awards" description={`${grants.length} awards granted from this plan`}>
        <PlanGrantsTable companyId={C} rows={rows} />
      </Section>
    </>
  );
}
