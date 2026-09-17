import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, MapPin, Building2, CalendarClock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { computeVesting } from "@/lib/equity/vesting";
import { compactMoney, date, humanize, money, percent, price, shares } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { EXERCISE_METHODS } from "@/lib/securities-utils";
import { CONVERTIBLE_TYPES, DOCUMENT_TYPE_LABELS, EXERCISABLE_TYPES, SECURITY_TYPE_LABELS, TRANSACTION_LABELS, type DocumentType, type SecurityType, type TransactionType } from "@/lib/types";
import { PageHeader, Stat, DescriptionList, Section, TableWrap, EmptyState } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { RelationshipBadge } from "../stakeholder-table";
import { StakeholderActions } from "./stakeholder-actions";
import { TRANSACTION_TYPE_VARIANT } from "../../transactions/type-variant";

export async function generateMetadata(props: PageProps<"/app/[companyId]/stakeholders/[id]">) {
  const { id } = await props.params;
  const s = await db.stakeholder.findUnique({ where: { id }, select: { name: true } });
  return { title: s?.name ?? "Stakeholder" };
}

export default async function StakeholderDetailPage(props: PageProps<"/app/[companyId]/stakeholders/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [sh, data] = await Promise.all([
    db.stakeholder.findFirst({
      where: { id, companyId: C },
      include: {
        user: { select: { email: true } },
        securities: { include: { shareClass: true, equityPlan: true, vestingSchedule: true }, orderBy: { issueDate: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        exerciseRequests: { orderBy: { requestedAt: "desc" }, take: 5 },
      },
    }),
    loadCapTable(C),
  ]);
  if (!sh) notFound();
  const transactions = await db.transaction.findMany({
    where: { companyId: C, OR: [{ fromStakeholderId: sh.id }, { toStakeholderId: sh.id }, { security: { stakeholderId: sh.id } }] },
    include: { security: { select: { id: true, certificateNumber: true } } },
    orderBy: { effectiveDate: "desc" },
  });
  const row = data.summary.rows.find((r) => r.stakeholderId === sh.id);
  const tags = parseJson<string[]>(sh.tags, []);
  const isEmployee = ["EMPLOYEE", "FOUNDER", "FORMER_EMPLOYEE"].includes(sh.relationship);
  const now = new Date();

  const holdings = sh.securities.map((s) => {
    const vestable = EXERCISABLE_TYPES.includes(s.type as never) || s.type === "RSU" || s.type === "RSA";
    const vest = vestable ? computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf: now, terminationDate: sh.terminationDate, cancelled: s.cancelledQuantity }) : null;
    const isConvertible = CONVERTIBLE_TYPES.includes(s.type as never);
    return { s, vest, isConvertible, live: s.quantity - s.exercisedQuantity - s.cancelledQuantity };
  });
  const outstandingGrants = holdings.filter((h) => h.s.status === "OUTSTANDING" && h.vest && !h.isConvertible);
  const totalVested = outstandingGrants.reduce((a, h) => a + (h.vest?.vested ?? 0), 0);
  const totalGranted = outstandingGrants.reduce((a, h) => a + (h.vest?.total ?? 0), 0);
  const nextVest = outstandingGrants.map((h) => h.vest).filter((v) => v?.nextVestDate).sort((a, b) => (a!.nextVestDate!.getTime() - b!.nextVestDate!.getTime()))[0];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Stakeholders", href: `/app/${C}/stakeholders` }, { label: sh.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={sh.name} size="lg" />
            <span className="min-w-0">
              <span className="block">{sh.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-normal tracking-normal text-muted-foreground">
                <RelationshipBadge relationship={sh.relationship} />
                {sh.title ? <span>{sh.title}</span> : null}
                {sh.employmentStatus === "TERMINATED" ? <Badge variant="neutral">Terminated {date(sh.terminationDate)}</Badge> : null}
                {tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </span>
            </span>
          </span>
        }
        actions={
          <StakeholderActions
            companyId={C}
            canEdit={ctx.canEdit}
            stakeholder={{
              id: sh.id,
              name: sh.name,
              email: sh.email,
              type: sh.type,
              relationship: sh.relationship,
              title: sh.title,
              department: sh.department,
              costCenter: sh.costCenter,
              employeeId: sh.employeeId,
              employmentStatus: sh.employmentStatus,
              startDate: sh.startDate?.toISOString() ?? null,
              country: sh.country,
              address: sh.address,
              taxId: sh.taxId,
              isUsTaxpayer: sh.isUsTaxpayer,
              accredited: sh.accredited,
              tags,
              notes: sh.notes,
              hasPortal: !!sh.userId,
              portalInvitedAt: sh.portalInvitedAt?.toISOString() ?? null,
              securityCount: sh.securities.length,
              isEmployee,
              hasOutstandingGrants: outstandingGrants.length > 0,
            }}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        <Stat className="sm:col-span-2 xl:col-span-1" label="Outstanding shares" value={shares(row?.outstandingShares ?? 0)} hint={`${percent(row?.outstandingPct ?? 0)} of outstanding`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Fully diluted" value={shares(row?.fullyDilutedShares ?? 0)} hint={`${percent(row?.fullyDilutedPct ?? 0)} fully diluted`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label="Options outstanding" value={shares(row?.optionsOutstanding ?? 0)} hint={`${shares(row?.optionsExercisable ?? 0)} exercisable`} />
        <Stat className="sm:col-span-3 xl:col-span-1" label="Vested" value={totalGranted ? percent(totalVested / totalGranted, 0) : "—"} hint={totalGranted ? `${shares(totalVested)} of ${shares(totalGranted)}` : "No vesting grants"} />
        <Stat className="col-span-2 sm:col-span-3 xl:col-span-1" label="Invested" value={compactMoney(row?.invested ?? 0)} hint={row?.safePrincipal || row?.notePrincipal ? `${compactMoney((row?.safePrincipal ?? 0) + (row?.notePrincipal ?? 0))} in convertibles` : "Cash paid for equity"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-[13px]">
              <div className="flex items-start gap-2 text-muted-foreground">
                <Mail className="mt-[3px] size-3.5 shrink-0" /> {sh.email ? <a href={`mailto:${sh.email}`} className="min-w-0 break-words text-foreground hover:underline">{sh.email}</a> : "No email"}
              </div>
              {sh.address ? (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-[3px] size-3.5 shrink-0" /> <span className="min-w-0 text-foreground">{sh.address}</span>
                </div>
              ) : null}
              <div className="flex items-start gap-2 text-muted-foreground">
                <Building2 className="mt-[3px] size-3.5 shrink-0" /> <span className="text-foreground">{sh.type === "ENTITY" ? "Entity" : "Individual"} · {sh.country}</span>
              </div>
            </div>
            <DescriptionList
              columns={2}
              className="md:grid-cols-4 xl:grid-cols-2"
              items={[
                ...(isEmployee
                  ? [
                      { label: "Department", value: sh.department ?? "—" },
                      { label: "Cost center", value: sh.costCenter ?? "—" },
                      { label: "Employee ID", value: sh.employeeId ?? "—" },
                      { label: "Status", value: sh.employmentStatus ? <StatusBadge status={sh.employmentStatus} /> : "—" },
                      { label: "Start date", value: date(sh.startDate) },
                      { label: sh.terminationDate ? "Termination" : "Tenure", value: sh.terminationDate ? `${date(sh.terminationDate)} · ${sh.terminationReason ?? ""}` : sh.startDate ? `${Math.max(0, Math.floor((now.getTime() - sh.startDate.getTime()) / (365.25 * 86_400_000) * 10) / 10)} years` : "—" },
                    ]
                  : []),
                { label: "US taxpayer", value: sh.isUsTaxpayer ? "Yes" : "No" },
                { label: "Accredited", value: sh.accredited ? "Yes" : "No" },
                { label: "Tax ID", value: sh.taxId ? `•••-••-${sh.taxId.slice(-4)}` : "—" },
                { label: "Portal", value: sh.portalAcceptedAt ? <Badge variant="success" dot>Active since {date(sh.portalAcceptedAt)}</Badge> : sh.portalInvitedAt ? <Badge variant="warning" dot>Invited {date(sh.portalInvitedAt)}</Badge> : <Badge variant="neutral">Not invited</Badge> },
                { label: "Added", value: date(sh.createdAt) },
              ]}
            />
            {sh.notes ? <p className="rounded-md bg-muted p-3 text-[13px] text-muted-foreground">{sh.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Section
            title="Holdings"
            description={nextVest?.nextVestDate ? `Next vesting: ${shares(nextVest.nextVestAmount)} on ${date(nextVest.nextVestDate)}` : undefined}
          >
            {holdings.length === 0 ? (
              <EmptyState icon={FileText} title="No securities" description="Issue shares, options or a SAFE to this stakeholder." />
            ) : (
              <TableWrap>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Security</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Price / strike</th>
                      <th>Vesting</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map(({ s, vest, isConvertible, live }) => (
                      <tr key={s.id}>
                        {/* Type and issue date live with the certificate so the whole row fits beside the profile card. */}
                        <td>
                          <span className="flex items-center gap-2">
                            <Link href={`/app/${C}/securities/${s.id}`} className="font-mono text-xs font-medium hover:underline">
                              {s.certificateNumber}
                            </Link>
                            <Badge variant="outline">{SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type}</Badge>
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">{[s.equityPlan?.name ?? s.shareClass?.name, `Issued ${date(s.issueDate)}`].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="num">
                          {isConvertible ? (
                            money(s.totalAmount)
                          ) : (
                            <>
                              {shares(live)}
                              {s.exercisedQuantity || s.cancelledQuantity ? (
                                <span className="block text-[11px] text-muted-foreground">
                                  of {shares(s.quantity)}
                                  {s.exercisedQuantity ? ` · ${shares(s.exercisedQuantity)} exercised` : ""}
                                  {s.cancelledQuantity ? ` · ${shares(s.cancelledQuantity)} cancelled` : ""}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="num">{isConvertible ? (s.valuationCap ? `${compactMoney(s.valuationCap)} cap` : "—") : price(s.exercisePrice ?? s.pricePerShare)}</td>
                        <td className="min-w-[160px]">
                          {vest && s.vestingScheduleId && s.vestingSchedule?.type !== "IMMEDIATE" ? (
                            <div>
                              <div className="flex items-center justify-between gap-3 text-[11px]">
                                <span>{percent(vest.percentVested, 0)} vested</span>
                                <span className="tabular text-muted-foreground">{shares(vest.vested)} / {shares(vest.total)}</span>
                              </div>
                              <Progress value={vest.percentVested * 100} className="mt-1" tone={vest.terminated ? "warning" : "accent"} />
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {vest.terminated ? `Stopped ${date(sh.terminationDate)}` : vest.nextVestDate ? `${shares(vest.nextVestAmount)} on ${date(vest.nextVestDate)}` : vest.unvested <= 0 ? "Fully vested" : s.vestingSchedule?.type === "MILESTONE" ? "Remaining milestones pending" : `${shares(vest.unvested)} unvested`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{isConvertible ? "—" : "Fully vested"}</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Section>

          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Transactions">
              {transactions.length === 0 ? (
                <EmptyState title="No transactions" className="py-8" />
              ) : (
                <TableWrap>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Security</th>
                        <th className="text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, 12).map((t) => (
                        <tr key={t.id}>
                          <td className="text-muted-foreground">{date(t.effectiveDate)}</td>
                          <td>
                            <Badge variant={TRANSACTION_TYPE_VARIANT[t.type] ?? "neutral"}>{TRANSACTION_LABELS[t.type as TransactionType] ?? humanize(t.type)}</Badge>
                          </td>
                          <td>{t.security ? <Link href={`/app/${C}/securities/${t.security.id}`} className="font-mono text-xs hover:underline">{t.security.certificateNumber}</Link> : "—"}</td>
                          <td className="num">{t.quantity ? shares(t.quantity) : t.totalAmount ? money(t.totalAmount) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              {transactions.length > 12 ? (
                <Link href={`/app/${C}/transactions?stakeholder=${sh.id}`} className="text-xs text-accent-foreground hover:underline">
                  View all {transactions.length} transactions →
                </Link>
              ) : null}
            </Section>

            <Section title="Documents">
              {sh.documents.length === 0 ? (
                <EmptyState title="No documents" className="py-8" />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {sh.documents.map((d) => (
                    <li key={d.id}>
                      <Link href={`/app/${C}/documents/${d.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{d.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type} · {date(d.createdAt)}
                          </span>
                        </span>
                        {d.signatureStatus !== "NOT_REQUIRED" ? <StatusBadge status={d.signatureStatus} /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {sh.exerciseRequests.length ? (
            <Section title="Exercise requests">
              <TableWrap>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Requested</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Cost</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sh.exerciseRequests.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <Link href={`/app/${C}/exercises/${e.id}`} className="hover:underline">
                            {date(e.requestedAt)}
                          </Link>
                        </td>
                        <td className="num">{shares(e.quantity)}</td>
                        <td className="num">{money(e.totalCost, { cents: true })}</td>
                        <td>{EXERCISE_METHODS.find((m) => m.value === e.method)?.label ?? humanize(e.method)}</td>
                        <td>
                          <StatusBadge status={e.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Section>
          ) : null}
        </div>
      </div>

      {sh.employmentStatus === "TERMINATED" && outstandingGrants.some((h) => EXERCISABLE_TYPES.includes(h.s.type as never)) ? (
        <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarClock className="mt-px size-3.5 shrink-0" /> Vested options remain exercisable during the post-termination exercise period set on each grant.
        </p>
      ) : null}
    </>
  );
}
