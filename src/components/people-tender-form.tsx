"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RELATIONSHIP_LABELS, STAKEHOLDER_RELATIONSHIPS } from "@/lib/types";
import { createTender } from "@/app/app/[companyId]/liquidity/actions";

export function TenderForm({ companyId, lastPreferredPrice, defaultStart, defaultEnd }: { companyId: string; lastPreferredPrice: number | null; defaultStart: string; defaultEnd: string }) {
  return (
    <ActionForm action={createTender} hidden={{ companyId }} redirectTo={(r) => `/app/${companyId}/liquidity/${r.data?.id ?? ""}`} className="max-w-3xl space-y-5">
      {({ fieldErrors }) => (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Terms</CardTitle>
                <CardDescription>{lastPreferredPrice ? `Last preferred price was $${lastPreferredPrice.toFixed(2)}; secondary common typically trades at a 15–40% discount.` : "Set the buyer's price and the size of the program."}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Program name" error={fieldErrors.name} required className="col-span-2">
                <Input name="name" required placeholder={`${new Date().getFullYear()} employee liquidity program`} />
              </Field>
              <Field label="Buyer" error={fieldErrors.buyerName} required className="col-span-2 sm:col-span-1">
                <Input name="buyerName" required placeholder="Fund or company name" />
              </Field>
              <Field label="Price per share" error={fieldErrors.pricePerShare} required>
                <Input name="pricePerShare" type="number" step={0.01} min={0.01} required prefix="$" defaultValue={lastPreferredPrice ? (lastPreferredPrice * 0.8).toFixed(2) : ""} />
              </Field>
              <Field label="Maximum shares" error={fieldErrors.maxShares} required>
                <Input name="maxShares" type="number" step={1000} min={1} required placeholder="400000" />
              </Field>
              <Field label="Per-holder cap" error={fieldErrors.maxPercentPerHolder} hint="Share of their vested equity any one holder can sell." className="col-span-2 sm:col-span-1">
                <Input name="maxPercentPerHolder" type="number" min={1} max={100} defaultValue={20} suffix="%" />
              </Field>
              <Field label="Election window opens" required>
                <Input name="startDate" type="date" defaultValue={defaultStart} required />
              </Field>
              <Field label="Election window closes" error={fieldErrors.endDate} required>
                <Input name="endDate" type="date" defaultValue={defaultEnd} required />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Eligibility</CardTitle>
                <CardDescription>Which stakeholder groups can participate.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAKEHOLDER_RELATIONSHIPS.map((r) => (
                  <label key={r} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                    <input type="checkbox" name="eligibility[]" value={r} defaultChecked={["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER"].includes(r)} className="size-4 accent-blue-600" />
                    {RELATIONSHIP_LABELS[r]}
                  </label>
                ))}
              </div>
              {fieldErrors.eligibility ? <p className="mt-2 text-xs text-danger">{fieldErrors.eligibility}</p> : null}
              <Field label="Notes" className="mt-4">
                <Textarea name="notes" rows={3} placeholder="ROFR waiver, board approval status, tax withholding arrangements…" />
              </Field>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <SubmitButton pendingText="Creating…">Create draft</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
