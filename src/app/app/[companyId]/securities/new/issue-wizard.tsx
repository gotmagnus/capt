"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, addYears, format } from "date-fns";
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, Check, FileSignature, FileText, Landmark, Layers, Percent, Search, Ticket, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch, Avatar, Checkbox } from "@/components/ui/misc";
import { Alert, DescriptionList } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/forms";
import { isoLimitCheck } from "@/lib/equity/compliance";
import { buildVestingEvents } from "@/lib/equity/vesting";
import { date as fmtDate, money, percent, price, shares } from "@/lib/format";
import { RELATIONSHIP_LABELS, SECURITY_TYPE_LABELS, STAKEHOLDER_RELATIONSHIPS, type SecurityType } from "@/lib/types";
import { SAFE_TYPES } from "@/lib/securities-utils";
import { cn } from "@/lib/utils";
import { issueSecurity } from "./actions";

interface Stakeholder {
  id: string;
  name: string;
  email: string | null;
  relationship: string;
}
interface ShareClassOpt {
  id: string;
  name: string;
  prefix: string;
  type: string;
  authorized: number;
  issued: number;
  available: number;
  originalIssuePrice: number | null;
  parValue: number;
}
interface PlanOpt {
  id: string;
  name: string;
  shareClassId: string;
  authorized: number;
  available: number;
  status: string;
}
interface ScheduleOpt {
  id: string;
  name: string;
  type: string;
  totalMonths: number;
  cliffMonths: number;
  cliffPercent: number | null;
  frequency: string;
  accelerationSingleTrigger: number;
  accelerationDoubleTrigger: number;
  description: string | null;
}
interface IsoGrant {
  securityId: string;
  stakeholderId: string;
  grantDate: string;
  vestingStart: string;
  quantity: number;
  fmvAtGrant: number;
  scheduleId: string | null;
}

export interface IssueWizardProps {
  companyId: string;
  currentUser: { name: string; email: string };
  fmv: number | null;
  fmvDate: string | null;
  fullyDiluted: number;
  stakeholders: Stakeholder[];
  shareClasses: ShareClassOpt[];
  equityPlans: PlanOpt[];
  vestingSchedules: ScheduleOpt[];
  isoGrants: IsoGrant[];
  prefill: Partial<Record<"stakeholderId" | "type" | "quantity" | "vestingScheduleId" | "exercisePrice" | "equityPlanId" | "shareClassId", string>>;
}

type Terms = Record<string, string | boolean>;

const TYPE_CARDS: { type: SecurityType; title: string; description: string; icon: typeof Layers; group: string }[] = [
  { type: "COMMON_SHARES", title: "Common shares", description: "Founder stock, exercised options, transfers.", icon: Layers, group: "Shares" },
  { type: "PREFERRED_SHARES", title: "Preferred shares", description: "Investor stock from a priced round.", icon: Landmark, group: "Shares" },
  { type: "RSA", title: "Restricted stock (RSA)", description: "Shares subject to vesting and repurchase; 83(b) tracked.", icon: Layers, group: "Shares" },
  { type: "OPTION_ISO", title: "ISO", description: "Incentive stock option for employees.", icon: Ticket, group: "Equity awards" },
  { type: "OPTION_NSO", title: "NSO", description: "Non-qualified option for advisors, contractors or excess ISOs.", icon: Ticket, group: "Equity awards" },
  { type: "RSU", title: "RSU", description: "Restricted stock units settled in shares on vesting.", icon: Ticket, group: "Equity awards" },
  { type: "WARRANT", title: "Warrant", description: "Right to purchase shares, often for lenders or partners.", icon: Percent, group: "Other" },
  { type: "SAFE", title: "SAFE", description: "Simple agreement for future equity (YC pre/post-money).", icon: Banknote, group: "Other" },
  { type: "CONVERTIBLE_NOTE", title: "Convertible note", description: "Debt that converts at the next priced round.", icon: Banknote, group: "Other" },
];

const STEPS = ["Type", "Holder", "Terms", "Documents", "Review"];

const today = () => format(new Date(), "yyyy-MM-dd");

