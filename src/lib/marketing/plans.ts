import { PLANS, type PlanId } from "@/lib/types";

export const PLAN_ORDER: PlanId[] = ["STARTUP", "GROWTH", "ENTERPRISE"];

export const PLAN_COPY: Record<PlanId, { pitch: string; cta: string; href: string; features: string[] }> = {
  STARTUP: {
    pitch: "From incorporation to your first priced round.",
    cta: "Start with Startup",
    href: "/signup",
    features: ["Cap table and transaction ledger", "Share certificates", "Templated SAFE, option and RSA agreements", "Round and exit modeling", "Interactive offer letters", "Investor updates"],
  },
  GROWTH: {
    pitch: "For companies granting options every month.",
    cta: "Start with Growth",
    href: "/signup",
    features: ["Everything in Startup", "409A valuations", "Custom agreements", "Option exercises", "Rule 701, ISO limit and Form 3921", "Board consents with e-signature", "HRIS sync"],
  },
  ENTERPRISE: {
    pitch: "Late-stage reporting, liquidity and a managed service.",
    cta: "Talk to us",
    href: "/signup",
    features: ["Everything in Growth", "ASC 718 expense reporting", "Custom reports", "Tender offers and secondary liquidity", "Managed equity administration"],
  },
};

export const COMPARISON: { group: string; rows: { label: string; tiers: [string | boolean, string | boolean, string | boolean] }[] }[] = [
  {
    group: "Ledger",
    rows: [
      { label: "Stakeholders included", tiers: [String(PLANS.STARTUP.stakeholders), String(PLANS.GROWTH.stakeholders), "Unlimited"] },
      { label: "Cap table with as-of-date history", tiers: [true, true, true] },
      { label: "Share certificates and transaction ledger", tiers: [true, true, true] },
      { label: "CSV import, CSV and Excel export", tiers: [true, true, true] },
    ],
  },
  {
    group: "Fundraising",
    rows: [
      { label: "SAFE and convertible note builders", tiers: [true, true, true] },
      { label: "Round modeler and exit waterfall", tiers: [true, true, true] },
      { label: "Term sheet scanner", tiers: [true, true, true] },
      { label: "409A valuations", tiers: [false, true, true] },
    ],
  },
  {
    group: "Governance and compliance",
    rows: [
      { label: "Board consents with e-signature", tiers: [false, true, true] },
      { label: "Rule 701, ISO $100K limit, Form 3921", tiers: [false, true, true] },
      { label: "83(b) election tracking", tiers: [true, true, true] },
      { label: "ASC 718 expense reporting", tiers: [false, false, true] },
      { label: "Append-only audit log", tiers: [true, true, true] },
    ],
  },
  {
    group: "People",
    rows: [
      { label: "Employee and investor portals", tiers: [true, true, true] },
      { label: "Offer letters with equity scenarios", tiers: [true, true, true] },
      { label: "Option exercise requests", tiers: [false, true, true] },
      { label: "HRIS sync", tiers: [false, true, true] },
      { label: "Tender offers and secondary liquidity", tiers: [false, false, true] },
    ],
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "We already have a cap table in a spreadsheet. How do we move?",
    a: "Download the import template, paste in your stakeholders and securities, and upload the CSV. Capt validates every row before it writes to the ledger, and the import is recorded in the audit log.",
  },
  {
    q: "Can our law firm work in Capt with us?",
    a: "Yes. Invite counsel with the Legal role. They can issue securities, draft board consents and manage the data room, but cannot change users or billing. Every action they take is attributed to them in the audit log.",
  },
  {
    q: "What does an employee actually see?",
    a: "Only their own equity: each grant with its vesting schedule, what it would cost to exercise, a tax estimate for ISOs and NSOs, and the documents they signed. They never see anyone else's holdings.",
  },
  {
    q: "What happens to our data if we leave?",
    a: "You can export the full ledger, every document and the audit log at any time from Settings, on every plan. Nothing is held back behind a support ticket.",
  },
  {
    q: "Are the tax figures advice?",
    a: "No. Exercise and AMT figures use current US federal rates and are labelled as estimates. Capt is software, not a law or accounting firm, and nothing in it is legal, tax or investment advice.",
  },
];
