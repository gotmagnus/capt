"use client";

import { now } from "@/lib/utils";

import { useMemo, useState } from "react";
import { addYears } from "date-fns";
import { FileSignature } from "lucide-react";
import { convertibleNote, type CompanyInfo } from "@/lib/documents/templates";
import { accruedInterest, previewConversion } from "@/lib/equity/conversion";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { money, pct, percent, price, shares, toInputDate } from "@/lib/format";
import { createNote } from "../../actions";

export function NoteBuilder({ companyId, company, stakeholders, preRoundFullyDiluted, defaultPreMoney, nextCertificate }: { companyId: string; company: CompanyInfo; stakeholders: { id: string; name: string; relationship: string }[]; preRoundFullyDiluted: number; defaultPreMoney: number; nextCertificate: string }) {
  const [stakeholderId, setStakeholderId] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [principal, setPrincipal] = useState(250_000);
  const [rate, setRate] = useState(6);
  const [interestType, setInterestType] = useState<"SIMPLE" | "COMPOUND">("SIMPLE");
  const [issueDate, setIssueDate] = useState(toInputDate(new Date()));
  const [maturity, setMaturity] = useState(toInputDate(addYears(new Date(), 2)));
  const [cap, setCap] = useState<number | "">(15_000_000);
  const [discount, setDiscount] = useState<number | "">(20);
  const [trigger, setTrigger] = useState<number | "">(1_000_000);
  const [send, setSend] = useState(true);
  const [preMoney, setPreMoney] = useState(defaultPreMoney);
  const [convDate, setConvDate] = useState(toInputDate(addYears(new Date(), 1)));

  const holderName = stakeholderId ? stakeholders.find((s) => s.id === stakeholderId)?.name ?? "" : investorName || "[Holder]";
  const preview = useMemo(
    () => convertibleNote({ company, investorName: holderName, principal: principal || 0, interestRate: rate, maturityDate: maturity ? new Date(maturity) : new Date(), valuationCap: cap === "" ? null : Number(cap), discountPercent: discount === "" ? null : Number(discount), qualifiedFinancing: trigger === "" ? null : Number(trigger), date: issueDate ? new Date(issueDate) : new Date() }),
    [company, holderName, principal, rate, maturity, cap, discount, trigger, issueDate],
  );
  const input = useMemo(() => ({ id: "preview", type: "CONVERTIBLE_NOTE", stakeholderId: "x", principal: principal || 0, valuationCap: cap === "" ? null : Number(cap), discountPercent: discount === "" ? null : Number(discount), interestRate: rate, interestType, issueDate: issueDate ? new Date(issueDate) : new Date() }), [principal, cap, discount, rate, interestType, issueDate]);
  const asOf = useMemo(() => (convDate ? new Date(convDate) : now()), [convDate]);
  const interest = accruedInterest(input, asOf);
  const conv = useMemo(() => (principal && preMoney ? previewConversion(input, preMoney, preRoundFullyDiluted, asOf) : null), [input, preMoney, preRoundFullyDiluted, asOf, principal]);
  const interestAtMaturity = accruedInterest(input, maturity ? new Date(maturity) : new Date());

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <ActionForm action={createNote} hidden={{ companyId }} successMessage="Note issued" redirectTo={(r) => `/app/${companyId}/securities/${r.data?.id}`}>
          {({ pending, fieldErrors }) => (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Note terms</CardTitle>
                  <CardDescription>Certificate {nextCertificate}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Holder" required error={fieldErrors.investorName} className="col-span-2 sm:col-span-1">
                    <Select name="stakeholderId" value={stakeholderId} onChange={(e) => setStakeholderId(e.target.value)}>
                      <option value="">New investor…</option>
                      {stakeholders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {!stakeholderId ? (
                    <>
                      <Field label="Investor name" required className="col-span-2 sm:col-span-1">
                        <Input name="investorName" value={investorName} onChange={(e) => setInvestorName(e.target.value)} />
                      </Field>
                      <Field label="Investor email" className="col-span-2">
                        <Input name="investorEmail" type="email" />
                      </Field>
                    </>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                  <Field label="Principal" required error={fieldErrors.principal}>
                    <Input name="principal" type="number" prefix="$" min={1} step={1000} value={principal || ""} onChange={(e) => setPrincipal(Number(e.target.value))} required />
                  </Field>
                  <Field label="Interest rate" required error={fieldErrors.interestRate}>
                    <Input name="interestRate" type="number" suffix="% / yr" min={0} max={30} step={0.25} value={rate} onChange={(e) => setRate(Number(e.target.value))} required />
                  </Field>
                  <Field label="Interest type" className="col-span-2 sm:col-span-1">
                    <Select name="interestType" value={interestType} onChange={(e) => setInterestType(e.target.value as "SIMPLE" | "COMPOUND")}>
                      <option value="SIMPLE">Simple</option>
                      <option value="COMPOUND">Compound (annual)</option>
                    </Select>
                  </Field>
                  <Field label="Issue date" required className="col-span-2 sm:col-span-1">
                    <Input name="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                  </Field>
                  <Field label="Maturity date" required error={fieldErrors.maturityDate} className="col-span-2 sm:col-span-1">
                    <Input name="maturityDate" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} required />
                  </Field>
                  <Field label="Board approval date" className="col-span-2 sm:col-span-1">
                    <Input name="boardApprovalDate" type="date" />
                  </Field>
                  <Field label="Valuation cap" hint="Pre-money style: cap ÷ fully diluted excluding convertibles.">
                    <Input name="valuationCap" type="number" prefix="$" min={0} step={100_000} value={cap} onChange={(e) => setCap(e.target.value === "" ? "" : Number(e.target.value))} />
                  </Field>
                  <Field label="Conversion discount">
                    <Input name="discountPercent" type="number" suffix="%" min={0} max={90} value={discount} onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))} />
                  </Field>
                  <Field label="Qualified financing threshold" hint="Minimum new money that triggers automatic conversion." className="col-span-2 sm:col-span-1">
                    <Input name="conversionTrigger" type="number" prefix="$" min={0} step={100_000} value={trigger} onChange={(e) => setTrigger(e.target.value === "" ? "" : Number(e.target.value))} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <Switch name="sendForSignature" checked={send} onCheckedChange={setSend} /> Send for e-signature
                </label>
                <Field label="Internal notes">
                  <Textarea name="notes" rows={2} />
                </Field>
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Interest at maturity: <span className="font-medium text-foreground">{money(interestAtMaturity, { cents: true })}</span> · balance {money((principal || 0) + interestAtMaturity)}
                  </p>
                  <SubmitButton loading={pending} className="w-full shrink-0 sm:w-auto">
                    <FileSignature /> {send ? "Issue & send for signature" : "Issue note"}
                  </SubmitButton>
                </div>
              </CardContent>
            </Card>
          )}
        </ActionForm>
      </div>
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Conversion preview</CardTitle>
              <CardDescription>Principal plus accrued interest at the conversion date</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="Round pre-money">
                <Input type="number" prefix="$" step={1_000_000} value={preMoney || ""} onChange={(e) => setPreMoney(Number(e.target.value))} />
              </Field>
              <Field label="Conversion date">
                <Input type="date" value={convDate} onChange={(e) => setConvDate(e.target.value)} />
              </Field>
            </div>
            {conv ? (
              <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4 lg:grid-cols-2">
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Accrued interest</div>
                  <div className="font-semibold tabular">{money(interest, { cents: true })}</div>
                  <div className="text-xs text-muted-foreground">converting {money(conv.amount)}</div>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Converts via</div>
                  <Badge variant={conv.method === "CAP" ? "info" : conv.method === "DISCOUNT" ? "purple" : "neutral"} className="mt-1">
                    {conv.method === "CAP" ? "Valuation cap" : conv.method === "DISCOUNT" ? "Discount" : "Round price"}
                  </Badge>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Conversion price</div>
                  <div className="font-semibold tabular">{price(conv.conversionPrice)}</div>
                  <div className="text-xs text-muted-foreground">{pct(conv.effectiveDiscountPct, 1)} below round price</div>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Shares / ownership</div>
                  <div className="font-semibold tabular">{shares(conv.shares)}</div>
                  <div className="text-xs text-muted-foreground">{percent(conv.shares / (preRoundFullyDiluted + conv.shares))} pre-new-money</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Document preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-y-auto rounded-md border border-border bg-white p-4 scrollbar-thin">
              <Markdown content={preview} className="text-[12px] [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-[13px]" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
