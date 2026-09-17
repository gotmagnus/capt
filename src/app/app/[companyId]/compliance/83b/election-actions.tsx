"use client";

import Link from "next/link";
import { Bell, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { generate83bForm, mark83bFiled, remind83b } from "../actions";

export function Election83bActions({ companyId, securityId, status, documentId, canEdit, holderName }: { companyId: string; securityId: string; status: string; documentId: string | null; canEdit: boolean; holderName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {documentId ? (
        <Button size="xs" variant="ghost" asChild>
          <Link href={`/app/${companyId}/documents/${documentId}`}>
            <FileText /> Form
          </Link>
        </Button>
      ) : canEdit ? (
        <ConfirmButton action={generate83bForm} hidden={{ companyId, securityId }} title="Generate 83(b) election form?" description={`Creates a pre-filled election for ${holderName} in Documents and notifies them.`} confirmLabel="Generate" size="xs" variant="ghost">
          <FileText /> Generate form
        </ConfirmButton>
      ) : null}
      {status !== "FILED" && canEdit ? (
        <>
          <FormDialog
            trigger={
              <Button size="xs" variant="secondary">
                <Check /> Mark filed
              </Button>
            }
            action={mark83bFiled}
            hidden={{ companyId, securityId }}
            title="Record 83(b) filing"
            description="Enter the postmark date of the election sent to the IRS."
            submitLabel="Mark filed"
            size="sm"
            successMessage="Marked filed"
          >
            <Field label="Postmark date">
              <Input type="date" name="filedDate" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </Field>
          </FormDialog>
          {status === "DUE" ? (
            <ConfirmButton action={remind83b} hidden={{ companyId, securityId }} title={`Remind ${holderName}?`} confirmLabel="Send reminder" size="xs" variant="ghost" className="relative">
              <Bell /> <span className="sr-only">Send reminder</span>
            </ConfirmButton>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
