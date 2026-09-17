import { describe, expect, it } from "vitest";
import { computeVesting, buildVestingEvents } from "../vesting";
import { buildCapTable, nextCertificateNumber, securityStateAsOf } from "../captable";
import { solveConversions } from "../conversion";
import { modelRound } from "../round-model";
import { computeWaterfall } from "../waterfall";
import { isoLimitCheck, rule701Check } from "../compliance";
import { blackScholes, computeExpense } from "../asc718";
import { simulateExercise } from "../tax";

const std = { type: "TIME", totalMonths: 48, cliffMonths: 12, frequency: "MONTHLY" };

describe("vesting", () => {
  const start = new Date(2024, 0, 1);
  it("respects the cliff and vests monthly", () => {
    expect(computeVesting(48_000, start, std, { asOf: new Date(2024, 11, 15) }).vested).toBe(0);
    expect(computeVesting(48_000, start, std, { asOf: new Date(2025, 0, 1) }).vested).toBe(12_000);
    expect(computeVesting(48_000, start, std, { asOf: new Date(2026, 0, 1) }).vested).toBe(24_000);
    expect(computeVesting(48_000, start, std, { asOf: new Date(2028, 0, 1) }).vested).toBe(48_000);
  });
  it("handles uneven share counts without losing shares", () => {
    const events = buildVestingEvents(1_000, start, std);
    expect(events[events.length - 1].cumulative).toBe(1_000);
    expect(events.reduce((a, e) => a + e.amount, 0)).toBe(1_000);
  });
  it("stops vesting at termination and forfeits the rest", () => {
    const r = computeVesting(48_000, start, std, { asOf: new Date(2026, 5, 1), terminationDate: new Date(2025, 6, 1) });
    expect(r.vested).toBe(18_000);
    expect(r.forfeited).toBe(30_000);
    expect(r.unvested).toBe(0);
    expect(r.terminated).toBe(true);
  });
  it("keeps vested shares vested once the forfeiture is recorded as a cancellation", () => {
    // 45,000 options, terminated after 15 months: 14,062 vested, and the 30,938 unvested were cancelled.
    const grant = new Date(2024, 0, 8);
    const left = new Date(2025, 3, 30);
    const before = computeVesting(45_000, grant, std, { asOf: new Date(2026, 0, 1), terminationDate: left });
    expect(before.vested).toBe(14_062);
    expect(before.forfeited).toBe(30_938);
    const after = computeVesting(45_000, grant, std, { asOf: new Date(2026, 0, 1), terminationDate: left, cancelled: 30_938 });
    expect(after.total).toBe(14_062);
    expect(after.vested).toBe(14_062);
    expect(after.percentVested).toBe(1);
    expect(after.forfeited).toBe(0);
    expect(after.unvested).toBe(0);
    expect(after.events[after.events.length - 1].cumulative).toBe(14_062);
  });
  it("takes a partial cancellation off the unvested tail of an active grant", () => {
    // 48,000 granted, 12,000 cancelled by agreement: vesting keeps its pace and stops at 36,000.
    expect(computeVesting(48_000, start, std, { asOf: new Date(2026, 0, 1), cancelled: 12_000 }).vested).toBe(24_000);
    const done = computeVesting(48_000, start, std, { asOf: new Date(2028, 0, 1), cancelled: 12_000 });
    expect(done.total).toBe(36_000);
    expect(done.vested).toBe(36_000);
    expect(done.unvested).toBe(0);
    expect(done.fullyVestedDate).toEqual(new Date(2027, 0, 1));
  });
  it("applies recorded acceleration", () => {
    const r = computeVesting(48_000, start, std, { asOf: new Date(2025, 0, 1), accelerated: { shares: 10_000, at: new Date(2024, 11, 1) } });
    expect(r.vested).toBe(22_000);
    expect(r.unvested).toBe(26_000);
    const future = computeVesting(48_000, start, std, { asOf: new Date(2025, 0, 1), accelerated: { shares: 10_000, at: new Date(2026, 0, 1) } });
    expect(future.vested).toBe(12_000);
  });
  it("supports quarterly and immediate schedules", () => {
    const q = computeVesting(4_000, start, { ...std, frequency: "QUARTERLY", cliffMonths: 0 }, { asOf: new Date(2024, 3, 1) });
    expect(q.vested).toBe(250);
    expect(computeVesting(100, start, { ...std, type: "IMMEDIATE" }, { asOf: start }).vested).toBe(100);
  });
});

