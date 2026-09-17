"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { modelRound } from "@/lib/equity/round-model";
import type { CapTableSummary } from "@/lib/equity/captable";
import type { ConvertibleInput } from "@/lib/equity/conversion";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/misc";
import { compactMoney, money, percent, price, shares, toInputDate } from "@/lib/format";
import { cn, now } from "@/lib/utils";
import { closeRound, type CloseRoundInput } from "../../../actions";

type Investor = { key: string; name: string; amount: number; stakeholderId: string | null; email: string };

export function CloseRoundWizard({
  companyId,
  round,
  summary,
  convertibles,
  stakeholders,
  shareClasses,
  suggestedName,
  suggestedPrefix,
  planName,
}: {
  companyId: string;
  round: { id: string; name: string; preMoneyValuation: number | null; targetAmount: number | null; leadInvestor: string | null; closeDate: string | null; shareClassId: string | null };
  summary: CapTableSummary;
  convertibles: (ConvertibleInput & { certificateNumber: string; holderName: string })[];
  stakeholders: { id: string; name: string; relationship: string; fdPct: number }[];
  shareClasses: { id: string; name: string; prefix: string; originalIssuePrice: number | null }[];
  suggestedName: string;
  suggestedPrefix: string;
  planName: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [preMoney, setPreMoney] = useState(round.preMoneyValuation ?? 0);
  const [closeDate, setCloseDate] = useState(toInputDate(round.closeDate ?? new Date()));
  const [poolPct, setPoolPct] = useState<number | "">(10);
  const [poolTiming, setPoolTiming] = useState<"PRE" | "POST">("PRE");
  const [convertSafes, setConvertSafes] = useState(true);
  const [convertNotes, setConvertNotes] = useState(true);
  const [applyMfn, setApplyMfn] = useState(true);
  const [shareClassId, setShareClassId] = useState<string>(round.shareClassId ?? "");
  const [nc, setNc] = useState({ name: suggestedName, prefix: suggestedPrefix, authorizedShares: 0, liquidationMultiple: 1, participating: false, participationCap: "" as number | "", conversionRatio: 1, dividendRate: 8 as number | "", dividendType: "NON_CUMULATIVE" as "NON_CUMULATIVE" | "CUMULATIVE" | "NONE", antiDilution: "BROAD_BASED" as "NONE" | "BROAD_BASED" | "NARROW_BASED" | "FULL_RATCHET" });
  const [investors, setInvestors] = useState<Investor[]>([{ key: "1", name: round.leadInvestor ?? "", amount: round.targetAmount ?? 0, stakeholderId: null, email: "" }]);
  const [pending, start] = useTransition();

  const totalRaise = investors.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const model = useMemo(() => {
    if (!preMoney || !totalRaise) return null;
    return modelRound({
      capTable: summary,
      preMoneyValuation: preMoney,
      investors: investors.filter((i) => i.name && i.amount > 0).map((i) => ({ id: i.key, name: i.name, amount: Number(i.amount), stakeholderId: i.stakeholderId })),
      targetPoolPct: poolPct === "" ? null : Number(poolPct),
      poolTiming,
      convertibles,
      convertSafes,
      convertNotes,
      applyMfn,
      asOf: closeDate ? new Date(closeDate) : now(),
    });
  }, [summary, preMoney, totalRaise, investors, poolPct, poolTiming, convertibles, convertSafes, convertNotes, applyMfn, closeDate]);

  const authorizedSuggestion = model ? Math.ceil(((model.newMoneyShares + model.convertedShares) * 1.1) / 1000) * 1000 : 0;

  const update = (key: string, patch: Partial<Investor>) => setInvestors((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const addInvestor = () => setInvestors((l) => [...l, { key: String(Date.now()), name: "", amount: 0, stakeholderId: null, email: "" }]);
  const addProRata = (id: string) => {
    const sh = stakeholders.find((s) => s.id === id);
    if (!sh) return;
    setInvestors((l) => [...l, { key: String(Date.now()), name: sh.name, amount: Math.round(sh.fdPct * totalRaise), stakeholderId: sh.id, email: "" }]);
  };

  const canProceed = [preMoney > 0 && !!closeDate && (shareClassId || (nc.name && nc.prefix)), investors.some((i) => i.name && i.amount > 0), !!model && model.pricePerShare > 0][step];

  const commit = () => {
    if (!model) return;
    const payload: CloseRoundInput = {
      preMoneyValuation: preMoney,
      closeDate,
      targetPoolPct: poolPct === "" ? null : Number(poolPct),
      poolTiming,
      convertSafes,
      convertNotes,
      applyMfn,
      investors: investors.filter((i) => i.name && i.amount > 0).map((i) => ({ name: i.name, amount: Number(i.amount), stakeholderId: i.stakeholderId, email: i.email || undefined })),
      shareClassId: shareClassId || null,
      newShareClass: shareClassId
        ? null
        : {
            name: nc.name,
            prefix: nc.prefix,
            authorizedShares: nc.authorizedShares || authorizedSuggestion,
            liquidationMultiple: Number(nc.liquidationMultiple),
            participating: nc.participating,
            participationCap: nc.participating && nc.participationCap !== "" ? Number(nc.participationCap) : null,
            conversionRatio: Number(nc.conversionRatio),
            dividendRate: nc.dividendRate === "" ? null : Number(nc.dividendRate),
            dividendType: nc.dividendType,
            antiDilution: nc.antiDilution,
          },
    };
    start(async () => {
      const res = await closeRound(companyId, round.id, payload);
      if (res.ok) {
        toast.success(res.message ?? "Round closed");
        router.push(`/app/${companyId}/fundraising/rounds/${round.id}`);
      } else toast.error(res.error);
    });
  };

  const steps = ["Terms", "Investors", "Review & commit"];
  const sharesFor = (inv: Investor) => (model && model.pricePerShare > 0 ? Math.floor(inv.amount / model.pricePerShare) : 0);
  const holderSelect = (inv: Investor) => (
    <Select
      className="h-8"
      aria-label="Investor"
      value={inv.stakeholderId ?? "__new"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__new") update(inv.key, { stakeholderId: null });
        else {
          const sh = stakeholders.find((s) => s.id === v);
          update(inv.key, { stakeholderId: v, name: sh?.name ?? inv.name });
        }
      }}
    >
      <option value="__new">New investor</option>
      {stakeholders.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
  const removeButton = (inv: Investor) => (
    <button onClick={() => setInvestors((l) => l.filter((x) => x.key !== inv.key))} className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-danger" aria-label="Remove investor">
      <Trash2 className="size-4" />
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <ol className="flex items-center gap-2 text-[13px]">
          {steps.map((s, i) => (
            <li key={s} className="relative flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
              <span className={cn("whitespace-nowrap", i === step ? "font-medium" : "text-muted-foreground max-sm:sr-only")}>{s}</span>
              {i < steps.length - 1 ? <span className="mx-1 h-px w-5 shrink-0 bg-border sm:w-8" /> : null}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Round terms</CardTitle>
                <CardDescription>Valuation, pool and the preferred class being issued.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Pre-money valuation" required hint="Fully diluted, including the pool top-up and converting instruments.">
                  <Input type="number" prefix="$" value={preMoney || ""} onChange={(e) => setPreMoney(Number(e.target.value))} min={0} step={100_000} />
                </Field>
                <Field label="Close date" required>
                  <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
                </Field>
                <Field label="Post-money option pool target" hint="Unallocated pool as % of post-money fully diluted. Leave blank for no top-up.">
                  <Input type="number" suffix="%" value={poolPct} onChange={(e) => setPoolPct(e.target.value === "" ? "" : Number(e.target.value))} min={0} max={50} step={0.5} />
                </Field>
                <Field label="Pool timing">
                  <Select value={poolTiming} onChange={(e) => setPoolTiming(e.target.value as "PRE" | "POST")}>
                    <option value="PRE">In the pre-money (dilutes existing holders)</option>
                    <option value="POST">Post-money (dilutes everyone)</option>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex items-center gap-2 text-[13px]">
                  <Switch checked={convertSafes} onCheckedChange={setConvertSafes} /> Convert SAFEs ({convertibles.filter((c) => c.type === "SAFE").length})
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <Switch checked={convertNotes} onCheckedChange={setConvertNotes} /> Convert notes ({convertibles.filter((c) => c.type !== "SAFE").length})
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <Switch checked={applyMfn} onCheckedChange={setApplyMfn} /> Apply MFN clauses
                </label>
              </div>
              <div className="border-t border-border pt-4">
                <Field label="Preferred share class">
                  <Select value={shareClassId} onChange={(e) => setShareClassId(e.target.value)}>
                    <option value="">Create new class</option>
                    {shareClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.prefix}) — OIP {price(c.originalIssuePrice)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!shareClassId ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-3">
                    <Field label="Class name" required className="col-span-2 sm:col-span-1">
                      <Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
                    </Field>
                    <Field label="Certificate prefix" required>
                      <Input value={nc.prefix} onChange={(e) => setNc({ ...nc, prefix: e.target.value.toUpperCase() })} />
                    </Field>
                    <Field label="Authorized shares" hint={authorizedSuggestion ? `Suggested ${shares(authorizedSuggestion)}` : undefined}>
                      <Input type="number" value={nc.authorizedShares || ""} placeholder={authorizedSuggestion ? String(authorizedSuggestion) : ""} onChange={(e) => setNc({ ...nc, authorizedShares: Number(e.target.value) })} />
                    </Field>
                    <Field label="Liquidation multiple">
                      <Input type="number" suffix="x" step={0.5} min={0} value={nc.liquidationMultiple} onChange={(e) => setNc({ ...nc, liquidationMultiple: Number(e.target.value) })} />
                    </Field>
                    <Field label="Participation">
                      <Select value={nc.participating ? "yes" : "no"} onChange={(e) => setNc({ ...nc, participating: e.target.value === "yes" })}>
                        <option value="no">Non-participating</option>
                        <option value="yes">Participating</option>
                      </Select>
                    </Field>
                    <Field label="Participation cap" hint="Multiple of OIP; blank = uncapped">
                      <Input type="number" suffix="x" disabled={!nc.participating} value={nc.participationCap} onChange={(e) => setNc({ ...nc, participationCap: e.target.value === "" ? "" : Number(e.target.value) })} />
                    </Field>
                    <Field label="Conversion ratio">
                      <Input type="number" step={0.01} min={0.01} value={nc.conversionRatio} onChange={(e) => setNc({ ...nc, conversionRatio: Number(e.target.value) })} />
                    </Field>
                    <Field label="Dividend rate">
                      <Input type="number" suffix="%" value={nc.dividendRate} onChange={(e) => setNc({ ...nc, dividendRate: e.target.value === "" ? "" : Number(e.target.value) })} />
                    </Field>
                    <Field label="Dividend type">
                      <Select value={nc.dividendType} onChange={(e) => setNc({ ...nc, dividendType: e.target.value as typeof nc.dividendType })}>
                        <option value="NON_CUMULATIVE">Non-cumulative</option>
                        <option value="CUMULATIVE">Cumulative</option>
                        <option value="NONE">None</option>
                      </Select>
                    </Field>
                    <Field label="Anti-dilution" className="col-span-full">
                      <Select value={nc.antiDilution} onChange={(e) => setNc({ ...nc, antiDilution: e.target.value as typeof nc.antiDilution })}>
                        <option value="BROAD_BASED">Broad-based weighted average</option>
                        <option value="NARROW_BASED">Narrow-based weighted average</option>
                        <option value="FULL_RATCHET">Full ratchet</option>
                        <option value="NONE">None</option>
                      </Select>
                    </Field>
                    <p className="col-span-full text-xs text-muted-foreground">The new class is made senior to all existing preferred; original issue price is set to the round price.</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card>
            <CardHeader className="flex-col sm:flex-row sm:flex-wrap">
              <div className="min-w-0 sm:flex-1 sm:basis-64">
                <CardTitle>Investors</CardTitle>
                <CardDescription>New investors are created as stakeholders; existing holders can take pro-rata.</CardDescription>
              </div>
              <div className="flex w-full gap-2 sm:w-auto [&>div]:min-w-0 [&>div]:flex-1">
                <Select className="h-8 sm:w-56" value="" onChange={(e) => e.target.value && addProRata(e.target.value)}>
                  <option value="">Add existing holder pro-rata…</option>
                  {stakeholders
                    .filter((s) => s.relationship === "INVESTOR")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({percent(s.fdPct, 1)})
                      </option>
                    ))}
                </Select>
                <Button variant="secondary" size="sm" onClick={addInvestor}>
                  <Plus /> Add investor
                </Button>
              </div>
            </CardHeader>
            <CardContent className="sm:rounded-b-lg sm:px-0 sm:pb-0 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5">
              <div className="space-y-3 sm:hidden">
                {investors.map((inv) => {
                  const shr = sharesFor(inv);
                  return (
                    <div key={inv.key} className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">{holderSelect(inv)}</div>
                        {removeButton(inv)}
                      </div>
                      {!inv.stakeholderId ? (
                        <>
                          <Input className="h-8" placeholder="Investor name" value={inv.name} onChange={(e) => update(inv.key, { name: e.target.value })} />
                          <Input className="h-8" type="email" placeholder="Email (optional)" value={inv.email} onChange={(e) => update(inv.key, { email: e.target.value })} />
                        </>
                      ) : null}
                      <Input className="h-8" type="number" prefix="$" min={0} step={10_000} placeholder="Amount" aria-label="Amount" value={inv.amount || ""} onChange={(e) => update(inv.key, { amount: Number(e.target.value) })} />
                      <div className="flex justify-between text-xs text-muted-foreground tabular">
                        <span>{shares(shr)} shares</span>
                        <span>{model ? `${percent(model.postFullyDiluted ? shr / model.postFullyDiluted : 0)} post-money` : "—"}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-[13px] font-semibold">
                  <span>Total</span>
                  <span className="tabular">
                    {money(totalRaise)}
                    {model ? <span className="ml-2 font-normal text-muted-foreground">{percent(model.newInvestorPct)}</span> : null}
                  </span>
                </div>
              </div>
              <table className="data-table max-sm:hidden">
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Email (new investors)</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Shares</th>
                    <th className="text-right">Post %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((inv) => {
                    const shr = sharesFor(inv);
                    return (
                      <tr key={inv.key}>
                        <td className="min-w-[300px]">
                          <div className="flex gap-2">
                            <div className={cn("min-w-0", inv.stakeholderId ? "flex-1" : "w-36 shrink-0")}>{holderSelect(inv)}</div>
                            {!inv.stakeholderId ? <Input className="h-8" placeholder="Investor name" value={inv.name} onChange={(e) => update(inv.key, { name: e.target.value })} /> : null}
                          </div>
                        </td>
                        <td>{!inv.stakeholderId ? <Input className="h-8 min-w-36" type="email" placeholder="optional" value={inv.email} onChange={(e) => update(inv.key, { email: e.target.value })} /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="num">
                          <Input className="ml-auto h-8 w-36" type="number" prefix="$" min={0} step={10_000} value={inv.amount || ""} onChange={(e) => update(inv.key, { amount: Number(e.target.value) })} />
                        </td>
                        <td className="num">{shares(shr)}</td>
                        <td className="num">{model ? percent(model.postFullyDiluted ? shr / model.postFullyDiluted : 0) : "—"}</td>
                        <td>{removeButton(inv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="num">{money(totalRaise)}</td>
                    <td className="num">{shares(model?.newMoneyShares)}</td>
                    <td className="num">{model ? percent(model.newInvestorPct) : "—"}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 && model ? (
          <>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pro-forma capitalization</CardTitle>
                  <CardDescription>What the cap table looks like after this round closes.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="max-sm:px-0 max-sm:pb-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="data-table max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5 max-sm:[&_td:first-child]:pl-5 max-sm:[&_th:first-child]:pl-5">
                    <thead>
                      <tr>
                        <th>Holder</th>
                        <th className="text-right max-sm:hidden">Pre shares</th>
                        <th className="text-right">Pre %</th>
                        <th className="text-right max-sm:hidden">New shares</th>
                        <th className="text-right max-sm:hidden">Post shares</th>
                        <th className="text-right">Post %</th>
                        <th className="text-right">Δ pp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.rows
                        .filter((r) => r.kind !== "TOTAL")
                        .map((r) => (
                          <tr key={r.key} className={cn(r.kind === "NEW_INVESTOR" && "bg-accent-soft/40", r.kind === "POOL" && "text-muted-foreground")}>
                            <td className="max-sm:max-w-[10.5rem]">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate" title={r.name}>
                                  {r.name}
                                </span>
                                {r.kind === "NEW_INVESTOR" ? <Badge variant="accent">New</Badge> : r.kind === "CONVERSION" ? <Badge variant="info">Conversion</Badge> : null}
                              </div>
                              <div className="truncate text-[11px] tabular text-muted-foreground sm:hidden">
                                {shares(r.postShares)} sh{r.newShares && r.preShares ? ` · +${shares(r.newShares)}` : ""}
                              </div>
                            </td>
                            <td className="num max-sm:hidden">{shares(r.preShares)}</td>
                            <td className="num">{percent(r.prePct)}</td>
                            <td className="num max-sm:hidden">{r.newShares ? shares(r.newShares) : "—"}</td>
                            <td className="num max-sm:hidden">{shares(r.postShares)}</td>
                            <td className="num">{percent(r.postPct)}</td>
                            <td className={cn("num", r.dilutionPct < 0 ? "text-danger" : r.dilutionPct > 0 ? "text-success" : "")}>{r.dilutionPct ? `${r.dilutionPct > 0 ? "+" : ""}${r.dilutionPct.toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>
                          Total
                          <div className="text-[11px] font-normal tabular text-muted-foreground sm:hidden">{shares(model.postFullyDiluted)} sh</div>
                        </td>
                        <td className="num max-sm:hidden">{shares(model.preFullyDiluted)}</td>
                        <td className="num">100%</td>
                        <td className="num max-sm:hidden">{shares(model.postFullyDiluted - model.preFullyDiluted)}</td>
                        <td className="num max-sm:hidden">{shares(model.postFullyDiluted)}</td>
                        <td className="num">100%</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
            {model.conversions.length ? (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Conversions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="max-sm:px-0 max-sm:pb-0 max-sm:[&_td:first-child]:pl-5 max-sm:[&_th:first-child]:pl-5">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Instrument</th>
                        <th>Holder</th>
                        <th className="text-right">Amount</th>
                        <th>Method</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.conversions.map((c) => {
                        const src = convertibles.find((x) => x.id === c.id);
                        return (
                          <tr key={c.id}>
                            <td className="font-mono text-xs">{src?.certificateNumber}</td>
                            <td>{src?.holderName}</td>
                            <td className="num">{money(c.amount)}</td>
                            <td>
                              <Badge variant={c.method === "CAP" ? "info" : c.method === "DISCOUNT" ? "purple" : "neutral"}>{c.method === "CAP" ? "Cap" : c.method === "DISCOUNT" ? "Discount" : "Round price"}</Badge>
                            </td>
                            <td className="num">{price(c.conversionPrice)}</td>
                            <td className="num">{shares(c.shares)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : null}
            <Alert tone="warning">
              Committing will issue {shares(model.newMoneyShares + model.convertedShares)} preferred shares across {investors.filter((i) => i.name && i.amount > 0).length + model.conversions.length} certificates{model.poolIncrease > 0 && planName ? `, increase the ${planName} reserve by ${shares(model.poolIncrease)} shares` : ""}, mark converted instruments as converted, and draft a board consent. This is recorded in the audit log.
            </Alert>
          </>
        ) : null}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={commit} loading={pending} disabled={!model || !canProceed}>
              <Check /> Close {round.name}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 content-start gap-3 lg:sticky lg:top-[4.5rem] lg:grid-cols-1 lg:self-start">
        <Stat className="col-span-2 lg:col-span-1" label="Price per share" value={price(model?.pricePerShare)} hint={model ? `${model.iterations} solver iterations` : "Enter a pre-money valuation"} />
        <Stat label="Post-money valuation" value={compactMoney(model?.postMoneyValuation)} hint={model ? `Pre-money ${compactMoney(model.preMoneyValuation)} + ${compactMoney(model.totalRaised)}` : undefined} />
        <Stat label="New investors own" value={model ? percent(model.newInvestorPct, 1) : "—"} hint={model ? `${shares(model.newMoneyShares)} new shares` : undefined} />
        <Stat label="Converted shares" value={shares(model?.convertedShares)} hint={model ? `${model.conversions.length} instruments` : undefined} />
        <Stat label="Pool after close" value={model ? percent(model.poolPostPct, 1) : "—"} hint={model ? `+${shares(model.poolIncrease)} shares` : undefined} />
        {model?.warnings.map((w) => (
          <Alert key={w} tone="danger" className="col-span-full">
            {w}
          </Alert>
        ))}
      </div>
    </div>
  );
}
