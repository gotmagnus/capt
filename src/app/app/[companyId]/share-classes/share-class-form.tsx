"use client";

import * as React from "react";
import { FormDialog } from "@/components/forms";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import { toInputDate } from "@/lib/format";
import { saveShareClass } from "./actions";

export interface ShareClassFormValues {
  id?: string;
  name?: string;
  prefix?: string;
  type?: string;
  authorizedShares?: number;
  parValue?: number;
  originalIssuePrice?: number | null;
  liquidationMultiple?: number;
  participating?: boolean;
  participationCap?: number | null;
  seniority?: number;
  conversionRatio?: number;
  dividendRate?: number | null;
  dividendType?: string;
  antiDilution?: string;
  votesPerShare?: number;
  boardApprovalDate?: string | null;
}

export function ShareClassFormDialog({ companyId, trigger, initial, open, onOpenChange, nextSeniority }: { companyId: string; trigger?: React.ReactNode; initial?: ShareClassFormValues; open?: boolean; onOpenChange?: (o: boolean) => void; nextSeniority?: number }) {
  const [type, setType] = React.useState(initial?.type ?? "PREFERRED");
  const [participating, setParticipating] = React.useState(initial?.participating ?? false);
  const preferred = type === "PREFERRED";
  return (
    <FormDialog<{ id: string }>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? `Edit ${initial.name}` : "Add share class"}
      description="Share classes carry the economic and voting terms from your charter. Preferred terms drive the exit waterfall."
      action={saveShareClass}
      hidden={{ companyId, id: initial?.id }}
      submitLabel={initial?.id ? "Save changes" : "Create share class"}
      size="lg"
    >
      {({ fieldErrors }) => (
        <>
          {/* Two columns on phones, thirds from sm; selects get enough room to show their value. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            <Field label="Name" required className="col-span-2" error={fieldErrors.name}>
              <Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Series B Preferred" />
            </Field>
            <Field label="Certificate prefix" required className="sm:col-span-2" error={fieldErrors.prefix} hint="e.g. PS-B">
              <Input name="prefix" required defaultValue={initial?.prefix ?? ""} placeholder="PS-B" className="uppercase font-mono" />
            </Field>
            <Field label="Type" className="sm:col-span-2">
              <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="PREFERRED">Preferred</option>
                <option value="COMMON">Common</option>
              </Select>
            </Field>
            <Field label="Authorized shares" required className="col-span-2" error={fieldErrors.authorizedShares}>
              <Input name="authorizedShares" type="number" min={1} step={1} required defaultValue={initial?.authorizedShares ?? ""} />
            </Field>
            <Field label="Par value" className="sm:col-span-2">
              <Input name="parValue" type="number" min={0} step="0.00001" defaultValue={initial?.parValue ?? 0.0001} prefix="$" />
            </Field>
            <Field label="Votes per share" className="sm:col-span-2">
              <Input name="votesPerShare" type="number" min={0} step="0.01" defaultValue={initial?.votesPerShare ?? 1} />
            </Field>
            <Field label="Board approval date" className="col-span-2">
              <Input name="boardApprovalDate" type="date" defaultValue={toInputDate(initial?.boardApprovalDate)} />
            </Field>
          </div>
          {preferred ? (
            <div className="rounded-md border border-border bg-muted/40 p-3.5 sm:p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preferred terms</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                <Field label="Original issue price" className="col-span-2" hint="Basis for the liquidation preference.">
                  <Input name="originalIssuePrice" type="number" min={0} step="0.0001" defaultValue={initial?.originalIssuePrice ?? ""} prefix="$" />
                </Field>
                <Field label="Liquidation multiple" className="sm:col-span-2">
                  <Input name="liquidationMultiple" type="number" min={0} step="0.1" defaultValue={initial?.liquidationMultiple ?? 1} suffix="x" />
                </Field>
                <Field label="Seniority" className="sm:col-span-2" hint="1 = paid first.">
                  <Input name="seniority" type="number" min={1} step={1} defaultValue={initial?.seniority ?? nextSeniority ?? 1} />
                </Field>
                <Field label="Anti-dilution" className="col-span-2 sm:col-span-3">
                  <Select name="antiDilution" defaultValue={initial?.antiDilution ?? "BROAD_BASED"}>
                    <option value="BROAD_BASED">Broad-based weighted average</option>
                    <option value="NARROW_BASED">Narrow-based weighted average</option>
                    <option value="FULL_RATCHET">Full ratchet</option>
                    <option value="NONE">None</option>
                  </Select>
                </Field>
                <Field label="Dividends" className="col-span-2 sm:col-span-3">
                  <div className="flex gap-2">
                    <Input name="dividendRate" type="number" min={0} step="0.1" defaultValue={initial?.dividendRate ?? ""} suffix="%" className="w-24 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Select name="dividendType" defaultValue={initial?.dividendType ?? "NON_CUMULATIVE"} aria-label="Dividend type">
                        <option value="NON_CUMULATIVE">Non-cumulative</option>
                        <option value="CUMULATIVE">Cumulative</option>
                        <option value="NONE">None</option>
                      </Select>
                    </div>
                  </div>
                </Field>
                <Field label="Conversion ratio" className="col-span-2" hint="Common shares per preferred share.">
                  <Input name="conversionRatio" type="number" min={0.0001} step="0.0001" defaultValue={initial?.conversionRatio ?? 1} />
                </Field>
                <div className="col-span-2 flex items-center gap-2 sm:pt-[26px] sm:self-start">
                  <Checkbox name="participating" checked={participating} onCheckedChange={(v) => setParticipating(v === true)} id="participating" />
                  <label htmlFor="participating" className="text-[13px]">
                    Participating preferred
                  </label>
                </div>
                {participating ? (
                  <Field label="Participation cap" className="col-span-2" hint="Multiple of OIP; blank = uncapped.">
                    <Input name="participationCap" type="number" min={0} step="0.1" defaultValue={initial?.participationCap ?? ""} suffix="x" />
                  </Field>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