const classes = [
  { id: "common", name: "Common", prefix: "CS", type: "COMMON", authorizedShares: 20_000_000, liquidationMultiple: 1, participating: false, seniority: 99, conversionRatio: 1 },
  { id: "a", name: "Series A Preferred", prefix: "PS-A", type: "PREFERRED", authorizedShares: 3_000_000, originalIssuePrice: 1, liquidationMultiple: 1, participating: false, seniority: 1, conversionRatio: 1 },
];
const stakeholders = [
  { id: "f1", name: "Founder One", relationship: "FOUNDER" },
  { id: "f2", name: "Founder Two", relationship: "FOUNDER" },
  { id: "vc", name: "Venture Fund", relationship: "INVESTOR" },
  { id: "e1", name: "Employee", relationship: "EMPLOYEE" },
];
const plans = [{ id: "plan", name: "2023 Plan", shareClassId: "common", authorizedShares: 1_000_000 }];
const issue = new Date(2023, 0, 1);
const securities = [
  { id: "s1", type: "COMMON_SHARES", status: "OUTSTANDING", certificateNumber: "CS-1", stakeholderId: "f1", shareClassId: "common", quantity: 4_000_000, exercisedQuantity: 0, cancelledQuantity: 0, pricePerShare: 0.0001, issueDate: issue },
  { id: "s2", type: "COMMON_SHARES", status: "OUTSTANDING", certificateNumber: "CS-2", stakeholderId: "f2", shareClassId: "common", quantity: 4_000_000, exercisedQuantity: 0, cancelledQuantity: 0, pricePerShare: 0.0001, issueDate: issue },
  { id: "s3", type: "PREFERRED_SHARES", status: "OUTSTANDING", certificateNumber: "PS-A-1", stakeholderId: "vc", shareClassId: "a", quantity: 2_000_000, exercisedQuantity: 0, cancelledQuantity: 0, pricePerShare: 1, issueDate: issue },
  { id: "s4", type: "OPTION_ISO", status: "OUTSTANDING", certificateNumber: "ES-1", stakeholderId: "e1", equityPlanId: "plan", vestingScheduleId: "std", quantity: 300_000, exercisedQuantity: 0, cancelledQuantity: 0, exercisePrice: 0.25, issueDate: issue, vestingStartDate: issue },
];

