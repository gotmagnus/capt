import { requireCompany } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPortal } from "@/lib/portal-data";
import { date, money, shares } from "@/lib/format";
import { PageHeader, EmptyState, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/forms";
import { ExerciseSimulator, type SimGrant } from "@/components/portal-exercise-simulator";
import { exerciseMethodLabel } from "@/components/people-labels";
import { NoHoldings } from "../no-holdings";
import { cancelExerciseRequest } from "../actions";

export const metadata = { title: "Exercise simulator" };

export default async function ExercisePage(props: PageProps<"/portal/[companyId]/exercise">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const requests = await db.exerciseRequest.findMany({ where: { companyId: C, stakeholderId: { in: [...p.myIds] } }, include: { security: true }, orderBy: { requestedAt: "desc" } });
  const openIds = new Set(requests.filter((r) => ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"].includes(r.status)).map((r) => r.securityId));
  const grants: SimGrant[] = p.holdings
    .filter((h) => h.isExercisable && h.security.status === "OUTSTANDING" && h.exercisable > 0)
    .map((h) => ({ id: h.security.id, certificateNumber: h.security.certificateNumber, type: h.security.type, strike: h.security.exercisePrice ?? 0, exercisable: h.exercisable, unexercised: h.unexercised, vested: h.vesting.vested, exercised: h.security.exercisedQuantity, grantDate: (h.security.grantDate ?? h.security.issueDate).toISOString(), earlyExercise: h.security.earlyExercise, hasOpenRequest: openIds.has(h.security.id) }));
  const initial = typeof sp.grant === "string" ? sp.grant : undefined;

  return (
    <>
      <PageHeader title="Exercise simulator" description="Estimate what it costs to exercise your options — the purchase price, tax withholding and Alternative Minimum Tax — and submit a request when you're ready." />
      <Alert tone="warning" className="mb-5">
        These figures are estimates based on 2025 US federal rules and simplified state rates. They are not tax advice; please consult a tax professional before exercising.
      </Alert>
      {grants.length === 0 ? <EmptyState title="Nothing to exercise yet" description="You'll be able to simulate and request an exercise once you have vested options." /> : <ExerciseSimulator companyId={C} grants={grants} fmv={p.fmv} initialGrantId={initial} />}

      {requests.length ? (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle>Your exercise requests</CardTitle>
            </div>
          </CardHeader>
          {/* Phones: stacked rows; the 7-column table returns from sm up. */}
          <CardContent className="divide-y divide-border border-t border-border px-0 pb-0 sm:hidden">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium tabular">
                    {shares(r.quantity)} options · {money(r.totalCost, { cents: true })}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{r.security.certificateNumber}</span> · {date(r.requestedAt)} · {exerciseMethodLabel(r.method)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={r.status} />
                  {["REQUESTED", "APPROVED"].includes(r.status) ? (
                    <ConfirmButton action={cancelExerciseRequest} hidden={{ companyId: C, id: r.id }} title="Cancel this exercise request?" variant="ghost" size="xs" confirmLabel="Cancel request" successMessage="Request cancelled">
                      Cancel
                    </ConfirmButton>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
          <CardContent className="hidden px-0 pb-0 sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Grant</th>
                  <th className="text-right">Options</th>
                  <th className="text-right">Cost</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.requestedAt)}</td>
                    <td className="font-mono text-xs">{r.security.certificateNumber}</td>
                    <td className="num">{shares(r.quantity)}</td>
                    <td className="num">{money(r.totalCost, { cents: true })}</td>
                    <td className="text-muted-foreground">{exerciseMethodLabel(r.method)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-right">
                      {["REQUESTED", "APPROVED"].includes(r.status) ? (
                        <ConfirmButton action={cancelExerciseRequest} hidden={{ companyId: C, id: r.id }} title="Cancel this exercise request?" variant="ghost" size="xs" confirmLabel="Cancel request" successMessage="Request cancelled">
                          Cancel
                        </ConfirmButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
