"use client";

import { useMemo, useState } from "react";
import { ChevronDown, LifeBuoy, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { FaqSection } from "@/lib/help-content";
import type { ActionResult } from "@/lib/actions";

export function HelpCenter({ sections, glossary, contactAction, companyId, portal }: { sections: FaqSection[]; glossary: { term: string; definition: string }[]; contactAction: (prev: ActionResult | undefined, fd: FormData) => Promise<ActionResult>; companyId: string; portal?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const ql = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, items: ql ? s.items.filter((i) => i.q.toLowerCase().includes(ql) || i.a.toLowerCase().includes(ql) || s.title.toLowerCase().includes(ql)) : s.items }))
        .filter((s) => s.items.length > 0),
    [sections, ql],
  );
  const terms = useMemo(() => (ql ? glossary.filter((g) => g.term.toLowerCase().includes(ql) || g.definition.toLowerCase().includes(ql)) : glossary), [glossary, ql]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={portal ? "Search: exercising, taxes, vesting…" : "Search the help center…"} className="h-10 pl-9 text-sm" />
        </div>
        {filtered.length === 0 ? <p className="text-[13px] text-muted-foreground">No articles match “{q}”.</p> : null}
        {filtered.map((s) => (
          <section key={s.id}>
            <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{s.title}</h2>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {s.items.map((it) => {
                const key = `${s.id}:${it.q}`;
                const isOpen = open === key || (!!ql && filtered.length <= 3);
                return (
                  <div key={key}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen && !ql ? null : key)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-medium hover:bg-muted/50">
                      {it.q}
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen ? <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{it.a}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <section>
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Glossary</h2>
          {terms.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No glossary terms match “{q}”.</p>
          ) : (
            <dl className="divide-y divide-border rounded-lg border border-border bg-card text-[13px]">
              {terms.map((g) => (
                <div key={g.term} className="gap-4 px-4 py-2.5 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <dt className="font-medium">{g.term}</dt>
                  <dd className="mt-0.5 leading-relaxed text-muted-foreground sm:mt-0">{g.definition}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
      <div className="grid content-start items-start gap-4 md:grid-cols-2 lg:grid-cols-1">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="size-4 text-muted-foreground" /> Contact support
              </CardTitle>
              <CardDescription>Equity specialists reply within a business day. For legal or tax advice, consult your advisors.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={contactAction} hidden={{ companyId }} successMessage="Message sent — we'll be in touch" resetOnSuccess className="space-y-3">
              <Field label="Subject">
                <Input name="subject" required placeholder="Question about…" />
              </Field>
              <Field label="Message">
                <Textarea name="message" required rows={5} placeholder="Tell us what you need help with." />
              </Field>
              <SubmitButton className="w-full">Send message</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Resources</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px]">
            {[
              ["Cap table 101 guide", "A founder's walkthrough of shares, options and dilution."],
              ["Fundraising playbook", "SAFEs, priced rounds and what to negotiate."],
              ["Employee equity handbook", "Plain-language explanations to share with your team."],
              ["Compliance calendar", "Every filing deadline for the year in one place."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-md border border-border px-3 py-2">
                <div className="font-medium">{t}</div>
                <div className="text-xs text-muted-foreground">{d}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-1">Nothing here is legal, tax or investment advice.</p>
      </div>
    </div>
  );
}
