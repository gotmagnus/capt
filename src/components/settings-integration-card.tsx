"use client";

import { Plug, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { ConfirmButton, FormDialog } from "@/components/forms";
import { date, dateTime, humanize } from "@/lib/format";
import { connectIntegration, disconnectIntegration, syncIntegration } from "@/app/app/[companyId]/settings/actions";

const LOGO_COLORS: Record<string, string> = { GUSTO: "bg-orange-100 text-orange-700", RIPPLING: "bg-yellow-100 text-yellow-800", BAMBOOHR: "bg-green-100 text-green-700", WORKDAY: "bg-blue-100 text-blue-700", JUSTWORKS: "bg-sky-100 text-sky-700", DEEL: "bg-slate-200 text-slate-800", QUICKBOOKS: "bg-emerald-100 text-emerald-700", XERO: "bg-cyan-100 text-cyan-700", NETSUITE: "bg-indigo-100 text-indigo-700", SLACK: "bg-purple-100 text-purple-700", DOCUSIGN: "bg-amber-100 text-amber-700", NASDAQ_PRIVATE_MARKET: "bg-blue-100 text-blue-800" };

export interface IntegrationCardProps {
  companyId: string;
  provider: { id: string; name: string; category: string };
  status: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  config: Record<string, unknown>;
  canEdit: boolean;
}

const DESCRIPTIONS: Record<string, string> = {
  HRIS: "Sync new hires, terminations and departments so grants and cancellations never fall through the cracks.",
  ACCOUNTING: "Push ASC 718 stock-based compensation journal entries to your general ledger.",
  COMMUNICATION: "Post notifications about exercises, signatures and vesting milestones to a channel.",
  ESIGN: "Route agreements through your existing e-signature account instead of built-in signing.",
  LIQUIDITY: "Share cap table data with a secondary-market partner to run tender offers.",
};

/** "syncNewHires" → "Sync new hires" */
function configLabel(key: string) {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** true → "Yes", "EXERCISE_REQUEST" → "Exercise request", arrays joined */
function configValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(configValue).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^[A-Z][A-Z0-9_]+$/.test(v)) {
    const h = humanize(v);
    return h.charAt(0) + h.slice(1).toLowerCase();
  }
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function IntegrationCard(p: IntegrationCardProps) {
  const connected = p.status === "CONNECTED";
  const hidden = { companyId: p.companyId, provider: p.provider.id };
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-bold ${LOGO_COLORS[p.provider.id] ?? "bg-muted text-foreground"}`}>{p.provider.name.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14px] font-semibold">{p.provider.name}</span>
            <StatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{DESCRIPTIONS[p.provider.category]}</p>
        </div>
      </div>
      {connected ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted px-3 py-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Connected</dt>
            <dd>{date(p.connectedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last sync</dt>
            <dd>{dateTime(p.lastSyncAt)}</dd>
          </div>
          {Object.entries(p.config)
            .filter(([k]) => !["companyId", "provider"].includes(k))
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} className="col-span-2 truncate" title={`${configLabel(k)}: ${configValue(v)}`}>
                <dt className="inline text-muted-foreground">{configLabel(k)}: </dt>
                <dd className="inline">{configValue(v)}</dd>
              </div>
            ))}
        </dl>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {connected ? (
          <>
            <ConfirmButton action={syncIntegration} hidden={hidden} title={`Sync ${p.provider.name} now?`} description="Pulls the latest records and reconciles them with the cap table." variant="secondary" size="sm" confirmLabel="Sync now" successMessage="Sync started">
              <RefreshCw className="size-3.5" /> Sync now
            </ConfirmButton>
            {p.canEdit ? (
              <ConfirmButton action={disconnectIntegration} hidden={hidden} title={`Disconnect ${p.provider.name}?`} description="Synced data stays in Capt; future changes won't sync." variant="ghost" size="sm" confirmLabel="Disconnect" successMessage="Disconnected">
                <Unplug className="size-3.5" /> Disconnect
              </ConfirmButton>
            ) : null}
          </>
        ) : p.canEdit ? (
          <FormDialog
            trigger={
              <Button size="sm" variant="secondary">
                <Plug className="size-3.5" /> Connect
              </Button>
            }
            title={`Connect ${p.provider.name}`}
            description="In production this opens the provider's OAuth consent screen. Configure what to sync below."
            action={connectIntegration}
            hidden={hidden}
            submitLabel="Connect"
          >
            <ConfigFields category={p.provider.category} providerId={p.provider.id} />
          </FormDialog>
        ) : (
          <span className="text-xs text-muted-foreground">Ask an admin to connect.</span>
        )}
      </div>
    </div>
  );
}

function ConfigFields({ category, providerId }: { category: string; providerId: string }) {
  if (category === "HRIS") {
    return (
      <>
        <Field label="Account subdomain" hint={`e.g. northwind for northwind.${providerId.toLowerCase()}.com`}>
          <Input name="subdomain" placeholder="northwind" />
        </Field>
        <CheckboxRow name="syncNewHires" label="Create stakeholders for new hires" defaultChecked />
        <CheckboxRow name="syncTerminations" label="Flag terminations and start post-termination exercise windows" defaultChecked />
        <CheckboxRow name="syncDepartments" label="Keep departments and cost centers in sync" defaultChecked />
      </>
    );
  }
  if (category === "ACCOUNTING") {
    return (
      <>
        <Field label="Journal entry frequency">
          <Select name="exportFrequency" defaultValue="MONTHLY">
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
          </Select>
        </Field>
        <Field label="Stock-based compensation expense account">
          <Input name="expenseAccount" placeholder="6250 · Stock-based compensation" />
        </Field>
        <Field label="APIC account">
          <Input name="apicAccount" placeholder="3100 · Additional paid-in capital" />
        </Field>
      </>
    );
  }
  if (category === "COMMUNICATION") {
    return (
      <>
        <Field label="Channel">
          <Input name="channel" placeholder="#equity-ops" defaultValue="#equity-ops" />
        </Field>
        <div className="space-y-2">
          <div className="text-[13px] font-medium">Notify on</div>
          {[
            ["EXERCISE_REQUEST", "Exercise requests"],
            ["CONSENT_SIGNED", "Board consent signatures"],
            ["DOCUMENT_SIGNED", "Agreement signatures"],
            ["VESTING_MILESTONE", "Cliffs and full vesting"],
            ["VALUATION", "409A valuation status"],
          ].map(([v, l]) => (
            <CheckboxRow key={v} name="notifyOn[]" value={v} label={l} defaultChecked={v !== "VALUATION"} />
          ))}
        </div>
      </>
    );
  }
  if (category === "ESIGN") {
    return (
      <>
        <Field label={`${providerId === "DOCUSIGN" ? "DocuSign" : "Provider"} account email`}>
          <Input name="accountEmail" type="email" placeholder="legal@company.com" />
        </Field>
        <CheckboxRow name="useForAllAgreements" label="Route all new agreements through this provider" />
      </>
    );
  }
  return (
    <>
      <Field label="Program contact">
        <Input name="contactEmail" type="email" placeholder="liquidity@company.com" />
      </Field>
      <CheckboxRow name="shareCapTable" label="Share the fully diluted cap table for eligibility checks" defaultChecked />
    </>
  );
}

function CheckboxRow({ name, label, value, defaultChecked }: { name: string; label: string; value?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-[13px]">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-blue-600" />
      {label}
    </label>
  );
}
