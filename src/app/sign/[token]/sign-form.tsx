"use client";

import { useState } from "react";
import { PenLine, ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton, FormDialog } from "@/components/forms";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { declineByToken, signByToken } from "./actions";

export function SignForm({ token, signerName, role }: { token: string; signerName: string; role: string }) {
  const [typed, setTyped] = useState("");
  return (
    <div className="space-y-4">
      <ActionForm action={signByToken} hidden={{ token }} className="space-y-4">
        {({ pending }) => (
          <>
            <Field label="Type your full name to sign" hint={`Signing as ${signerName} (${role.toLowerCase()})`}>
              <Input name="typedName" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={signerName} autoComplete="name" required />
            </Field>
            <div className="rounded-md border border-dashed border-border-strong bg-muted/40 px-4 py-6 text-center">
              <div className="break-words font-serif text-2xl italic text-foreground/80" style={{ fontFamily: "'Snell Roundhand', 'Brush Script MT', cursive" }}>
                {typed || <span className="text-subtle">Your signature</span>}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Electronic signature preview</div>
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" name="agree" className="mt-0.5 size-4 shrink-0 accent-blue-600" required />
              <span>I agree to use electronic records and signatures, and I intend this typed name to be my legally binding signature under the U.S. ESIGN Act and applicable law.</span>
            </label>
            <SubmitButton className="w-full" size="lg" disabled={pending}>
              <PenLine /> Adopt and sign
            </SubmitButton>
          </>
        )}
      </ActionForm>
      <FormDialog
        trigger={
          <Button variant="ghost" className="w-full text-muted-foreground">
            Decline to sign
          </Button>
        }
        action={declineByToken}
        hidden={{ token }}
        title="Decline to sign"
        description="The company will be notified. You can add a reason."
        submitLabel="Decline"
        size="sm"
        destructive
      >
        <Field label="Reason (optional)">
          <Textarea name="comment" rows={3} />
        </Field>
      </FormDialog>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0" /> Your IP address and a timestamp are recorded with the signature for the audit trail.
      </p>
    </div>
  );
}
