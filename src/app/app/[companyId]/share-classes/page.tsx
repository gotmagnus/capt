import { Layers, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { compactMoney, humanize, money, multiple, percent, price, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, Section, EmptyState, TableWrap } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareClassFormDialog } from "./share-class-form";
import { ShareClassRowActions } from "./share-class-row-actions";

export const metadata = { title: "Share classes" };

const ANTI_DILUTION_LABELS: Record<string, string> = { NONE: "No anti-dilution", BROAD_BASED: "Broad-based WA", NARROW_BASED: "Narrow-based WA", FULL_RATCHET: "Full ratchet" };

/** Row actions stay reachable when the terms table scrolls sideways on narrow screens. */
const stickyActions = "sticky right-0 w-px shadow-[inset_1px_0_0_var(--border)]";

export default async function ShareClassesPage(props: PageProps<"/app/[companyId]/share-classes">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const data = await loadCapTable(C);
  const totals = new Map(data.summary.classTotals.map((c) => [c.shareClassId, c]));
  const ordered = data.shareClasses.slice().sort((a, b) => (a.type === b.type ? a.seniority - b.seniority : a.type === "PREFERRED" ? -1 : 1));
  const preferred = ordered.filter((c) => c.type === "PREFERRED");
  const totalPref = data.summary.totals.totalLiquidationPreference;
  const usage = new Map<string, number>();
  for (const s of data.securities) if (s.shareClassId) usage.set(s.shareClassId, (usage.get(s.shareClassId) ?? 0) + 1);
  const plansByClass = new Map<string, number>();
  for (const p of data.equityPlans) plansByClass.set(p.shareClassId, (plansByClass.get(p.shareClassId) ?? 0) + 1);
  const nextSeniority = preferred.length ? Math.min(...preferred.map((c) => c.seniority)) : 1;

  return (
    <>
      <PageHeader
        title="Share classes"
        description="Authorized capital and the economic terms of each class, as set out in the charter."
        actions={
          ctx.canEdit ? (
            <ShareClassFormDialog
              companyId={C}
              nextSeniority={Math.max(1, nextSeniority)}
              trigger={
                <Button>
                  <Plus /> Add share class
                </Button>
              }
            />
          ) : null
        }
      />

      {ordered.length === 0 ? (
        <EmptyState icon={Layers} title="No share classes" description="Create Common Stock first, then add preferred classes as you close priced rounds." />
      ) : (
        <div className="space-y-5">
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Authorized</th>
                  <th className="text-right">Issued</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Issue price</th>
                  <th className="text-right">Liquidation pref.</th>
                  <th className="text-right">Seniority</th>
                  <th className="text-right">Conversion</th>
                  <th className="text-right">Dividends</th>
                  <th className="text-right">Votes</th>
                  {ctx.canEdit ? <th className={stickyActions} /> : null}
                </tr>
              </thead>
              <tbody>
                {ordered.map((c) => {
                  const t = totals.get(c.id);
                  const isPreferred = c.type === "PREFERRED";
                  return (
                    <tr key={c.id} className="group">
                      {/* Related terms share a cell (type under the name, participation under the preference, anti-dilution under the ratio) so every column fits a laptop screen. */}
                      <td>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          <span className="font-mono">{c.prefix}</span> · {isPreferred ? "Preferred" : "Common"}
                        </span>
                      </td>
                      <td className="num">{shares(c.authorizedShares)}</td>
                      <td className="num">
                        {shares(t?.issued ?? 0)}
                        <span className="block text-[11px] text-muted-foreground">{percent(t?.fullyDilutedPct ?? 0, 1)} FD</span>
                      </td>
                      <td className="num">
                        {shares(t?.available ?? 0)}
                        {t?.reservedForPlans ? <span className="block text-[11px] text-muted-foreground">{shares(t.reservedForPlans)} reserved</span> : null}
                      </td>
                      <td className="num">{c.originalIssuePrice != null ? price(c.originalIssuePrice) : <span className="text-subtle">—</span>}</td>
                      <td className="num">
                        {isPreferred ? (
                          <>
                            {multiple(c.liquidationMultiple)} · {money(t?.liquidationPreference ?? 0)}
                            <span className={cn("block text-[11px]", c.participating ? "font-medium text-warning" : "text-muted-foreground")}>
                              {c.participating ? (c.participationCap ? `Participating, ${multiple(c.participationCap)} cap` : "Participating, uncapped") : "Non-participating"}
                            </span>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="num">{isPreferred ? c.seniority : <span className="text-subtle">Last</span>}</td>
                      <td className="num">
                        {isPreferred ? (
                          <>
                            {c.conversionRatio}:1
                            <span className="block text-[11px] text-muted-foreground">{ANTI_DILUTION_LABELS[c.antiDilution] ?? humanize(c.antiDilution)}</span>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="num">
                        {c.dividendRate ? (
                          <>
                            {c.dividendRate}%<span className="block text-[11px] text-muted-foreground">{c.dividendType === "CUMULATIVE" ? "Cumulative" : "Non-cumulative"}</span>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="num">{c.votesPerShare}</td>
                      {ctx.canEdit ? (
                        <td className={cn(stickyActions, "bg-card text-right group-hover:bg-[#fafbfc]")}>
                          <ShareClassRowActions
                            companyId={C}
                            inUse={(usage.get(c.id) ?? 0) > 0 || (plansByClass.get(c.id) ?? 0) > 0}
                            shareClass={{
                              id: c.id,
                              name: c.name,
                              prefix: c.prefix,
                              type: c.type,
                              authorizedShares: c.authorizedShares,
                              parValue: c.parValue,
                              originalIssuePrice: c.originalIssuePrice,
                              liquidationMultiple: c.liquidationMultiple,
                              participating: c.participating,
                              participationCap: c.participationCap,
                              seniority: c.seniority,
                              conversionRatio: c.conversionRatio,
                              dividendRate: c.dividendRate,
                              dividendType: c.dividendType,
                              antiDilution: c.antiDilution,
                              votesPerShare: c.votesPerShare,
                              boardApprovalDate: c.boardApprovalDate?.toISOString() ?? null,
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Preference stack</CardTitle>
                  <CardDescription>Order in which proceeds are paid in a liquidation, most senior first</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {preferred.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No preferred stock outstanding — all proceeds flow to common.</p>
                ) : (
                  <ol className="space-y-2">
                    {[...new Set(preferred.map((c) => c.seniority))]
                      .sort((a, b) => a - b)
                      .map((tier, i) => {
                        const tierClasses = preferred.filter((c) => c.seniority === tier);
                        const tierPref = tierClasses.reduce((a, c) => a + (totals.get(c.id)?.liquidationPreference ?? 0), 0);
                        return (
                          <li key={tier} className="flex items-center gap-3 rounded-md border border-border p-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-medium">
                                {tierClasses.map((c) => c.name).join(" + ")}
                                {tierClasses.length > 1 ? <Badge variant="neutral" className="ml-2">pari passu</Badge> : null}
                              </div>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-chart-3" style={{ width: `${totalPref ? Math.max(2, (tierPref / totalPref) * 100) : 0}%` }} />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[13px] font-semibold tabular">{compactMoney(tierPref)}</div>
                              <div className="text-[11px] text-muted-foreground">{tierClasses.map((c) => `${multiple(c.liquidationMultiple)}${c.participating ? " part." : ""}`).join(" · ")}</div>
                            </div>
                          </li>
                        );
                      })}
                    <li className="flex items-center gap-3 rounded-md border border-dashed border-border p-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">∞</span>
                      <div className="min-w-0 flex-1 text-[13px] font-medium">Common Stock & as-converted preferred</div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">Residual, pro rata</div>
                    </li>
                  </ol>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Total liquidation preference: {money(totalPref)}. Non-participating classes convert to common when their as-converted value exceeds the preference.</p>
              </CardContent>
            </Card>

            <Section title="Authorized capital" description="Charter authorization versus issued and reserved shares">
              <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                {ordered.map((c) => {
                  const t = totals.get(c.id);
                  const issuedPct = c.authorizedShares ? ((t?.issued ?? 0) / c.authorizedShares) * 100 : 0;
                  const reservedPct = c.authorizedShares ? ((t?.reservedForPlans ?? 0) / c.authorizedShares) * 100 : 0;
                  return (
                    <div key={c.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground tabular sm:text-[13px]">
                          {shares(t?.issued ?? 0)} issued{t?.reservedForPlans ? ` · ${shares(t.reservedForPlans)} reserved` : ""} / {shares(c.authorizedShares)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-accent" style={{ width: `${Math.min(100, issuedPct)}%` }} title="Issued" />
                        <div className="h-full bg-chart-2/60" style={{ width: `${Math.min(100 - issuedPct, reservedPct)}%` }} title="Reserved for plans" />
                      </div>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-accent" /> Issued
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-chart-2/60" /> Reserved for equity plans
                  </span>
                  <span className="sm:ml-auto">Company authorized: {shares(data.company.authorizedShares ?? ordered.reduce((a, c) => a + c.authorizedShares, 0))}</span>
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
