"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { solveConversions, type ConvertibleInput } from "@/lib/equity/conversion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/tooltip";
import { compactMoney, date, money, pct, price, shares } from "@/lib/format";

export interface ConvertibleRow extends ConvertibleInput {
  certificateNumber: string;
  holderName: string;
  maturityDate: string | null;
  status: string;
}

export function ConvertiblesTable({ companyId, rows, preRoundFullyDiluted, defaultPreMoney }: { companyId: string; rows: ConvertibleRow[]; preRoundFullyDiluted: number; defaultPreMoney: number }) {
  const [preMoney, setPreMoney] = useState(defaultPreMoney);
  const [applyMfn, setApplyMfn] = useState(true);
  const solved = useMemo(() => {
    if (!rows.length || !preMoney) return null;
    return solveConversions({ convertibles: rows, preRoundFullyDiluted, poolIncrease: 0, preMoneyValuation: preMoney, applyMfn });
  }, [rows, preRoundFullyDiluted, preMoney, applyMfn]);
  const byId = new Map(solved?.results.map((r) => [r.id, r]) ?? []);
  const totalPrincipal = rows.reduce((a, r) => a + r.principal, 0);
  const totalShares = solved?.totalConvertedShares ?? 0;
  const postConvFD = preRoundFullyDiluted + totalShares;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border px-4 py-3">
        <div className="w-full text-[13px] font-medium sm:w-auto">Conversion preview at a priced round</div>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] sm:flex-none">
          <span className="shrink-0 text-muted-foreground">Pre-money</span>
          <Input type="number" prefix="$" value={preMoney} onChange={(e) => setPreMoney(Number(e.target.value))} className="h-8 min-w-0 flex-1 sm:w-44 sm:flex-none" step={1_000_000} min={0} aria-label="Pre-money valuation" />
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={applyMfn} onChange={(e) => setApplyMfn(e.target.checked)} className="size-3.5 accent-blue-600" /> Apply MFN
        </label>
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:ml-auto lg:w-auto">
          <span>
            Round price <span className="font-medium text-foreground tabular">{price(solved?.roundPricePerShare)}</span>
          </span>
          <span>
            Converts into <span className="font-medium text-foreground tabular">{shares(totalShares)}</span> shares ({pct(postConvFD ? (totalShares / postConvFD) * 100 : 0)})
          </span>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="data-table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th className="max-sm:hidden">Holder</th>
              <th className="text-right">Principal</th>
              <th className="max-sm:hidden">Terms</th>
              <th className="text-right max-sm:hidden">Accrued interest</th>
              <th className="max-sm:hidden">Maturity</th>
              <th className="max-sm:hidden">Converts via</th>
              <th className="text-right max-sm:hidden">Conversion price</th>
              <th className="text-right">Shares</th>
              <th className="text-right max-sm:hidden">Post-conv. %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = byId.get(r.id);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/app/${companyId}/securities/${r.id}`} className="font-mono text-xs font-medium hover:underline">
                      {r.certificateNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.type === "SAFE" ? `${r.safeType === "PRE_MONEY" ? "Pre-money" : "Post-money"} SAFE` : "Convertible note"}</div>
                    {/* Phones: holder and conversion terms fold under the instrument. */}
                    <div className="mt-0.5 max-w-[11rem] truncate text-xs sm:hidden">{r.holderName}</div>
                    {c ? (
                      <div className="text-xs tabular text-muted-foreground sm:hidden">
                        {c.method === "CAP" ? "Cap" : c.method === "DISCOUNT" ? "Discount" : "Round price"} · {price(c.conversionPrice)}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-sm:hidden">{r.holderName}</td>
                  <td className="num">{money(r.principal)}</td>
                  <td className="max-sm:hidden">
                    <div className="flex flex-wrap gap-1">
                      {r.valuationCap ? <Badge variant="outline">Cap {compactMoney(r.valuationCap)}</Badge> : null}
                      {r.discountPercent ? <Badge variant="outline">{r.discountPercent}% discount</Badge> : null}
                      {r.interestRate ? <Badge variant="outline">{r.interestRate}% {r.interestType === "COMPOUND" ? "compound" : "simple"}</Badge> : null}
                      {r.mfn ? <Badge variant="accent">MFN</Badge> : null}
                      {r.proRataRight ? <Badge variant="accent">Pro rata</Badge> : null}
                    </div>
                  </td>
                  <td className="num max-sm:hidden">{c && c.accruedInterest > 0 ? money(c.accruedInterest, { cents: true }) : "—"}</td>
                  <td className="text-muted-foreground max-sm:hidden">{date(r.maturityDate)}</td>
                  <td className="max-sm:hidden">
                    {c ? (
                      <span className="inline-flex items-center gap-1">
                        <Badge variant={c.method === "CAP" ? "info" : c.method === "DISCOUNT" ? "purple" : "neutral"}>{c.method === "CAP" ? "Valuation cap" : c.method === "DISCOUNT" ? "Discount" : "Round price"}</Badge>
                        {c.effectiveDiscountPct > 0 ? <span className="text-xs text-muted-foreground">{pct(c.effectiveDiscountPct, 0)} off</span> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num max-sm:hidden">{price(c?.conversionPrice)}</td>
                  <td className="num">{shares(c?.shares)}</td>
                  <td className="num max-sm:hidden">{c ? pct(postConvFD ? (c.shares / postConvFD) * 100 : 0) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="max-sm:hidden" />
              <td className="num">{money(totalPrincipal)}</td>
              <td colSpan={5} className="max-sm:hidden" />
              <td className="num">{shares(totalShares)}</td>
              <td className="num max-sm:hidden">{pct(postConvFD ? (totalShares / postConvFD) * 100 : 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        <p>
          Post-money SAFEs convert on the full pre-round capitalization including each other; pre-money SAFEs and notes use the capitalization excluding convertibles.{" "}
          <InfoTip label="Shares are rounded down to whole shares. Notes include interest accrued to today.">
            <span className="underline decoration-dotted">Details</span>
          </InfoTip>
        </p>
      </div>
    </div>
  );
}
