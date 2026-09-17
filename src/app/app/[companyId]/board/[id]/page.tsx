import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock, Download, FileText, Send, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalState, loadConsent } from "@/lib/governance-consents";
import { PageHeader, DescriptionList, Alert, Section } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { date, dateTime, shares, price, money } from "@/lib/format";
import { CONSENT_TYPE_LABELS, SECURITY_TYPE_LABELS, type ConsentType, type SecurityType } from "@/lib/types";
import { ConsentHeaderActions, SignerActions, AddSignerButton, DraftEditor } from "./consent-actions";

export const metadata = { title: "Board consent" };

export default async function ConsentDetailPage(props: PageProps<"/app/[companyId]/board/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const consent = await loadConsent(id);
  if (!consent || consent.companyId !== C) notFound();
  const state = approvalState(consent);
  const [valuations, plans, rounds, classes, stakeholders, creator, audit] = await Promise.all([
    db.valuation.findMany({ where: { id: { in: consent.exhibits.filter((e) => e.referenceType === "VALUATION").map((e) => e.referenceId as string) } } }),
    db.equityPlan.findMany({ where: { id: { in: consent.exhibits.filter((e) => e.referenceType === "EQUITY_PLAN").map((e) => e.referenceId as string) } } }),
    db.fundingRound.findMany({ where: { id: { in: consent.exhibits.filter((e) => e.referenceType === "ROUND").map((e) => e.referenceId as string) } } }),
    db.shareClass.findMany({ where: { id: { in: consent.exhibits.filter((e) => e.referenceType === "SHARE_CLASS").map((e) => e.referenceId as string) } } }),
    db.stakeholder.findMany({ where: { companyId: C, relationship: { in: ["BOARD_MEMBER", "FOUNDER"] }, email: { not: null } }, orderBy: { name: "asc" } }),
    consent.createdById ? db.user.findUnique({ where: { id: consent.createdById } }) : null,
    db.auditLog.findMany({ where: { companyId: C, entityType: "BoardConsent", entityId: consent.id }, orderBy: { createdAt: "desc" }, take: 20, include: { user: true } }),
  ]);

  const timeline = [
    { label: "Created", at: consent.createdAt, done: true },
    { label: "Sent for signature", at: consent.sentAt, done: !!consent.sentAt },
    { label: `Signatures (${state.signed}/${state.required})`, at: null, done: state.approved },
    { label: consent.status === "REJECTED" ? "Rejected" : consent.status === "WITHDRAWN" ? "Withdrawn" : "Approved", at: consent.approvedAt, done: consent.status === "APPROVED" || consent.status === "REJECTED" || consent.status === "WITHDRAWN" },
  ];

  // The comment column only earns its width when a director actually left one.
  const hasComments = consent.signers.some((s) => s.comment);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Board consents", href: `/app/${C}/board` }, { label: consent.title }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {consent.title} <StatusBadge status={consent.status} />
          </span>
        }
        description={`${CONSENT_TYPE_LABELS[consent.type as ConsentType] ?? consent.type} · effective ${date(consent.effectiveDate)} · ${state.required === state.total ? "unanimous" : `${state.required} of ${state.total}`} approval`}
        actions={<ConsentHeaderActions companyId={C} consent={{ id: consent.id, status: consent.status, title: consent.title, documentId: consent.documentId, signers: consent.signers.length }} state={state} canEdit={ctx.canEdit} />}
      />

      {consent.status === "SENT" && state.approved ? (
        <Alert tone="success" icon={Check} className="mb-5">
          Enough signatures have been collected. Approval is applied automatically after the last required signature; use “Approve now” if this consent was created before that rule.
        </Alert>
      ) : null}
      {consent.status === "REJECTED" ? (
        <Alert tone="danger" className="mb-5">
          A director declined and the approval threshold can no longer be met. Reopen the consent as a draft to revise and resend.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-wrap gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-56">
                <CardTitle>Resolution</CardTitle>
                <CardDescription>Action by written consent of the Board of Directors of {ctx.company.legalName}</CardDescription>
              </div>
              {consent.status === "DRAFT" && ctx.canEdit ? <DraftEditor companyId={C} consent={{ id: consent.id, title: consent.title, body: consent.body, effectiveDate: consent.effectiveDate?.toISOString().slice(0, 10) ?? "", requiredApprovals: consent.requiredApprovals }} /> : null}
            </CardHeader>
            <CardContent>
              <Markdown content={consent.body} className="max-w-3xl" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Exhibits</CardTitle>
                <CardDescription>{consent.exhibits.length} attached · approval applies board approval dates and links valuations</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {consent.exhibits.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted-foreground">No exhibits attached.</p> : null}
              {consent.exhibits.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Description</th>
                      <th>Reference</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consent.exhibits.map((e) => {
                      const v = e.referenceType === "VALUATION" ? valuations.find((x) => x.id === e.referenceId) : null;
                      const p = e.referenceType === "EQUITY_PLAN" ? plans.find((x) => x.id === e.referenceId) : null;
                      const r = e.referenceType === "ROUND" ? rounds.find((x) => x.id === e.referenceId) : null;
                      const sc = e.referenceType === "SHARE_CLASS" ? classes.find((x) => x.id === e.referenceId) : null;
                      return (
                        <tr key={e.id}>
                          <td className="font-medium">{e.label}</td>
                          <td className="min-w-[12rem] whitespace-normal">{e.description}</td>
                          <td>
                            {e.security ? (
                              <Link href={`/app/${C}/securities/${e.security.id}`} className="font-mono text-xs hover:underline">
                                {e.security.certificateNumber}
                              </Link>
                            ) : v ? (
                              <Link href={`/app/${C}/valuations/${v.id}`} className="text-xs hover:underline">
                                409A · {date(v.valuationDate)}
                              </Link>
                            ) : p ? (
                              <Link href={`/app/${C}/equity-plans/${p.id}`} className="text-xs hover:underline">
                                {p.name}
                              </Link>
                            ) : r ? (
                              <Link href={`/app/${C}/fundraising/rounds/${r.id}`} className="text-xs hover:underline">
                                {r.name}
                              </Link>
                            ) : sc ? (
                              <Link href={`/app/${C}/share-classes`} className="text-xs hover:underline">
                                {sc.name}
                              </Link>
                            ) : e.documentId ? (
                              <Link href={`/app/${C}/documents/${e.documentId}`} className="text-xs hover:underline">
                                Document
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td>
                            {e.security ? (
                              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                                <StatusBadge status={e.security.status} />
                                <span className="min-w-[10rem] whitespace-normal text-xs text-muted-foreground">
                                  {SECURITY_TYPE_LABELS[e.security.type as SecurityType]} · {e.security.type === "SAFE" || e.security.type === "CONVERTIBLE_NOTE" ? money(e.security.totalAmount) : shares(e.security.quantity)}
                                  {e.security.exercisePrice ? ` @ ${price(e.security.exercisePrice)}` : ""}
                                  {e.security.boardApprovalDate ? ` · approved ${date(e.security.boardApprovalDate)}` : ""}
                                </span>
                              </div>
                            ) : v ? (
                              <div className="flex items-center gap-2">
                                <StatusBadge status={v.status} />
                                <span className="text-xs text-muted-foreground">FMV {price(v.fairMarketValue)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" /> Signers
                </CardTitle>
                <CardDescription>
                  {state.signed} of {state.total} signed · {state.required} required
                </CardDescription>
              </div>
              <div className="flex w-full items-center gap-3 sm:w-auto sm:gap-2">
                <Progress value={state.total ? (state.signed / state.total) * 100 : 0} className="flex-1 sm:w-32 sm:flex-none" tone={state.approved ? "success" : "accent"} />
                {ctx.canEdit && consent.status !== "APPROVED" ? <AddSignerButton companyId={C} consentId={consent.id} candidates={stakeholders.filter((s) => !consent.signers.some((x) => x.email.toLowerCase() === (s.email ?? "").toLowerCase())).map((s) => ({ id: s.id, name: s.name, email: s.email as string }))} /> : null}
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {/* Phones: one block per signer so the sign / remind actions never scroll out of reach. */}
              <ul className="divide-y divide-border border-t border-border sm:hidden">
                {consent.signers.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    {s.signedAt ? <div className="mt-1 text-xs text-muted-foreground">Signed {dateTime(s.signedAt)}</div> : null}
                    {s.comment ? <p className="mt-1 text-xs text-muted-foreground">“{s.comment}”</p> : null}
                    <SignerActions className="-ml-2 mt-1.5 flex-wrap justify-start" companyId={C} signer={{ id: s.id, name: s.name, email: s.email, status: s.status, token: s.token }} consentStatus={consent.status} isSelf={s.email.toLowerCase() === ctx.user.email.toLowerCase()} isAdmin={ctx.role === "ADMIN"} canEdit={ctx.canEdit} />
                  </li>
                ))}
                {consent.signers.length === 0 ? <li className="px-5 py-4 text-center text-[13px] text-muted-foreground">No signers yet.</li> : null}
              </ul>
              <table className="data-table max-sm:hidden">
                <thead>
                  <tr>
                    <th>Director</th>
                    <th>Status</th>
                    <th>Signed</th>
                    {hasComments ? <th>Comment</th> : null}
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {consent.signers.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="text-muted-foreground">
                        {s.signedAt ? (
                          <>
                            {date(s.signedAt)}
                            <div className="text-xs">{dateTime(s.signedAt).split(" at ")[1]}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {hasComments ? <td className="max-w-[16rem] whitespace-normal text-xs text-muted-foreground">{s.comment ?? "—"}</td> : null}
                      <td className="text-right">
                        <SignerActions companyId={C} signer={{ id: s.id, name: s.name, email: s.email, status: s.status, token: s.token }} consentStatus={consent.status} isSelf={s.email.toLowerCase() === ctx.user.email.toLowerCase()} isAdmin={ctx.role === "ADMIN"} canEdit={ctx.canEdit} />
                      </td>
                    </tr>
                  ))}
                  {consent.signers.length === 0 ? (
                    <tr>
                      <td colSpan={hasComments ? 5 : 4} className="text-center text-muted-foreground">
                        No signers yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border pl-4">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-card ${t.done ? "bg-success" : "bg-border-strong"}`} />
                    <div className="text-[13px] font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.at ? dateTime(t.at) : t.done ? "Done" : "Pending"}</div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" /> Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                className="sm:max-md:grid-cols-2"
                items={[
                  { label: "Type", value: <Badge variant="outline">{CONSENT_TYPE_LABELS[consent.type as ConsentType] ?? consent.type}</Badge> },
                  { label: "Effective date", value: date(consent.effectiveDate) },
                  { label: "Required approvals", value: consent.requiredApprovals === 0 ? "Unanimous" : `${consent.requiredApprovals} of ${state.total}` },
                  { label: "Created by", value: creator?.name ?? "—" },
                  { label: "Created", value: dateTime(consent.createdAt) },
                  { label: "Sent", value: consent.sentAt ? dateTime(consent.sentAt) : "—" },
                  { label: "Approved", value: consent.approvedAt ? dateTime(consent.approvedAt) : "—" },
                ]}
              />
              <div className="mt-4 flex flex-col gap-2">
                {consent.documentId ? (
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/app/${C}/documents/${consent.documentId}`}>
                      <Download /> Open executed document
                    </Link>
                  </Button>
                ) : null}
                {consent.status === "SENT" ? (
                  <p className="text-xs text-muted-foreground">
                    <Send className="mr-1 inline size-3" /> Each signer has a private link at <code className="font-mono">/sign/…</code>; use “Copy link” to share it manually.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Section title="Activity" className="md:col-span-2 xl:col-span-1">
            <ul className="space-y-2 text-xs">
              {audit.map((a) => (
                <li key={a.id} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-foreground">{a.summary}</div>
                  <div className="text-muted-foreground">
                    {a.user?.name ?? "System"} · {dateTime(a.createdAt)}
                  </div>
                </li>
              ))}
              {audit.length === 0 ? <li className="text-muted-foreground">No activity recorded.</li> : null}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
