"use client";

import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/forms";
import { changePassword } from "@/app/app/[companyId]/settings/actions";

/**
 * Change-password form. Client component because it reads `fieldErrors` from ActionForm's
 * render prop — a function child cannot cross the server → client boundary.
 */
export function PasswordForm({ companyId }: { companyId: string }) {
  return (
    <ActionForm action={changePassword} hidden={{ companyId }} successMessage="Password changed" resetOnSuccess className="grid gap-4 md:grid-cols-3">
      {({ fieldErrors }) => (
        <>
          <Field label="Current password">
            <Input name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" error={fieldErrors.next}>
            <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password">
            <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="flex justify-end md:col-span-3">
            <SubmitButton variant="secondary">Change password</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
