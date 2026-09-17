"use client";

import { now } from "@/lib/utils";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OfferLetter } from "@/components/offers-letter";
import { grantValueProjection } from "@/lib/equity/tax";
import { offerLetterDocument, vestingDescription } from "@/lib/documents/templates";
import { compactMoney, money, percent, price, shares, toInputDate } from "@/lib/format";
import { saveOffer } from "@/app/app/[companyId]/offers/actions";
import { LEVELS } from "@/components/people-hiring-planner";

export interface OfferFormValues {
  id?: string;
  candidateName: string;
  candidateEmail: string;
  title: string;
  department: string;
  level: string;
  salary: number;
  bonus: number | null;
  equityQuantity: number;
  equityType: string;
  strikePrice: number | null;
  vestingScheduleId: string;
  startDate: string | null;
  expiresAt: string | null;
  message: string;
  packages: { label: string; salary: number; equityQuantity: number }[];
}

export interface ScheduleDto {
  id: string;
  name: string;
  type: string;
  totalMonths: number;
  cliffMonths: number;
  frequency: string;
  cliffPercent: number | null;
}

export function OffersForm({
  companyId,
  company,
  fmv,
  fullyDiluted,
  schedules,
  departments,
  initial,
}: {
  companyId: string;
  company: { legalName: string; incorporationState: string };
  fmv: number | null;
  fullyDiluted: number;
  schedules: ScheduleDto[];
  departments: string[];
  initial?: OfferFormValues;
}) {
  const defaultSchedule = schedules.find((s) => /1 year cliff/i.test(s.name)) ?? schedules[0];
  const [v, setV] = useState<OfferFormValues>(
    initial ?? {
      candidateName: "",
      candidateEmail: "",
      title: "",
      department: departments[0] ?? "Engineering",
      level: "L5",
      salary: 185_000,
      bonus: null,
      equityQuantity: 50_000,
      equityType: "OPTION_ISO",
      strikePrice: fmv,
      vestingScheduleId: defaultSchedule?.id ?? "",
      startDate: null,
      expiresAt: toInputDate(new Date(now().getTime() + 7 * 86_400_000)),
      message: "",
      packages: [],
    },
  );
  const set = <K extends keyof OfferFormValues>(k: K, val: OfferFormValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const schedule = schedules.find((s) => s.id === v.vestingScheduleId) ?? null;
  const projection = useMemo(() => grantValueProjection(v.equityQuantity, v.strikePrice ?? 0, fmv ?? 0), [v.equityQuantity, v.strikePrice, fmv]);
  const letter = useMemo(
    () =>
      offerLetterDocument({
        company,
        candidateName: v.candidateName || "Candidate",
        title: v.title || "Role",
        startDate: v.startDate,
        salary: v.salary,
        bonus: v.bonus,
        equityQuantity: v.equityQuantity,
        equityType: v.equityType,
        strikePrice: v.equityType.startsWith("OPTION") ? v.strikePrice : null,
        vestingDescription: vestingDescription(schedule),
        expiresAt: v.expiresAt,
        fullyDiluted,
        message: v.message || null,
      }),
    [v, company, schedule, fullyDiluted],
  );
  const pct = fullyDiluted ? v.equityQuantity / fullyDiluted : 0;

  return (
    <ActionForm action={saveOffer} hidden={{ companyId, id: v.id, packages: JSON.stringify(v.packages), level: v.level }} redirectTo={(r) => `/app/${companyId}/offers/${r.data?.id ?? ""}`}>
      {({ fieldErrors, pending }) => (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Candidate & role</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Candidate name" error={fieldErrors.candidateName} required className="col-span-2 sm:col-span-1">
                  <Input name="candidateName" value={v.candidateName} onChange={(e) => set("candidateName", e.target.value)} required placeholder="Ada Lovelace" />
                </Field>
                <Field label="Candidate email" error={fieldErrors.candidateEmail} required className="col-span-2 sm:col-span-1">
                  <Input name="candidateEmail" type="email" value={v.candidateEmail} onChange={(e) => set("candidateEmail", e.target.value)} required placeholder="ada@example.com" />
                </Field>
                <Field label="Job title" error={fieldErrors.title} required className="col-span-2 sm:col-span-1">
                  <Input name="title" value={v.title} onChange={(e) => set("title", e.target.value)} required placeholder="Staff Software Engineer" />
                </Field>
                <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-1">
                  <Field label="Department">
                    <Input name="department" value={v.department} onChange={(e) => set("department", e.target.value)} list="offer-departments" />
                    <datalist id="offer-departments">
                      {departments.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Level">
                    <Select
                      value={v.level}
                      onChange={(e) => {
                        const l = LEVELS.find((x) => x.level === e.target.value);
                        setV((x) => ({ ...x, level: e.target.value, equityQuantity: l?.equity ?? x.equityQuantity, salary: l?.salary ?? x.salary }));
                      }}
                    >
                      {LEVELS.map((l) => (
                        <option key={l.level} value={l.level}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Base salary">
                  <Input name="salary" type="number" min={0} step={1000} value={v.salary} onChange={(e) => set("salary", Number(e.target.value))} prefix="$" />
                </Field>
                <Field label="Target bonus">
                  <Input name="bonus" type="number" min={0} step={1000} value={v.bonus ?? ""} onChange={(e) => set("bonus", e.target.value === "" ? null : Number(e.target.value))} prefix="$" placeholder="Optional" />
                </Field>
                <Field label="Start date">
                  <Input name="startDate" type="date" value={v.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
                </Field>
                <Field label="Offer expires">
                  <Input name="expiresAt" type="date" value={v.expiresAt ?? ""} onChange={(e) => set("expiresAt", e.target.value || null)} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Equity</CardTitle>
                  <CardDescription>The grant is drafted at acceptance and still needs board approval.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Award type" className="col-span-2 sm:col-span-1">
                  <Select name="equityType" value={v.equityType} onChange={(e) => set("equityType", e.target.value)}>
                    <option value="OPTION_ISO">Incentive stock options (ISO)</option>
                    <option value="OPTION_NSO">Non-qualified options (NSO)</option>
                    <option value="RSU">Restricted stock units (RSU)</option>
                    <option value="RSA">Restricted stock award (RSA)</option>
                  </Select>
                </Field>
                <Field label="Shares" error={fieldErrors.equityQuantity} hint={`${percent(pct, 3)} fully diluted`}>
                  <Input name="equityQuantity" type="number" min={0} step={1000} value={v.equityQuantity} onChange={(e) => set("equityQuantity", Number(e.target.value))} required />
                </Field>
                {v.equityType.startsWith("OPTION") ? (
                  <Field label="Exercise price" hint={fmv ? `Current 409A FMV ${price(fmv)}` : "No 409A on file"}>
                    <Input name="strikePrice" type="number" min={0} step={0.01} value={v.strikePrice ?? ""} onChange={(e) => set("strikePrice", e.target.value === "" ? null : Number(e.target.value))} prefix="$" />
                  </Field>
                ) : null}
                <Field label="Vesting schedule" className={v.equityType.startsWith("OPTION") ? "col-span-2 sm:col-span-1" : undefined}>
                  <Select name="vestingScheduleId" value={v.vestingScheduleId} onChange={(e) => set("vestingScheduleId", e.target.value)}>
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="col-span-2 rounded-md bg-muted p-3 text-[13px] text-muted-foreground">{vestingDescription(schedule)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-col sm:flex-row">
                <div className="min-w-0">
                  <CardTitle>Alternative packages</CardTitle>
                  <CardDescription>Let the candidate choose between cash and equity mixes. Leave empty for a single package.</CardDescription>
                </div>
                <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => set("packages", [...v.packages, { label: v.packages.length === 0 ? "Balanced" : "Option " + (v.packages.length + 1), salary: v.salary, equityQuantity: v.equityQuantity }])}>
                  <Plus /> Add package
                </Button>
              </CardHeader>
              {v.packages.length ? (
                <CardContent className="space-y-3">
                  {v.packages.map((p, i) => {
                    const patch = (next: Partial<OfferFormValues["packages"][number]>) => set("packages", v.packages.map((x, j) => (j === i ? { ...x, ...next } : x)));
                    return (
                      <div key={i} className="rounded-md border border-border p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Package {i + 1}</span>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("packages", v.packages.filter((_, j) => j !== i))} aria-label={`Remove package ${i + 1}`}>
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <Field label="Label" className="col-span-2 sm:col-span-1">
                            <Input value={p.label} onChange={(e) => patch({ label: e.target.value })} />
                          </Field>
                          <Field label="Salary">
                            <Input type="number" min={0} step={1000} value={p.salary} onChange={(e) => patch({ salary: Number(e.target.value) })} prefix="$" />
                          </Field>
                          <Field label="Equity (shares)">
                            <Input type="number" min={0} step={1000} value={p.equityQuantity} onChange={(e) => patch({ equityQuantity: Number(e.target.value) })} />
                          </Field>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground tabular">
                          {percent(fullyDiluted ? p.equityQuantity / fullyDiluted : 0, 3)} fully diluted{fmv ? ` · ${money(p.equityQuantity * fmv)} at FMV` : ""}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              ) : null}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Personal message</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea name="message" rows={3} value={v.message} onChange={(e) => set("message", e.target.value)} placeholder="Why you're excited to have them join…" />
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <SubmitButton pendingText="Saving…" disabled={pending}>
                {v.id ? "Save changes" : "Save draft"}
              </SubmitButton>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Equity value</CardTitle>
                  <CardDescription>What {shares(v.equityQuantity)} shares could be worth as the company grows</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 grid grid-cols-3 gap-3 text-[13px]">
                  <div>
                    <div className="text-xs text-muted-foreground">Ownership</div>
                    <div className="font-semibold tabular">{percent(pct, 3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Value at FMV</div>
                    <div className="font-semibold tabular">{fmv ? money(v.equityQuantity * fmv) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Exercise cost</div>
                    <div className="font-semibold tabular">{v.equityType.startsWith("OPTION") ? money(v.equityQuantity * (v.strikePrice ?? 0)) : "—"}</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={projection.map((p) => ({ name: `${p.multiple}×`, value: Math.round(p.netValue) }))} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef0f3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(x) => compactMoney(x)} width={48} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e7ec" }} formatter={(x) => [money(Number(x)), "Net value"]} cursor={{ fill: "#f1f2f4" }} />
                    <Bar dataKey="value" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Letter preview</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="max-h-[560px] overflow-y-auto scrollbar-thin">
                <OfferLetter content={letter} className="text-[12.5px]" />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
