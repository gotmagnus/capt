import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Circle, Pencil, Send } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { offerLetterDocument, vestingDescription } from "@/lib/documents/templates";
import { date, dateTime, money, percent, price, shares } from "@/lib/format";
import { cn, parseJson } from "@/lib/utils";
import { PageHeader, DescriptionList, Alert } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/forms";
import { OfferLetter } from "@/components/offers-letter";
import { CopyLink } from "@/components/offers-copy-link";
import { CreateStakeholderDialog } from "@/components/offers-create-stakeholder";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { deleteOffer, revokeOffer, sendOffer } from "../actions";

export const metadata = { title: "Offer" };

export default async function OfferDetailPage(props: PageProps<"/app/[companyId]/offers/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const offer = await db.offerLetter.findFirst({ where: { id, companyId: C }, include: { stakeholder: true } });
  if (!offer) notFound();
  const [data, valuation] = await Promise.all([loadCapTable(C), currentValuation(C)]);
  const schedule = offer.vestingScheduleId ? data.vestingSchedules.find((v) => v.id === offer.vestingScheduleId) : null;
  const packages = parseJson<{ label: string; salary: number; equityQuantity: number }[]>(offer.packages, []);
  const fd = data.summary.totals.fullyDilutedShares;
  const fmv = valuation?.fairMarketValue ?? null;
  const letter = offerLetterDocument({
    company: { legalName: ctx.company.legalName, incorporationState: ctx.company.incorporationState },
    candidateName: offer.candidateName,
    title: offer.title,
    startDate: offer.startDate,
    salary: offer.salary,
    bonus: offer.bonus,
    equityQuantity: offer.equityQuantity,
    equityType: offer.equityType,
    strikePrice: offer.equityType.startsWith("OPTION") ? offer.strikePrice : null,
    vestingDescription: vestingDescription(schedule),
    expiresAt: offer.expiresAt,
    fullyDiluted: fd,
    message: offer.message,
  });
  const expired = offer.expiresAt && offer.expiresAt < new Date() && ["SENT", "VIEWED"].includes(offer.status);
  const steps = [
    { label: "Drafted", at: offer.createdAt, done: true },
    { label: "Sent", at: offer.sentAt, done: !!offer.sentAt },
    { label: "Viewed by candidate", at: offer.viewedAt, done: !!offer.viewedAt },
    { label: offer.status === "DECLINED" ? "Declined" : "Accepted", at: offer.acceptedAt, done: !!offer.acceptedAt || offer.status === "DECLINED" },
    { label: "Grant issued", at: null, done: false },
  ];
  const editable = ctx.canEdit && !["ACCEPTED", "DECLINED"].includes(offer.status);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Offer letters", href: `/app/${C}/offers` }, { label: offer.candidateName }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {offer.candidateName} <StatusBadge status={expired ? "EXPIRED" : offer.status} />
          </span>
        }
        description={`${offer.title}${offer.department ? ` · ${offer.department}` : ""}${offer.level ? ` · ${offer.level}` : ""} · ${offer.candidateEmail}`}
        actions={
          ctx.canEdit ? (
            <>
              {editable ? (
                <Button variant="secondary" asChild>
                  <Link href={`/app/${C}/offers/${offer.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              ) : null}
              {offer.status === "DRAFT" ? (
                <ConfirmButton action={deleteOffer} hidden={{ companyId: C, id: offer.id }} title="Delete draft" confirmLabel="Delete" variant="ghost" redirectTo={`/app/${C}/offers`}>
                  Delete
                </ConfirmButton>
              ) : null}
              {["SENT", "VIEWED"].includes(offer.status) ? (
                <ConfirmButton action={revokeOffer} hidden={{ companyId: C, id: offer.id }} title="Revoke offer" description="The candidate link will show the offer as expired." confirmLabel="Revoke" variant="secondary">
                  Revoke
                </ConfirmButton>
              ) : null}
              {editable ? (
                <ConfirmButton action={sendOffer} hidden={{ companyId: C, id: offer.id }} title={offer.status === "DRAFT" ? "Send offer" : "Re-send offer"} description={`Emails ${offer.candidateEmail} a private link to review and accept the offer.`} confirmLabel="Send" variant="default">
                  <Send /> {offer.status === "DRAFT" ? "Send offer" : "Re-send"}
                </ConfirmButton>
              ) : null}
              {offer.status === "ACCEPTED" ? (
                <CreateStakeholderDialog
                  companyId={C}
                  offerId={offer.id}
                  candidateName={offer.candidateName}
                  linked={!!offer.stakeholderId}
                  items={[
                    { label: "Package", value: offer.selectedPackage != null ? packages[offer.selectedPackage]?.label ?? "Standard" : "Standard" },
                    { label: "Shares", value: shares(offer.selectedPackage != null ? packages[offer.selectedPackage]?.equityQuantity ?? offer.equityQuantity : offer.equityQuantity) },
                    { label: "Award", value: SECURITY_TYPE_LABELS[offer.equityType as SecurityType] },
                    { label: "Start date", value: date(offer.startDate) },
                  ]}
                />
              ) : null}
            </>
          ) : null
        }
      />

      {expired ? <Alert tone="warning" className="mb-5">This offer expired on {date(offer.expiresAt)} without a response. Re-send to extend it by a week.</Alert> : null}
      {offer.status === "ACCEPTED" && !offer.stakeholder ? <Alert tone="success" className="mb-5" title={`${offer.candidateName} accepted on ${date(offer.acceptedAt)}`}>Create the stakeholder record and issue the grant so it can go on the next board consent.</Alert> : null}
      {offer.stakeholder ? (
        <Alert tone="info" className="mb-5">
          Linked to stakeholder{" "}
          <Link href={`/app/${C}/stakeholders/${offer.stakeholder.id}`} className="font-medium underline">
            {offer.stakeholder.name}
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Package</CardTitle>
                <CardDescription>{packages.length > 1 ? `${packages.length} packages offered` : "Single package"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={4}
                items={[
                  { label: "Base salary", value: money(offer.salary) },
                  { label: "Target bonus", value: money(offer.bonus) },
                  { label: "Equity", value: <span className="block whitespace-normal">{`${shares(offer.equityQuantity)} ${SECURITY_TYPE_LABELS[offer.equityType as SecurityType]}`}</span> },
                  { label: "Ownership", value: percent(fd ? offer.equityQuantity / fd : 0, 3) },
                  { label: "Exercise price", value: offer.equityType.startsWith("OPTION") ? price(offer.strikePrice) : "—" },
                  { label: "Value at FMV", value: fmv ? money(offer.equityQuantity * fmv) : "—" },
                  { label: "Vesting", value: <span className="block whitespace-normal">{schedule?.name ?? "—"}</span> },
                  { label: "Start date", value: date(offer.startDate) },
                ]}
              />
              {packages.length > 1 ? (
                <>
                  {/* Phones: stacked rows instead of a 6-column table */}
                  <ul className="mt-4 divide-y divide-border rounded-md border border-border sm:hidden">
                    {packages.map((p, i) => (
                      <li key={i} className={cn("px-3 py-2.5", offer.selectedPackage === i && "bg-success-soft/50")}>
                        <div className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <span className="truncate">{p.label}</span>
                            {offer.selectedPackage === i ? <Badge variant="success">Selected</Badge> : null}
                          </span>
                          <span className="font-medium tabular">{money(p.salary)}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular">
                          {shares(p.equityQuantity)} shares · {percent(fd ? p.equityQuantity / fd : 0, 3)} FD{fmv ? ` · ${money(p.equityQuantity * fmv)} at FMV` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 hidden overflow-x-auto rounded-md border border-border scrollbar-thin sm:block">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Package</th>
                          <th className="text-right">Salary</th>
                          <th className="text-right">Equity</th>
                          <th className="text-right">% FD</th>
                          <th className="text-right">Value at FMV</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {packages.map((p, i) => (
                          <tr key={i} className={offer.selectedPackage === i ? "bg-success-soft/50" : undefined}>
                            <td className="font-medium">{p.label}</td>
                            <td className="num">{money(p.salary)}</td>
                            <td className="num">{shares(p.equityQuantity)}</td>
                            <td className="num">{percent(fd ? p.equityQuantity / fd : 0, 3)}</td>
                            <td className="num">{fmv ? money(p.equityQuantity * fmv) : "—"}</td>
                            <td>{offer.selectedPackage === i ? <Badge variant="success">Selected</Badge> : null}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Letter</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <OfferLetter content={letter} />
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start items-start gap-5 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Candidate link</CardTitle>
                <CardDescription>Private link — anyone with it can view and accept.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CopyLink path={`/offer/${offer.token}`} />
              <p className="mt-2 text-xs text-muted-foreground">Expires {date(offer.expiresAt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {steps.map((s) => (
                  <li key={s.label} className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full border", s.done ? (s.label === "Declined" ? "border-danger bg-danger text-white" : "border-success bg-success text-white") : "border-border text-subtle")}>{s.done ? <Check className="size-3" /> : <Circle className="size-2" />}</span>
                    <div>
                      <div className={cn("text-[13px]", s.done ? "font-medium" : "text-muted-foreground")}>{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.at ? dateTime(s.at) : "—"}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
