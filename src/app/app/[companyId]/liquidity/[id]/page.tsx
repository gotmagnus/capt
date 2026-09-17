import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { tenderHolders } from "@/lib/people-tender";
import { date, money, percent, price, shares } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { RELATIONSHIP_LABELS, SECURITY_TYPE_LABELS, type SecurityType, type StakeholderRelationship } from "@/lib/types";
import { PageHeader, DescriptionList, Alert, Stat } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { ConfirmButton } from "@/components/forms";
import { RecordElectionDialog } from "@/components/people-tender-election";
import { cancelTender, closeTender, openTender, settleTender, withdrawElection } from "../actions";

export const metadata = { title: "Tender offer" };

export default async function TenderDetailPage(props: PageProps<"/app/[companyId]/liquidity/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const tender = await db.tenderOffer.findFirst({ where: { id, companyId: C }, include: { participants: { include: { stakeholder: true, security: true }, orderBy: { createdAt: "asc" } } } });
  if (!tender) notFound();
  const data = await loadCapTable(C);
  const eligibility = parseJson<string[]>(tender.eligibility, []);
  const holders = tenderHolders(data, eligibility, tender.maxPercentPerHolder);
  const live = tender.participants.filter((p) => p.status !== "WITHDRAWN");
  const totalOffered = live.reduce((a, p) => a + p.sharesOffered, 0);
  const ratio = totalOffered > tender.maxShares ? tender.maxShares / totalOffered : 1;
  const totalAccepted = live.reduce((a, p) => a + (p.sharesAccepted ?? Math.floor(p.sharesOffered * ratio)), 0);
  const offeredByHolder = new Map<string, number>();
  for (const p of live) offeredByHolder.set(p.stakeholderId, (offeredByHolder.get(p.stakeholderId) ?? 0) + p.sharesOffered);
  const holderDtos = holders.filter((h) => h.sellable > 0).map((h) => ({ stakeholderId: h.stakeholderId, name: h.name, cap: h.cap, alreadyOffered: offeredByHolder.get(h.stakeholderId) ?? 0, securities: h.securities.map((s) => ({ securityId: s.securityId, certificateNumber: s.certificateNumber, type: s.type, sellable: s.sellable, exercisePrice: s.exercisePrice })) }));
  const editable = ctx.canEdit && ["DRAFT", "OPEN"].includes(tender.status);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Liquidity", href: `/app/${C}/liquidity` }, { label: tender.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {tender.name} <StatusBadge status={tender.status} />
          </span>
        }
        description={`${tender.buyerName} · ${price(tender.pricePerShare)} per share · window ${date(tender.startDate)} – ${date(tender.endDate)}`}
        actions={
          ctx.canEdit ? (
            <>
              {tender.status === "DRAFT" ? (
                <ConfirmButton action={openTender} hidden={{ companyId: C, id: tender.id }} title="Open the election window" description={`Notifies ${holders.filter((h) => h.sellable > 0).length} eligible holders that they may elect to sell.`} confirmLabel="Open offer" variant="default">
                  Open to holders
                </ConfirmButton>
              ) : null}
              {tender.status === "OPEN" ? (
                <ConfirmButton action={closeTender} hidden={{ companyId: C, id: tender.id }} title="Close elections" description={ratio < 1 ? `Elections total ${shares(totalOffered)} against a cap of ${shares(tender.maxShares)}; each will be prorated to ${percent(ratio, 1)}.` : `All ${shares(totalOffered)} offered shares will be accepted.`} confirmLabel="Close & allocate" variant="default">
                  Close elections
                </ConfirmButton>
              ) : null}
              {tender.status === "CLOSED" ? (
                <ConfirmButton action={settleTender} hidden={{ companyId: C, id: tender.id }} title="Settle transfers" description={`Transfers ${shares(totalAccepted)} shares to ${tender.buyerName} at ${price(tender.pricePerShare)} (${money(totalAccepted * tender.pricePerShare)}), issues new certificates and records the transactions. Options are exercised cashlessly.`} confirmLabel="Settle" variant="default">
                  Settle
                </ConfirmButton>
              ) : null}
              {!["SETTLED", "CANCELLED"].includes(tender.status) ? (
                <ConfirmButton action={cancelTender} hidden={{ companyId: C, id: tender.id }} title="Cancel tender offer" description="All elections will be withdrawn." confirmLabel="Cancel offer" variant="ghost">
                  Cancel
                </ConfirmButton>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Eligible holders" value={holders.filter((h) => h.sellable > 0).length} hint={`${shares(holders.reduce((a, h) => a + h.cap, 0))} shares eligible in total`} />
        <Stat label="Elections" value={live.length} hint={`${shares(totalOffered)} shares offered`} />
        <Stat label="Subscription" value={percent(tender.maxShares ? totalOffered / tender.maxShares : 0, 0)} tone={ratio < 1 ? "warning" : "default"} hint={ratio < 1 ? `Oversubscribed — prorated to ${percent(ratio, 1)}` : `Cap ${shares(tender.maxShares)}`} />
        <Stat label="Purchase value" value={money(totalAccepted * tender.pricePerShare)} hint={`${shares(totalAccepted)} shares accepted`} tone="success" />
      </div>

      {ratio < 1 && tender.status === "OPEN" ? (
        <Alert tone="warning" icon={AlertTriangle} className="mb-5" title="Oversubscribed">
          Holders have offered {shares(totalOffered)} shares against a maximum of {shares(tender.maxShares)}. At close, each election is reduced pro-rata to {percent(ratio, 1)}.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-col sm:flex-row">
              <div className="min-w-0">
                <CardTitle>Elections</CardTitle>
                <CardDescription>{tender.status === "CLOSED" || tender.status === "SETTLED" ? "Final allocations" : "Recorded so far — proration preview shown if oversubscribed"}</CardDescription>
              </div>
              {editable ? <RecordElectionDialog companyId={C} tenderId={tender.id} holders={holderDtos} pricePerShare={tender.pricePerShare} /> : null}
            </CardHeader>
            <CardContent className={tender.participants.length ? "max-sm:px-0 max-sm:pb-0" : undefined}>
              {tender.participants.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No elections yet.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Holder</th>
                      <th>Security</th>
                      <th className="text-right">Offered</th>
                      <th className="text-right">Accepted</th>
                      <th className="text-right">Proceeds</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tender.participants.map((p) => {
                      const accepted = p.status === "WITHDRAWN" ? 0 : p.sharesAccepted ?? Math.floor(p.sharesOffered * ratio);
                      const net = accepted * tender.pricePerShare - (p.security.exercisePrice ?? 0) * accepted;
                      return (
                        <tr key={p.id} className={p.status === "WITHDRAWN" ? "opacity-50" : undefined}>
                          <td>
                            <Link href={`/app/${C}/stakeholders/${p.stakeholderId}`} className="flex items-center gap-2 hover:underline">
                              <Avatar name={p.stakeholder.name} size="xs" /> {p.stakeholder.name}
                            </Link>
                          </td>
                          <td>
                            <span className="font-mono text-xs">{p.security.certificateNumber}</span> <span className="text-xs text-muted-foreground">{SECURITY_TYPE_LABELS[p.security.type as SecurityType]}</span>
                          </td>
                          <td className="num">{shares(p.sharesOffered)}</td>
                          <td className="num">{p.status === "WITHDRAWN" ? "—" : shares(accepted)}</td>
                          <td className="num">{p.status === "WITHDRAWN" ? "—" : money(net)}</td>
                          <td>
                            <StatusBadge status={p.status} />
                          </td>
                          <td>{editable && p.status === "ELECTED" ? <ConfirmButton action={withdrawElection} hidden={{ companyId: C, id: tender.id, participationId: p.id }} title="Withdraw election" confirmLabel="Withdraw" variant="ghost" size="xs">Withdraw</ConfirmButton> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="num">{shares(totalOffered)}</td>
                      <td className="num">{shares(totalAccepted)}</td>
                      <td className="num">{money(totalAccepted * tender.pricePerShare)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Eligible holders</CardTitle>
                <CardDescription>Vested common shares plus vested unexercised options, capped at {tender.maxPercentPerHolder}% per holder</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="max-sm:px-0 max-sm:pb-0">
              {/* Phones keep the decision columns (sellable, cap, elected); the breakdown returns from sm up. */}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th className="max-sm:hidden">Relationship</th>
                    <th className="text-right max-sm:hidden">Shares held</th>
                    <th className="text-right max-sm:hidden">Vested options</th>
                    <th className="text-right">Sellable</th>
                    <th className="text-right">Cap</th>
                    <th className="text-right">Elected</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h) => (
                    <tr key={h.stakeholderId}>
                      <td>
                        <Link href={`/app/${C}/stakeholders/${h.stakeholderId}`} className="flex items-center gap-2 hover:underline">
                          <Avatar name={h.name} size="xs" /> {h.name}
                        </Link>
                      </td>
                      <td className="max-sm:hidden">
                        <Badge variant="outline">{RELATIONSHIP_LABELS[h.relationship as StakeholderRelationship]}</Badge>
                      </td>
                      <td className="num max-sm:hidden">{shares(h.sharesHeld)}</td>
                      <td className="num max-sm:hidden">{shares(h.vestedOptions)}</td>
                      <td className="num">{shares(h.sellable)}</td>
                      <td className="num font-medium">{shares(h.cap)}</td>
                      <td className="num">{offeredByHolder.get(h.stakeholderId) ? shares(offeredByHolder.get(h.stakeholderId)) : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                  {holders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted-foreground">
                        No holders match the eligibility criteria.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start items-start gap-5 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                items={[
                  { label: "Buyer", value: <span className="block whitespace-normal">{tender.buyerName}</span> },
                  { label: "Price per share", value: price(tender.pricePerShare) },
                  { label: "Maximum shares", value: shares(tender.maxShares) },
                  { label: "Maximum purchase", value: money(tender.maxShares * tender.pricePerShare) },
                  { label: "Per-holder cap", value: `${tender.maxPercentPerHolder}% of vested equity` },
                  { label: "Election window", value: `${date(tender.startDate)} – ${date(tender.endDate)}` },
                  { label: "Eligible groups", value: <span className="block whitespace-normal">{eligibility.map((e) => RELATIONSHIP_LABELS[e as StakeholderRelationship] ?? e).join(", ")}</span> },
                ]}
              />
              {tender.notes ? <p className="mt-4 whitespace-pre-line rounded-md bg-muted p-3 text-[13px]">{tender.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-[13px]">
                {[
                  ["Board approval of the program", "Draft under Board consents → Custom"],
                  ["ROFR / co-sale waiver from preferred holders", "Required by most charters"],
                  ["Buyer KYC and funds confirmation", ""],
                  ["Tax withholding for option sales", "NSO spread is wage income"],
                  ["Update 409A after settlement", "Secondary price is a valuation input"],
                ].map(([t, h]) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-1 size-3.5 shrink-0 rounded border border-border-strong" />
                    <span>
                      {t}
                      {h ? <span className="block text-xs text-muted-foreground">{h}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
