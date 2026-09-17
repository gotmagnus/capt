import Link from "next/link";
import { PieChart } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader, EmptyState, Stat } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { date, percent, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewPlanDialog } from "./plan-dialogs";

export const metadata = { title: "Equity plans" };

export default async function EquityPlansPage(props: PageProps<"/app/[companyId]/equity-plans">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const s = data.summary;
  const classes = data.shareClasses
    .filter((c) => c.type === "COMMON")
    .map((c) => ({ id: c.id, name: c.name, available: s.classTotals.find((x) => x.shareClassId === c.id)?.available ?? c.authorizedShares }));
  const totals = s.plans.reduce((a, p) => ({ authorized: a.authorized + p.authorized, granted: a.granted + p.granted, exercised: a.exercised + p.exercised, available: a.available + p.available }), { authorized: 0, granted: 0, exercised: 0, available: 0 });

  return (
    <>
      <PageHeader
        title="Equity plans"
        description="Option pools and the awards drawn from them. Availability is computed live from outstanding grants."
        actions={ctx.canEdit ? <NewPlanDialog companyId={C} shareClasses={classes} /> : null}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Reserved across plans" value={shares(totals.authorized)} hint={`${s.plans.length} plan${s.plans.length === 1 ? "" : "s"}`} />
        <Stat label="Outstanding grants" value={shares(totals.granted)} hint={`${shares(totals.exercised)} exercised`} />
        <Stat label="Available to grant" value={shares(totals.available)} hint={`${percent(s.totals.fullyDilutedShares ? totals.available / s.totals.fullyDilutedShares : 0, 1)} of fully diluted`} tone={totals.authorized && totals.available / totals.authorized < 0.15 ? "warning" : "default"} />
        <Stat label="Pool utilization" value={percent(totals.authorized ? (totals.granted + totals.exercised) / totals.authorized : 0, 0)} hint="Granted + exercised ÷ reserved" />
      </div>

      {s.plans.length === 0 ? (
        <EmptyState icon={PieChart} title="No equity plan yet" description="Create an equity incentive plan to reserve a pool of shares for employee, advisor and consultant awards." action={ctx.canEdit ? <NewPlanDialog companyId={C} shareClasses={classes} /> : null} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.equityPlans.map((p) => {
            const ps = s.plans.find((x) => x.id === p.id)!;
            const cls = data.shareClasses.find((c) => c.id === p.shareClassId);
            const grants = data.securities.filter((x) => x.equityPlanId === p.id);
            return (
              <Card key={p.id} className={cn("flex flex-col", data.equityPlans.length === 1 && "lg:col-span-2")}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      <Link href={`/app/${C}/equity-plans/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {cls?.name ?? "—"} · adopted {date(p.adoptionDate)} · expires {date(p.expirationDate)}
                    </CardDescription>
                  </div>
                  <StatusBadge status={p.status} />
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-2xl font-semibold tabular">{shares(ps.available)}</span>
                    <span className="text-xs text-muted-foreground tabular">available of {shares(ps.authorized)} reserved</span>
                  </div>
                  <Progress value={ps.utilizationPct * 100} className="mt-3" tone={ps.utilizationPct > 0.85 ? "danger" : ps.utilizationPct > 0.7 ? "warning" : "accent"} />
                  <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-3 text-xs sm:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Granted</div>
                      <div className="font-medium tabular">{shares(ps.granted)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Exercised</div>
                      <div className="font-medium tabular">{shares(ps.exercised)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Returned</div>
                      <div className="font-medium tabular">{shares(ps.cancelled)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Awards</div>
                      <div className="font-medium tabular">{grants.length}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{percent(s.totals.fullyDilutedShares ? ps.available / s.totals.fullyDilutedShares : 0, 1)} of fully diluted unallocated</span>
                    <Link href={`/app/${C}/equity-plans/${p.id}`} className="text-accent-foreground hover:underline">
                      View plan →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
