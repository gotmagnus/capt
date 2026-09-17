"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Info } from "lucide-react";
import { simulateExercise, type FilingStatus } from "@/lib/equity/tax";
import { money, price, shares, date as fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { ActionForm, SubmitButton } from "@/components/forms";
import { requestExercise } from "@/app/portal/[companyId]/actions";

export interface SimGrant {
  id: string;
  certificateNumber: string;
  type: string;
  strike: number;
  exercisable: number;
  unexercised: number;
  vested: number;
  exercised: number;
  grantDate: string;
  earlyExercise: boolean;
  hasOpenRequest: boolean;
}

const STATES: { label: string; rate: number }[] = [
  { label: "California (9.3%)", rate: 0.093 },
  { label: "New York (6.85%)", rate: 0.0685 },
  { label: "Massachusetts (5%)", rate: 0.05 },
  { label: "Colorado (4.4%)", rate: 0.044 },
  { label: "Texas / Washington / Florida (0%)", rate: 0 },
  { label: "Other (5%)", rate: 0.05 },
];

export function ExerciseSimulator({ companyId, grants, fmv, initialGrantId }: { companyId: string; grants: SimGrant[]; fmv: number | null; initialGrantId?: string }) {
  const [grantId, setGrantId] = useState(initialGrantId && grants.some((g) => g.id === initialGrantId) ? initialGrantId : grants[0]?.id ?? "");
  const grant = grants.find((g) => g.id === grantId) ?? null;
  const [quantity, setQuantity] = useState(grant?.exercisable ?? 0);
  const [filing, setFiling] = useState<FilingStatus>("SINGLE");
  const [income, setIncome] = useState(150000);
  const [stateRate, setStateRate] = useState(0.093);
  const [exerciseDate, setExerciseDate] = useState(new Date().toISOString().slice(0, 10));
  const [customFmv, setCustomFmv] = useState<number | null>(null);
  const effectiveFmv = customFmv ?? fmv ?? 0;

  const pickGrant = (id: string) => {
    setGrantId(id);
    const g = grants.find((x) => x.id === id);
    setQuantity(g?.exercisable ?? 0);
  };
  const qty = Math.max(0, Math.min(quantity, grant?.exercisable ?? 0));
  const result = useMemo(() => (grant ? simulateExercise({ type: grant.type, quantity: qty, exercisePrice: grant.strike, fmv: effectiveFmv, filingStatus: filing, otherIncome: income, stateRate, grantDate: new Date(grant.grantDate), exerciseDate: new Date(exerciseDate) }) : null), [grant, qty, effectiveFmv, filing, income, stateRate, exerciseDate]);
  const isIso = grant?.type === "OPTION_ISO";
  const earlyPortion = grant ? Math.max(0, qty - Math.max(0, grant.vested - grant.exercised)) : 0;

  if (!grant) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* The wrapper scopes the phone-only sticky summary to the inputs: it follows the thumb while the scenario is on screen, then scrolls away. */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Scenario</CardTitle>
              <CardDescription>Adjust the inputs to see the cash and tax impact.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Grant">
              <Select value={grantId} onChange={(e) => pickGrant(e.target.value)}>
                {grants.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.certificateNumber} · {g.type === "OPTION_ISO" ? "ISO" : g.type === "OPTION_NSO" ? "NSO" : "Warrant"} · {shares(g.exercisable)} exercisable @ {price(g.strike)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Options to exercise (max ${shares(grant.exercisable)})`}>
              <input type="range" min={0} max={grant.exercisable} step={Math.max(1, Math.round(grant.exercisable / 200))} value={qty} onChange={(e) => setQuantity(Number(e.target.value))} className="h-6 w-full cursor-pointer accent-blue-600" aria-label="Options to exercise" />
              <div className="flex items-center gap-2">
                <Input type="number" inputMode="numeric" min={0} max={grant.exercisable} value={qty} onChange={(e) => setQuantity(Number(e.target.value))} className="min-w-0 flex-1" />
                {/* Presets: a slider is imprecise under a thumb */}
                <div className="flex shrink-0 overflow-hidden rounded-md border border-border-strong text-xs font-medium shadow-sm">
                  {[0.25, 0.5, 1].map((f) => {
                    const target = Math.floor(grant.exercisable * f);
                    return (
                      <button key={f} type="button" onClick={() => setQuantity(target)} aria-pressed={qty === target} className={cn("h-9 border-l border-border px-2.5 transition-colors first:border-l-0 hover:bg-muted", qty === target ? "bg-accent-soft text-accent-foreground" : "bg-input")}>
                        {f === 1 ? "Max" : `${f * 100}%`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>
            {grant.earlyExercise && earlyPortion > 0 ? (
              <Alert tone="info">
                {shares(earlyPortion)} of these options are unvested (early exercise). The shares stay subject to repurchase until they vest, and you should file an 83(b) election within 30 days.
              </Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Filing status">
                <Select value={filing} onChange={(e) => setFiling(e.target.value as FilingStatus)}>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED_JOINT">Married filing jointly</option>
                  <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
                </Select>
              </Field>
              <Field label="Other income this year">
                <Input type="number" prefix="$" value={income} onChange={(e) => setIncome(Number(e.target.value))} />
              </Field>
              <Field label="State">
                <Select value={String(stateRate)} onChange={(e) => setStateRate(Number(e.target.value))}>
                  {STATES.map((s) => (
                    <option key={s.label} value={String(s.rate)}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Exercise date">
                <Input type="date" value={exerciseDate} onChange={(e) => setExerciseDate(e.target.value)} />
              </Field>
              <Field label="Assumed FMV per share" hint={fmv ? `Current 409A: ${price(fmv)}` : "No 409A on file"} className="col-span-2">
                <Input type="number" step="0.01" prefix="$" value={effectiveFmv} onChange={(e) => setCustomFmv(Number(e.target.value))} />
              </Field>
            </div>
          </CardContent>
        </Card>
        {result ? (
          <a href="#outcome" className="sticky bottom-3 z-10 mt-3 flex items-center justify-between gap-3 rounded-lg border border-border-strong bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur lg:hidden">
            <span className="min-w-0">
              <span className="block text-[11px] text-muted-foreground">Cash needed at exercise</span>
              <span className="block truncate text-[15px] font-semibold tabular">{money(result.totalCashRequired, { cents: true })}</span>
            </span>
            <span className="min-w-0 text-right">
              <span className="block text-[11px] text-muted-foreground">{isIso ? "Est. AMT" : "Withholding"}</span>
              <span className="block truncate text-[13px] font-medium tabular">{money(isIso ? result.amtEstimate : result.totalWithholding)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent-foreground">
              Details <ArrowDown className="size-3.5" />
            </span>
          </a>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-3">
        {result ? (
          <Card id="outcome" className="scroll-mt-4">
            <CardHeader>
              <div>
                <CardTitle>Estimated outcome</CardTitle>
                <CardDescription>
                  Exercising {shares(qty)} {isIso ? "ISOs" : grant.type === "OPTION_NSO" ? "NSOs" : "warrants"} at {price(grant.strike)} with FMV {price(effectiveFmv)}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Big label="Exercise cost" value={money(result.exerciseCost, { cents: true })} />
                <Big label="Value of shares" value={money(result.fmvValue, { cents: true })} />
                <Big label="Spread (gain)" value={money(result.spread, { cents: true })} tone="success" className="col-span-2 md:col-span-1" />
              </div>
              <dl className="mt-4 divide-y divide-border text-[13px]">
                {isIso ? (
                  <>
                    <Row label="Ordinary income at exercise" value="$0" hint="ISOs are not taxed as income when exercised" />
                    <Row label="Estimated AMT" value={money(result.amtEstimate, { cents: true })} hint="Alternative Minimum Tax on the spread, if it exceeds your regular tax" />
                  </>
                ) : (
                  <>
                    <Row label="Ordinary income" value={money(result.ordinaryIncome, { cents: true })} />
                    <Row label="Federal withholding (22% / 37%)" value={money(result.federalWithholding, { cents: true })} />
                    <Row label="Social Security (6.2%)" value={money(result.socialSecurity, { cents: true })} />
                    <Row label="Medicare (1.45% + 0.9%)" value={money(result.medicare, { cents: true })} />
                    <Row label="State withholding" value={money(result.stateWithholding, { cents: true })} />
                  </>
                )}
                <Row strong label="Total cash needed at exercise" value={money(result.totalCashRequired, { cents: true })} hint={isIso ? "AMT, if any, is paid with your tax return" : "Exercise price plus withholding"} />
              </dl>
              {result.isoQualifyingDate ? (
                <p className="mt-3 text-[13px]">
                  <span className="font-medium">Qualifying disposition date:</span> {fmtDate(result.isoQualifyingDate, "long")}. Sell after this date (2 years from grant and 1 year from exercise) for long-term capital gains treatment on the full gain.
                </p>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {result.notes.map((n) => (
                  <li key={n} className="flex gap-1.5">
                    <Info className="mt-0.5 size-3 shrink-0" /> {n}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Request this exercise</CardTitle>
              <CardDescription>Submits a request to your equity team. Nothing is charged until they approve it and you complete payment.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {grant.hasOpenRequest ? (
              <Alert tone="info">There is already an exercise request in progress for {grant.certificateNumber}.</Alert>
            ) : (
              <ActionForm action={requestExercise} hidden={{ companyId, securityId: grant.id, quantity: qty }} className="space-y-3" successMessage="Exercise request submitted">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Payment method">
                    <Select name="method" defaultValue="ACH">
                      <option value="ACH">Bank transfer (ACH)</option>
                      <option value="WIRE">Wire</option>
                      <option value="CHECK">Check</option>
                      <option value="CASHLESS">Cashless (if permitted)</option>
                      <option value="NET_EXERCISE">Net exercise (if permitted)</option>
                    </Select>
                  </Field>
                  <Field label="Quantity">
                    <Input value={shares(qty)} readOnly className="bg-muted" />
                  </Field>
                </div>
                {earlyPortion > 0 ? (
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" name="election83b" defaultChecked className="mt-0.5 size-4 shrink-0 accent-blue-600" /> I intend to file an 83(b) election for the unvested shares
                  </label>
                ) : null}
                <Field label="Note to the equity team (optional)">
                  <Textarea name="notes" rows={2} />
                </Field>
                <SubmitButton disabled={qty <= 0} className="w-full sm:w-auto">
                  Request exercise of {shares(qty)} options
                </SubmitButton>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Big({ label, value, tone, className }: { label: string; value: string; tone?: "success"; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-md bg-muted px-3 py-2.5", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate text-lg font-semibold tabular", tone === "success" && "text-success")} title={value}>
        {value}
      </div>
    </div>
  );
}

/** Label (+ explanatory hint underneath) on the left, amount on the right — reads the same at 390px and on desktop. */
function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2.5", strong && "font-semibold")}>
      <dt className="min-w-0">
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 tabular">{value}</dd>
    </div>
  );
}
