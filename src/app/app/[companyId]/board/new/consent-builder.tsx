"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { Markdown } from "@/components/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONSENT_TYPE_LABELS, CONSENT_TYPES } from "@/lib/types";
import { createConsent } from "../actions";
import { cn } from "@/lib/utils";

export interface ExhibitCandidate {
  key: string;
  kind: "SECURITY" | "VALUATION" | "EQUITY_PLAN" | "ROUND" | "SHARE_CLASS";
  id: string;
  group: string;
  label: string;
  hint?: string;
  description: string;
  checked: boolean;
}

export interface SignerCandidate {
  stakeholderId: string;
  name: string;
  email: string;
  title?: string;
  checked: boolean;
}

function templateFor(type: string, ctx: { fmv: number | null; planName: string; companyName: string }) {
  const fmv = ctx.fmv != null ? `$${ctx.fmv.toFixed(2)}` : "$[FMV]";
  switch (type) {
    case "OPTION_GRANT":
      return `**WHEREAS**, the Board has determined that it is in the best interests of the Company to grant equity awards to the individuals listed on **Exhibit A** under the ${ctx.planName} (the "Plan");\n\n**RESOLVED**, that the Company grant stock options under the Plan to the individuals listed on Exhibit A, in the amounts set forth therein, at an exercise price of **${fmv} per share**, being the fair market value of the Common Stock as determined by the Board in good faith, subject to the vesting schedules set forth in Exhibit A;\n\n**RESOLVED FURTHER**, that the officers of the Company are authorized to execute award agreements in substantially the form previously approved by the Board.`;
    case "VALUATION_409A":
      return `**WHEREAS**, the Board has received an independent valuation report (**Exhibit A**) prepared for purposes of Section 409A of the Internal Revenue Code, concluding a fair market value of **${fmv} per share** of Common Stock;\n\n**RESOLVED**, that the Board hereby determines, in good faith and in reliance on the report, that the fair market value of the Company's Common Stock is ${fmv} per share, effective from the valuation date until the earlier of twelve months thereafter or a material event affecting the value of the Company.`;
    case "EQUITY_PLAN":
      return `**WHEREAS**, the Board believes it is in the best interests of the Company to increase the number of shares reserved for issuance under the ${ctx.planName};\n\n**RESOLVED**, that the number of shares of Common Stock reserved for issuance under the ${ctx.planName} be increased by **[NUMBER] shares**, subject to stockholder approval to the extent required;\n\n**RESOLVED FURTHER**, that the officers are authorized to submit the amendment to the stockholders for approval and to take all actions necessary to effect the foregoing.`;
    case "SAFE_ISSUANCE":
      return `**WHEREAS**, the Company desires to raise capital through the issuance of Simple Agreements for Future Equity ("SAFEs") in an aggregate amount of up to **$[AMOUNT]**;\n\n**RESOLVED**, that the Company is authorized to issue SAFEs substantially in the form of the Y Combinator post-money SAFE, with a valuation cap of **$[CAP]** and a discount of **[DISCOUNT]%**, to the investors listed on **Exhibit A**;\n\n**RESOLVED FURTHER**, that the officers are authorized to execute and deliver the SAFEs and to reserve shares of capital stock for issuance upon conversion.`;
    case "ROUND_APPROVAL":
      return `**WHEREAS**, the Company proposes to sell shares of **[SERIES] Preferred Stock** at a price of **$[PRICE] per share** for aggregate proceeds of up to **$[AMOUNT]** (the "Financing");\n\n**RESOLVED**, that the Amended and Restated Certificate of Incorporation attached as **Exhibit A** is approved and the officers are authorized to file it with the Secretary of State;\n\n**RESOLVED FURTHER**, that the Financing, the Stock Purchase Agreement and the related transaction documents are approved, and the officers are authorized to execute them on behalf of the Company.`;
    case "SHARE_CLASS":
      return `**RESOLVED**, that the Company is authorized to create a new class of **[CLASS NAME]** consisting of **[NUMBER] shares**, with the rights, preferences and privileges set forth in **Exhibit A**;\n\n**RESOLVED FURTHER**, that the officers are authorized to file an amendment to the Certificate of Incorporation reflecting the foregoing.`;
    default:
      return `**WHEREAS**, [background];\n\n**RESOLVED**, that [resolution];\n\n**RESOLVED FURTHER**, that the officers of ${ctx.companyName} are authorized to take all actions necessary to carry out the foregoing resolutions.`;
  }
}