export function IssueWizard(p: IssueWizardProps) {
  const commonClass = p.shareClasses.find((c) => c.type === "COMMON");
  const preferredClasses = p.shareClasses.filter((c) => c.type === "PREFERRED");
  const activePlans = p.equityPlans.filter((x) => x.status !== "TERMINATED");
  const defaultSchedule = p.vestingSchedules.find((v) => v.cliffMonths === 12 && v.totalMonths === 48) ?? p.vestingSchedules.find((v) => v.type === "TIME") ?? p.vestingSchedules[0];
  const initialType = TYPE_CARDS.some((c) => c.type === p.prefill.type) ? (p.prefill.type as SecurityType) : null;

  // Sensible default terms for each instrument; applied whenever a type is chosen.
  const defaultsFor = (type: SecurityType): Terms => {
    const base: Terms = {
      issueDate: today(),
      boardApprovalDate: today(),
      quantity: p.prefill.quantity ?? "",
      notes: "",
    };
    if (type === "COMMON_SHARES" || type === "RSA") Object.assign(base, { shareClassId: p.prefill.shareClassId ?? commonClass?.id ?? "", pricePerShare: type === "RSA" ? String(commonClass?.parValue ?? 0.0001) : p.fmv != null ? String(p.fmv) : "" });
    if (type === "PREFERRED_SHARES") Object.assign(base, { shareClassId: p.prefill.shareClassId ?? preferredClasses[0]?.id ?? "", pricePerShare: preferredClasses[0]?.originalIssuePrice != null ? String(preferredClasses[0].originalIssuePrice) : "" });
    if (type === "RSA") Object.assign(base, { equityPlanId: p.prefill.equityPlanId ?? "", vestingScheduleId: p.prefill.vestingScheduleId ?? defaultSchedule?.id ?? "", vestingStartDate: today(), election83bDeadline: format(addDays(new Date(), 30), "yyyy-MM-dd") });
    if (type === "OPTION_ISO" || type === "OPTION_NSO" || type === "RSU")
      Object.assign(base, { equityPlanId: p.prefill.equityPlanId ?? activePlans[0]?.id ?? "", vestingScheduleId: p.prefill.vestingScheduleId ?? defaultSchedule?.id ?? "", vestingStartDate: today() });
    if (type === "OPTION_ISO" || type === "OPTION_NSO") Object.assign(base, { exercisePrice: p.prefill.exercisePrice ?? (p.fmv != null ? String(p.fmv) : ""), expirationDate: format(addYears(new Date(), 10), "yyyy-MM-dd"), ptepMonths: "3", earlyExercise: false });
    if (type === "WARRANT") Object.assign(base, { shareClassId: commonClass?.id ?? "", exercisePrice: p.fmv != null ? String(p.fmv) : "", expirationDate: format(addYears(new Date(), 10), "yyyy-MM-dd") });
    if (type === "SAFE") Object.assign(base, { totalAmount: "", safeType: "POST_MONEY", valuationCap: "", discountPercent: "", mfn: false, proRataRight: false });
    if (type === "CONVERTIBLE_NOTE") Object.assign(base, { totalAmount: "", interestRate: "6", interestType: "SIMPLE", maturityDate: format(addYears(new Date(), 2), "yyyy-MM-dd"), valuationCap: "", discountPercent: "20", conversionTrigger: "1000000", mfn: false, proRataRight: false });
    return base;
  };

  const [step, setStep] = useState(initialType ? (p.prefill.stakeholderId ? 2 : 1) : 0);
  const [type, setTypeState] = useState<SecurityType | null>(initialType);
  const [holderMode, setHolderMode] = useState<"existing" | "new">("existing");
  const [stakeholderId, setStakeholderId] = useState(p.prefill.stakeholderId ?? "");
  const [newHolder, setNewHolder] = useState({ name: "", email: "", relationship: "EMPLOYEE" });
  const [terms, setTerms] = useState<Terms>(() => (initialType ? defaultsFor(initialType) : {}));
  const [generateDocument, setGenerateDocument] = useState(true);
  const [sendForSignature, setSendForSignature] = useState(initialType !== "COMMON_SHARES" && initialType !== "PREFERRED_SHARES");
  const [splitIso, setSplitIso] = useState(true);
  const [holderQuery, setHolderQuery] = useState("");

  const set = (k: string, v: string | boolean) => setTerms((t) => ({ ...t, [k]: v }));
  const str = (k: string) => (typeof terms[k] === "string" ? (terms[k] as string) : "");
  const num = (k: string) => {
    const n = Number(str(k));
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (k: string) => terms[k] === true;

  // Choosing a type resets the terms to sensible defaults for that instrument.
  function selectType(next: SecurityType) {
    setTypeState(next);
    setTerms(defaultsFor(next));
    setSendForSignature(next !== "COMMON_SHARES" && next !== "PREFERRED_SHARES");
  }

  const holder =p.stakeholders.find((s) => s.id === stakeholderId) ?? null;
  const holderName = holderMode === "existing" ? holder?.name ?? "" : newHolder.name;
  const filteredHolders = useMemo(() => {
    const q = holderQuery.trim().toLowerCase();
    return (q ? p.stakeholders.filter((s) => s.name.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)) : p.stakeholders).slice(0, 60);
  }, [holderQuery, p.stakeholders]);

  const selectedClass = p.shareClasses.find((c) => c.id === str("shareClassId"));
  const selectedPlan = p.equityPlans.find((x) => x.id === str("equityPlanId"));
  const selectedSchedule = p.vestingSchedules.find((v) => v.id === str("vestingScheduleId"));
  const isOption = type === "OPTION_ISO" || type === "OPTION_NSO";
  const isShares = type === "COMMON_SHARES" || type === "PREFERRED_SHARES" || type === "RSA";
  const isConvertible = type === "SAFE" || type === "CONVERTIBLE_NOTE";
  const usesPlan = isOption || type === "RSU" || type === "RSA";
  const hasVesting = usesPlan || type === "WARRANT";
  const qty = num("quantity");

  // ISO $100K check
  const isoExcess = useMemo(() => {
    if (type !== "OPTION_ISO" || !qty || holderMode !== "existing" || !stakeholderId) return 0;
    const fmv = num("exercisePrice");
    const schedOf = (id: string | null) => {
      const s = id ? p.vestingSchedules.find((v) => v.id === id) : null;
      return s ? { type: s.type, totalMonths: s.totalMonths, cliffMonths: s.cliffMonths, cliffPercent: s.cliffPercent, frequency: s.frequency } : null;
    };
    const existing = p.isoGrants
      .filter((g) => g.stakeholderId === stakeholderId)
      .map((g) => ({ securityId: g.securityId, stakeholderId, stakeholderName: "", grantDate: new Date(g.grantDate), vestingStart: new Date(g.vestingStart), quantity: g.quantity, fmvAtGrant: g.fmvAtGrant, schedule: schedOf(g.scheduleId) }));
    const res = isoLimitCheck([...existing, { securityId: "new", stakeholderId, stakeholderName: "", grantDate: new Date(str("issueDate") || today()), vestingStart: new Date(str("vestingStartDate") || today()), quantity: qty, fmvAtGrant: fmv, schedule: schedOf(str("vestingScheduleId") || null) }]);
    return res[0]?.years.flatMap((y) => y.grants).filter((g) => g.securityId === "new").reduce((a, g) => a + g.excessShares, 0) ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, qty, holderMode, stakeholderId, terms.exercisePrice, terms.issueDate, terms.vestingStartDate, terms.vestingScheduleId, p.isoGrants, p.vestingSchedules]);

  const belowFmv = isOption && p.fmv != null && str("exercisePrice") !== "" && num("exercisePrice") < p.fmv;
  const planShort = usesPlan && selectedPlan && qty > selectedPlan.available;
  const classShort = isShares && selectedClass && qty > selectedClass.available;

  const stepValid = (i: number) => {
    if (i === 0) return !!type;
    if (i === 1) return holderMode === "existing" ? !!stakeholderId : newHolder.name.trim().length > 1;
    if (i === 2) {
      if (!type) return false;
      if (isConvertible) return num("totalAmount") > 0 && !!str("issueDate");
      if (qty <= 0 || !str("issueDate")) return false;
      if (isShares) return !!selectedClass && str("pricePerShare") !== "" && !classShort;
      if (usesPlan) return !!selectedPlan && !planShort && (!isOption || num("exercisePrice") > 0);
      if (type === "WARRANT") return !!selectedClass && str("exercisePrice") !== "";
      return true;
    }
    return true;
  };

  const payload = JSON.stringify({ type, holderMode, stakeholderId: stakeholderId || null, newHolder, terms, generateDocument, sendForSignature, splitIso: type === "OPTION_ISO" && splitIso });

  const vestPreview = useMemo(() => {
    if (!selectedSchedule || !qty || !hasVesting) return null;
    const events = buildVestingEvents(qty, new Date(str("vestingStartDate") || str("issueDate") || today()), selectedSchedule);
    return { events, cliff: events.find((e) => e.label === "Cliff"), last: events[events.length - 1] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchedule, qty, terms.vestingStartDate, terms.issueDate, hasVesting]);

  const docName = !type
    ? ""
    : isShares
      ? "Stock certificate" + (type === "RSA" ? " + 83(b) election form" : "")
      : isOption
        ? "Option grant notice & agreement"
        : type === "RSU"
          ? "RSU award notice"
          : type === "WARRANT"
            ? "Warrant certificate"
            : type === "SAFE"
              ? `${str("safeType") === "PRE_MONEY" ? "Pre-money" : "Post-money"} SAFE`
              : "Convertible promissory note";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* A compact horizontal stepper below lg (inactive steps collapse to their number on phones); the vertical rail from lg. */}
      <ol className="flex gap-1 self-start rounded-lg border border-border bg-card p-1.5 lg:block lg:space-y-1 lg:p-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          const reachable = i <= step || STEPS.slice(0, i).every((_, j) => stepValid(j));
          return (
            <li key={label} className={cn("min-w-0 sm:flex-1 lg:flex-none", active && "flex-1")}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && setStep(i)}
                aria-current={active ? "step" : undefined}
                className={cn("flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] lg:justify-start lg:gap-2.5", active ? "bg-muted font-medium" : "hover:bg-muted/60", !reachable && "opacity-50")}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold", done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground border border-border")}>{done ? <Check className="size-3" /> : i + 1}</span>
                <span className={cn("truncate", !active && "max-sm:sr-only")}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 rounded-lg border border-border bg-card">
        <div className="px-4 py-5 sm:px-6">
          {step === 0 ? (
            <div className="space-y-5">
              {["Shares", "Equity awards", "Other"].map((group) => (
                <div key={group}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TYPE_CARDS.filter((c) => c.group === group).map((c) => (
                      <button
                        key={c.type}
                        type="button"
                        onClick={() => selectType(c.type)}
                        aria-pressed={type === c.type}
                        className={cn("flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors hover:border-border-strong hover:bg-muted/40 sm:flex-col sm:gap-2", type === c.type ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-border")}
                      >
                        <c.icon className={cn("mt-0.5 size-4 shrink-0 sm:mt-0", type === c.type ? "text-accent" : "text-muted-foreground")} />
                        <span className="min-w-0 space-y-1 sm:space-y-2">
                          <span className="block text-[13px] font-semibold">{c.title}</span>
                          <span className="block text-xs leading-snug text-muted-foreground">{c.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => setHolderMode("existing")} aria-pressed={holderMode === "existing"} className={cn("flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-[13px]", holderMode === "existing" ? "border-accent bg-accent-soft/60 font-medium" : "border-border")}>
                  <Users className="size-4 shrink-0" /> Existing<span className="max-sm:sr-only"> stakeholder</span>
                </button>
                <button type="button" onClick={() => setHolderMode("new")} aria-pressed={holderMode === "new"} className={cn("flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-[13px]", holderMode === "new" ? "border-accent bg-accent-soft/60 font-medium" : "border-border")}>
                  <UserPlus className="size-4 shrink-0" /> New<span className="max-sm:sr-only"> stakeholder</span>
                </button>
              </div>
              {holderMode === "existing" ? (
                <div>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={holderQuery} onChange={(e) => setHolderQuery(e.target.value)} placeholder="Search by name or email…" className="pl-8" autoFocus />
                  </div>
                  <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
                    {filteredHolders.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setStakeholderId(s.id)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60", stakeholderId === s.id && "bg-accent-soft/60")}>
                          <Avatar name={s.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium truncate">{s.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{s.email ?? "No email"}</div>
                          </div>
                          <Badge variant="neutral">{RELATIONSHIP_LABELS[s.relationship as keyof typeof RELATIONSHIP_LABELS] ?? s.relationship}</Badge>
                          {stakeholderId === s.id ? <Check className="size-4 text-accent" /> : null}
                        </button>
                      </li>
                    ))}
                    {filteredHolders.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No stakeholders match.</li> : null}
                  </ul>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full legal name" required>
                    <Input value={newHolder.name} onChange={(e) => setNewHolder({ ...newHolder, name: e.target.value })} placeholder="Jane Doe or Acme Ventures LP" autoFocus />
                  </Field>
                  <Field label="Email" hint="Used to invite them to the equity portal.">
                    <Input type="email" value={newHolder.email} onChange={(e) => setNewHolder({ ...newHolder, email: e.target.value })} placeholder="jane@example.com" />
                  </Field>
                  <Field label="Relationship">
                    <Select value={newHolder.relationship} onChange={(e) => setNewHolder({ ...newHolder, relationship: e.target.value })}>
                      {STAKEHOLDER_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {RELATIONSHIP_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          ) : null}

          {step === 2 && type ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <Badge variant="accent">{SECURITY_TYPE_LABELS[type]}</Badge>
                <span className="text-muted-foreground">for</span>
                <span className="font-medium">{holderName || "—"}</span>
              </div>

              {isShares ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Share class" required hint={selectedClass ? `${shares(selectedClass.available)} available of ${shares(selectedClass.authorized)} authorized` : undefined} error={classShort ? "Exceeds the shares available in this class." : null}>
                    <Select value={str("shareClassId")} onChange={(e) => set("shareClassId", e.target.value)}>
                      <option value="">Select…</option>
                      {p.shareClasses
                        .filter((c) => (type === "PREFERRED_SHARES" ? c.type === "PREFERRED" : c.type === "COMMON"))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.prefix})
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Number of shares" required>
                    <Input type="number" min={1} step={1} value={str("quantity")} onChange={(e) => set("quantity", e.target.value)} />
                  </Field>
                  <Field label="Price per share" required hint={qty && str("pricePerShare") ? `Total consideration ${money(qty * num("pricePerShare"), { cents: true })}` : undefined}>
                    <Input type="number" min={0} step="any" prefix="$" value={str("pricePerShare")} onChange={(e) => set("pricePerShare", e.target.value)} />
                  </Field>
                  <Field label="Fair market value at issue" hint={p.fmv != null ? `Current 409A: ${price(p.fmv)}` : "No 409A on file"}>
                    <Input type="number" min={0} step="any" prefix="$" value={str("fmvAtGrant")} onChange={(e) => set("fmvAtGrant", e.target.value)} placeholder={p.fmv != null ? String(p.fmv) : ""} />
                  </Field>
                  <Field label="Issue date" required>
                    <Input type="date" value={str("issueDate")} onChange={(e) => set("issueDate", e.target.value)} />
                  </Field>
                  <Field label="Board approval date">
                    <Input type="date" value={str("boardApprovalDate")} onChange={(e) => set("boardApprovalDate", e.target.value)} />
                  </Field>
                  {type === "RSA" ? (
                    <>
                      <Field label="Equity plan" hint="Optional — RSAs may be issued under a plan or directly.">
                        <Select value={str("equityPlanId")} onChange={(e) => set("equityPlanId", e.target.value)}>
                          <option value="">Not under a plan</option>
                          {activePlans.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} — {shares(x.available)} available
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="83(b) election deadline" hint="30 days from the transfer date.">
                        <Input type="date" value={str("election83bDeadline")} onChange={(e) => set("election83bDeadline", e.target.value)} />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Legend" className="sm:col-span-2" hint="Leave blank to use the standard Securities Act legend.">
                    <Textarea rows={2} value={str("legend")} onChange={(e) => set("legend", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {usesPlan && type !== "RSA" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Equity plan" required hint={selectedPlan ? `${shares(selectedPlan.available)} available of ${shares(selectedPlan.authorized)}` : undefined} error={planShort ? "Not enough shares left in the pool. Increase the reserve first." : null}>
                    <Select value={str("equityPlanId")} onChange={(e) => set("equityPlanId", e.target.value)}>
                      <option value="">Select…</option>
                      {activePlans.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={type === "RSU" ? "Number of units" : "Number of shares"} required hint={qty && p.fullyDiluted ? `≈ ${percent(qty / (p.fullyDiluted + qty), 3)} fully diluted` : undefined}>
                    <Input type="number" min={1} step={1} value={str("quantity")} onChange={(e) => set("quantity", e.target.value)} />
                  </Field>
                  {isOption ? (
                    <Field label="Exercise price" required hint={p.fmv != null ? `Current 409A FMV ${price(p.fmv)} (${fmtDate(p.fmvDate)})` : "No accepted 409A valuation on file."} error={belowFmv ? "Below the 409A fair market value — discounted options trigger Section 409A penalties." : null}>
                      <Input type="number" min={0} step="any" prefix="$" value={str("exercisePrice")} onChange={(e) => set("exercisePrice", e.target.value)} />
                    </Field>
                  ) : (
                    <Field label="FMV at grant" hint="Used for ASC 718 and tax reporting.">
                      <Input type="number" min={0} step="any" prefix="$" value={str("fmvAtGrant")} onChange={(e) => set("fmvAtGrant", e.target.value)} placeholder={p.fmv != null ? String(p.fmv) : ""} />
                    </Field>
                  )}
                  <Field label="Grant date" required>
                    <Input type="date" value={str("issueDate")} onChange={(e) => set("issueDate", e.target.value)} />
                  </Field>
                  <Field label="Board approval date">
                    <Input type="date" value={str("boardApprovalDate")} onChange={(e) => set("boardApprovalDate", e.target.value)} />
                  </Field>
                  {isOption ? (
                    <Field label="Expiration date" hint="Ten years from grant is the maximum for ISOs.">
                      <Input type="date" value={str("expirationDate")} onChange={(e) => set("expirationDate", e.target.value)} />
                    </Field>
                  ) : null}
                </div>
              ) : null}

              {hasVesting ? (
                <div className="rounded-md border border-border p-3.5 sm:p-4">
                  <div className="mb-3 text-[13px] font-semibold">Vesting</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Vesting schedule" hint={selectedSchedule?.description ?? undefined}>
                      <Select value={str("vestingScheduleId")} onChange={(e) => set("vestingScheduleId", e.target.value)}>
                        <option value="">No vesting (fully vested)</option>
                        {p.vestingSchedules.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Vesting commencement date">
                      <Input type="date" value={str("vestingStartDate")} onChange={(e) => set("vestingStartDate", e.target.value)} />
                    </Field>
                    {isOption ? (
                      <>
                        <Field label="Post-termination exercise period (months)">
                          <Input type="number" min={0} step={1} value={str("ptepMonths")} onChange={(e) => set("ptepMonths", e.target.value)} />
                        </Field>
                        <div className="flex items-center gap-3 sm:pt-6">
                          <Switch checked={bool("earlyExercise")} onCheckedChange={(v) => set("earlyExercise", v)} id="early" />
                          <label htmlFor="early" className="text-[13px]">
                            Allow early exercise of unvested options
                          </label>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {vestPreview ? (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {vestPreview.events.length} vesting events
                      </span>
                      {vestPreview.cliff ? (
                        <span>
                          Cliff {fmtDate(vestPreview.cliff.date)}: <span className="text-foreground tabular">{shares(vestPreview.cliff.amount)}</span>
                        </span>
                      ) : null}
                      {vestPreview.last ? <span>Fully vested {fmtDate(vestPreview.last.date)}</span> : null}
                      {selectedSchedule && (selectedSchedule.accelerationSingleTrigger || selectedSchedule.accelerationDoubleTrigger) ? (
                        <span>
                          Acceleration: {selectedSchedule.accelerationSingleTrigger ? `${selectedSchedule.accelerationSingleTrigger}% single-trigger` : ""}
                          {selectedSchedule.accelerationSingleTrigger && selectedSchedule.accelerationDoubleTrigger ? ", " : ""}
                          {selectedSchedule.accelerationDoubleTrigger ? `${selectedSchedule.accelerationDoubleTrigger}% double-trigger` : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {type === "OPTION_ISO" && isoExcess > 0 ? (
                <Alert tone="warning" icon={AlertTriangle} title={`${shares(isoExcess)} shares exceed the ISO $100,000 limit`}>
                  <p>Options first exercisable in a calendar year above $100,000 of grant-date value cannot qualify as ISOs (IRC §422(d)).</p>
                  <label className="mt-2 flex items-start gap-2">
                    <Checkbox checked={splitIso} onCheckedChange={(v) => setSplitIso(v === true)} className="mt-0.5" /> Automatically issue the excess as a separate NSO grant
                  </label>
                </Alert>
              ) : null}

              {type === "WARRANT" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Underlying share class" required>
                    <Select value={str("shareClassId")} onChange={(e) => set("shareClassId", e.target.value)}>
                      {p.shareClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Number of warrant shares" required>
                    <Input type="number" min={1} step={1} value={str("quantity")} onChange={(e) => set("quantity", e.target.value)} />
                  </Field>
                  <Field label="Exercise price" required>
                    <Input type="number" min={0} step="any" prefix="$" value={str("exercisePrice")} onChange={(e) => set("exercisePrice", e.target.value)} />
                  </Field>
                  <Field label="Issue date" required>
                    <Input type="date" value={str("issueDate")} onChange={(e) => set("issueDate", e.target.value)} />
                  </Field>
                  <Field label="Expiration date">
                    <Input type="date" value={str("expirationDate")} onChange={(e) => set("expirationDate", e.target.value)} />
                  </Field>
                  <Field label="Board approval date">
                    <Input type="date" value={str("boardApprovalDate")} onChange={(e) => set("boardApprovalDate", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {type === "SAFE" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Purchase amount" required>
                    <Input type="number" min={1} step="any" prefix="$" value={str("totalAmount")} onChange={(e) => set("totalAmount", e.target.value)} />
                  </Field>
                  <Field label="SAFE form">
                    <Select value={str("safeType")} onChange={(e) => set("safeType", e.target.value)}>
                      {SAFE_TYPES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Valuation cap" hint={num("totalAmount") && num("valuationCap") && str("safeType") === "POST_MONEY" ? `Post-money ownership ≈ ${percent(num("totalAmount") / num("valuationCap"))}` : "Leave blank for an uncapped SAFE."}>
                    <Input type="number" min={0} step="any" prefix="$" value={str("valuationCap")} onChange={(e) => set("valuationCap", e.target.value)} />
                  </Field>
                  <Field label="Discount" hint="Discount to the next round price, e.g. 20.">
                    <Input type="number" min={0} max={99} step="any" suffix="%" value={str("discountPercent")} onChange={(e) => set("discountPercent", e.target.value)} />
                  </Field>
                  <Field label="Issue date" required>
                    <Input type="date" value={str("issueDate")} onChange={(e) => set("issueDate", e.target.value)} />
                  </Field>
                  <Field label="Board approval date">
                    <Input type="date" value={str("boardApprovalDate")} onChange={(e) => set("boardApprovalDate", e.target.value)} />
                  </Field>
                  <div className="flex items-center gap-3">
                    <Switch checked={bool("mfn")} onCheckedChange={(v) => set("mfn", v)} id="mfn" />
                    <label htmlFor="mfn" className="text-[13px]">
                      Most favored nation clause
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={bool("proRataRight")} onCheckedChange={(v) => set("proRataRight", v)} id="prorata" />
                    <label htmlFor="prorata" className="text-[13px]">
                      Pro rata side letter
                    </label>
                  </div>
                </div>
              ) : null}

              {type === "CONVERTIBLE_NOTE" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Principal amount" required>
                    <Input type="number" min={1} step="any" prefix="$" value={str("totalAmount")} onChange={(e) => set("totalAmount", e.target.value)} />
                  </Field>
                  <Field label="Interest rate">
                    <Input type="number" min={0} step="any" suffix="% / yr" value={str("interestRate")} onChange={(e) => set("interestRate", e.target.value)} />
                  </Field>
                  <Field label="Interest type">
                    <Select value={str("interestType")} onChange={(e) => set("interestType", e.target.value)}>
                      <option value="SIMPLE">Simple</option>
                      <option value="COMPOUND">Compound (annual)</option>
                    </Select>
                  </Field>
                  <Field label="Maturity date">
                    <Input type="date" value={str("maturityDate")} onChange={(e) => set("maturityDate", e.target.value)} />
                  </Field>
                  <Field label="Valuation cap">
                    <Input type="number" min={0} step="any" prefix="$" value={str("valuationCap")} onChange={(e) => set("valuationCap", e.target.value)} />
                  </Field>
                  <Field label="Conversion discount">
                    <Input type="number" min={0} max={99} step="any" suffix="%" value={str("discountPercent")} onChange={(e) => set("discountPercent", e.target.value)} />
                  </Field>
                  <Field label="Qualified financing threshold" hint="Minimum new money that triggers automatic conversion.">
                    <Input type="number" min={0} step="any" prefix="$" value={str("conversionTrigger")} onChange={(e) => set("conversionTrigger", e.target.value)} />
                  </Field>
                  <Field label="Issue date" required>
                    <Input type="date" value={str("issueDate")} onChange={(e) => set("issueDate", e.target.value)} />
                  </Field>
                  <Field label="Board approval date">
                    <Input type="date" value={str("boardApprovalDate")} onChange={(e) => set("boardApprovalDate", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              <Field label="Internal notes">
                <Textarea rows={2} value={str("notes")} onChange={(e) => set("notes", e.target.value)} placeholder="Visible to admins only." />
              </Field>
            </div>
          ) : null}

          {step === 3 && type ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
                <div className="flex min-w-0 gap-3">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-[13px] font-medium">Generate agreement</div>
                    <div className="text-xs text-muted-foreground">{docName}. Stored in the data room under Securities and visible to the holder in their portal.</div>
                  </div>
                </div>
                <Switch checked={generateDocument} onCheckedChange={setGenerateDocument} aria-label="Generate agreement" />
              </div>
              <div className={cn("flex items-start justify-between gap-4 rounded-md border border-border p-4", !generateDocument && "opacity-50")}>
                <div className="flex min-w-0 gap-3">
                  <FileSignature className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-[13px] font-medium">Send for e-signature</div>
                    <div className="text-xs text-muted-foreground">The security stays “Pending signature” until both parties sign; the cap table already reflects it.</div>
                  </div>
                </div>
                <Switch checked={generateDocument && sendForSignature} disabled={!generateDocument} onCheckedChange={setSendForSignature} aria-label="Send for e-signature" />
              </div>
              {generateDocument && sendForSignature ? (
                <div className="rounded-md bg-muted p-4 text-[13px]">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signers</div>
                  <ol className="space-y-1.5">
                    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="w-5 text-xs text-muted-foreground">1.</span>
                      <span className="font-medium">{p.currentUser.name}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{p.currentUser.email}</span>
                      <Badge variant="neutral">Company</Badge>
                    </li>
                    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="w-5 text-xs text-muted-foreground">2.</span>
                      <span className="font-medium">{holderName}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{holderMode === "existing" ? holder?.email ?? "no email on file" : newHolder.email || "no email"}</span>
                      <Badge variant="neutral">{isConvertible || type === "PREFERRED_SHARES" ? "Investor" : "Holder"}</Badge>
                    </li>
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 4 && type ? (
            <div className="space-y-5">
              <DescriptionList
                columns={3}
                className="grid-cols-2 sm:grid-cols-3 [&_dd]:whitespace-normal [&_dd]:break-words"
                items={[
                  { label: "Security", value: SECURITY_TYPE_LABELS[type] },
                  { label: "Holder", value: holderName },
                  { label: "Issue date", value: fmtDate(str("issueDate")) },
                  ...(isConvertible
                    ? [
                        { label: type === "SAFE" ? "Purchase amount" : "Principal", value: money(num("totalAmount")) },
                        { label: "Valuation cap", value: str("valuationCap") ? money(num("valuationCap")) : "None" },
                        { label: "Discount", value: str("discountPercent") ? `${num("discountPercent")}%` : "None" },
                        ...(type === "SAFE" ? [{ label: "Form", value: str("safeType") === "PRE_MONEY" ? "Pre-money" : "Post-money" }, { label: "MFN", value: bool("mfn") ? "Yes" : "No" }, { label: "Pro rata", value: bool("proRataRight") ? "Yes" : "No" }] : [{ label: "Interest", value: `${num("interestRate")}% ${str("interestType").toLowerCase()}` }, { label: "Maturity", value: fmtDate(str("maturityDate")) }, { label: "Qualified financing", value: money(num("conversionTrigger")) }]),
                      ]
                    : [
                        { label: type === "RSU" ? "Units" : "Shares", value: shares(qty) },
                        ...(isShares ? [{ label: "Share class", value: selectedClass?.name ?? "—" }, { label: "Price per share", value: price(num("pricePerShare")) }, { label: "Consideration", value: money(qty * num("pricePerShare"), { cents: true }) }] : []),
                        ...(usesPlan && type !== "RSA" ? [{ label: "Plan", value: selectedPlan?.name ?? "—" }] : []),
                        ...(isOption || type === "WARRANT" ? [{ label: "Exercise price", value: price(num("exercisePrice")) }, { label: "Expires", value: fmtDate(str("expirationDate")) }] : []),
                        ...(hasVesting ? [{ label: "Vesting", value: selectedSchedule?.name ?? "Fully vested" }, { label: "Vesting start", value: fmtDate(str("vestingStartDate")) }] : []),
                        ...(isOption ? [{ label: "PTEP", value: `${num("ptepMonths")} months` }, { label: "Early exercise", value: bool("earlyExercise") ? "Allowed" : "No" }] : []),
                        ...(type === "RSA" ? [{ label: "83(b) deadline", value: fmtDate(str("election83bDeadline")) }] : []),
                      ]),
                  { label: "Documents", value: generateDocument ? docName : "None" },
                  { label: "Signature", value: generateDocument && sendForSignature ? "Sent for e-signature" : "Not required" },
                ]}
              />
              {type === "OPTION_ISO" && isoExcess > 0 && splitIso ? <Alert tone="info">{shares(isoExcess)} of these shares will be issued as a separate NSO grant to stay within the $100K ISO limit.</Alert> : null}
              {belowFmv ? <Alert tone="warning">The exercise price is below the current 409A fair market value.</Alert> : null}
              <ActionForm action={issueSecurity} hidden={{ companyId: p.companyId, payload }} redirectTo={(r) => `/app/${p.companyId}/securities/${r.data?.id ?? ""}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <p className="text-xs text-muted-foreground">Creates the security, its issuance transaction and documents, and notifies the holder. Recorded in the audit log.</p>
                  <SubmitButton size="lg" pendingText="Issuing…" className="shrink-0 max-sm:w-full">
                    <Check /> Issue {/^[A-Z]{2,}/.test(SECURITY_TYPE_LABELS[type]) ? SECURITY_TYPE_LABELS[type] : SECURITY_TYPE_LABELS[type].charAt(0).toLowerCase() + SECURITY_TYPE_LABELS[type].slice(1)}
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : null}
        </div>

        {step < 4 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex items-center gap-1 sm:gap-3">
              <Button variant="ghost" asChild>
                <Link href={`/app/${p.companyId}/securities`}>Cancel</Link>
              </Button>
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!stepValid(step)}>
                Continue <ArrowRight />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => setStep(3)}>
              <ArrowLeft /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
