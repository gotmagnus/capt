"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton, FormDialog } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OfferLetter } from "@/components/offers-letter";
import { VestingAreaChart } from "@/components/charts";
import { grantValueProjection } from "@/lib/equity/tax";
import { buildVestingEvents, type VestingScheduleInput } from "@/lib/equity/vesting";
import { compactMoney, date, money, percent, price, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { acceptOffer, declineOffer } from "@/app/offer/[token]/actions";

export function CandidateOffer({
  token,
  letter,
  companyName,
  candidateName,
  packages,
  status,
  expiresAt,
  equityType,
  strikePrice,
  fmv,
  fullyDiluted,
  schedule,
  scheduleName,
  startDate,
  selectedPackage,
}: {
  token: string;
  letter: string;
  companyName: string;
  candidateName: string;
  packages: { label: string; salary: number; equityQuantity: number }[];
  status: string;
  expiresAt: string | null;
  equityType: string;
  strikePrice: number | null;
  fmv: number | null;
  fullyDiluted: number;
  schedule: VestingScheduleInput | null;
  scheduleName: string | null;
  startDate: string | null;
  selectedPackage: number | null;
}) {
  const [pkg, setPkg] = useState(selectedPackage ?? 0);
  const chosen = packages[pkg] ?? packages[0];
  const isOption = equityType.startsWith("OPTION");
  const projection = useMemo(() => grantValueProjection(chosen.equityQuantity, isOption ? strikePrice ?? 0 : 0, fmv ?? 0), [chosen.equityQuantity, strikePrice, fmv, isOption]);
  const vesting = useMemo(() => {
    const start = startDate ? new Date(startDate) : new Date();
    if (!schedule) return [];
    const events = buildVestingEvents(chosen.equityQuantity, start, schedule);
    const months = Math.max(schedule.totalMonths, 12);
    const out: { month: string; vesting: number; cumulative: number }[] = [];
    let cumulative = 0;
    for (let i = 0; i <= months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const vesting = events.filter((e) => `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}` === key).reduce((a, e) => a + e.amount, 0);
      cumulative += vesting;
      out.push({ month: key, vesting, cumulative });
    }
    return out;
  }, [schedule, chosen.equityQuantity, startDate]);
  const expired = status === "EXPIRED" || (expiresAt ? new Date(expiresAt) < new Date() && ["SENT", "VIEWED"].includes(status) : false);
  const answered = ["ACCEPTED", "DECLINED"].includes(status);
  const cliffEvent = schedule && schedule.cliffMonths > 0 ? vesting.find((v) => v.vesting > 0) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
      {/* Phones: the letter is long — give a shortcut to the decision at the bottom. */}
      {!answered && !expired ? (
        <Button variant="secondary" className="w-full lg:hidden" asChild>
          <a href={packages.length > 1 ? "#packages" : "#equity"}>
            {packages.length > 1 ? "Compare packages & accept" : "Review equity & accept"} <ArrowDown />
          </a>
        </Button>
      ) : null}
      <div className="space-y-6 lg:col-span-3">
        <Card>
          <CardContent className="pt-5">
            <OfferLetter content={letter} />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5 lg:col-span-2">
        {answered ? (
          <Card className={status === "ACCEPTED" ? "border-success" : "border-border"}>
            <CardContent className="flex items-center gap-3 pt-5">
              <CheckCircle2 className={cn("size-6", status === "ACCEPTED" ? "text-success" : "text-muted-foreground")} />
              <div>
                <div className="font-semibold">{status === "ACCEPTED" ? "Offer accepted" : "Offer declined"}</div>
                <div className="text-xs text-muted-foreground">{status === "ACCEPTED" ? `Welcome to ${companyName}! Your equity grant will be prepared for board approval.` : "Thank you for considering us."}</div>
              </div>
            </CardContent>
          </Card>
        ) : expired ? (
          <Card className="border-warning">
            <CardContent className="pt-5">
              <div className="font-semibold">This offer has expired</div>
              <div className="text-xs text-muted-foreground">Please contact {companyName} if you'd like to discuss it further.</div>
            </CardContent>
          </Card>
        ) : null}

        {packages.length > 1 ? (
          <Card id="packages" className="scroll-mt-4">
            <CardHeader>
              <div>
                <CardTitle>Choose your package</CardTitle>
                <CardDescription>Each option balances salary and equity differently.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {packages.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={answered || expired}
                  onClick={() => setPkg(i)}
                  aria-pressed={pkg === i}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors", pkg === i ? "border-accent bg-accent-soft" : "border-border hover:bg-muted", (answered || expired) && "cursor-default opacity-80")}
                >
                  <span>
                    <span className="block text-[13px] font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {money(p.salary)} salary · {shares(p.equityQuantity)} {isOption ? "options" : "shares"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular text-muted-foreground">{percent(fullyDiluted ? p.equityQuantity / fullyDiluted : 0, 3)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card id="equity" className="scroll-mt-4">
          <CardHeader>
            <div>
              <CardTitle>Your equity, explained</CardTitle>
              <CardDescription>{isOption ? "Stock options give you the right to buy shares at a fixed price." : equityType === "RSU" ? "RSUs convert to shares as they vest — nothing to buy." : "Restricted shares are yours from day one and vest over time."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-xs text-muted-foreground">{isOption ? "Options" : "Shares"}</div>
                <div className="font-semibold tabular">{shares(chosen.equityQuantity)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ownership today</div>
                <div className="font-semibold tabular">{percent(fullyDiluted ? chosen.equityQuantity / fullyDiluted : 0, 3)}</div>
              </div>
              {isOption ? (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground">Exercise price</div>
                    <div className="font-semibold tabular">{price(strikePrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Cost to exercise all</div>
                    <div className="font-semibold tabular">{money(chosen.equityQuantity * (strikePrice ?? 0))}</div>
                  </div>
                </>
              ) : null}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Potential value if the share price grows</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={projection.map((p) => ({ name: `${p.multiple}× (${price(p.pricePerShare)})`, value: Math.round(p.netValue) }))} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef0f3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#667085" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(x) => compactMoney(x)} width={44} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e7ec" }} formatter={(x) => [money(Number(x)), "Net value"]} cursor={{ fill: "#f1f2f4" }} />
                  <Bar dataKey="value" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground">Illustrative only, based on the current 409A fair market value of {price(fmv)}. Not a promise of future value.</p>
            </div>
            {schedule ? (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Vesting — {scheduleName}</div>
                <VestingAreaChart data={vesting} height={140} />
                <p className="text-[11px] text-muted-foreground">
                  {cliffEvent ? `${shares(cliffEvent.vesting)} vest at your ${schedule.cliffMonths}-month cliff (${cliffEvent.month}), then ` : "Vests "}
                  {schedule.frequency.toLowerCase()} until {vesting[vesting.length - 1]?.month} from a start date of {date(startDate)}.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!answered && !expired ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Accept this offer</CardTitle>
                <CardDescription>Type your full name to sign electronically.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ActionForm action={acceptOffer} hidden={{ token, selectedPackage: pkg }} className="space-y-3">
                {({ fieldErrors }) => (
                  <>
                    <Field label="Full name" error={fieldErrors.signature}>
                      <Input name="signature" placeholder={candidateName} required />
                    </Field>
                    <label className="flex items-start gap-2 text-[13px]">
                      <input type="checkbox" name="agree" className="mt-0.5 size-4 shrink-0 accent-blue-600" required />
                      <span>I have read the offer letter and accept the position{packages.length > 1 ? ` with the “${chosen.label}” package` : ""}.</span>
                    </label>
                    <SubmitButton size="lg" className="w-full" pendingText="Accepting…">
                      Accept offer
                    </SubmitButton>
                  </>
                )}
              </ActionForm>
              <FormDialog trigger={<Button variant="ghost" className="mt-2 w-full">Decline</Button>} title="Decline this offer" description="We're sorry to hear that. You can leave a note for the team." action={declineOffer} hidden={{ token }} submitLabel="Decline offer" size="sm" destructive>
                <Field label="Note (optional)">
                  <Textarea name="reason" rows={3} />
                </Field>
              </FormDialog>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
