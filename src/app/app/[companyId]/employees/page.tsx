import Link from "next/link";
import { Download, Plus, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { buildEmployeeRows } from "@/lib/people-data";
import { money, percent, shares } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { PageHeader, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { LinkTabs } from "@/components/people-tabs";
import { EmployeesTable } from "@/components/people-employees-table";
import { HiringPlanner } from "@/components/people-hiring-planner";
import { RefreshPlanner } from "@/components/people-refresh-planner";
import { PoolForecast } from "@/components/people-pool-forecast";
import { HrisSync } from "@/components/people-hris";

export const metadata = { title: "Employees" };

const TABS = [
  { key: "employees", label: "Employees" },
  { key: "hiring", label: "Hiring planner" },
  { key: "refresh", label: "Refresh planner" },
  { key: "forecast", label: "Pool forecast" },
  { key: "hris", label: "HRIS sync" },
];

export default async function EmployeesPage(props: PageProps<"/app/[companyId]/employees">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "employees";
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, valuation, scenarios, integrations] = await Promise.all([
    loadCapTable(C),
    currentValuation(C),
    db.scenario.findMany({ where: { companyId: C, type: { in: ["HIRING", "REFRESH", "POOL_FORECAST"] } }, orderBy: { updatedAt: "desc" } }),
    db.integration.findMany({ where: { companyId: C, category: "HRIS" } }),
  ]);
  const fmv = valuation?.fairMarketValue ?? null;
  const rows = buildEmployeeRows(data, fmv);
  const active = rows.filter((r) => r.employmentStatus === "ACTIVE" && r.relationship !== "FORMER_EMPLOYEE");
  const totalGranted = rows.reduce((a, r) => a + r.granted, 0);
  const totalVested = rows.reduce((a, r) => a + r.vested, 0);
  const totalLive = rows.reduce((a, r) => a + r.granted - r.forfeited, 0);
  const exercisableValue = rows.reduce((a, r) => a + r.vestedValue, 0);
  const s = data.summary;
  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[];
  const scenarioDto = scenarios.map((x) => ({ id: x.id, name: x.name, type: x.type, description: x.description, params: parseJson<Record<string, unknown>>(x.params, {}), updatedAt: x.updatedAt.toISOString() }));
  const refreshSchedule = data.vestingSchedules.find((v) => /refresh/i.test(v.name)) ?? data.vestingSchedules.find((v) => v.type === "TIME") ?? null;
  const groups = Object.fromEntries(s.groups.map((g) => [g.key, g.fullyDilutedShares]));
  const unvestedOptions = rows.filter((r) => r.employmentStatus === "ACTIVE").reduce((a, r) => a + r.grants.filter((g) => g.type.startsWith("OPTION")).reduce((b, g) => b + g.unvested, 0), 0);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Equity across your team: grants, vesting, exercisable value, hiring and refresh planning, and HRIS reconciliation."
        actions={
          <>
            <Button variant="secondary" asChild>
              <a href={`/api/companies/${C}/exports/employees`}>
                <Download /> Export CSV
              </a>
            </Button>
            <Button asChild>
              <Link href={`/app/${C}/securities/new?type=OPTION_ISO`}>
                <Plus /> New grant
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active employees" value={active.length} hint={`${rows.length - active.length} former / advisors`} icon={Users} />
        <Stat label="Total granted" value={shares(totalGranted)} hint={`${percent(s.totals.fullyDilutedShares ? totalLive / s.totals.fullyDilutedShares : 0, 1)} of fully diluted`} />
        <Stat label="Vested" value={percent(totalLive ? totalVested / totalLive : 0, 1)} hint={`${shares(totalVested)} of ${shares(totalLive)} live shares`} />
        <Stat label="Exercisable value" value={money(exercisableValue)} hint={fmv ? `In-the-money at $${fmv.toFixed(2)} FMV` : "No 409A on file"} tone="success" />
      </div>
      <LinkTabs base={`/app/${C}/employees`} current={tab} tabs={TABS.map((t) => (t.key === "refresh" ? { ...t, count: rows.filter((r) => r.refreshDue).length } : t))} />

      {tab === "employees" ? <EmployeesTable companyId={C} rows={rows} departments={departments} fmv={fmv} /> : null}
      {tab === "hiring" ? (
        <HiringPlanner
          companyId={C}
          scenarios={scenarioDto.filter((x) => x.type === "HIRING")}
          fullyDiluted={s.totals.fullyDilutedShares}
          poolAvailable={s.totals.poolAvailable}
          groups={{ founders: groups.founders ?? 0, investors: groups.investors ?? 0, employees: groups.employees ?? 0, advisors: groups.advisors ?? 0, other: groups.other ?? 0 }}
          fmv={fmv}
        />
      ) : null}
      {tab === "refresh" ? <RefreshPlanner companyId={C} rows={rows.filter((r) => r.grantCount > 0 && r.employmentStatus === "ACTIVE")} fmv={fmv} fullyDiluted={s.totals.fullyDilutedShares} refreshScheduleId={refreshSchedule?.id ?? ""} refreshScheduleName={refreshSchedule?.name ?? "Refresh schedule"} /> : null}
      {tab === "forecast" ? (
        <PoolForecast
          companyId={C}
          poolAvailable={s.totals.poolAvailable}
          poolAuthorized={s.totals.poolAuthorized}
          fullyDiluted={s.totals.fullyDilutedShares}
          unvestedOptions={unvestedOptions}
          suggestedRefreshTotal={rows.filter((r) => r.refreshDue).reduce((a, r) => a + r.suggestedRefresh, 0)}
          hiringScenarios={scenarioDto.filter((x) => x.type === "HIRING")}
          forecastScenarios={scenarioDto.filter((x) => x.type === "POOL_FORECAST")}
        />
      ) : null}
      {tab === "hris" ? (
        <HrisSync
          companyId={C}
          integrations={integrations.map((i) => ({ id: i.id, provider: i.provider, status: i.status, connectedAt: i.connectedAt?.toISOString() ?? null, lastSyncAt: i.lastSyncAt?.toISOString() ?? null, config: parseJson<Record<string, unknown>>(i.config, {}) }))}
          employeeCount={active.length}
        />
      ) : null}
    </>
  );
}
