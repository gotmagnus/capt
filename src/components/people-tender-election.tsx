"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormDialog } from "@/components/forms";
import { money, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { recordElection } from "@/app/app/[companyId]/liquidity/actions";

export interface HolderDto {
  stakeholderId: string;
  name: string;
  cap: number;
  alreadyOffered: number;
  securities: { securityId: string; certificateNumber: string; type: string; sellable: number; exercisePrice: number | null }[];
}

export function RecordElectionDialog({ companyId, tenderId, holders, pricePerShare }: { companyId: string; tenderId: string; holders: HolderDto[]; pricePerShare: number }) {
  const [holderId, setHolderId] = useState(holders[0]?.stakeholderId ?? "");
  const holder = holders.find((h) => h.stakeholderId === holderId) ?? holders[0];
  const [securityId, setSecurityId] = useState(holder?.securities[0]?.securityId ?? "");
  const sec = holder?.securities.find((s) => s.securityId === securityId) ?? holder?.securities[0];
  const remaining = holder ? Math.max(0, holder.cap - holder.alreadyOffered) : 0;
  const max = Math.min(sec?.sellable ?? 0, remaining);
  const [qty, setQty] = useState(max);
  const proceeds = qty * pricePerShare - (sec?.exercisePrice ?? 0) * qty;
  return (
    <FormDialog
      trigger={
        <Button size="sm" disabled={holders.length === 0}>
          <Plus /> Record election
        </Button>
      }
      title="Record an election"
      description="Log a holder's decision to sell into the tender offer. Elections are prorated at close if oversubscribed."
      action={recordElection}
      hidden={{ companyId, id: tenderId, stakeholderId: holder?.stakeholderId, securityId: sec?.securityId }}
      submitLabel="Record election"
    >
      {({ fieldErrors }) => (
        <>
          <Field label="Holder" hint={holder ? `May sell up to ${shares(holder.cap)}; ${shares(holder.alreadyOffered)} already elected` : undefined}>
            <Select
              value={holder?.stakeholderId ?? ""}
              onChange={(e) => {
                setHolderId(e.target.value);
                const h = holders.find((x) => x.stakeholderId === e.target.value);
                const s = h?.securities[0];
                setSecurityId(s?.securityId ?? "");
                setQty(Math.min(s?.sellable ?? 0, Math.max(0, (h?.cap ?? 0) - (h?.alreadyOffered ?? 0))));
              }}
            >
              {holders.map((h) => (
                <option key={h.stakeholderId} value={h.stakeholderId}>
                  {h.name} — {shares(h.cap)} eligible
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Security">
            <Select
              value={sec?.securityId ?? ""}
              onChange={(e) => {
                setSecurityId(e.target.value);
                const s = holder?.securities.find((x) => x.securityId === e.target.value);
                setQty(Math.min(s?.sellable ?? 0, remaining));
              }}
            >
              {holder?.securities.map((s) => (
                <option key={s.securityId} value={s.securityId}>
                  {s.certificateNumber} · {SECURITY_TYPE_LABELS[s.type as SecurityType]} · {shares(s.sellable)} sellable{s.exercisePrice != null ? ` @ ${price(s.exercisePrice)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shares to sell" error={fieldErrors.sharesOffered} hint={`Maximum ${shares(max)}`}>
            <Input name="sharesOffered" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </Field>
          <div className="grid gap-x-3 gap-y-1.5 rounded-md bg-muted p-3 text-[13px] sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">Gross proceeds</div>
              <div className="font-semibold tabular">{money(qty * pricePerShare)}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">Exercise cost</div>
              <div className="font-semibold tabular">{sec?.exercisePrice != null ? money(qty * sec.exercisePrice) : "—"}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <div className="text-xs text-muted-foreground">Net</div>
              <div className="font-semibold tabular text-success">{money(proceeds)}</div>
            </div>
          </div>
        </>
      )}
    </FormDialog>
  );
}