describe("cap table", () => {
  const ct = buildCapTable({ shareClasses: classes, stakeholders, equityPlans: plans, securities, vestingSchedules: { std }, asOf: new Date(2025, 0, 1) });
  it("computes outstanding and fully diluted totals", () => {
    expect(ct.totals.outstandingShares).toBe(10_000_000);
    expect(ct.totals.optionsOutstanding).toBe(300_000);
    expect(ct.totals.poolAvailable).toBe(700_000);
    expect(ct.totals.fullyDilutedShares).toBe(11_000_000);
  });
  it("computes ownership percentages", () => {
    const f1 = ct.rows.find((r) => r.stakeholderId === "f1")!;
    expect(f1.outstandingPct).toBeCloseTo(0.4, 6);
    expect(f1.fullyDilutedPct).toBeCloseTo(4 / 11, 6);
    const e1 = ct.rows.find((r) => r.stakeholderId === "e1")!;
    expect(e1.optionsVested).toBe(150_000);
  });
  it("counts RSUs and plan RSAs against the pool", () => {
    const withRsu = buildCapTable({
      shareClasses: classes,
      stakeholders,
      equityPlans: plans,
      securities: [
        ...securities,
        { id: "r1", type: "RSU", status: "OUTSTANDING", certificateNumber: "RSU-1", stakeholderId: "e1", equityPlanId: "plan", vestingScheduleId: "std", quantity: 100_000, exercisedQuantity: 20_000, cancelledQuantity: 0, issueDate: issue, vestingStartDate: issue },
        { id: "r2", type: "RSA", status: "OUTSTANDING", certificateNumber: "CS-3", stakeholderId: "e1", shareClassId: "common", equityPlanId: "plan", quantity: 50_000, exercisedQuantity: 0, cancelledQuantity: 0, pricePerShare: 0.01, issueDate: issue },
      ],
      vestingSchedules: { std },
      asOf: new Date(2025, 0, 1),
    });
    expect(withRsu.plans[0].available).toBe(1_000_000 - 300_000 - 80_000 - 20_000 - 50_000);
    expect(withRsu.totals.rsus).toBe(80_000);
  });
  it("excludes securities issued after the as-of date", () => {
    const early = buildCapTable({ shareClasses: classes, stakeholders, equityPlans: plans, securities, vestingSchedules: { std }, asOf: new Date(2022, 0, 1) });
    expect(early.totals.outstandingShares).toBe(0);
  });
  it("reconstructs a security's status as of a date from the ledger", () => {
    const safe = { id: "safe1", type: "SAFE", status: "CONVERTED", certificateNumber: "SAFE-1", stakeholderId: "vc", quantity: 0, exercisedQuantity: 0, cancelledQuantity: 0, issueDate: new Date(2022, 9, 1) };
    const option = { id: "o1", type: "OPTION_ISO", status: "EXERCISED", certificateNumber: "ES-9", stakeholderId: "e1", quantity: 45_000, exercisedQuantity: 14_062, cancelledQuantity: 30_938, issueDate: new Date(2024, 0, 8) };
    const txs = [
      { id: "t1", type: "CONVERSION", securityId: "safe1", quantity: 1_000, effectiveDate: new Date(2023, 3, 3) },
      { id: "t2", type: "CANCELLATION", securityId: "o1", quantity: 30_938, effectiveDate: new Date(2025, 3, 30) },
      { id: "t3", type: "EXERCISE", securityId: "o1", quantity: 14_062, effectiveDate: new Date(2025, 6, 1) },
    ];
    expect(securityStateAsOf(safe, new Date(2022, 11, 31), txs).status).toBe("OUTSTANDING");
    expect(securityStateAsOf(safe, new Date(2023, 5, 1), txs).status).toBe("CONVERTED");
    expect(securityStateAsOf(safe, new Date(2022, 0, 1), txs).exists).toBe(false);
    expect(securityStateAsOf(option, new Date(2025, 0, 1), txs)).toMatchObject({ status: "OUTSTANDING", exercised: 0, cancelled: 0 });
    expect(securityStateAsOf(option, new Date(2025, 4, 15), txs)).toMatchObject({ status: "OUTSTANDING", exercised: 0, cancelled: 30_938 });
    expect(securityStateAsOf(option, new Date(2025, 8, 1), txs)).toMatchObject({ status: "EXERCISED", exercised: 14_062, cancelled: 30_938 });
  });
  it("generates certificate numbers", () => {
    expect(nextCertificateNumber("CS", ["CS-1", "CS-7", "PS-A-9"])).toBe("CS-8");
    expect(nextCertificateNumber("PS-A", ["CS-1"])).toBe("PS-A-1");
  });
});

describe("conversion", () => {
  it("post-money SAFE holder owns amount/cap of the pre-money capitalization", () => {
    const r = solveConversions({
      convertibles: [{ id: "safe", type: "SAFE", stakeholderId: "x", principal: 500_000, valuationCap: 5_000_000, safeType: "POST_MONEY" }],
      preRoundFullyDiluted: 10_000_000,
      poolIncrease: 0,
      preMoneyValuation: 20_000_000,
    });
    const shares = r.results[0].shares;
    expect(shares / (10_000_000 + shares)).toBeCloseTo(0.1, 4);
    expect(r.results[0].method).toBe("CAP");
  });
  it("uses the discount when it beats the cap", () => {
    const r = solveConversions({
      convertibles: [{ id: "safe", type: "SAFE", stakeholderId: "x", principal: 100_000, valuationCap: 50_000_000, discountPercent: 20, safeType: "POST_MONEY" }],
      preRoundFullyDiluted: 10_000_000,
      poolIncrease: 0,
      roundPricePerShare: 2,
    });
    expect(r.results[0].method).toBe("DISCOUNT");
    expect(r.results[0].conversionPrice).toBeCloseTo(1.6, 6);
    expect(r.results[0].shares).toBe(62_500);
  });
});

