"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Info, ScanSearch, Save, XCircle } from "lucide-react";
import type { TermSheetScan } from "@/lib/fundraising-term-sheet";
import { ActionForm, FormDialog, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { saveTermSheet, scanTermSheet } from "../actions";

const SAMPLE = `SUMMARY OF TERMS — SERIES B PREFERRED STOCK FINANCING

Amount of Financing: $25,000,000, with $18,000,000 from the Lead Investor.
Pre-Money Valuation: $90,000,000 on a fully diluted basis, including an unallocated option pool equal to 12% of the post-money capitalization, to be created prior to the closing.
Price per Share: $4.62 (the "Original Purchase Price").
Dividends: 8% non-cumulative dividends, payable when and if declared by the Board.
Liquidation Preference: 1x the Original Purchase Price plus declared but unpaid dividends, non-participating, senior to the Series A and Series Seed Preferred.
Anti-dilution: Broad-based weighted average.
Board of Directors: Five members: two designated by the founders, two designated by the investors (one Series B, one Series A), and one independent director mutually agreed.
Pro Rata Rights: Major Investors (holding at least $1,000,000) shall have pro rata rights on future financings.
Drag-Along: Holders of a majority of Preferred, a majority of Common and the Board may require all holders to participate in a sale.
No-Shop: 45 days from signing of this term sheet.
Protective Provisions: Standard NVCA protective provisions.
Information Rights: Major Investors receive quarterly financials and the annual budget.`;

function TermStatus({ status }: { status: TermSheetScan["terms"][number]["status"] }) {
  return <Badge variant={status === "OK" ? "success" : status === "WARNING" ? "warning" : status === "DANGER" ? "danger" : status === "INFO" ? "info" : "neutral"}>{status === "UNKNOWN" ? "Not found" : status === "OK" ? "Standard" : status === "INFO" ? "Noted" : status === "WARNING" ? "Review" : "Off-market"}</Badge>;
}

export function TermSheetScanner({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TermSheetScan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-4">
        <ActionForm action={scanTermSheet} hidden={{ companyId }} onSuccess={(r) => setResult(r.data ?? null)}>
          {({ pending }) => (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Term sheet text</CardTitle>
                  <CardDescription>Paste the summary of terms or upload a .txt / .md export.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea name="text" value={text} onChange={(e) => setText(e.target.value)} rows={18} placeholder="Paste the term sheet here…" className="font-mono text-[12px]" />
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    <FileUp /> Upload file
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
                    Use sample
                  </Button>
                  <SubmitButton size="sm" className="ml-auto" loading={pending} disabled={text.trim().length < 40}>
                    <ScanSearch /> Scan terms
                  </SubmitButton>
                </div>
              </CardContent>
            </Card>
          )}
        </ActionForm>
        <Alert tone="info" icon={Info}>
          The scanner uses pattern matching on standard NVCA / YC language. Always have counsel review the full document — this is a negotiation aid, not legal advice.
        </Alert>
      </div>

      <div className="lg:col-span-3 space-y-4">
        {!result ? (
          <Card>
            <CardContent className="py-16 text-center text-[13px] text-muted-foreground">
              <ScanSearch className="mx-auto mb-3 size-6 text-subtle" />
              Results appear here: each term, what the market standard is, and anything worth pushing back on.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex-col gap-3 sm:flex-row sm:gap-4">
                <div>
                  <CardTitle>Founder-friendliness</CardTitle>
                  <CardDescription>
                    {result.terms.filter((t) => t.value).length} of {result.terms.length} terms detected · {result.flags.length} flag{result.flags.length === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                  <div className={cn("text-3xl font-semibold tabular leading-none", result.score >= 80 ? "text-success" : result.score >= 60 ? "text-warning" : "text-danger")}>
                    {result.score}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </div>
                  {canEdit ? (
                    <FormDialog
                      trigger={
                        <Button variant="secondary" size="sm">
                          <Save /> Save to documents
                        </Button>
                      }
                      title="Save term sheet"
                      description="Stores the text and this analysis in the Fundraising folder."
                      action={saveTermSheet}
                      hidden={{ companyId, text, summary: result.summaryMarkdown }}
                      submitLabel="Save"
                      successMessage="Saved to documents"
                      redirectTo={(r) => `/app/${companyId}/documents/${r.data?.id}`}
                      size="sm"
                    >
                      <Field label="Document name" required>
                        <Input name="name" defaultValue={`Term sheet — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`} required />
                      </Field>
                    </FormDialog>
                  ) : null}
                </div>
              </CardHeader>
              {result.flags.length ? (
                <CardContent className="space-y-2">
                  {result.flags.map((f, i) => (
                    <div key={i} className={cn("flex gap-3 rounded-md border px-3 py-2.5 text-[13px]", f.severity === "DANGER" ? "border-red-200 bg-danger-soft" : f.severity === "WARNING" ? "border-amber-200 bg-warning-soft" : "border-blue-200 bg-info-soft")}>
                      {f.severity === "DANGER" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : f.severity === "WARNING" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Info className="mt-0.5 size-4 shrink-0 text-info" />}
                      <div>
                        <div className="font-semibold">{f.title}</div>
                        <div className="text-muted-foreground">{f.detail}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              ) : (
                <CardContent>
                  <div className="flex items-center gap-2 text-[13px] text-success">
                    <CheckCircle2 className="size-4" /> No atypical terms detected.
                  </div>
                </CardContent>
              )}
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Term-by-term</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <ul className="divide-y divide-border border-t border-border sm:hidden">
                  {result.terms.map((t) => (
                    <li key={t.key} className="px-5 py-3 text-[13px]">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium">{t.label}</span>
                        <TermStatus status={t.status} />
                      </div>
                      <div className="mt-1">{t.value ?? <span className="text-muted-foreground">Not found</span>}</div>
                      {t.explanation ? <div className="mt-0.5 text-xs text-muted-foreground">{t.explanation}</div> : null}
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">Market standard:</span> {t.standard}
                      </div>
                    </li>
                  ))}
                </ul>
                <table className="data-table max-sm:hidden">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th>In this term sheet</th>
                      <th>Market standard</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.terms.map((t) => (
                      <tr key={t.key}>
                        <td className="font-medium">{t.label}</td>
                        <td className="min-w-[200px] max-w-[260px] whitespace-normal">
                          {t.value ?? <span className="text-muted-foreground">Not found</span>}
                          {t.explanation ? <div className="mt-0.5 text-xs text-muted-foreground">{t.explanation}</div> : null}
                        </td>
                        <td className="min-w-[200px] max-w-[240px] whitespace-normal text-muted-foreground">{t.standard}</td>
                        <td>
                          <TermStatus status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
