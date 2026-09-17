"use client";

import { useActionState, useState } from "react";
import { login, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = "demo1234";
const DEMO_ACCOUNTS = [
  { email: "maya@northwind.dev", name: "Maya Chen", role: "Admin (CEO)" },
  { email: "finance@northwind.dev", name: "Aisha Bell", role: "Finance" },
  { email: "legal@northwind.dev", name: "Sam Wu", role: "Outside counsel" },
  { email: "elena@ridgeline.vc", name: "Elena Vasquez", role: "Board member" },
  { email: "jordan@northwind.dev", name: "Jordan Lee", role: "Employee portal" },
  { email: "james@basecamp.vc", name: "James Park", role: "Investor portal" },
];

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  return (
    <>
      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Sign in
        </Button>
      </form>

      <fieldset className="mt-8 rounded-lg border border-border bg-card">
        <legend className="ml-3 px-1 text-xs font-medium text-muted-foreground">Demo accounts</legend>
        <ul className="p-1.5">
          {DEMO_ACCOUNTS.map((a) => {
            const active = a.email === email;
            return (
              <li key={a.email}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", active ? "bg-accent-soft" : "hover:bg-muted")}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                  </span>
                  <span className={cn("shrink-0 text-xs", active ? "font-medium text-accent-foreground" : "text-muted-foreground")}>{a.role}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Pick one to fill the form. They all use the password <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>.
        </p>
      </fieldset>
    </>
  );
}
