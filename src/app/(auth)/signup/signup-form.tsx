"use client";

import { useActionState } from "react";
import { signup, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/page";

const STATES = ["Delaware", "California", "New York", "Texas", "Washington", "Massachusetts", "Nevada", "Wyoming", "Other"];

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name">
        <Input name="name" required placeholder="Ada Lovelace" />
      </Field>
      <Field label="Work email">
        <Input name="email" type="email" required placeholder="ada@company.com" autoComplete="email" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:gap-3">
        <Field label="Company name" className="sm:col-span-3">
          <Input name="companyName" required placeholder="Acme, Inc." />
        </Field>
        <Field label="State" className="sm:col-span-2">
          <Select name="incorporationState" defaultValue="Delaware">
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Create company
      </Button>
    </form>
  );
}
