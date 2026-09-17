"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";
import { FormDialog } from "@/components/forms";
import { shares } from "@/lib/format";
import { completeExercise } from "@/app/app/[companyId]/exercises/[id]/actions";

export function IssueSharesDialog({ companyId, requestId, quantity, exercisable, grantCert, isIso, offerElection }: { companyId: string; requestId: string; quantity: number; exercisable: number; grantCert: string; isIso: boolean; offerElection: boolean }) {
  const overQuantity = quantity > exercisable;
  return (
    <FormDialog
      trigger={<Button>Issue shares</Button>}
      title="Issue shares"
      description={`Creates a new common stock certificate for ${shares(quantity)} shares, records the exercise transaction and updates ${grantCert}.${isIso ? " A Form 3921 record will be queued for this tax year." : ""}`}
      action={completeExercise}
      hidden={{ companyId, id: requestId }}
      submitLabel="Issue shares"
      redirectTo={(r) => (r.data ? `/app/${companyId}/securities/${r.data.securityId}` : `/app/${companyId}/exercises/${requestId}`)}
    >
      {overQuantity ? (
        <Alert tone="danger" icon={AlertTriangle}>
          Only {shares(exercisable)} shares are currently exercisable; reduce the request or wait for vesting.
        </Alert>
      ) : null}
      {offerElection ? (
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-[13px]">
          <input type="checkbox" name="election83b" className="mt-0.5 size-4 accent-blue-600" />
          <span>
            <span className="font-medium">Early exercise — track 83(b) election</span>
            <span className="block text-xs text-muted-foreground">Sets a 30-day 83(b) deadline on the new certificate and reminds the holder.</span>
          </span>
        </label>
      ) : null}
      <Field label="Notes on the certificate">
        <Input name="notes" placeholder="Optional" />
      </Field>
    </FormDialog>
  );
}
