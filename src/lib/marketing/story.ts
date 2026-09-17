/**
 * Marketing-site data. Every figure below is an as-of-date snapshot of the seeded demo
 * company (Northwind Robotics) produced by `buildCapTable`, so the public story matches
 * what a visitor finds when they open the demo. Regenerate if `prisma/seed.ts` changes.
 */

export type GroupKey = "founders" | "team" | "pool" | "investors";

export const GROUPS: { key: GroupKey; label: string; short: string; color: string }[] = [
  { key: "founders", label: "Founders", short: "Founders", color: "#3b6cf6" },
  { key: "team", label: "Employees & advisors", short: "Team", color: "#8b6cf9" },
  { key: "pool", label: "Unallocated pool", short: "Pool", color: "#64748b" },
  { key: "investors", label: "Investors", short: "Investors", color: "#12a594" },
];

export interface Stage {
  id: string;
  /** Short axis label, and the long form shown as the ledger's as-of date. */
  tick: string;
  asOf: string;
  title: string;
  body: string;
  /** What Capt records at this moment. */
  inCapt: string;
  shares: Record<GroupKey, number>;
  stakeholders: number;
  /** Money sitting in SAFEs and notes that has not converted into shares yet. */
  unconverted?: { amount: number; label: string };
  event: string;
}

export const STAGES: Stage[] = [
  {
    id: "incorporation",
    tick: "Mar 2022",
    asOf: "April 1, 2022",
    title: "Incorporation",
    body: "Two founders take 8.5 million shares on four-year vesting, their first engineer gets 1.5 million, and the board reserves 3.2 million for everyone they haven't hired yet.",
    inCapt: "Restricted stock with repurchase rights, 83(b) deadlines counted from the issue date, certificates numbered CS-1 onward.",
    shares: { founders: 8_500_000, team: 1_500_000, pool: 3_200_000, investors: 0 },
    stakeholders: 3,
    event: "10,000,000 common shares issued, 3,200,000 reserved for the plan",
  },
  {
    id: "safes",
    tick: "Oct 2022",
    asOf: "October 1, 2022",
    title: "Three SAFEs",
    body: "Angels wire $900,000 on post-money SAFEs. No shares change hands, so the table looks the same. It isn't: that money already has a claim on the next round.",
    inCapt: "SAFEs sit on the ledger as convertibles. The round modeler shows what they will cost before you agree to a cap.",
    shares: { founders: 8_500_000, team: 1_620_000, pool: 3_080_000, investors: 0 },
    stakeholders: 7,
    unconverted: { amount: 900_000, label: "on 3 post-money SAFEs" },
    event: "First option grant: 120,000 ISOs at a $0.05 strike",
  },
  {
    id: "seed",
    tick: "Apr 2023",
    asOf: "April 10, 2023",
    title: "Series Seed",
    body: "Basecamp leads at $0.80 a share. $1.6 million of new money buys 2,000,000 preferred shares, and the SAFEs convert into 1,406,250 more. The founders go from 64% to 51% in one signature.",
    inCapt: "Closing a round converts the SAFEs, issues every certificate, files the board consent and writes each step to the transaction ledger.",
    shares: { founders: 8_500_000, team: 2_020_000, pool: 2_680_000, investors: 3_406_250 },
    stakeholders: 10,
    event: "3,406,250 Series Seed Preferred issued at $0.80",
  },
  {
    id: "series-a",
    tick: "Sep 2024",
    asOf: "September 20, 2024",
    title: "Series A",
    body: "Ridgeline prices the company at $30 million pre-money and invests most of an $8.5 million round at $2.10. A departing co-founder's million unvested shares have already been bought back at cost.",
    inCapt: "A new 409A lands two weeks after closing, and every later grant is struck at the new fair market value.",
    shares: { founders: 8_500_000, team: 1_790_000, pool: 1_970_000, investors: 7_453_869 },
    stakeholders: 21,
    event: "4,047,619 Series A Preferred issued at $2.10",
  },
  {
    id: "today",
    tick: "Today",
    asOf: "Today",
    title: "Thirty-two stakeholders",
    body: "Nineteen employees hold grants, 44,062 options have been exercised, and a new SAFE and a note are waiting for the Series B. Each of them can open a portal and see exactly what they own.",
    inCapt: "Rule 701 headroom, ISO $100K splits, the 409A refresh and a board consent out for signature, all on one dashboard.",
    shares: { founders: 8_500_000, team: 2_589_062, pool: 1_170_938, investors: 7_453_869 },
    stakeholders: 32,
    unconverted: { amount: 500_000, label: "on a SAFE and a convertible note" },
    event: "Common fair market value: $0.85 a share",
  },
];

export function fullyDiluted(stage: Stage) {
  return GROUPS.reduce((sum, g) => sum + stage.shares[g.key], 0);
}

/** Today's ledger, largest holders first. `kind` picks the strip colour. */
export const HERO_ROWS: { name: string; detail: string; shares: number; kind: GroupKey }[] = [
  { name: "Maya Chen", detail: "Common", shares: 4_500_000, kind: "founders" },
  { name: "Daniel Okafor", detail: "Common", shares: 4_000_000, kind: "founders" },
  { name: "Ridgeline Capital Partners II", detail: "Series A Preferred", shares: 2_857_143, kind: "investors" },
  { name: "Basecamp Ventures Fund III", detail: "Seed and Series A Preferred", shares: 1_976_190, kind: "investors" },
  { name: "Hustle Fund II", detail: "Series Seed Preferred", shares: 781_250, kind: "investors" },
  { name: "Lakeshore Partners", detail: "Series A Preferred", shares: 714_286, kind: "investors" },
  { name: "4 other investors", detail: "Series Seed Preferred", shares: 1_125_000, kind: "investors" },
  { name: "22 employees and advisors", detail: "Options, RSUs and common", shares: 2_589_062, kind: "team" },
  { name: "Unallocated option pool", detail: "2022 Equity Incentive Plan", shares: 1_170_938, kind: "pool" },
];

export const HERO_TOTAL = HERO_ROWS.reduce((sum, r) => sum + r.shares, 0);
