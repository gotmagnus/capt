"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Plus, Send, Trash2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";
import { toInputDate } from "@/lib/format";
import { StakeholderFormDialog, type StakeholderFormValues } from "../stakeholder-form";
import { deleteStakeholder, invitePortal, terminateStakeholder } from "../actions";

type StakeholderMeta = StakeholderFormValues & {
  id: string;
  name: string;
  hasPortal: boolean;
  portalInvitedAt: string | null;
  securityCount: number;
  isEmployee: boolean;
  hasOutstandingGrants: boolean;
};

export function StakeholderActions({ companyId, canEdit, stakeholder }: { companyId: string; canEdit: boolean; stakeholder: StakeholderMeta }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [terminateOpen, setTerminateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  if (!canEdit) return null;
  const active = stakeholder.isEmployee && stakeholder.employmentStatus !== "TERMINATED";
  return (
    <>
      <Button variant="secondary" asChild>
        <Link href={`/app/${companyId}/securities/new?stakeholderId=${stakeholder.id}`}>
          <Plus /> Issue equity
        </Link>
      </Button>
      <Button variant="secondary" onClick={() => setEditOpen(true)}>
        <Pencil /> Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setInviteOpen(true)} disabled={!stakeholder.email}>
            <Send /> {stakeholder.hasPortal ? "Resend portal access" : "Invite to portal"}
          </DropdownMenuItem>
          {active ? (
            <DropdownMenuItem onSelect={() => setTerminateOpen(true)}>
              <UserMinus /> Terminate
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)} disabled={stakeholder.securityCount > 0}>
            <Trash2 /> Delete stakeholder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StakeholderFormDialog companyId={companyId} initial={stakeholder} open={editOpen} onOpenChange={setEditOpen} />

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={stakeholder.hasPortal ? "Resend portal access" : "Invite to the equity portal"}
        description={`${stakeholder.name} will be able to view their holdings, vesting, documents and tax information.`}
        action={invitePortal}
        hidden={{ companyId, id: stakeholder.id }}
        submitLabel="Send invitation"
        size="sm"
      >
        <Alert tone="info">
          An invitation is sent to <strong>{stakeholder.email}</strong>. New accounts receive a temporary password (<span className="font-mono">welcome123</span>) and are prompted to change it.
        </Alert>
      </FormDialog>

      <FormDialog
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        title={`Terminate ${stakeholder.name}`}
        description="Vesting stops on the termination date. Unvested options are cancelled and returned to the pool; vested options stay exercisable through the post-termination exercise period."
        action={terminateStakeholder}
        hidden={{ companyId, id: stakeholder.id }}
        submitLabel="Record termination"
        destructive
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Termination date" required>
            <Input name="terminationDate" type="date" required defaultValue={toInputDate(new Date())} />
          </Field>
          <Field label="Reason">
            <Select name="terminationReason" defaultValue="Voluntary">
              {["Voluntary", "Involuntary", "For cause", "Death or disability", "Other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={2} placeholder="Optional context for the audit log" />
        </Field>
        {stakeholder.hasOutstandingGrants ? <Alert tone="warning">Outstanding grants will be adjusted automatically. A reminder about the exercise window is added to your tasks.</Alert> : null}
      </FormDialog>

      <FormDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete stakeholder" description="This removes the stakeholder record. Only stakeholders without securities can be deleted." action={deleteStakeholder} hidden={{ companyId, id: stakeholder.id }} submitLabel="Delete" destructive size="sm" redirectTo={`/app/${companyId}/stakeholders`}>
        <p className="text-[13px] text-muted-foreground">
          <strong>{stakeholder.name}</strong> will be permanently removed. This action is recorded in the audit log.
        </p>
      </FormDialog>
    </>
  );
}
