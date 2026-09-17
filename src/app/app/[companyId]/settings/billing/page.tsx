import { CheckCircle2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/types";
import { cn, parseJson } from "@/lib/utils";
import { date, money } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { ConfirmButton } from "@/components/forms";
import { changePlan } from "../actions";

export const metadata = { title: "Billing & plan" };

const FEATURES: Record<PlanId, string[]> = {
  STARTUP: ["Cap table management", "Share certificates", "Templated SAFE, option & RSA agreements", "Fundraise modeler", "Interactive offer letters", "Communications hub", "Concierge onboarding"],
  GROWTH: ["Everything in Startup", "409A valuations", "Custom SAFE, option & RSA agreements", "Option exercises", "Rule 701 & Form 3921", "Board approvals", "HRIS integrations"],
  ENTERPRISE: ["Everything in Growth", "ASC 718 stock-based compensation reporting", "Custom reporting", "Managed equity administration", "Secondary liquidity programs", "Dedicated account manager"],
};

const FEATURE_ROWS: { label: string; tiers: [boolean | string, boolean | string, boolean | string] }[] = [
  { label: "Stakeholders included", tiers: ["25", "40", "Unlimited"] },
  { label: "Cap table, certificates & ledger", tiers: [true, true, true] },
  { label: "Fundraise & exit modeling", tiers: [true, true, true] },
  { label: "Templated agreements & e-sign", tiers: [true, true, true] },
  { label: "Employee & investor portals", tiers: [true, true, true] },
  { label: "409A valuations", tiers: [false, "1 / year", "Unlimited"] },
  { label: "Option exercises & Form 3921", tiers: [false, true, true] },
  { label: "Rule 701 monitoring", tiers: [false, true, true] },
  { label: "Board consents", tiers: [false, true, true] },
  { label: "HRIS & Slack integrations", tiers: [false, true, true] },
  { label: "ASC 718 expense reporting", tiers: [false, false, true] },
  { label: "Tender offers & liquidity", tiers: [false, false, true] },
  { label: "Managed services", tiers: [false, false, true] },
];

export default async function BillingPage(props: PageProps<"/app/[companyId]/settings/billing">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const planId = (ctx.company.plan in PLANS ? ctx.company.plan : "GROWTH") as PlanId;
  const plan = PLANS[planId];
  const stakeholderCount = await db.stakeholder.count({ where: { companyId: C } });
  const settings = parseJson<{ invoices?: { id: string; date: string; description: string; amount: number; status: string }[]; renewsAt?: string }>(ctx.company.settings, {});
  const renewsAt = settings.renewsAt ? new Date(settings.renewsAt) : new Date(new Date().getFullYear() + 1, 0, 1);
  const included = plan.stakeholders;
  const overage = included ? Math.max(0, stakeholderCount - included) : 0;
  const invoices = settings.invoices ?? [{ id: "inv_seed", date: new Date(new Date().getFullYear(), 0, 1).toISOString(), description: `${plan.name} plan — annual`, amount: plan.price ?? 0, status: "PAID" }];

  return (
    <>
      <PageHeader title="Billing & plan" description="Your subscription, usage and invoices. Plans are billed annually." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <Stat className="col-span-2 md:col-span-1" label="Current plan" value={plan.name} hint={plan.price ? `${money(plan.price)}/year` : "Custom pricing"} />
        <Stat label="Stakeholders" value={`${stakeholderCount}${included ? ` / ${included}` : ""}`} hint={included ? (overage ? `${overage} over the included allowance` : "Within plan allowance") : "Unlimited on this plan"} tone={overage ? "warning" : "default"} />
        <Stat label="Renews" value={date(renewsAt)} hint="Auto-renews annually" />
      </div>
      {included ? (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-[13px]">
              <span>Stakeholder usage</span>
              <span className="text-muted-foreground tabular">
                {stakeholderCount} of {included}
              </span>
            </div>
            <Progress value={(stakeholderCount / included) * 100} className="mt-2" tone={overage ? "warning" : "accent"} />
            <p className="mt-2 text-xs text-muted-foreground">Additional stakeholders are billed at $20/stakeholder/year. Angel investors with $50K or less invested count as half a stakeholder.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = id === planId;
          return (
            <Card key={id} className={cn("flex flex-col", current && "border-primary")}>
              <CardHeader>
                <div>
                  <CardTitle className="flex min-h-[22px] items-center gap-2">
                    {p.name} {current ? <Badge variant="dark">Current</Badge> : null}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-lg font-semibold text-foreground tabular">{p.price ? money(p.price) : "Custom"}</span>
                    {p.price ? <span className="text-xs"> / year</span> : null}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="space-y-1.5 text-[13px]">
                  {FEATURES[id].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4">
                  {current ? (
                    <span className="text-xs text-muted-foreground">Your current plan</span>
                  ) : ctx.role === "ADMIN" ? (
                    <ConfirmButton action={changePlan} hidden={{ companyId: C, plan: id }} title={`Switch to ${p.name}?`} description={p.price ? `You'll be billed ${money(p.price)} per year, prorated for the current term.` : "Our team will contact you to finalize enterprise pricing."} variant={id === "ENTERPRISE" ? "secondary" : "default"} size="sm" confirmLabel={p.price ? "Switch plan" : "Contact sales"} successMessage="Plan updated" className="w-full">
                      {p.price ? (PLANS[planId].price && p.price > (PLANS[planId].price ?? 0) ? "Upgrade" : "Switch") : "Contact sales"}
                    </ConfirmButton>
                  ) : (
                    <span className="text-xs text-muted-foreground">Only admins can change plans.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Compare plans</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="text-center">Startup</th>
                <th className="text-center">Growth</th>
                <th className="text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="max-sm:whitespace-normal">{r.label}</td>
                  {r.tiers.map((t, i) => (
                    <td key={i} className="text-center">
                      {t === true ? <CheckCircle2 className="mx-auto size-4 text-success" /> : t === false ? <span className="text-subtle">—</span> : <span className="text-xs">{t}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Receipts are emailed to the billing contact ({ctx.user.email}).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{date(inv.date)}</td>
                  <td className="max-sm:min-w-36 max-sm:whitespace-normal">{inv.description}</td>
                  <td className="num">{money(inv.amount)}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
