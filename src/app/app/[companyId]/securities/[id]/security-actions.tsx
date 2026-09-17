"use client";

import { useState } from "react";
import { ArrowLeftRight, Ban, ChevronDown, ClipboardCheck, FastForward, FileSignature, Pencil, Repeat, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";
import { date, money, price, shares } from "@/lib/format";
import { EXERCISE_METHODS, isConvertible, isExercisable, isShareType } from "@/lib/securities-utils";
import { accelerateVesting, cancelSecurity, convertSecurity, deleteDraft, mark83bFiled, modifySecurity, recordExercise, repurchaseShares, resendForSignature, transferSecurity } from "./actions";

export interface SecuritySummary {
  id: string;
  certificateNumber: string;
  type: string;
  status: string;
  quantity: number;
  exercised: number;
  cancelled: number;
  remaining: number;
  vestedAvailable: number;
  unvested: number;
  hasVesting: boolean;
  exercisePrice: number | null;
  pricePerShare: number | null;
  ptepMonths: number | null;
  expirationDate: string | null;
  earlyExercise: boolean;
  election83bDeadline: string | null;
  election83bFiledDate: string | null;
  hasAgreementDoc: boolean;
  onlyIssuanceTx: boolean;
  principal: number | null;
  accruedInterest: number;
  stakeholderId: string;
  stakeholderName: string;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function SecurityActions({
  companyId,
  security: s,
  stakeholders,
  shareClasses,
  fmv,
}: {
  companyId: string;
  security: SecuritySummary;
  stakeholders: { id: string; name: string }[];
  shareClasses: { id: string; name: string; type: string; originalIssuePrice: number | null }[];
  fmv: number | null;
}) {
  const [dialog, setDialog] = useState<string | null>(null);
  const [exerciseQty, setExerciseQty] = useState(s.vestedAvailable);
  const [accelMode, setAccelMode] = useState<"ALL" | "PERCENT">("ALL");
  const [transferQty, setTransferQty] = useState(s.remaining);
  const [convPrice, setConvPrice] = useState<number>(shareClasses.find((c) => c.type === "PREFERRED")?.originalIssuePrice ?? 0);
  const hidden = { companyId, securityId: s.id };
  const live = s.status === "OUTSTANDING" || s.status === "PENDING_SIGNATURE";
  const exercisable = isExercisable(s.type) && live && s.remaining > 0;
  const sharesLike = isShareType(s.type) && s.status === "OUTSTANDING" && s.remaining > 0;
  const convertible = isConvertible(s.type) && s.status === "OUTSTANDING";
  const canAccelerate = s.hasVesting && (s.unvested > 0) && live;
  const canDelete = ["DRAFT", "PENDING_SIGNATURE"].includes(s.status) && s.onlyIssuanceTx;
  const canCancel = live && (convertible || s.remaining > 0);
  const can83b = s.type === "RSA" && !!s.election83bDeadline && !s.election83bFiledDate;
  const items: { key: string; label: string; icon: typeof Ban; destructive?: boolean }[] = [];
  if (exercisable) items.push({ key: "exercise", label: "Record exercise", icon: ClipboardCheck });
  if (sharesLike) items.push({ key: "transfer", label: "Transfer shares", icon: ArrowLeftRight }, { key: "repurchase", label: "Repurchase shares", icon: Undo2 });
  if (convertible) items.push({ key: "convert", label: "Convert to shares", icon: Repeat });
  if (canAccelerate) items.push({ key: "accelerate", label: "Accelerate vesting", icon: FastForward });
  if (isExercisable(s.type) && live) items.push({ key: "modify", label: "Modify terms", icon: Pencil });
  if (can83b) items.push({ key: "83b", label: "Mark 83(b) filed", icon: ShieldCheck });
  if (s.hasAgreementDoc && live) items.push({ key: "resend", label: s.status === "PENDING_SIGNATURE" ? "Resend for signature" : "Send for signature", icon: FileSignature });
  if (canCancel) items.push({ key: "cancel", label: convertible ? "Cancel instrument" : "Cancel", icon: Ban, destructive: true });
  if (canDelete) items.push({ key: "delete", label: "Delete unsigned", icon: Trash2, destructive: true });
  if (items.length === 0) return null;

  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Actions <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {items
            .filter((i) => !i.destructive)
            .map((i) => (
              <DropdownMenuItem key={i.key} onSelect={() => setDialog(i.key)}>
                <i.icon /> {i.label}
              </DropdownMenuItem>
            ))}
          {items.some((i) => i.destructive) ? <DropdownMenuSeparator /> : null}
          {items
            .filter((i) => i.destructive)
            .map((i) => (
              <DropdownMenuItem key={i.key} destructive onSelect={() => setDialog(i.key)}>
                <i.icon /> {i.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <FormDialog open={dialog === "exercise"} onOpenChange={close} title={`Record exercise of ${s.certificateNumber}`} description={`${shares(s.vestedAvailable)} vested and unexercised${s.earlyExercise ? ` · early exercise allowed for all ${shares(s.remaining)}` : ""}.`} action={recordExercise} hidden={hidden} submitLabel="Record exercise">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shares to exercise" required>
            <Input name="quantity" type="number" min={1} max={s.earlyExercise ? s.remaining : s.vestedAvailable} step={1} value={exerciseQty} onChange={(e) => setExerciseQty(Number(e.target.value))} />
          </Field>
          <Field label="Exercise date" required>
            <Input name="exerciseDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Payment method">
            <Select name="method" defaultValue="ACH">
              {EXERCISE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="FMV at exercise" hint="Defaults to the current 409A.">
            <Input name="fmvAtExercise" type="number" step="any" min={0} prefix="$" defaultValue={fmv ?? ""} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} />
          </Field>
        </div>
        <div className="rounded-md bg-muted p-3 text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Exercise cost</span>
            <span className="tabular font-medium">{money((exerciseQty || 0) * (s.exercisePrice ?? 0), { cents: true })}</span>
          </div>
          {fmv != null ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Spread at FMV {price(fmv)}</span>
              <span className="tabular">{money(Math.max(0, (exerciseQty || 0) * (fmv - (s.exercisePrice ?? 0))), { cents: true })}</span>
            </div>
          ) : null}
        </div>
        {s.earlyExercise && exerciseQty > s.vestedAvailable ? <Alert tone="info">{shares(exerciseQty - s.vestedAvailable)} unvested shares will be issued as restricted stock subject to repurchase; an 83(b) election form will be generated.</Alert> : null}
        {s.type === "OPTION_ISO" ? <p className="text-xs text-muted-foreground">A Form 3921 record will be created for this ISO exercise.</p> : null}
      </FormDialog>

      <FormDialog open={dialog === "transfer"} onOpenChange={close} title={`Transfer ${s.certificateNumber}`} description="The certificate is retired and new certificates are issued to the transferee (and for any remainder)." action={transferSecurity} hidden={hidden} submitLabel="Transfer">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transfer to" required className="sm:col-span-2">
            <Select name="toStakeholderId" defaultValue="">
              <option value="">Select stakeholder…</option>
              {stakeholders
                .filter((x) => x.id !== s.stakeholderId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Shares" required hint={`Up to ${shares(s.remaining)}`}>
            <Input name="quantity" type="number" min={1} max={s.remaining} step={1} value={transferQty} onChange={(e) => setTransferQty(Number(e.target.value))} />
          </Field>
          <Field label="Price per share" hint="Secondary sale price, if any.">
            <Input name="pricePerShare" type="number" min={0} step="any" prefix="$" defaultValue={s.pricePerShare ?? ""} />
          </Field>
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Notes">
            <Input name="notes" placeholder="ROFR waived, board approved…" />
          </Field>
        </div>
        {transferQty < s.remaining ? <p className="text-xs text-muted-foreground">{shares(s.remaining - transferQty)} shares will be reissued to {s.stakeholderName} under a new certificate.</p> : null}
      </FormDialog>

      <FormDialog open={dialog === "repurchase"} onOpenChange={close} title={`Repurchase shares from ${s.stakeholderName}`} description={`${s.certificateNumber} · ${shares(s.remaining)} outstanding${s.unvested > 0 ? ` · ${shares(s.unvested)} unvested` : ""}`} action={repurchaseShares} hidden={hidden} submitLabel="Repurchase">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shares" required>
            <Input name="quantity" type="number" min={1} max={s.remaining} step={1} defaultValue={s.unvested > 0 ? s.unvested : s.remaining} />
          </Field>
          <Field label="Price per share" required hint="Unvested shares are typically repurchased at cost.">
            <Input name="pricePerShare" type="number" min={0} step="any" prefix="$" defaultValue={s.pricePerShare ?? 0} />
          </Field>
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Reason">
            <Input name="reason" placeholder="Termination of service" />
          </Field>
        </div>
      </FormDialog>

      <FormDialog open={dialog === "convert"} onOpenChange={close} title={`Convert ${s.certificateNumber}`} description={`${money(s.principal)} principal${s.accruedInterest > 0 ? ` + ${money(s.accruedInterest, { cents: true })} accrued interest` : ""}. For round-driven conversions use the fundraising round close flow.`} action={convertSecurity} hidden={hidden} submitLabel="Convert">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Convert into" required className="sm:col-span-2">
            <Select
              name="shareClassId"
              defaultValue={shareClasses.find((c) => c.type === "PREFERRED")?.id ?? shareClasses[0]?.id}
              onChange={(e) => {
                const c = shareClasses.find((x) => x.id === e.target.value);
                if (c?.originalIssuePrice) setConvPrice(c.originalIssuePrice);
              }}
            >
              {shareClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Conversion price per share" required>
            <Input name="conversionPrice" type="number" min={0} step="any" prefix="$" value={convPrice || ""} onChange={(e) => setConvPrice(Number(e.target.value))} />
          </Field>
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Input name="notes" placeholder="Converted at Series B cap price" />
          </Field>
        </div>
        <div className="flex justify-between gap-3 rounded-md bg-muted p-3 text-[13px]">
          <span className="text-muted-foreground">Shares to be issued</span>
          <span className="tabular font-medium">{convPrice > 0 ? shares(Math.floor(((s.principal ?? 0) + s.accruedInterest) / convPrice)) : "—"}</span>
        </div>
      </FormDialog>

      <FormDialog open={dialog === "accelerate"} onOpenChange={close} title="Accelerate vesting" description={`${shares(s.unvested)} shares are unvested on ${s.certificateNumber}.`} action={accelerateVesting} hidden={hidden} submitLabel="Accelerate">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <Select name="mode" value={accelMode} onChange={(e) => setAccelMode(e.target.value as "ALL" | "PERCENT")}>
              <option value="ALL">All unvested shares</option>
              <option value="PERCENT">Percentage of unvested</option>
            </Select>
          </Field>
          {accelMode === "PERCENT" ? (
            <Field label="Percent" required>
              <Input name="percent" type="number" min={1} max={100} step="any" suffix="%" defaultValue={50} />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Reason" required>
            <Input name="reason" placeholder="Double-trigger: change of control + termination" />
          </Field>
        </div>
      </FormDialog>

      <FormDialog open={dialog === "modify"} onOpenChange={close} title={`Modify ${s.certificateNumber}`} description="Changes are recorded as a modification; repricing triggers ASC 718 modification accounting." action={modifySecurity} hidden={hidden} submitLabel="Save changes">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exercise price" hint={fmv != null ? `Current FMV ${price(fmv)}` : undefined}>
            <Input name="exercisePrice" type="number" min={0} step="any" prefix="$" defaultValue={s.exercisePrice ?? ""} />
          </Field>
          <Field label="Expiration date">
            <Input name="expirationDate" type="date" defaultValue={s.expirationDate ? s.expirationDate.slice(0, 10) : ""} />
          </Field>
          <Field label="Post-termination exercise period (months)">
            <Input name="ptepMonths" type="number" min={0} step={1} defaultValue={s.ptepMonths ?? 3} />
          </Field>
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Reason" required className="sm:col-span-2">
            <Input name="reason" placeholder="Board-approved PTEP extension" />
          </Field>
        </div>
      </FormDialog>

      <FormDialog open={dialog === "83b"} onOpenChange={close} title="Mark 83(b) election as filed" description={`Deadline ${s.election83bDeadline ? date(s.election83bDeadline) : "—"}.`} action={mark83bFiled} hidden={hidden} submitLabel="Mark filed" size="sm">
        <Field label="Date filed with the IRS" required>
          <Input name="filedDate" type="date" defaultValue={today()} />
        </Field>
      </FormDialog>

      <FormDialog open={dialog === "resend"} onOpenChange={close} title="Send for signature" description={`Signature requests are (re)created for the company and ${s.stakeholderName}; the security is marked pending signature until both sign.`} action={resendForSignature} hidden={hidden} submitLabel="Send" size="sm">
        <p className="text-[13px] text-muted-foreground">{s.stakeholderName} will receive a task in their portal.</p>
      </FormDialog>

      <FormDialog open={dialog === "cancel"} onOpenChange={close} title={`Cancel ${s.certificateNumber}`} description={convertible ? "The instrument is marked cancelled and removed from the unconverted balance." : `${shares(s.remaining)} ${isExercisable(s.type) ? "unexercised" : "outstanding"} shares can be cancelled${isExercisable(s.type) ? "; they return to the plan pool" : ""}.`} action={cancelSecurity} hidden={hidden} submitLabel="Cancel security" destructive>
        <div className="grid gap-4 sm:grid-cols-2">
          {!convertible ? (
            <Field label="Shares to cancel" required>
              <Input name="quantity" type="number" min={1} max={s.remaining} step={1} defaultValue={isExercisable(s.type) && s.unvested > 0 ? s.unvested : s.remaining} />
            </Field>
          ) : null}
          <Field label="Effective date" required>
            <Input name="effectiveDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            <Input name="reason" placeholder="Unvested at termination / issued in error" />
          </Field>
        </div>
      </FormDialog>

      <FormDialog open={dialog === "delete"} onOpenChange={close} title={`Delete ${s.certificateNumber}`} description="This unsigned security, its issuance record and generated documents will be permanently removed." action={deleteDraft} hidden={hidden} submitLabel="Delete" destructive size="sm" redirectTo={`/app/${companyId}/securities`}>
        <p className="text-[13px] text-muted-foreground">Use this only for securities issued in error. Signed or exercised securities must be cancelled instead so the ledger history is preserved.</p>
      </FormDialog>
    </>
  );
}
