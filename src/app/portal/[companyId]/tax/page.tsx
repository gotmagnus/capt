import Link from "next/link";
import { addYears, isAfter } from "date-fns";
import { requireCompany } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPortal } from "@/lib/portal-data";
import { election83bStatus } from "@/lib/equity/compliance";
import { date, money, price, shares } from "@/lib/format";
import { PageHeader, Alert } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoHoldings } from "../no-holdings";

export const metadata = { title: "Tax center" };

export default async function TaxCenterPage(props: PageProps<"/portal/[companyId]/tax">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const ids = [...p.myIds];
  const [docs, exercises] = await Promise.all([
    db.document.findMany({ where: { companyId: C, stakeholderId: { in: ids }, type: { in: ["ELECTION_83B", "FORM_3921"] } }, orderBy: { createdAt: "desc" } }),
    db.exerciseRequest.findMany({ where: { companyId: C, stakeholderId: { in: ids }, status: "COMPLETED" }, include: { security: true }, orderBy: { completedAt: "desc" } }),
  ]);
  const elections = election83bStatus(
    p.holdings.filter((h) => h.security.type === "RSA" || (h.isExercisable && h.security.earlyExercise && h.security.exercisedQuantity > 0)).map((h) => ({ securityId: h.security.id, certificateNumber: h.security.certificateNumber, stakeholderName: h.security.stakeholder.name, type: h.security.type, issueDate: h.security.issueDate, filedDate: h.security.election83bFiledDate, deadline: h.security.election83bDeadline })),
  );
  const electionDocs = docs.filter((d) => d.type === "ELECTION_83B");
  const forms3921 = docs.filter((d) => d.type === "FORM_3921");
  const now = new Date();
  const isoExercises = exercises.filter((e) => e.isIso);

  return (
    <>
      <PageHeader title="Tax center" description="Elections, forms and holding periods for your equity, in one place." />
      <Alert tone="warning" className="mb-5">
        This page organizes your records and explains general US rules. It isn't tax advice — your situation may differ, so consult a tax professional.
      </Alert>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>83(b) elections</CardTitle>
              <CardDescription>Required within 30 days of receiving restricted stock or early-exercising options.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {elections.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">None of your holdings require an 83(b) election.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Security</th>
                    <th>Transfer date</th>
                    <th>Deadline</th>
                    <th>Filed</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {elections.map((e) => {
                    const doc = electionDocs.find((d) => d.securityId === e.securityId);
                    return (
                      <tr key={e.securityId}>
                        <td className="font-mono text-xs">{e.certificateNumber}</td>
                        <td>{date(e.issueDate)}</td>
                        <td>{date(e.deadline)}</td>
                        <td>{e.filedDate ? date(e.filedDate) : <span className="text-subtle">—</span>}</td>
                        <td>
                          <StatusBadge status={e.status} />
                          {e.status === "DUE" ? <span className="ml-2 text-xs text-muted-foreground">{e.daysRemaining} days left</span> : null}
                        </td>
                        <td className="text-right">
                          {doc ? (
                            <Button size="xs" variant="secondary" asChild>
                              <Link href={`/portal/${C}/documents/${doc.id}`}>Open election</Link>
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Form 3921 — ISO exercises</CardTitle>
              <CardDescription>Issued by the company each January for ISOs exercised in the prior year. Use it for the AMT calculation on Form 6251.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {forms3921.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">No Form 3921 has been issued to you yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Form</th>
                    <th>Issued</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {forms3921.map((d) => (
                    <tr key={d.id}>
                      <td className="max-sm:whitespace-normal">{d.name}</td>
                      <td>{date(d.createdAt)}</td>
                      <td className="text-right">
                        <Button size="xs" variant="secondary" asChild>
                          <Link href={`/portal/${C}/documents/${d.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>ISO holding periods</CardTitle>
              <CardDescription>Hold shares 2 years from grant and 1 year from exercise for a qualifying disposition (long-term capital gains on the whole gain).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isoExercises.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">You haven't exercised any ISOs yet.</p>
            ) : (
              <>
                {/* Phones: one block per exercise; the 9-column table returns from md up. */}
                <ul className="divide-y divide-border border-t border-border md:hidden">
                  {isoExercises.map((e) => {
                    const grantDate = e.security.grantDate ?? e.security.issueDate;
                    const exDate = e.completedAt ?? e.requestedAt;
                    const twoY = addYears(grantDate, 2);
                    const oneY = addYears(exDate, 1);
                    const qualifying = isAfter(twoY, oneY) ? twoY : oneY;
                    const qualified = !isAfter(qualifying, now);
                    return (
                      <li key={e.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-medium tabular">
                            <span className="font-mono text-xs">{e.security.certificateNumber}</span> · {shares(e.quantity)} shares
                          </span>
                          {qualified ? <Badge variant="success">Qualified</Badge> : <Badge variant="warning">Hold until {date(qualifying)}</Badge>}
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Granted</dt>
                            <dd className="mt-0.5 font-medium tabular">{date(grantDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Exercised</dt>
                            <dd className="mt-0.5 font-medium tabular">{date(exDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Price → FMV at exercise</dt>
                            <dd className="mt-0.5 font-medium tabular">
                              {price(e.exercisePrice)} → {price(e.fmvAtExercise)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Spread</dt>
                            <dd className="mt-0.5 font-medium tabular">{money(((e.fmvAtExercise ?? 0) - e.exercisePrice) * e.quantity, { cents: true })}</dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden overflow-x-auto scrollbar-thin md:block">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Grant</th>
                        <th className="text-right">Shares</th>
                        <th>Granted</th>
                        <th>Exercised</th>
                        <th className="text-right">Exercise price</th>
                        <th className="text-right">FMV at exercise</th>
                        <th className="text-right">Spread</th>
                        <th>Qualifying from</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isoExercises.map((e) => {
                        const grantDate = e.security.grantDate ?? e.security.issueDate;
                        const exDate = e.completedAt ?? e.requestedAt;
                        const twoY = addYears(grantDate, 2);
                        const oneY = addYears(exDate, 1);
                        const qualifying = isAfter(twoY, oneY) ? twoY : oneY;
                        const qualified = !isAfter(qualifying, now);
                        return (
                          <tr key={e.id}>
                            <td className="font-mono text-xs">{e.security.certificateNumber}</td>
                            <td className="num">{shares(e.quantity)}</td>
                            <td>{date(grantDate)}</td>
                            <td>{date(exDate)}</td>
                            <td className="num">{price(e.exercisePrice)}</td>
                            <td className="num">{price(e.fmvAtExercise)}</td>
                            <td className="num">{money(((e.fmvAtExercise ?? 0) - e.exercisePrice) * e.quantity, { cents: true })}</td>
                            <td>{date(qualifying)}</td>
                            <td>{qualified ? <Badge variant="success">Qualified</Badge> : <Badge variant="warning">Hold until {date(qualifying)}</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Fair market value history</CardTitle>
                <CardDescription>The 409A value of common stock over time.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Valuation date</th>
                    <th className="text-right">FMV / share</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {p.valuations.map((v) => (
                    <tr key={v.id}>
                      <td>{date(v.valuationDate)}</td>
                      <td className="num">{price(v.fairMarketValue)}</td>
                      <td>
                        <StatusBadge status={v.status === "ACCEPTED" ? "CURRENT" : v.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>How your equity is taxed</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px] leading-relaxed">
              <p>
                <span className="font-medium">ISOs.</span> No regular income tax when you exercise, but the spread counts toward Alternative Minimum Tax. Meet the holding periods and the entire gain on sale is a long-term capital gain.
              </p>
              <p>
                <span className="font-medium">NSOs.</span> The spread at exercise is ordinary income reported on your W-2 with withholding. Gains after exercise are capital gains (long-term after one year).
              </p>
              <p>
                <span className="font-medium">RSUs.</span> Taxed as ordinary income when they settle into shares, based on the value that day. Companies typically withhold shares to cover the tax.
              </p>
              <p>
                <span className="font-medium">Restricted stock.</span> Without an 83(b) election each vesting tranche is income at its then-current value. With a timely 83(b), you're taxed on the (usually tiny) value at grant and everything after is capital gain.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