describe("round model", () => {
  const ct = buildCapTable({ shareClasses: classes, stakeholders, equityPlans: plans, securities, vestingSchedules: { std }, asOf: new Date(2025, 0, 1) });
  it("prices a simple round", () => {
    const r = modelRound({ capTable: ct, preMoneyValuation: 22_000_000, investors: [{ name: "Lead", amount: 5_500_000 }] });
    expect(r.pricePerShare).toBeCloseTo(2, 6);
    expect(r.newMoneyShares).toBe(2_750_000);
    expect(r.postFullyDiluted).toBe(13_750_000);
    expect(r.newInvestorPct).toBeCloseTo(0.2, 6);
    expect(r.postMoneyValuation).toBeCloseTo(27_500_000, 0);
  });
  it("tops up the pool to a post-money target in the pre-money", () => {
    const r = modelRound({ capTable: ct, preMoneyValuation: 22_000_000, investors: [{ name: "Lead", amount: 5_500_000 }], targetPoolPct: 10 });
    expect(r.poolPostPct).toBeCloseTo(0.1, 3);
    expect(r.pricePerShare).toBeLessThan(2);
    expect(r.newInvestorPct).toBeCloseTo(0.2, 3);
  });
});

describe("waterfall", () => {
  const holdings = [
    { stakeholderId: "f1", stakeholderName: "Founder One", relationship: "FOUNDER", securityId: "s1", kind: "SHARES" as const, shareClassId: "common", shares: 4_000_000 },
    { stakeholderId: "f2", stakeholderName: "Founder Two", relationship: "FOUNDER", securityId: "s2", kind: "SHARES" as const, shareClassId: "common", shares: 4_000_000 },
    { stakeholderId: "vc", stakeholderName: "Venture Fund", relationship: "INVESTOR", securityId: "s3", kind: "SHARES" as const, shareClassId: "a", shares: 2_000_000, originalIssuePrice: 1, invested: 2_000_000 },
  ];
  it("pays the preference when it beats conversion", () => {
    const r = computeWaterfall({ exitValue: 5_000_000, shareClasses: classes, holdings });
    const a = r.classes.find((c) => c.shareClassId === "a")!;
    expect(a.converted).toBe(false);
    expect(a.total).toBeCloseTo(2_000_000, 0);
    expect(r.commonPricePerShare).toBeCloseTo(3_000_000 / 8_000_000, 6);
  });
  it("converts when as-converted value is higher", () => {
    const r = computeWaterfall({ exitValue: 50_000_000, shareClasses: classes, holdings });
    const a = r.classes.find((c) => c.shareClassId === "a")!;
    expect(a.converted).toBe(true);
    expect(a.total).toBeCloseTo(10_000_000, 0);
    expect(r.holders.find((h) => h.stakeholderId === "vc")!.moic).toBeCloseTo(5, 6);
  });
  it("exercises in-the-money options and adds proceeds", () => {
    const r = computeWaterfall({
      exitValue: 50_000_000,
      shareClasses: classes,
      holdings: [...holdings, { stakeholderId: "e1", stakeholderName: "Employee", relationship: "EMPLOYEE", securityId: "s4", kind: "OPTION" as const, shareClassId: null, shares: 300_000, vested: 300_000, exercisePrice: 0.25 }],
    });
    expect(r.exerciseProceeds).toBeCloseTo(75_000, 0);
    const e = r.holders.find((h) => h.stakeholderId === "e1")!;
    expect(e.proceeds).toBeGreaterThan(0);
    const total = r.holders.reduce((a, h) => a + h.proceeds, 0);
    expect(total).toBeCloseTo(50_000_000, 0);
  });
  it("respects participation caps", () => {
    const partClasses = classes.map((c) => (c.id === "a" ? { ...c, participating: true, participationCap: 2 } : c));
    const r = computeWaterfall({ exitValue: 20_000_000, shareClasses: partClasses, holdings });
    const a = r.classes.find((c) => c.shareClassId === "a")!;
    expect(a.total).toBeLessThanOrEqual(4_000_000 + 1);
    expect(a.capped).toBe(true);
  });
});

