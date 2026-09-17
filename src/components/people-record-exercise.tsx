"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/forms";
import { money, price, shares, toInputDate } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { recordExercise } from "@/app/app/[companyId]/exercises/actions";

interface GrantOption {
  securityId: string;
  certificateNumber: string;
  stakeholderId: string;
  holderName: string;
  type: string;
  exercisable: number;
  exercisePrice: number;
}

export function RecordExerciseDialog({ companyId, grants, fmv }: { companyId: string; grants: GrantOption[]; fmv: number | null }) {
  const holders = useMemo(() => [...new Map(grants.map((g) => [g.stakeholderId, g.holderName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [grants]);
  const [holder, setHolder] = useState(holders[0]?.[0] ?? "");
  const mine = grants.filter((g) => g.stakeholderId === holder);
  const [securityId, setSecurityId] = useState(mine[0]?.securityId ?? "");
  const grant = grants.find((g) => g.securityId === securityId) ?? mine[0];
  const [qty, setQty] = useState(grant?.exercisable ?? 0);
  const cost = (grant?.exercisePrice ?? 0) * qty;
  const spread = fmv != null && grant ? Math.max(0, fmv - grant.exercisePrice) * qty : null;

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus /> Record exercise
        </Button>
      }
      title="Record an exercise"
      description="Log an exercise received outside the portal (e.g. a signed notice of exercise). It is created as approved; mark payment and complete to issue shares."
      action={recordExercise}
      hidden={{ companyId, securityId: grant?.securityId }}
      submitLabel="Record exercise"
      successMessage="Exercise recorded"
    >
      {({ fieldErrors }) => (
        <>
          <Field label="Holder">
            <Select
              value={holder}
              onChange={(e) => {
                setHolder(e.target.value);
                const first = grants.find((g) => g.stakeholderId === e.target.value);
                setSecurityId(first?.securityId ?? "");
                setQty(first?.exercisable ?? 0);
              }}
            >
              {holders.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grant" hint={grant ? `${shares(grant.exercisable)} vested & unexercised at ${price(grant.exercisePrice)}` : "No exercisable grants"}>
            <Select
              value={grant?.securityId ?? ""}
              onChange={(e) => {
                setSecurityId(e.target.value);
                setQty(grants.find((g) => g.securityId === e.target.value)?.exercisable ?? 0);
              }}
            >
              {mine.map((g) => (
                <option key={g.securityId} value={g.securityId}>
                  {g.certificateNumber} · {SECURITY_TYPE_LABELS[g.type as SecurityType]} · {shares(g.exercisable)} exercisable
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shares to exercise" error={fieldErrors.quantity}>
              <Input name="quantity" type="number" min={1} max={grant?.exercisable ?? 0} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
            </Field>
            <Field label="Exercise date">
              <Input name="date" type="date" defaultValue={toInputDate(new Date())} required />
            </Field>
          </div>
          <Field label="Payment method">
            <Select name="method" defaultValue="ACH">
              <option value="ACH">ACH debit</option>
              <option value="WIRE">Wire transfer</option>
              <option value="CHECK">Check</option>
              <option value="CASHLESS">Cashless (sell-to-cover)</option>
              <option value="NET_EXERCISE">Net exercise</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea name="notes" rows={2} placeholder="e.g. Notice of exercise received by email on …" />
          </Field>
          <div className="grid gap-x-3 gap-y-1.5 rounded-md bg-muted p-3 text-[13px] sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">Exercise cost</div>
              <div className="font-semibold tabular">{money(cost, { cents: true })}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">FMV</div>
              <div className="font-semibold tabular">{price(fmv)}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">Spread</div>
              <div className="font-semibold tabular">{spread != null ? money(spread) : "—"}</div>
            </div>
          </div>
        </>
      )}
    </FormDialog>
  );
}
