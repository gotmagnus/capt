"use client";

import { useState } from "react";
import { Paperclip, Send, Save } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";
import { RELATIONSHIP_LABELS, STAKEHOLDER_RELATIONSHIPS } from "@/lib/types";
import { saveUpdate } from "@/app/app/[companyId]/updates/actions";

const TEMPLATES: Record<string, { title: string; body: string }> = {
  monthly: {
    title: `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} update`,
    body: `## TL;DR\n\n- One line on the month.\n\n## Metrics\n\n| Metric | This month | Last month |\n|---|---|---|\n| ARR | | |\n| Net burn | | |\n| Runway | | |\n| Headcount | | |\n\n## Highlights\n\n- \n\n## Lowlights\n\n- \n\n## Asks\n\n- `,
  },
  quarterly: {
    title: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()} investor update`,
    body: `## Highlights\n\n- \n\n## Metrics\n\n| Metric | This quarter | Last quarter |\n|---|---|---|\n| ARR | | |\n| Gross margin | | |\n| Net burn | | |\n| Runway | | |\n| Headcount | | |\n\n## Product\n\n- \n\n## Team\n\n- \n\n## Financing\n\n- \n\n## Asks\n\n- `,
  },
  fundraise: {
    title: "We've closed our round",
    body: `We're thrilled to share that we've closed our **Series X** led by **Lead Investor**, with participation from existing investors.\n\n## The round\n\n- Amount: \n- Pre-money valuation: \n- New board member: \n\n## What it enables\n\n- \n\n## Thank you\n\nNone of this happens without you.`,
  },
  board: {
    title: "Board meeting pre-read",
    body: `## Agenda\n\n1. CEO update (15 min)\n2. Financials (15 min)\n3. Product & GTM (20 min)\n4. Hiring plan & option pool (10 min)\n5. Approvals (10 min)\n\n## CEO update\n\n\n## Financials\n\n\n## Decisions needed\n\n- `,
  },
};

export function UpdateEditor({
  companyId,
  initial,
  documents,
}: {
  companyId: string;
  initial?: { id: string; title: string; body: string; audience: string[]; externalEmails: string[]; status: string };
  documents: { id: string; name: string; folder: string }[];
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [audience, setAudience] = useState<string[]>(initial?.audience ?? ["INVESTOR", "BOARD_MEMBER"]);
  const [attach, setAttach] = useState("");
  return (
    <ActionForm action={saveUpdate} hidden={{ companyId, id: initial?.id }} redirectTo={(r) => `/app/${companyId}/updates/${r.data?.id ?? ""}`}>
      {({ fieldErrors }) => (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            <Card>
              <CardHeader className="flex-col sm:flex-row">
                <div className="min-w-0">
                  <CardTitle>Compose</CardTitle>
                  <CardDescription>Markdown supported — tables, lists and headings render for recipients.</CardDescription>
                </div>
                <div className="w-full shrink-0 sm:w-52">
                  <Select
                    className="h-8 text-xs"
                    aria-label="Insert template"
                    defaultValue=""
                    onChange={(e) => {
                      const t = TEMPLATES[e.target.value];
                      if (!t) return;
                      if (!title) setTitle(t.title);
                      setBody((b) => (b.trim() ? `${b}\n\n${t.body}` : t.body));
                      e.target.value = "";
                    }}
                  >
                    <option value="">Insert template…</option>
                    <option value="monthly">Monthly update</option>
                    <option value="quarterly">Quarterly update</option>
                    <option value="fundraise">Fundraise announcement</option>
                    <option value="board">Board pre-read</option>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Title" error={fieldErrors.title} required>
                  <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Q3 2026 investor update" />
                </Field>
                <Field label="Body" error={fieldErrors.body} required>
                  <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={22} required className="font-mono text-xs leading-relaxed max-sm:h-80" placeholder="## Highlights…" />
                </Field>
                <div className="flex items-center gap-2">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <Select value={attach} onChange={(e) => setAttach(e.target.value)} className="h-8 text-xs" aria-label="Attach a document">
                      <option value="">Attach a document from the data room…</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.folder} / {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <button
                    type="button"
                    className="h-8 shrink-0 rounded-md border border-border-strong px-3 text-xs hover:bg-muted disabled:opacity-50"
                    disabled={!attach}
                    onClick={() => {
                      const d = documents.find((x) => x.id === attach);
                      if (!d) return;
                      setBody((b) => `${b.trimEnd()}\n\n📎 [${d.name}](/app/${companyId}/documents/${d.id})`);
                      setAttach("");
                    }}
                  >
                    Attach
                  </button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recipients</CardTitle>
                  <CardDescription>Stakeholders in the selected groups get an in-app notification and a private link. External recipients receive the public link.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STAKEHOLDER_RELATIONSHIPS.map((r) => (
                    <label key={r} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                      <input type="checkbox" name="audience[]" value={r} checked={audience.includes(r)} onChange={(e) => setAudience((a) => (e.target.checked ? [...a, r] : a.filter((x) => x !== r)))} className="size-4 accent-blue-600" />
                      {RELATIONSHIP_LABELS[r]}
                    </label>
                  ))}
                </div>
                <Field label="External recipients" hint="Comma-separated emails, e.g. prospective investors.">
                  <Input name="externalEmails" defaultValue={initial?.externalEmails.join(", ") ?? ""} placeholder="partner@fund.vc, scout@angel.co" />
                </Field>
              </CardContent>
            </Card>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SubmitButton variant="secondary" name="intent" value="draft" pendingText="Saving…">
                <Save /> Save draft
              </SubmitButton>
              <SubmitButton name="intent" value="publish" pendingText="Publishing…">
                <Send /> {initial?.status === "PUBLISHED" ? "Publish changes" : "Publish"}
              </SubmitButton>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>How recipients will see it</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="max-h-[70vh] overflow-y-auto scrollbar-thin">
                <h2 className="mb-3 text-lg font-semibold">{title || "Untitled update"}</h2>
                <Markdown content={body || "_Nothing yet — start writing or insert a template._"} className={PROSE_FIXES} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
