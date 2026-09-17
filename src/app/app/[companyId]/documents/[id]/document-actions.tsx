"use client";

import { useState } from "react";
import { Bell, Check, Copy, MoreHorizontal, Pencil, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DOCUMENT_TYPE_LABELS } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { declineDocumentAs, deleteDocument, remindSignature, removeSignature, replaceDocument, requestSignatures, signDocumentAs, updateDocument } from "../actions";

export function DocumentHeaderActions({ companyId, doc, canEdit }: { companyId: string; doc: { id: string; name: string; folder: string; type: string; visibility: string; version: number; signatureStatus: string; isCertificateOfLive: boolean; isConsentRecord: boolean }; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [replace, setReplace] = useState(false);
  const [del, setDel] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEdit(true)}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReplace(true)}>
            <Upload /> Upload new version
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDel(true)} disabled={doc.isCertificateOfLive || doc.isConsentRecord}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormDialog open={edit} onOpenChange={setEdit} action={updateDocument} hidden={{ companyId, id: doc.id }} title="Edit document details" submitLabel="Save" successMessage="Saved">
        <Field label="Name">
          <Input name="name" defaultValue={doc.name} required />
        </Field>
        <Field label="Folder" hint="Use / to nest, e.g. Fundraising/Series B">
          <Input name="folder" defaultValue={doc.folder} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select name="type" defaultValue={doc.type}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select name="visibility" defaultValue={doc.visibility}>
              <option value="COMPANY">Company</option>
              <option value="BOARD">Board</option>
              <option value="INVESTORS">Investors</option>
              <option value="HOLDER">Related holder</option>
              <option value="PUBLIC">Public link</option>
            </Select>
          </Field>
        </div>
      </FormDialog>
      <FormDialog open={replace} onOpenChange={setReplace} action={replaceDocument} hidden={{ companyId, id: doc.id }} title={`Upload version ${doc.version + 1}`} description={doc.signatureStatus !== "NOT_REQUIRED" ? "Existing signatures will be reset because the content changes." : "The previous version is retained in the history."} submitLabel="Save new version" successMessage="New version saved">
        <Field label="File">
          <Input type="file" name="file" accept=".pdf,.doc,.docx,.md,.txt,.csv" />
        </Field>
        <Field label="…or paste Markdown">
          <Textarea name="content" rows={6} />
        </Field>
        <Field label="Version note">
          <Input name="note" placeholder="What changed?" />
        </Field>
      </FormDialog>
      <FormDialog open={del} onOpenChange={setDel} action={deleteDocument} hidden={{ companyId, id: doc.id }} title="Delete this document?" description="This permanently removes the document and its signature requests." submitLabel="Delete" size="sm" destructive redirectTo={`/app/${companyId}/documents`}>
        <p className="text-[13px] text-muted-foreground">This action is recorded in the audit log and cannot be undone.</p>
      </FormDialog>
    </>
  );
}

export function SignaturePanel({ companyId, documentId, signatures, candidates, currentEmail, isAdmin, canEdit }: { companyId: string; documentId: string; signatures: { id: string; name: string; email: string; role: string; status: string; signedAt: string | null; token: string; ipAddress: string | null }[]; candidates: { id: string; name: string; email: string; relationship: string }[]; currentEmail: string; isAdmin: boolean; canEdit: boolean }) {
  const copy = (token: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}/sign/${token}`).then(() => toast.success("Signing link copied"));
  };
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {signatures.map((s) => {
          const isSelf = s.email.toLowerCase() === currentEmail.toLowerCase();
          const canSign = s.status !== "SIGNED" && (isSelf || isAdmin);
          return (
            <li key={s.id} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.role.charAt(0) + s.role.slice(1).toLowerCase()} · {s.email}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              {s.signedAt ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Signed {dateTime(s.signedAt)}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                </div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {canSign ? (
                  <FormDialog
                    trigger={
                      <Button size="xs" variant={isSelf ? "default" : "secondary"}>
                        <Check /> {isSelf ? "Sign" : "Sign on behalf"}
                      </Button>
                    }
                    action={signDocumentAs}
                    hidden={{ companyId, signatureId: s.id }}
                    title={isSelf ? "Sign this document" : `Record signature for ${s.name}`}
                    description={isSelf ? "Your typed name is adopted as your electronic signature." : "Admin demo mode: records a signature on the signer's behalf."}
                    submitLabel="Adopt and sign"
                    size="sm"
                  >
                    <Field label="Full name">
                      <Input name="typedName" placeholder={s.name} required autoFocus />
                    </Field>
                    <label className="flex items-start gap-2 text-[13px]">
                      <input type="checkbox" name="agree" className="mt-0.5 size-3.5 accent-blue-600" required /> I agree to sign electronically.
                    </label>
                  </FormDialog>
                ) : null}
                {canSign ? (
                  <ConfirmButton action={declineDocumentAs} hidden={{ companyId, signatureId: s.id }} title="Decline to sign?" confirmLabel="Decline" size="xs" variant="ghost">
                    Decline
                  </ConfirmButton>
                ) : null}
                {s.status === "PENDING" && canEdit ? (
                  <ConfirmButton action={remindSignature} hidden={{ companyId, signatureId: s.id }} title={`Remind ${s.name}?`} confirmLabel="Send reminder" size="xs" variant="ghost" successMessage="Reminder sent">
                    <Bell /> Remind
                  </ConfirmButton>
                ) : null}
                {s.status !== "SIGNED" ? (
                  <Button size="xs" variant="ghost" onClick={() => copy(s.token)}>
                    <Copy /> Link
                  </Button>
                ) : null}
                {s.status !== "SIGNED" && canEdit ? (
                  <ConfirmButton action={removeSignature} hidden={{ companyId, signatureId: s.id }} title={`Remove ${s.name}?`} confirmLabel="Remove" size="xs" variant="ghost" className="relative">
                    <Trash2 /> <span className="sr-only">Remove signer</span>
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <FormDialog
          trigger={
            <Button size="sm" variant="secondary" className="w-full">
              <UserPlus /> Request signatures
            </Button>
          }
          action={requestSignatures}
          hidden={{ companyId, id: documentId }}
          title="Request signatures"
          description="Each signer receives a notification with a private signing link."
          submitLabel="Send requests"
          successMessage="Requests sent"
        >
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {candidates.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-0 hover:bg-muted/50">
                <input type="checkbox" name="signer" value={JSON.stringify({ stakeholderId: c.id, name: c.name, email: c.email, role: c.relationship === "INVESTOR" ? "INVESTOR" : c.relationship === "BOARD_MEMBER" ? "BOARD" : c.relationship === "FOUNDER" ? "COMPANY" : "HOLDER" })} className="size-3.5 accent-blue-600" />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="truncate text-xs text-muted-foreground">{c.email}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
            <Input name="manualName" placeholder="Other signer name" />
            <Input name="manualEmail" type="email" placeholder="Email" />
            <Select name="manualRole" defaultValue="HOLDER">
              <option value="HOLDER">Holder</option>
              <option value="COMPANY">Company</option>
              <option value="BOARD">Board</option>
              <option value="INVESTOR">Investor</option>
              <option value="SPOUSE">Spouse</option>
            </Select>
          </div>
        </FormDialog>
      ) : null}
    </div>
  );
}
