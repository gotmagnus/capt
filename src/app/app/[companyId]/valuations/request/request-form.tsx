"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DescriptionList, Alert } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { requestValuation } from "./actions";

const PURPOSES = [
  ["ANNUAL", "Annual refresh — previous valuation approaching 12 months"],
  ["FINANCING", "Post-financing — a priced round changed the capitalization"],
  ["MATERIAL_EVENT", "Material event — major contract, M&A interest, pivot"],
  ["INITIAL", "Initial — first valuation before granting options"],
] as const;

export function RequestForm({ companyId, defaultDate, snapshot, recentFinancing, headcount, suggestedPurpose }: { companyId: string; defaultDate: string; snapshot: { label: string; value: string }[]; recentFinancing: string; headcount: number; suggestedPurpose: string }) {
  const [step, setStep] = useState(0);
  const steps = ["Purpose", "Financials", "Events & review"];
  return (
    <ActionForm action={requestValuation} hidden={{ companyId }} successMessage="Valuation requested" redirectTo={(r) => `/app/${companyId}/valuations/${r.data?.id}`}>
      {({ pending, fieldErrors }) => (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <ol className="flex items-center gap-2 text-[13px]">
              {steps.map((s, i) => (
                <li key={s} className="relative flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
                  <span className={cn("whitespace-nowrap", i === step ? "font-medium" : "text-muted-foreground max-sm:sr-only")}>{s}</span>
                  {i < steps.length - 1 ? <span className="mx-1 h-px w-5 shrink-0 bg-border sm:w-8" /> : null}
                </li>
              ))}
            </ol>

            <Card className={cn(step !== 0 && "hidden")}>
              <CardHeader>
                <div>
                  <CardTitle>Purpose and date</CardTitle>
                  <CardDescription>The valuation date anchors the 12-month safe harbor.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Purpose" required className="sm:col-span-2" error={fieldErrors.purpose}>
                  <Select name="purpose" defaultValue={suggestedPurpose}>
                    {PURPOSES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Valuation date" required error={fieldErrors.valuationDate} hint="Usually today or the financing close date.">
                  <Input name="valuationDate" type="date" defaultValue={defaultDate} required />
                </Field>
                <Field label="Provider">
                  <Select name="provider" defaultValue="Capt Valuations">
                    <option>Capt Valuations</option>
                    <option>External appraiser</option>
                  </Select>
                </Field>
              </CardContent>
            </Card>

            <Card className={cn(step !== 1 && "hidden")}>
              <CardHeader>
                <div>
                  <CardTitle>Financial snapshot</CardTitle>
                  <CardDescription>Approximate figures are fine — the analyst will confirm against your statements.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Trailing 12-month revenue">
                  <Input name="revenueTtm" type="number" prefix="$" min={0} step={1000} />
                </Field>
                <Field label="Next 12-month revenue forecast">
                  <Input name="revenueForward" type="number" prefix="$" min={0} step={1000} />
                </Field>
                <Field label="Cash balance">
                  <Input name="cashBalance" type="number" prefix="$" min={0} step={1000} />
                </Field>
                <Field label="Monthly net burn">
                  <Input name="burnMonthly" type="number" prefix="$" min={0} step={1000} />
                </Field>
                <Field label="Total debt">
                  <Input name="totalDebt" type="number" prefix="$" min={0} step={1000} />
                </Field>
                <Field label="Headcount">
                  <Input name="headcount" type="number" min={0} defaultValue={headcount} />
                </Field>
              </CardContent>
            </Card>

            <Card className={cn(step !== 2 && "hidden")}>
              <CardHeader>
                <div>
                  <CardTitle>Events and expectations</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Most recent financing" hint="Pre-filled from your closed rounds.">
                  <Textarea name="recentFinancing" rows={2} defaultValue={recentFinancing} />
                </Field>
                <Field label="Material events since the last valuation" hint="New customers, contracts, product launches, leadership changes, term sheets, acquisition interest.">
                  <Textarea name="materialEvents" rows={4} />
                </Field>
                <Field label="Expected liquidity timeline">
                  <Select name="expectedLiquidity" defaultValue="3-5">
                    <option value="<2">Less than 2 years</option>
                    <option value="2-3">2–3 years</option>
                    <option value="3-5">3–5 years</option>
                    <option value=">5">More than 5 years</option>
                  </Select>
                </Field>
                <Field label="Notes for the analyst">
                  <Textarea name="notes" rows={2} />
                </Field>
                <Alert tone="info">Expected turnaround is 3–5 business days. You'll review a draft before accepting; accepting creates a board consent to ratify the FMV.</Alert>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                <ArrowLeft /> Back
              </Button>
              {step < 2 ? (
                <Button type="button" onClick={() => setStep((s) => s + 1)}>
                  Continue <ArrowRight />
                </Button>
              ) : (
                <SubmitButton loading={pending}>
                  <Send /> Submit request
                </SubmitButton>
              )}
            </div>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <div>
                <CardTitle>Cap table snapshot</CardTitle>
                <CardDescription>Attached automatically as of today</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList columns={1} items={snapshot} className="grid-cols-2 lg:grid-cols-1" />
            </CardContent>
          </Card>
        </div>
      )}
    </ActionForm>
  );
}
