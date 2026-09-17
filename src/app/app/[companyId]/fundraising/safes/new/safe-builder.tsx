"use client";

import { useMemo, useState } from "react";
import { Bookmark, FileSignature } from "lucide-react";
import { safeAgreement, type CompanyInfo } from "@/lib/documents/templates";
import { previewConversion } from "@/lib/equity/conversion";
import { ActionForm, FormDialog, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { compactMoney, money, pct, percent, price, shares, toInputDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createSafe, saveSafeTemplate } from "../../actions";

export interface SafeTemplate {
  name: string;
  safeType?: "POST_MONEY" | "PRE_MONEY";
  valuationCap?: number | null;
  discountPercent?: number | null;
  mfn?: boolean;
  proRataRight?: boolean;
}

const PRESETS: SafeTemplate[] = [
  { name: "Post-money cap", safeType: "POST_MONEY", valuationCap: 10_000_000, discountPercent: null, mfn: false, proRataRight: false },
  { name: "Post-money cap + discount", safeType: "POST_MONEY", valuationCap: 10_000_000, discountPercent: 20, mfn: false, proRataRight: false },
  { name: "Discount only", safeType: "POST_MONEY", valuationCap: null, discountPercent: 20, mfn: false, proRataRight: false },
  { name: "MFN only", safeType: "POST_MONEY", valuationCap: null, discountPercent: null, mfn: true, proRataRight: false },
];

export function SafeBuilder({ companyId, company, stakeholders, templates, preRoundFullyDiluted, defaultPreMoney, nextCertificate }: { companyId: string; company: CompanyInfo; stakeholders: { id: string; name: string; relationship: string }[]; templates: SafeTemplate[]; preRoundFullyDiluted: number; defaultPreMoney: number; nextCertificate: string }) {
  const [stakeholderId, setStakeholderId] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [amount, setAmount] = useState(250_000);
  const [safeType, setSafeType] = useState<"POST_MONEY" | "PRE_MONEY">("POST_MONEY");
  const [cap, setCap] = useState<number | "">(10_000_000);
  const [discount, setDiscount] = useState<number | "">("");
  const [mfn, setMfn] = useState(false);
  const [proRata, setProRata] = useState(false);
  const [issueDate, setIssueDate] = useState(toInputDate(new Date()));
  const [send, setSend] = useState(true);
  const [preMoney, setPreMoney] = useState(defaultPreMoney);
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].name);

  const applyPreset = (t: SafeTemplate) => {
    setSafeType(t.safeType ?? "POST_MONEY");
    setCap(t.valuationCap ?? "");
    setDiscount(t.discountPercent ?? "");
    setMfn(!!t.mfn);
    setProRata(!!t.proRataRight);
    setActivePreset(t.name);
  };

  const holderName = stakeholderId ? stakeholders.find((s) => s.id === stakeholderId)?.name ?? "" : investorName || "[Investor]";
  const preview = useMemo(
    () => safeAgreement({ company, investorName: holderName, amount: amount || 0, valuationCap: cap === "" ? null : Number(cap), discountPercent: discount === "" ? null : Number(discount), safeType, mfn, proRata, date: issueDate ? new Date(issueDate) : new Date() }),
    [company, holderName, amount, cap, discount, safeType, mfn, proRata, issueDate],
  );
  const conv = useMemo(() => {
    if (!amount || !preMoney || (cap === "" && discount === "")) return null;
    return previewConversion({ id: "preview", type: "SAFE", stakeholderId: "x", principal: amount, valuationCap: cap === "" ? null : Number(cap), discountPercent: discount === "" ? null : Number(discount), safeType, mfn }, preMoney, preRoundFullyDiluted);
  }, [amount, preMoney, cap, discount, safeType, mfn, preRoundFullyDiluted]);
  const postOwnership = conv ? conv.shares / (preRoundFullyDiluted + conv.shares) : null;
  const termsJson = JSON.stringify({ safeType, valuationCap: cap === "" ? null : Number(cap), discountPercent: discount === "" ? null : Number(discount), mfn, proRataRight: proRata });

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-5">
        <Card>
          <CardHeader className="flex-col gap-1 sm:flex-row sm:gap-4">
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>Start from a standard YC SAFE or one of your saved templates.</CardDescription>
            </div>
            <FormDialog
              trigger={
                <Button variant="ghost" size="sm" className="max-sm:-ml-3">
                  <Bookmark /> Save as template
                </Button>
              }
              title="Save SAFE template"
              description="Saves the current terms (not the investor or amount) for reuse."
              action={saveSafeTemplate}
              hidden={{ companyId, terms: termsJson }}
              submitLabel="Save template"
              successMessage="Template saved"
              size="sm"
            >
              <Field label="Template name" required>
                <Input name="name" placeholder="e.g. Seed extension terms" required />
              </Field>
            </FormDialog>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...PRESETS, ...templates].map((t) => (
              <button key={t.name} type="button" onClick={() => applyPreset(t)} className={cn("rounded-md border px-3 py-1.5 text-[13px]", activePreset === t.name ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-muted")}>
                {t.name}
                {templates.includes(t) ? <span className="ml-1 text-[10px] opacity-70">saved</span> : null}
              </button>
            ))}
          </CardContent>
        </Card>

        <ActionForm action={createSafe} hidden={{ companyId }} successMessage="SAFE issued" redirectTo={(r) => `/app/${companyId}/securities/${r.data?.id}`}>
          {({ pending, fieldErrors }) => (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Terms</CardTitle>
                  <CardDescription>Certificate {nextCertificate}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Investor" required error={fieldErrors.investorName} className="col-span-2 sm:col-span-1">
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
                        <Input name="investorName" value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Acme Ventures Fund II, L.P." />
                      </Field>
                      <Field label="Investor email" className="col-span-2">
                        <Input name="investorEmail" type="email" placeholder="Used for signature and portal invitation" />
                      </Field>
                    </>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                  <Field label="Purchase amount" required error={fieldErrors.amount} className="col-span-2 sm:col-span-1">
                    <Input name="amount" type="number" prefix="$" min={1} step={1000} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} required />
                  </Field>
                  <Field label="SAFE form" className="col-span-2 sm:col-span-1">
                    <Select name="safeType" value={safeType} onChange={(e) => setSafeType(e.target.value as "POST_MONEY" | "PRE_MONEY")}>
                      <option value="POST_MONEY">Post-money (YC 2018+)</option>
                      <option value="PRE_MONEY">Pre-money (YC 2013)</option>
                    </Select>
                  </Field>
                  <Field label="Valuation cap" hint="Leave blank for no cap." error={fieldErrors.valuationCap}>
                    <Input name="valuationCap" type="number" prefix="$" min={0} step={100_000} value={cap} onChange={(e) => setCap(e.target.value === "" ? "" : Number(e.target.value))} />
                  </Field>
                  <Field label="Discount" hint="Off the priced-round price. Leave blank for none." error={fieldErrors.discountPercent}>
                    <Input name="discountPercent" type="number" suffix="%" min={0} max={90} step={1} value={discount} onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))} />
                  </Field>
                  <Field label="Issue date" required className="col-span-2 sm:col-span-1">
                    <Input name="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                  </Field>
                  <Field label="Board approval date" className="col-span-2 sm:col-span-1">
                    <Input name="boardApprovalDate" type="date" />
                  </Field>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  <label className="flex items-center gap-2 text-[13px]">
                    <Switch name="mfn" checked={mfn} onCheckedChange={setMfn} /> Most favored nation
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <Switch name="proRataRight" checked={proRata} onCheckedChange={setProRata} /> Pro-rata side letter
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <Switch name="sendForSignature" checked={send} onCheckedChange={setSend} /> Send for e-signature
                  </label>
                </div>
                <Field label="Internal notes">
                  <Textarea name="notes" rows={2} />
                </Field>
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">{send ? "Creates the SAFE as pending signature; it becomes outstanding when countersigned." : "Records the SAFE as signed and outstanding immediately."}</p>
                  <SubmitButton loading={pending} className="w-full shrink-0 sm:w-auto">
                    <FileSignature /> {send ? "Issue & send for signature" : "Issue SAFE"}
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
              <CardTitle>What this converts to</CardTitle>
              <CardDescription>At a hypothetical priced round</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Next round pre-money">
              <Input type="number" prefix="$" step={1_000_000} value={preMoney || ""} onChange={(e) => setPreMoney(Number(e.target.value))} />
            </Field>
            {conv ? (
              <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4 lg:grid-cols-2">
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Converts via</div>
                  <Badge variant={conv.method === "CAP" ? "info" : conv.method === "DISCOUNT" ? "purple" : "neutral"} className="mt-1">
                    {conv.method === "CAP" ? "Valuation cap" : conv.method === "DISCOUNT" ? "Discount" : "Round price"}
                  </Badge>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Conversion price</div>
                  <div className="font-semibold tabular">{price(conv.conversionPrice)}</div>
                  <div className="text-xs text-muted-foreground">round price {price(conv.discountPrice ? conv.discountPrice / (1 - Number(discount || 0) / 100) : preMoney / preRoundFullyDiluted)}</div>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Shares</div>
                  <div className="font-semibold tabular">{shares(conv.shares)}</div>
                </div>
                <div className="rounded-md bg-muted/60 p-3">
                  <div className="text-xs text-muted-foreground">Ownership after conversion</div>
                  <div className="font-semibold tabular">{percent(postOwnership ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">before new money</div>
                </div>
                <p className="col-span-full text-xs text-muted-foreground">
                  Effective discount to the round: {pct(conv.effectiveDiscountPct, 1)}. {safeType === "POST_MONEY" && cap !== "" ? `A post-money SAFE at a ${compactMoney(Number(cap))} cap guarantees at least ${percent((amount || 0) / Number(cap))} ownership regardless of other SAFEs.` : ""}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Add a cap or discount to preview conversion. With MFN only, the SAFE takes the best later terms.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Document preview</CardTitle>
              <CardDescription>{money(amount)} · generated from your terms</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[520px] overflow-y-auto rounded-md border border-border bg-white p-4 scrollbar-thin">
              <Markdown content={preview} className="text-[12px] [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-[13px]" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