describe("compliance", () => {
  it("flags ISO $100K excess", () => {
    const r = isoLimitCheck([
      { securityId: "g", stakeholderId: "e", stakeholderName: "E", grantDate: new Date(2024, 0, 1), vestingStart: new Date(2024, 0, 1), quantity: 200_000, fmvAtGrant: 3, schedule: std },
    ]);
    expect(r[0].hasExcess).toBe(true);
    expect(r[0].years[0].isoQualified).toBe(33_333);
  });
  it("evaluates Rule 701 limits", () => {
    const r = rule701Check({
      sales: [{ securityId: "a", stakeholderName: "x", type: "OPTION_ISO", date: new Date(2025, 5, 1), quantity: 100, aggregateSalesPrice: 900_000 }],
      asOf: new Date(2025, 8, 1),
      totalAssets: 2_000_000,
    });
    expect(r.applicableLimit).toBe(1_000_000);
    expect(r.status).toBe("WARNING");
  });
});

describe("iso limit", () => {
  it("does not invent an excess share from rounding, and caps a cancelled grant", () => {
    // Carlos: 45,000 ISOs at a $0.18 FMV, 30,938 unvested cancelled at termination.
    const [r] = isoLimitCheck([{ securityId: "es8", stakeholderId: "c", stakeholderName: "Carlos", grantDate: new Date(2024, 0, 8), vestingStart: new Date(2024, 0, 8), quantity: 45_000, cancelled: 30_938, fmvAtGrant: 0.18, schedule: std }]);
    expect(r.hasExcess).toBe(false);
    expect(r.totalExcessShares).toBe(0);
    expect(r.years.reduce((a, y) => a + y.isoQualified, 0)).toBe(14_062);
    expect(r.years.map((y) => y.year)).toEqual([2025]);
  });
  it("still splits the tranche that crosses $100,000", () => {
    const [r] = isoLimitCheck([{ securityId: "big", stakeholderId: "x", stakeholderName: "X", grantDate: new Date(2024, 0, 1), vestingStart: new Date(2024, 0, 1), quantity: 100_000, fmvAtGrant: 3, schedule: { type: "IMMEDIATE", totalMonths: 0, cliffMonths: 0, frequency: "MONTHLY" } }]);
    expect(r.years[0].isoQualified).toBe(33_333);
    expect(r.years[0].excessShares).toBe(66_667);
  });
});

describe("asc 718", () => {
  it("prices options with Black-Scholes", () => {
    const v = blackScholes({ stockPrice: 1, strike: 1, expectedTermYears: 6, volatility: 0.5, riskFreeRate: 0.04 });
    expect(v).toBeGreaterThan(0.4);
    expect(v).toBeLessThan(0.7);
  });
  it("attributes expense over the service period", () => {
    const report = computeExpense(
      [{ id: "g", stakeholderId: "e", stakeholderName: "E", type: "OPTION_ISO", quantity: 48_000, grantDate: new Date(2024, 0, 1), vestingStart: new Date(2024, 0, 1), schedule: std, strike: 1, fmvAtGrant: 1 }],
      new Date(2024, 0, 1),
      new Date(2024, 11, 31),
    );
    expect(report.periodExpense).toBeCloseTo(report.grants[0].totalFairValue / 4, 0);
    expect(report.byMonth).toHaveLength(12);
  });
});

describe("tax", () => {
  it("withholds on NSO spread", () => {
    const r = simulateExercise({ type: "OPTION_NSO", quantity: 10_000, exercisePrice: 1, fmv: 5, otherIncome: 150_000, stateRate: 0.093 });
    expect(r.spread).toBe(40_000);
    expect(r.federalWithholding).toBeCloseTo(8_800, 0);
    expect(r.totalCashRequired).toBeGreaterThan(10_000);
  });
  it("estimates AMT on ISO spread", () => {
    const r = simulateExercise({ type: "OPTION_ISO", quantity: 100_000, exercisePrice: 1, fmv: 8, otherIncome: 150_000 });
    expect(r.amtEstimate).toBeGreaterThan(100_000);
    expect(r.totalWithholding).toBe(0);
  });
});