export function ConsentBuilder({ companyId, exhibits, signers, fmv, planName, companyName, presetType, canEdit }: { companyId: string; exhibits: ExhibitCandidate[]; signers: SignerCandidate[]; fmv: number | null; planName: string; companyName: string; presetType?: string; canEdit: boolean }) {
  const initialType = presetType && (CONSENT_TYPES as readonly string[]).includes(presetType) ? presetType : "OPTION_GRANT";
  const [type, setType] = useState(initialType);
  const [body, setBody] = useState(() => templateFor(initialType, { fmv, planName, companyName }));
  const [title, setTitle] = useState(() => defaultTitle(initialType));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(exhibits.filter((e) => e.checked && e.kind === "SECURITY").map((e) => e.key)));
  const [selectedSigners, setSelectedSigners] = useState<Set<string>>(() => new Set(signers.filter((s) => s.checked).map((s) => s.stakeholderId)));
  const [extraSigners, setExtraSigners] = useState<{ name: string; email: string }[]>([]);
  const [freeExhibits, setFreeExhibits] = useState<string[]>([]);
  const [required, setRequired] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  const groups = useMemo(() => {
    const m = new Map<string, ExhibitCandidate[]>();
    for (const e of exhibits) m.set(e.group, [...(m.get(e.group) ?? []), e]);
    return [...m.entries()];
  }, [exhibits]);

  const chosen = exhibits.filter((e) => selected.has(e.key));
  const signerCount = selectedSigners.size + extraSigners.filter((s) => s.name && s.email).length;

  const onTypeChange = (t: string) => {
    setType(t);
    setBody(templateFor(t, { fmv, planName, companyName }));
    setTitle(defaultTitle(t));
  };

  if (!canEdit) return <Alert tone="warning">You have read-only access to this company. Ask an admin to create consents.</Alert>;

  return (
    <ActionForm action={createConsent} hidden={{ companyId }} redirectTo={(r) => `/app/${companyId}/board/${r.data?.id}`}>
      {({ pending }) => (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Resolution</CardTitle>
                  <CardDescription>Pick a type to start from a template. Markdown is supported.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Type" className="col-span-2 sm:col-span-1">
                    <Select name="type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
                      {CONSENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CONSENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Effective date">
                    <Input type="date" name="effectiveDate" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                  </Field>
                  <Field label="Required approvals" hint="0 = unanimous">
                    <Input type="number" name="requiredApprovals" min={0} value={required} onChange={(e) => setRequired(Number(e.target.value))} />
                  </Field>
                </div>
                <Field label="Title" required>
                  <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </Field>
                <Tabs defaultValue="edit">
                  <TabsList>
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit">
                    <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-xs leading-relaxed" required />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="rounded-md border border-border bg-muted/30 p-4">
                      <Markdown content={body} />
                      {chosen.length || freeExhibits.length ? (
                        <div className="mt-4 border-t border-border pt-3 text-[13px]">
                          <div className="font-semibold">Exhibits</div>
                          <ul className="mt-1 list-disc pl-5">
                            {[...chosen.map((c) => c.description), ...freeExhibits.filter(Boolean)].map((d, i) => (
                              <li key={i}>
                                <strong>Exhibit {String.fromCharCode(65 + i)}</strong> — {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Exhibits</CardTitle>
                  <CardDescription>Attach the grants, valuations, plans or rounds this consent approves. Approval updates them automatically.</CardDescription>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs tabular text-muted-foreground">{chosen.length + freeExhibits.filter(Boolean).length} selected</span>
              </CardHeader>
              <CardContent className="space-y-4">
                {groups.length === 0 ? <p className="text-[13px] text-muted-foreground">No recent grants or pending items to attach.</p> : null}
                {groups.map(([group, items]) => (
                  <div key={group}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {items.map((e) => {
                        const on = selected.has(e.key);
                        return (
                          <li key={e.key}>
                            <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/50", on && "bg-accent-soft/40")}>
                              <input
                                type="checkbox"
                                className="mt-1 size-3.5 accent-blue-600"
                                checked={on}
                                onChange={(ev) => {
                                  const next = new Set(selected);
                                  if (ev.target.checked) next.add(e.key);
                                  else next.delete(e.key);
                                  setSelected(next);
                                }}
                              />
                              {on ? <input type="hidden" name="exhibit" value={JSON.stringify({ kind: e.kind, id: e.id, description: e.description })} /> : null}
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium">{e.label}</span>
                                {e.hint ? <span className="block text-xs text-muted-foreground">{e.hint}</span> : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other exhibits</div>
                  <div className="space-y-2">
                    {freeExhibits.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input name="exhibitText" value={t} onChange={(e) => setFreeExhibits(freeExhibits.map((x, j) => (j === i ? e.target.value : x)))} placeholder="e.g. Form of Stock Option Agreement" />
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFreeExhibits(freeExhibits.filter((_, j) => j !== i))} aria-label="Remove">
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setFreeExhibits([...freeExhibits, ""])}>
                      <Plus /> Add free-text exhibit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-5 md:grid-cols-2 lg:grid-cols-1">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Signers</CardTitle>
                  <CardDescription>Directors and founders on file. Each receives a unique signing link.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="divide-y divide-border rounded-md border border-border">
                  {signers.map((s) => {
                    const on = selectedSigners.has(s.stakeholderId);
                    return (
                      <li key={s.stakeholderId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                          <input
                            type="checkbox"
                            className="size-3.5 accent-blue-600"
                            checked={on}
                            onChange={(ev) => {
                              const next = new Set(selectedSigners);
                              if (ev.target.checked) next.add(s.stakeholderId);
                              else next.delete(s.stakeholderId);
                              setSelectedSigners(next);
                            }}
                          />
                          {on ? <input type="hidden" name="signer" value={JSON.stringify({ stakeholderId: s.stakeholderId, name: s.name, email: s.email })} /> : null}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium">{s.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {s.title ? `${s.title} · ` : ""}
                              {s.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {signers.length === 0 ? <li className="px-3 py-3 text-xs text-muted-foreground">No board members on file. Add stakeholders with the “Board member” relationship, or add signers manually below.</li> : null}
                </ul>
                {extraSigners.map((s, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Input name="extraSignerName" placeholder="Full name" value={s.name} onChange={(e) => setExtraSigners(extraSigners.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Input name="extraSignerEmail" type="email" placeholder="Email" className="col-start-1 row-start-2 sm:max-md:col-start-auto sm:max-md:row-start-auto" value={s.email} onChange={(e) => setExtraSigners(extraSigners.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" size="icon-sm" className="col-start-2 row-start-1 sm:max-md:col-start-auto sm:max-md:row-start-auto" onClick={() => setExtraSigners(extraSigners.filter((_, j) => j !== i))} aria-label="Remove signer">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setExtraSigners([...extraSigners, { name: "", email: "" }])}>
                  <Plus /> Add signer
                </Button>
                <p className="text-xs text-muted-foreground">
                  {signerCount} signer{signerCount === 1 ? "" : "s"} · {required === 0 || required >= signerCount ? "unanimous approval required" : `${required} of ${signerCount} approvals required`}
                </p>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardContent className="space-y-2 pt-5">
                <SubmitButton name="mode" value="send" className="w-full" disabled={pending || signerCount === 0}>
                  Send for signature
                </SubmitButton>
                <SubmitButton name="mode" value="draft" variant="secondary" className="w-full" disabled={pending}>
                  Save as draft
                </SubmitButton>
                <p className="text-xs text-muted-foreground">Sending notifies each signer and locks the resolution text. Drafts can be edited until sent.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

function defaultTitle(type: string) {
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    {
      OPTION_GRANT: `Option grants — ${month}`,
      VALUATION_409A: `Approval of 409A valuation — ${month}`,
      EQUITY_PLAN: "Increase of equity incentive plan reserve",
      SAFE_ISSUANCE: "Authorization of SAFE financing",
      ROUND_APPROVAL: "Approval of preferred stock financing",
      SHARE_CLASS: "Authorization of new share class",
      CUSTOM: "Board resolution",
    }[type] ?? "Board resolution"
  );
}
