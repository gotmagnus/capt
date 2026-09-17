import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInDays } from "date-fns";
import { ArrowRight, CheckCircle2, FileText, Pencil, Rocket, Trash2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { compactMoney, date, money, percent, price, shares } from "@/lib/format";
import { PageHeader, Section, DescriptionList, EmptyState, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { ConfirmButton } from "@/components/forms";
import { RoundDialog } from "../../round-dialog";
import { deleteRound } from "../../actions";

export const metadata = { title: "Round" };

export default async function RoundDetailPage(props: PageProps<"/app/[companyId]/fundraising/rounds/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const round = await db.fundingRound.findFirst({ where: { id, companyId: C }, include: { shareClass: true } });
  if (!round) notFound();
  const [data, termSheets, consents] = await Promise.all([
    loadCapTable(C),
    db.document.findMany({ where: { companyId: C, type: "TERM_SHEET" }, orderBy: { createdAt: "desc" } }),
    db.boardConsent.findMany({ where: { companyId: C, type: "ROUND_APPROVAL" }, orderBy: { createdAt: "desc" } }),
  ]);
  const closed = round.status === "CLOSED";
  const near = (d: Date) => !round.closeDate || Math.abs(differenceInDays(d, round.closeDate)) <= 30;
  const participants = closed && round.shareClassId ? data.securities.filter((s) => s.shareClassId === round.shareClassId && s.type === "PREFERRED_SHARES" && near(s.issueDate)) : [];
  const newMoney = participants.filter((p) => !/conversion/i.test(p.notes ?? ""));
  const converted = participants.filter((p) => /conversion/i.test(p.notes ?? ""));
  const conversionTx = closed ? data.transactions.filter((t) => t.type === "CONVERSION" && near(t.effectiveDate)) : [];
  const totalShares = participants.reduce((a, p) => a + p.quantity, 0);
  const postFD = data.summary.totals.fullyDilutedShares;
  const relatedConsent = consents.find((c) => c.title.includes(round.name));
  const relatedTermSheet = termSheets.find((t) => t.name.toLowerCase().includes(round.name.toLowerCase())) ?? (closed ? undefined : termSheets[0]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Fundraising", href: `/app/${C}/fundraising` }, { label: round.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {round.name} <StatusBadge status={round.status} />
          </span>
        }
        description={closed ? `Closed ${date(round.closeDate, "long")} · ${money(round.amountRaised)} raised at ${price(round.pricePerShare)} per share` : `Planned ${round.roundType.toLowerCase().replace("_", " ")} round${round.closeDate ? ` targeting ${date(round.closeDate, "long")}` : ""}`}
        actions={
          ctx.canEdit ? (
            <>
              {!closed ? (
                <ConfirmButton action={deleteRound} hidden={{ companyId: C, roundId: round.id }} title="Delete this planned round?" description="The round record will be removed. No securities are affected." confirmLabel="Delete round" variant="ghost" redirectTo={`/app/${C}/fundraising`} successMessage="Round deleted">
                  <Trash2 /> Delete
                </ConfirmButton>
              ) : null}
              <RoundDialog
                companyId={C}
                round={round}
                shareClasses={data.shareClasses}
                trigger={
                  <Button variant="secondary">
                    <Pencil /> Edit terms
                  </Button>
                }
              />
              {!closed ? (
                <Button asChild>
                  <Link href={`/app/${C}/fundraising/rounds/${round.id}/close`}>
                    <Rocket /> Close round
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {!closed ? (
        <Alert tone="info" className="mb-5">
          Closing the round prices the shares from the pre-money valuation, converts outstanding SAFEs and notes, tops up the option pool and issues certificates — all in one step with a preview first.{" "}
          <Link href={`/app/${C}/modeling`} className="font-medium underline">
            Model it first
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Terms</CardTitle>
              <CardDescription>{closed ? "As recorded at close" : "Planned terms — editable until close"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DescriptionList
              columns={3}
              className="grid-cols-2 sm:grid-cols-3"
              items={[
                { label: "Type", value: round.roundType.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) },
                { label: closed ? "Amount raised" : "Target amount", value: money(closed ? round.amountRaised : round.targetAmount) },
                { label: "Price per share", value: price(round.pricePerShare) },
                { label: "Pre-money valuation", value: compactMoney(round.preMoneyValuation) },
                { label: "Post-money valuation", value: compactMoney(round.postMoneyValuation) },
                { label: "Lead investor", value: round.leadInvestor ?? "—" },
                { label: "Share class", value: round.shareClass ? <Link href={`/app/${C}/share-classes`} className="hover:underline">{round.shareClass.name}</Link> : "New class at close" },
                { label: "Option pool increase", value: round.optionPoolIncrease ? `${shares(round.optionPoolIncrease)} shares` : "—" },
                { label: closed ? "Close date" : "Planned close", value: date(round.closeDate) },
              ]}
            />
            {round.shareClass ? (
              <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{round.shareClass.name}:</span> {round.shareClass.liquidationMultiple}x {round.shareClass.participating ? `participating${round.shareClass.participationCap ? ` (cap ${round.shareClass.participationCap}x)` : ""}` : "non-participating"} preference · seniority {round.shareClass.seniority} · {round.shareClass.conversionRatio}:1 conversion ·{" "}
                {round.shareClass.dividendRate ? `${round.shareClass.dividendRate}% ${round.shareClass.dividendType.toLowerCase().replace("_", "-")} dividends` : "no dividends"} · {round.shareClass.antiDilution.toLowerCase().replace(/_/g, " ")} anti-dilution
              </div>
            ) : null}
            {round.notes ? <p className="mt-4 text-[13px] text-muted-foreground whitespace-pre-line">{round.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Documents & approvals</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {relatedTermSheet ? (
              <Link href={`/app/${C}/documents/${relatedTermSheet.id}`} className="flex items-center gap-2 rounded-md border border-border p-3 text-[13px] hover:bg-muted/50">
                <FileText className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{relatedTermSheet.name}</span>
                <Badge variant="outline">Term sheet</Badge>
              </Link>
            ) : (
              <Link href={`/app/${C}/fundraising/term-sheet`} className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-[13px] text-muted-foreground hover:bg-muted/50">
                <FileText className="size-4" /> No term sheet on file — scan one
              </Link>
            )}
            {relatedConsent ? (
              <Link href={`/app/${C}/board/${relatedConsent.id}`} className="flex items-center gap-2 rounded-md border border-border p-3 text-[13px] hover:bg-muted/50">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{relatedConsent.title}</span>
                <StatusBadge status={relatedConsent.status} />
              </Link>
            ) : null}
            {closed && round.shareClass ? (
              <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                {shares(totalShares)} shares issued ({percent(postFD ? totalShares / postFD : 0, 1)} of today's fully diluted) across {participants.length} certificates.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {closed ? (
        <>
          <Section title="Participants" description="New money investors in this round" className="mt-8">
            {newMoney.length === 0 ? (
              <EmptyState title="No participants recorded" description="Shares issued in this class within 30 days of the close date appear here." />
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto scrollbar-thin">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Investor</th>
                      <th className="max-sm:hidden">Certificate</th>
                      <th className="text-right max-sm:hidden">Shares</th>
                      <th className="text-right max-sm:hidden">Price</th>
                      <th className="text-right">Invested</th>
                      <th className="text-right max-sm:hidden">% of round</th>
                      <th className="text-right max-sm:hidden">% FD today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newMoney.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/app/${C}/stakeholders/${p.stakeholderId}`} className="flex items-center gap-2 hover:underline">
                            <Avatar name={p.stakeholder.name} size="xs" /> <span className="max-w-[11rem] truncate sm:max-w-none">{p.stakeholder.name}</span>
                          </Link>
                          {/* Phones: certificate, shares and round share fold under the investor. */}
                          <div className="mt-0.5 pl-7 text-xs tabular text-muted-foreground sm:hidden">
                            <span className="font-mono">{p.certificateNumber}</span> · {shares(p.quantity)} sh · {percent(totalShares ? p.quantity / totalShares : 0, 1)} of round
                          </div>
                        </td>
                        <td className="max-sm:hidden">
                          <Link href={`/app/${C}/securities/${p.id}`} className="font-mono text-xs hover:underline">
                            {p.certificateNumber}
                          </Link>
                        </td>
                        <td className="num max-sm:hidden">{shares(p.quantity)}</td>
                        <td className="num max-sm:hidden">{price(p.pricePerShare)}</td>
                        <td className="num">{money(p.totalAmount ?? (p.pricePerShare ?? 0) * p.quantity)}</td>
                        <td className="num max-sm:hidden">{percent(totalShares ? p.quantity / totalShares : 0, 1)}</td>
                        <td className="num max-sm:hidden">{percent(postFD ? p.quantity / postFD : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total new money</td>
                      <td className="max-sm:hidden" />
                      <td className="num max-sm:hidden">{shares(newMoney.reduce((a, p) => a + p.quantity, 0))}</td>
                      <td className="max-sm:hidden" />
                      <td className="num">{money(newMoney.reduce((a, p) => a + (p.totalAmount ?? (p.pricePerShare ?? 0) * p.quantity), 0))}</td>
                      <td colSpan={2} className="max-sm:hidden" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {converted.length || conversionTx.length ? (
            <Section title="Converted instruments" description="SAFEs and notes that converted into this round" className="mt-8">
              <div className="rounded-lg border border-border bg-card overflow-x-auto scrollbar-thin">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Instrument</th>
                      <th className="max-sm:hidden">Holder</th>
                      <th className="text-right">
                        <span className="sm:hidden">Converted</span>
                        <span className="max-sm:hidden">Principal + interest</span>
                      </th>
                      <th className="text-right max-sm:hidden">Conversion price</th>
                      <th className="text-right">Shares</th>
                      <th className="max-sm:hidden">Issued as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversionTx.map((t) => {
                      const source = t.securityId ? data.securities.find((x) => x.id === t.securityId) : undefined;
                      const issued = converted.find((c) => c.stakeholderId === source?.stakeholderId && Math.abs(c.quantity - t.quantity) < 1);
                      const holderName = source?.stakeholder.name ?? data.stakeholders.find((x) => x.id === t.toStakeholderId)?.name ?? "—";
                      return (
                        <tr key={t.id}>
                          <td>
                            {source ? (
                              <Link href={`/app/${C}/securities/${source.id}`} className="font-mono text-xs hover:underline">
                                {source.certificateNumber}
                              </Link>
                            ) : (
                              "—"
                            )}
                            <div className="max-w-[10rem] truncate text-xs text-muted-foreground sm:hidden">
                              {holderName} · {price(t.pricePerShare)}
                            </div>
                          </td>
                          <td className="max-sm:hidden">{holderName}</td>
                          <td className="num">{money(t.totalAmount)}</td>
                          <td className="num max-sm:hidden">{price(t.pricePerShare)}</td>
                          <td className="num">{shares(t.quantity)}</td>
                          <td className="max-sm:hidden">
                            {issued ? (
                              <Link href={`/app/${C}/securities/${issued.id}`} className="font-mono text-xs hover:underline">
                                {issued.certificateNumber}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{round.shareClass?.name}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}
        </>
      ) : (
        <Section title="What happens at close" className="mt-8">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Price the round", "Price per share = pre-money ÷ fully diluted shares (after pool top-up and conversions)."],
              ["Convert instruments", `${data.summary.totals.safeCount} SAFE(s) and ${data.summary.totals.noteCount} note(s) convert at the better of cap or discount.`],
              ["Issue preferred", "Each investor receives a certificate in the new class; a board consent is drafted."],
              ["Update the pool", "The equity plan reserve is increased to hit the post-money pool target."],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">Step {i + 1}</div>
                <div className="mt-1 text-[13px] font-semibold">{t}</div>
                <p className="mt-1 text-xs text-muted-foreground">{b}</p>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <Link href={`/app/${C}/modeling`} className="inline-flex items-center gap-1 text-[13px] text-accent-foreground hover:underline">
              Open the round modeler <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Section>
      )}

      {relatedTermSheet?.content && !closed ? (
        <Section title="Term sheet" className="mt-8">
          <Card>
            <CardContent className="pt-5">
              <Markdown content={relatedTermSheet.content} className="max-w-3xl" />
            </CardContent>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
