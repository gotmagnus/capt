import type { Metadata } from "next";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { RoleMatrix } from "@/components/marketing/role-matrix";
import { SectionHead } from "@/components/marketing/section-head";

export const metadata: Metadata = {
  title: "Security",
  description: "How Capt controls access to your cap table: server-verified sessions, per-company roles, document visibility, an append-only audit log and full export.",
};

// Each claim here describes behaviour that exists in the codebase today. Keep it that way.
const PRACTICES = [
  {
    title: "Access is decided on the server, every time",
    body: "Each page load and each change re-reads your session and your role for that company before it touches data. Hiding a button is never the control. A board member who guesses an admin URL gets nothing.",
  },
  {
    title: "Roles are per company",
    body: "One person can be an admin of their own company, outside counsel on a client's and an investor in a third. Seven roles, from admin to read-only viewer, and each query is scoped to the company in front of you.",
  },
  {
    title: "Stakeholders see their own equity, and only that",
    body: "Employees and investors sign in to a separate portal that loads their holdings, their documents and the updates addressed to them. Documents carry their own visibility: company, holder, investors or board.",
  },
  {
    title: "The audit log cannot be edited",
    body: "Issuances, approvals, signatures, role changes, sign-ins and exports are written to a log with no edit or delete path, for anyone. When a diligence team asks who changed what, you export the answer.",
  },
  {
    title: "Sessions and passwords",
    body: "Passwords are stored as bcrypt hashes. A session is a random 256-bit token in an HttpOnly, SameSite cookie that is marked Secure in production, expires after 30 days and is removed when you sign out.",
  },
  {
    title: "Signatures without accounts",
    body: "Directors, investors and candidates sign from a private link tied to one signer and one document. Each signature is timestamped and recorded against the consent, agreement or offer it belongs to.",
  },
  {
    title: "Every input is validated before it is written",
    body: "Forms are checked against a schema on the server, not just in the browser, and every change to the cap table writes a matching row to the transaction ledger so the table can always be rebuilt.",
  },
  {
    title: "Your data leaves when you say so",
    body: "Export the full ledger, every document and the audit log from Settings at any time, on every plan, as CSV, Excel or JSON. API keys are shown once, can be rotated and are revoked immediately.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <section className="pb-20 pt-14 lg:pb-28 lg:pt-20">
        <div className="mkt-container">
          <SectionHead as="h1" title="Who can see the cap table, and who can change it.">
            A cap table is the most sensitive spreadsheet a company owns. This page describes the controls that are in the product today, in plain terms, so your counsel can check them.
          </SectionHead>
          <dl className="mt-14 grid gap-x-16 border-b border-rule md:grid-cols-2 lg:mt-20">
            {PRACTICES.map((p) => (
              <div key={p.title} className="border-t border-rule py-8">
                <dt className="mkt-display text-[1.625rem] leading-tight text-ink">{p.title}</dt>
                <dd className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-vellum py-20 lg:py-28">
        <div className="mkt-container">
          <SectionHead title="What each role can reach.">The same matrix your admins see under Settings. Pick a role.</SectionHead>
          <div className="mt-10 lg:mt-12">
            <RoleMatrix />
          </div>
        </div>
      </section>

      <ClosingCta />
    </>
  );
}
