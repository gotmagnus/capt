import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, Circle, Info } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation, loadCapTable } from "@/lib/data/captable";
import { exercisableForSecurity } from "@/lib/people-data";
import { simulateExercise } from "@/lib/equity/tax";
import { computeVesting } from "@/lib/equity/vesting";
import { date, dateTime, money, percent, price, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, DescriptionList, Alert } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Field } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { RELATIONSHIP_LABELS, SECURITY_TYPE_LABELS, type SecurityType, type StakeholderRelationship } from "@/lib/types";
import { exerciseMethodLabel } from "@/components/people-labels";
import { IssueSharesDialog } from "@/components/people-issue-shares";
import { approveExercise, cancelExercise, markExercisePaid, rejectExercise } from "./actions";

export const metadata = { title: "Exercise request" };

export default async function ExerciseDetailPage(props: PageProps<"/app/[companyId]/exercises/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const req = await db.exerciseRequest.findFirst({ where: { id, companyId: C }, include: { stakeholder: true, security: { include: { equityPlan: true, vestingSchedule: true } } } });
  if (!req) notFound();
  const [data, valuation] = await Promise.all([loadCapTable(C), currentValuation(C)]);
  const fmv = req.fmvAtExercise ?? valuation?.fairMarketValue ?? null;
  const exercisable = exercisableForSecurity(data, req.securityId);
  const sec = req.security;
  const vest = computeVesting(sec.quantity, sec.vestingStartDate ?? sec.issueDate, sec.vestingScheduleId ? data.schedules[sec.vestingScheduleId] : null, { terminationDate: req.stakeholder.terminationDate, cancelled: sec.cancelledQuantity });
  const tax = fmv != null ? simulateExercise({ type: sec.type === "WARRANT" ? "OPTION_NSO" : sec.type, quantity: req.quantity, exercisePrice: req.exercisePrice, fmv, grantDate: sec.grantDate ?? sec.issueDate, exerciseDate: req.completedAt ?? new Date(), otherIncome: 150_000 }) : null;
  const resulting = req.resultingSecurityId ? data.securities.find((s) => s.id === req.resultingSecurityId) : null;
  const open = !["COMPLETED", "REJECTED", "CANCELLED"].includes(req.status);
  const overQuantity = open && req.quantity > exercisable;

  const steps = [
    { label: "Requested", at: req.requestedAt, done: true },
    { label: "Approved", at: req.approvedAt, done: !!req.approvedAt },
    { label: "Payment received", at: req.paidAt, done: !!req.paidAt },
    { label: "Shares issued", at: req.completedAt, done: !!req.completedAt },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exercises", href: `/app/${C}/exercises` }, { label: req.stakeholder.name }]}
        title={
          <span className="flex items-center gap-3">
            Exercise of {shares(req.quantity)} {SECURITY_TYPE_LABELS[sec.type as SecurityType]}s <StatusBadge status={req.status} />
          </span>
        }
        description={`${req.stakeholder.name} · ${sec.certificateNumber} · requested ${dateTime(req.requestedAt)}`}
        actions={
          ctx.canEdit && open ? (
            <>
              {req.status === "REQUESTED" ? (
                <>
                  <FormDialog trigger={<Button variant="secondary">Reject</Button>} title="Reject exercise request" action={rejectExercise} hidden={{ companyId: C, id: req.id }} submitLabel="Reject request" destructive size="sm">
                    <Field label="Reason (shared with the holder)">
                      <Textarea name="reason" required rows={3} placeholder="e.g. Shares are not yet vested under the schedule." />
                    </Field>
                  </FormDialog>
                  <ConfirmButton action={approveExercise} hidden={{ companyId: C, id: req.id }} title="Approve exercise" description={`Approve ${shares(req.quantity)} shares at ${price(req.exercisePrice)} (${money(req.totalCost, { cents: true })}) and send payment instructions to ${req.stakeholder.name}.`} confirmLabel="Approve" variant="default">
                    Approve
                  </ConfirmButton>
                </>
              ) : null}
              {["APPROVED", "PAYMENT_PENDING"].includes(req.status) ? (
                <ConfirmButton action={markExercisePaid} hidden={{ companyId: C, id: req.id }} title="Record payment" description={`Confirm receipt of ${money(req.totalCost, { cents: true })} by ${exerciseMethodLabel(req.method).toLowerCase()}.`} confirmLabel="Payment received" variant="secondary">
                  Mark paid
                </ConfirmButton>
              ) : null}
              {["APPROVED", "PAYMENT_PENDING", "PAID"].includes(req.status) ? (
                <IssueSharesDialog companyId={C} requestId={req.id} quantity={req.quantity} exercisable={exercisable} grantCert={sec.certificateNumber} isIso={req.isIso} offerElection={sec.earlyExercise && vest.unvested > 0} />
              ) : null}
              <ConfirmButton action={cancelExercise} hidden={{ companyId: C, id: req.id }} title="Cancel request" description="The holder will keep their unexercised options." confirmLabel="Cancel request" variant="ghost">
                Cancel
              </ConfirmButton>
            </>
          ) : null
        }
      />

      {overQuantity ? (
        <Alert tone="warning" icon={AlertTriangle} className="mb-5" title="Request exceeds exercisable shares">
          {shares(req.quantity)} requested but only {shares(exercisable)} are vested and unexercised under {sec.certificateNumber} today.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
              <Badge variant="outline">{exerciseMethodLabel(req.method)}</Badge>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={4}
                items={[
                  { label: "Shares", value: shares(req.quantity) },
                  { label: "Exercise price", value: price(req.exercisePrice) },
                  { label: "Total cost", value: money(req.totalCost, { cents: true }) },
                  { label: "FMV at exercise", value: price(fmv) },
                  { label: "Spread", value: fmv != null ? money((fmv - req.exercisePrice) * req.quantity) : "—" },
                  { label: "Option type", value: req.isIso ? "ISO" : SECURITY_TYPE_LABELS[sec.type as SecurityType] },
                  { label: "83(b) election", value: req.election83b ? "Yes" : "No" },
                  { label: "Resulting certificate", value: resulting ? <Link href={`/app/${C}/securities/${resulting.id}`} className="font-mono text-xs hover:underline">{resulting.certificateNumber}</Link> : "—" },
                ]}
              />
              {req.notes ? <p className="mt-4 whitespace-pre-line rounded-md bg-muted p-3 text-[13px]">{req.notes}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Grant {sec.certificateNumber}</CardTitle>
                <CardDescription>
                  {SECURITY_TYPE_LABELS[sec.type as SecurityType]} · {sec.equityPlan?.name ?? "No plan"} · {sec.vestingSchedule?.name ?? "No vesting"}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/${C}/securities/${sec.id}`}>View grant</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={4}
                items={[
                  { label: "Granted", value: shares(sec.quantity) },
                  { label: "Vested", value: `${shares(vest.vested)} (${percent(vest.percentVested, 0)})` },
                  { label: "Exercised to date", value: shares(sec.exercisedQuantity) },
                  { label: "Exercisable now", value: shares(exercisable) },
                  { label: "Grant date", value: date(sec.grantDate ?? sec.issueDate) },
                  { label: "Vesting start", value: date(sec.vestingStartDate ?? sec.issueDate) },
                  { label: "Expires", value: date(sec.expirationDate) },
                  { label: "Cancelled", value: shares(sec.cancelledQuantity) },
                ]}
              />
            </CardContent>
          </Card>

          {tax ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tax preview</CardTitle>
                  <CardDescription>Estimate at {price(fmv)} FMV assuming $150,000 other income, single filer. Not tax advice.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  columns={4}
                  items={[
                    { label: "Exercise cost", value: money(tax.exerciseCost, { cents: true }) },
                    { label: "Bargain element", value: money(tax.spread) },
                    { label: req.isIso ? "Est. AMT impact" : "Ordinary income", value: money(req.isIso ? tax.amtEstimate : tax.ordinaryIncome) },
                    { label: req.isIso ? "Withholding" : "Total withholding", value: money(tax.totalWithholding) },
                    { label: "Cash required", value: money(tax.totalCashRequired, { cents: true }) },
                    { label: "ISO qualifying date", value: tax.isoQualifyingDate ? date(tax.isoQualifyingDate) : "—" },
                  ]}
                />
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {tax.notes.map((n) => (
                    <li key={n} className="flex gap-1.5">
                      <Info className="mt-0.5 size-3 shrink-0" /> {n}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid content-start items-start gap-5 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Holder</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/app/${C}/stakeholders/${req.stakeholderId}`} className="flex items-center gap-3 hover:underline">
                <Avatar name={req.stakeholder.name} size="lg" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{req.stakeholder.name}</div>
                  <div className="text-xs text-muted-foreground">{req.stakeholder.title ?? RELATIONSHIP_LABELS[req.stakeholder.relationship as StakeholderRelationship] ?? req.stakeholder.relationship}</div>
                </div>
              </Link>
              <DescriptionList
                className="mt-4"
                columns={1}
                items={[
                  { label: "Email", value: req.stakeholder.email ?? "—" },
                  { label: "Status", value: req.stakeholder.employmentStatus ? <StatusBadge status={req.stakeholder.employmentStatus} /> : "—" },
                  { label: "Termination date", value: date(req.stakeholder.terminationDate) },
                  { label: "Tax residency", value: req.stakeholder.country },
                ]}
              />
              {req.stakeholder.terminationDate && sec.ptepMonths ? (
                <Alert tone="warning" className="mt-4">
                  Post-termination exercise window: {sec.ptepMonths} months from {date(req.stakeholder.terminationDate)}.
                </Alert>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full border", s.done ? "border-success bg-success text-white" : "border-border text-subtle")}>{s.done ? <Check className="size-3" /> : <Circle className="size-2" />}</span>
                    <div>
                      <div className={cn("text-[13px]", s.done ? "font-medium" : "text-muted-foreground")}>{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.at ? dateTime(s.at) : i === steps.findIndex((x) => !x.done) && open ? "Next step" : "—"}</div>
                    </div>
                  </li>
                ))}
                {["REJECTED", "CANCELLED"].includes(req.status) ? (
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-danger text-white">×</span>
                    <div className="text-[13px] font-medium">{req.status === "REJECTED" ? "Rejected" : "Cancelled"}</div>
                  </li>
                ) : null}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
