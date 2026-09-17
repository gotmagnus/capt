"use client";

import { useState, useTransition } from "react";
import { Bell, Check, Copy, MoreHorizontal, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addConsentSigner, approveConsentNow, declineConsentAs, deleteConsent, duplicateConsent, remindSigner, removeConsentSigner, reopenConsent, sendConsent, signConsentAs, updateConsentDraft, withdrawConsent } from "../actions";

export function ConsentHeaderActions({ companyId, consent, state, canEdit }: { companyId: string; consent: { id: string; status: string; title: string; documentId: string | null; signers: number }; state: { signed: number; required: number; approved: boolean }; canEdit: boolean }) {
  const [dup, startDup] = useTransition();
  if (!canEdit) return null;
  const hidden = { companyId, id: consent.id };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {consent.status === "DRAFT" ? (
        <ConfirmButton action={sendConsent} hidden={hidden} title="Send for signature?" description={`${consent.signers} signer${consent.signers === 1 ? "" : "s"} will be notified with a private signing link. The resolution text is locked once sent.`} confirmLabel="Send" variant="default" successMessage="Consent sent">
          <Send /> Send for signature
        </ConfirmButton>
      ) : null}
      {consent.status === "SENT" && state.approved ? (
        <ConfirmButton action={approveConsentNow} hidden={hidden} title="Approve now?" description="Applies board approval dates to exhibit securities, links valuations and marks the consent approved." confirmLabel="Approve" variant="default" successMessage="Consent approved">
          <Check /> Approve now
        </ConfirmButton>
      ) : null}
      {["WITHDRAWN", "REJECTED", "EXPIRED"].includes(consent.status) ? (
        <ConfirmButton action={reopenConsent} hidden={hidden} title="Reopen as draft?" description="Signatures are cleared and the consent returns to draft for editing." confirmLabel="Reopen" variant="secondary">
          Reopen as draft
        </ConfirmButton>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => startDup(() => duplicateConsent(companyId, consent.id))} disabled={dup}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          {consent.status === "SENT" || consent.status === "DRAFT" ? (
            <WithdrawItem companyId={companyId} id={consent.id} />
          ) : null}
          {consent.status === "DRAFT" ? (
            <>
              <DropdownMenuSeparator />
              <DeleteItem companyId={companyId} id={consent.id} />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function WithdrawItem({ companyId, id }: { companyId: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <X /> Withdraw
      </DropdownMenuItem>
      <FormDialog open={open} onOpenChange={setOpen} action={withdrawConsent} hidden={{ companyId, id }} title="Withdraw consent?" description="Signers will no longer be able to sign. You can reopen it as a draft later." submitLabel="Withdraw" size="sm" destructive successMessage="Consent withdrawn">
        <p className="text-[13px] text-muted-foreground">This is recorded in the audit log.</p>
      </FormDialog>
    </>
  );
}

function DeleteItem({ companyId, id }: { companyId: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem destructive onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <Trash2 /> Delete draft
      </DropdownMenuItem>
      <FormDialog open={open} onOpenChange={setOpen} action={deleteConsent} hidden={{ companyId, id }} title="Delete this draft?" description="The draft and its generated document are removed permanently." submitLabel="Delete" size="sm" destructive redirectTo={`/app/${companyId}/board`}>
        <p className="text-[13px] text-muted-foreground">This cannot be undone.</p>
      </FormDialog>
    </>
  );
}

export function SignerActions({ companyId, signer, consentStatus, isSelf, isAdmin, canEdit, className }: { companyId: string; signer: { id: string; name: string; email: string; status: string; token: string }; consentStatus: string; isSelf: boolean; isAdmin: boolean; canEdit: boolean; className?: string }) {
  const copy = () => {
    const url = `${window.location.origin}/sign/${signer.token}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Signing link copied"));
  };
  const canSign = consentStatus === "SENT" && signer.status !== "SIGNED" && (isSelf || isAdmin);
  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      {canSign ? (
        <FormDialog
          trigger={
            <Button size="xs" variant={isSelf ? "default" : "secondary"}>
              <Check /> {isSelf ? "Sign" : "Sign on behalf"}
            </Button>
          }
          action={signConsentAs}
          hidden={{ companyId, signerId: signer.id }}
          title={isSelf ? "Sign this consent" : `Record signature for ${signer.name}`}
          description={isSelf ? "By signing you adopt this resolution as a director of the company." : "Admin demo mode: records a signature on behalf of the director. Use this only with the director's authorization."}
          submitLabel="Adopt and sign"
          size="sm"
        >
          <Field label="Full name" hint={`Type “${signer.name}” to sign.`}>
            <Input name="typedName" placeholder={signer.name} required autoFocus />
          </Field>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="agree" className="mt-0.5 size-3.5 accent-blue-600" required /> I agree to sign electronically and understand this signature is legally binding.
          </label>
        </FormDialog>
      ) : null}
      {canSign ? (
        <FormDialog
          trigger={
            <Button size="xs" variant="ghost">
              Decline
            </Button>
          }
          action={declineConsentAs}
          hidden={{ companyId, signerId: signer.id }}
          title="Decline to sign"
          submitLabel="Decline"
          size="sm"
          destructive
        >
          <Field label="Comment (optional)">
            <Textarea name="comment" rows={3} placeholder="Reason for declining" />
          </Field>
        </FormDialog>
      ) : null}
      {consentStatus === "SENT" && signer.status === "PENDING" && canEdit ? (
        <ConfirmButton action={remindSigner} hidden={{ companyId, signerId: signer.id }} title={`Remind ${signer.name}?`} description="Sends a notification with the signing link." confirmLabel="Send reminder" variant="ghost" size="xs" successMessage="Reminder sent">
          <Bell /> Remind
        </ConfirmButton>
      ) : null}
      {consentStatus === "SENT" ? (
        <Button size="xs" variant="ghost" onClick={copy} aria-label="Copy signing link">
          <Copy /> Link
        </Button>
      ) : null}
      {signer.status !== "SIGNED" && consentStatus !== "APPROVED" && canEdit ? (
        <ConfirmButton action={removeConsentSigner} hidden={{ companyId, signerId: signer.id }} title={`Remove ${signer.name}?`} confirmLabel="Remove" variant="ghost" size="xs" className="relative">
          <Trash2 /> <span className="sr-only">Remove signer</span>
        </ConfirmButton>
      ) : null}
    </div>
  );
}

export function AddSignerButton({ companyId, consentId, candidates }: { companyId: string; consentId: string; candidates: { id: string; name: string; email: string }[] }) {
  const [pick, setPick] = useState("");
  const chosen = candidates.find((c) => c.id === pick);
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="secondary">
          Add signer
        </Button>
      }
      action={addConsentSigner}
      hidden={{ companyId, id: consentId }}
      title="Add a signer"
      description="Pick a board member on file or enter a name and email."
      submitLabel="Add signer"
      size="sm"
      successMessage="Signer added"
    >
      <Field label="Board member">
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">— Enter manually —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </Select>
      </Field>
      {chosen ? <input type="hidden" name="stakeholderId" value={chosen.id} /> : null}
      <Field label="Name">
        <Input name="name" key={`n-${pick}`} defaultValue={chosen?.name ?? ""} required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" key={`e-${pick}`} defaultValue={chosen?.email ?? ""} required />
      </Field>
    </FormDialog>
  );
}

export function DraftEditor({ companyId, consent }: { companyId: string; consent: { id: string; title: string; body: string; effectiveDate: string; requiredApprovals: number } }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="secondary">
          <Pencil /> Edit draft
        </Button>
      }
      action={updateConsentDraft}
      hidden={{ companyId, id: consent.id }}
      title="Edit resolution"
      size="lg"
      submitLabel="Save"
      successMessage="Draft updated"
    >
      <Field label="Title">
        <Input name="title" defaultValue={consent.title} required />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Effective date">
          <Input type="date" name="effectiveDate" defaultValue={consent.effectiveDate} />
        </Field>
        <Field label="Required approvals" hint="0 = unanimous">
          <Input type="number" name="requiredApprovals" min={0} defaultValue={consent.requiredApprovals} />
        </Field>
      </div>
      <Field label="Resolution (Markdown)">
        <Textarea name="body" defaultValue={consent.body} rows={14} className="font-mono text-xs" required />
      </Field>
    </FormDialog>
  );
}
