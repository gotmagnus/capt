import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, addYears, subDays } from "date-fns";
import {
  boardConsentDocument,
  convertibleNote,
  optionGrantNotice,
  safeAgreement,
  shareCertificate,
  valuationReportSummary,
  vestingDescription,
  election83b,
  form3921,
} from "../src/lib/documents/templates";

const db = new PrismaClient();
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const TODAY = new Date();

async function main() {
  console.log("Resetting database…");
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.notification.deleteMany(),
    db.integration.deleteMany(),
    db.complianceRecord.deleteMany(),
    db.tenderParticipation.deleteMany(),
    db.tenderOffer.deleteMany(),
    db.updateView.deleteMany(),
    db.investorUpdate.deleteMany(),
    db.offerLetter.deleteMany(),
    db.exerciseRequest.deleteMany(),
    db.signature.deleteMany(),
    db.document.deleteMany(),
    db.consentExhibit.deleteMany(),
    db.consentSigner.deleteMany(),
    db.boardConsent.deleteMany(),
    db.scenario.deleteMany(),
    db.fundingRound.deleteMany(),
    db.valuation.deleteMany(),
    db.transaction.deleteMany(),
    db.security.deleteMany(),
    db.vestingMilestone.deleteMany(),
    db.vestingSchedule.deleteMany(),
    db.equityPlan.deleteMany(),
    db.shareClass.deleteMany(),
    db.stakeholder.deleteMany(),
    db.companyMembership.deleteMany(),
    db.session.deleteMany(),
    db.company.deleteMany(),
    db.user.deleteMany(),
  ]);

  const password = await bcrypt.hash("demo1234", 10);

  // ------------------------------------------------------------------ users
  const users = await Promise.all(
    [
      ["maya@northwind.dev", "Maya Chen"],
      ["daniel@northwind.dev", "Daniel Okafor"],
      ["finance@northwind.dev", "Aisha Bell"],
      ["legal@northwind.dev", "Sam Wu"],
      ["elena@ridgeline.vc", "Elena Vasquez"],
      ["jordan@northwind.dev", "Jordan Lee"],
      ["james@basecamp.vc", "James Park"],
    ].map(([email, name]) => db.user.create({ data: { email, name, passwordHash: password } })),
  );
  const [maya, daniel, aisha, sam, elena, jordan, james] = users;

  // ---------------------------------------------------------------- company
  const company = await db.company.create({
    data: {
      name: "Northwind Robotics",
      legalName: "Northwind Robotics, Inc.",
      slug: "northwind",
      entityType: "C_CORP",
      incorporationState: "Delaware",
      incorporationDate: d(2022, 3, 15),
      ein: "88-1234567",
      website: "https://northwind.dev",
      address: "550 Bryant St, Suite 300, San Francisco, CA 94107",
      plan: "GROWTH",
      stage: "SERIES_A",
      authorizedShares: 28_000_000,
      totalAssets: 9_800_000,
    },
  });
  const C = company.id;
  const info = { legalName: company.legalName, incorporationState: company.incorporationState, address: company.address };

  await db.companyMembership.createMany({
    data: [
      { userId: maya.id, companyId: C, role: "ADMIN" },
      { userId: daniel.id, companyId: C, role: "ADMIN" },
      { userId: aisha.id, companyId: C, role: "FINANCE" },
      { userId: sam.id, companyId: C, role: "LEGAL" },
      { userId: elena.id, companyId: C, role: "BOARD" },
      { userId: jordan.id, companyId: C, role: "EMPLOYEE" },
      { userId: james.id, companyId: C, role: "INVESTOR" },
    ],
  });

  // ---------------------------------------------------------- share classes
  const common = await db.shareClass.create({ data: { companyId: C, name: "Common Stock", prefix: "CS", type: "COMMON", authorizedShares: 20_000_000, parValue: 0.0001, seniority: 99, boardApprovalDate: d(2022, 3, 15) } });
  const seed = await db.shareClass.create({
    data: { companyId: C, name: "Series Seed Preferred", prefix: "PS-SEED", type: "PREFERRED", authorizedShares: 3_500_000, originalIssuePrice: 0.8, liquidationMultiple: 1, participating: false, seniority: 2, conversionRatio: 1, dividendRate: 6, dividendType: "NON_CUMULATIVE", antiDilution: "BROAD_BASED", boardApprovalDate: d(2023, 3, 20) },
  });
  const seriesA = await db.shareClass.create({
    data: { companyId: C, name: "Series A Preferred", prefix: "PS-A", type: "PREFERRED", authorizedShares: 4_500_000, originalIssuePrice: 2.1, liquidationMultiple: 1, participating: false, seniority: 1, conversionRatio: 1, dividendRate: 8, dividendType: "NON_CUMULATIVE", antiDilution: "BROAD_BASED", boardApprovalDate: d(2024, 9, 10) },
  });

  // ------------------------------------------------------------- vesting
  const vStd = await db.vestingSchedule.create({ data: { companyId: C, name: "4 years, 1 year cliff, monthly", type: "TIME", totalMonths: 48, cliffMonths: 12, frequency: "MONTHLY", accelerationDoubleTrigger: 100, description: "Standard employee schedule with double-trigger acceleration" } });
  const vNoCliff = await db.vestingSchedule.create({ data: { companyId: C, name: "4 years, no cliff, monthly", type: "TIME", totalMonths: 48, cliffMonths: 0, frequency: "MONTHLY", description: "Founder schedule" } });
  const vAdvisor = await db.vestingSchedule.create({ data: { companyId: C, name: "2 years, quarterly", type: "TIME", totalMonths: 24, cliffMonths: 0, frequency: "QUARTERLY", accelerationSingleTrigger: 100, description: "Advisor schedule" } });
  const vImmediate = await db.vestingSchedule.create({ data: { companyId: C, name: "Immediate", type: "IMMEDIATE", totalMonths: 0, cliffMonths: 0, frequency: "MONTHLY" } });
  const vRefresh = await db.vestingSchedule.create({ data: { companyId: C, name: "3 years, quarterly (refresh)", type: "TIME", totalMonths: 36, cliffMonths: 0, frequency: "QUARTERLY", description: "Refresh grant schedule" } });
  const vMilestone = await db.vestingSchedule.create({
    data: {
      companyId: C,
      name: "Performance milestones",
      type: "MILESTONE",
      totalMonths: 0,
      cliffMonths: 0,
      frequency: "MONTHLY",
      description: "Vests on product milestones",
      milestones: {
        create: [
          { description: "Gen-2 gripper ships to first customer", percent: 40, sortOrder: 0, achievedAt: d(2025, 6, 30) },
          { description: "$5M ARR", percent: 30, sortOrder: 1 },
          { description: "ISO 10218 certification", percent: 30, sortOrder: 2 },
        ],
      },
    },
  });
  const schedules = { [vStd.id]: vStd, [vNoCliff.id]: vNoCliff, [vAdvisor.id]: vAdvisor, [vImmediate.id]: vImmediate, [vRefresh.id]: vRefresh, [vMilestone.id]: vMilestone };

  // ------------------------------------------------------------- plan
  const plan = await db.equityPlan.create({
    data: { companyId: C, shareClassId: common.id, name: "2022 Equity Incentive Plan", authorizedShares: 3_200_000, adoptionDate: d(2022, 4, 1), boardApprovalDate: d(2022, 4, 1), stockholderApprovalDate: d(2022, 4, 5), expirationDate: d(2032, 4, 1), status: "ACTIVE", notes: "Pool increased from 2,000,000 to 3,200,000 shares in connection with the Series A financing (September 2024)." },
  });

  // ------------------------------------------------------------- stakeholders
  type SH = { key: string; name: string; email?: string; relationship: string; type?: string; title?: string; department?: string; startDate?: Date; terminationDate?: Date; employmentStatus?: string; userId?: string; country?: string; accredited?: boolean; costCenter?: string; address?: string; tags?: string[] };
  const shDefs: SH[] = [
    { key: "maya", name: "Maya Chen", email: "maya@northwind.dev", relationship: "FOUNDER", title: "Co-founder & CEO", department: "Executive", startDate: d(2022, 3, 15), employmentStatus: "ACTIVE", userId: maya.id, costCenter: "G&A", address: "1 Market St, San Francisco, CA 94105" },
    { key: "daniel", name: "Daniel Okafor", email: "daniel@northwind.dev", relationship: "FOUNDER", title: "Co-founder & CTO", department: "Engineering", startDate: d(2022, 3, 15), employmentStatus: "ACTIVE", userId: daniel.id, costCenter: "R&D", address: "200 Folsom St, San Francisco, CA 94105" },
    { key: "priya", name: "Priya Raman", email: "priya.raman@gmail.com", relationship: "FORMER_EMPLOYEE", title: "Co-founder (departed)", department: "Product", startDate: d(2022, 3, 15), terminationDate: d(2023, 7, 15), employmentStatus: "TERMINATED", costCenter: "R&D" },
    { key: "basecamp", name: "Basecamp Ventures Fund III, L.P.", email: "james@basecamp.vc", relationship: "INVESTOR", type: "ENTITY", userId: james.id, accredited: true, tags: ["Lead - Seed", "Board"] },
    { key: "ridgeline", name: "Ridgeline Capital Partners II, L.P.", email: "elena@ridgeline.vc", relationship: "INVESTOR", type: "ENTITY", accredited: true, tags: ["Lead - Series A", "Board"] },
    { key: "homebrew", name: "Homebrew Ventures", email: "ops@homebrew.co", relationship: "INVESTOR", type: "ENTITY", accredited: true },
    { key: "lakeshore", name: "Lakeshore Partners", email: "deals@lakeshore.com", relationship: "INVESTOR", type: "ENTITY", accredited: true },
    { key: "hustle", name: "Hustle Fund II, L.P.", email: "team@hustlefund.vc", relationship: "INVESTOR", type: "ENTITY", accredited: true },
    { key: "rachel", name: "Rachel Kim", email: "rachel@angel.vc", relationship: "INVESTOR", accredited: true, tags: ["Angel"] },
    { key: "tom", name: "Tom Alvarez", email: "tom.alvarez@me.com", relationship: "INVESTOR", accredited: true, tags: ["Angel"] },
    { key: "scout", name: "Sequoia Scout (Ana Petrova)", email: "ana@scout.sequoiacap.com", relationship: "INVESTOR", accredited: true, tags: ["Angel", "SAFE"] },
    { key: "svb", name: "Silicon Valley Bank", email: "venturedebt@svb.com", relationship: "OTHER", type: "ENTITY", tags: ["Lender"] },
    { key: "elena", name: "Elena Vasquez", email: "elena@ridgeline.vc", relationship: "BOARD_MEMBER", title: "Director (Ridgeline)", userId: elena.id },
    { key: "james", name: "James Park", email: "james@basecamp.vc", relationship: "BOARD_MEMBER", title: "Director (Basecamp)" },
    { key: "advisor1", name: "Dr. Lena Fischer", email: "lena@ethz.ch", relationship: "ADVISOR", title: "Technical advisor", country: "CH", costCenter: "R&D" },
    { key: "advisor2", name: "Marcus Hale", email: "marcus@halegroup.com", relationship: "ADVISOR", title: "GTM advisor", costCenter: "S&M" },
    // employees
    { key: "jordan", name: "Jordan Lee", email: "jordan@northwind.dev", relationship: "EMPLOYEE", title: "Senior Robotics Engineer", department: "Engineering", startDate: d(2022, 9, 6), employmentStatus: "ACTIVE", userId: jordan.id, costCenter: "R&D", address: "88 King St, San Francisco, CA 94107", employeeId: "E-004" } as SH,
    { key: "sofia", name: "Sofia Martinez", email: "sofia@northwind.dev", relationship: "EMPLOYEE", title: "VP Engineering", department: "Engineering", startDate: d(2023, 1, 9), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "wei", name: "Wei Zhang", email: "wei@northwind.dev", relationship: "EMPLOYEE", title: "Staff ML Engineer", department: "Engineering", startDate: d(2023, 3, 1), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "amara", name: "Amara Osei", email: "amara@northwind.dev", relationship: "EMPLOYEE", title: "Head of Product", department: "Product", startDate: d(2023, 7, 10), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "liam", name: "Liam O'Connor", email: "liam@northwind.dev", relationship: "EMPLOYEE", title: "Mechanical Engineer", department: "Engineering", startDate: d(2023, 8, 21), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "aisha", name: "Aisha Bell", email: "finance@northwind.dev", relationship: "EMPLOYEE", title: "Head of Finance", department: "Finance", startDate: d(2024, 2, 5), employmentStatus: "ACTIVE", userId: aisha.id, costCenter: "G&A" },
    { key: "noah", name: "Noah Williams", email: "noah@northwind.dev", relationship: "EMPLOYEE", title: "Account Executive", department: "Sales", startDate: d(2024, 4, 15), employmentStatus: "ACTIVE", costCenter: "S&M" },
    { key: "emma", name: "Emma Johansson", email: "emma@northwind.dev", relationship: "EMPLOYEE", title: "Controls Engineer", department: "Engineering", startDate: d(2024, 6, 3), employmentStatus: "ACTIVE", costCenter: "R&D", country: "SE" },
    { key: "carlos", name: "Carlos Mendes", email: "carlos.mendes@outlook.com", relationship: "FORMER_EMPLOYEE", title: "Sales Engineer", department: "Sales", startDate: d(2024, 1, 8), terminationDate: d(2025, 4, 30), employmentStatus: "TERMINATED", costCenter: "S&M" },
    { key: "yuki", name: "Yuki Tanaka", email: "yuki@northwind.dev", relationship: "EMPLOYEE", title: "Firmware Engineer", department: "Engineering", startDate: d(2024, 10, 14), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "olivia", name: "Olivia Brown", email: "olivia@northwind.dev", relationship: "EMPLOYEE", title: "People Operations Lead", department: "People", startDate: d(2024, 11, 4), employmentStatus: "ACTIVE", costCenter: "G&A" },
    { key: "ravi", name: "Ravi Patel", email: "ravi@northwind.dev", relationship: "EMPLOYEE", title: "Senior Software Engineer", department: "Engineering", startDate: d(2025, 1, 13), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "hannah", name: "Hannah Schmidt", email: "hannah@northwind.dev", relationship: "EMPLOYEE", title: "Customer Success Manager", department: "Customer", startDate: d(2025, 3, 3), employmentStatus: "ACTIVE", costCenter: "S&M" },
    { key: "diego", name: "Diego Ruiz", email: "diego@northwind.dev", relationship: "EMPLOYEE", title: "Perception Engineer", department: "Engineering", startDate: d(2025, 5, 19), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "grace", name: "Grace Nakamura", email: "grace@northwind.dev", relationship: "EMPLOYEE", title: "VP Sales", department: "Sales", startDate: d(2025, 9, 2), employmentStatus: "ACTIVE", costCenter: "S&M" },
    { key: "ben", name: "Ben Carter", email: "ben@northwind.dev", relationship: "EMPLOYEE", title: "Robotics Engineer", department: "Engineering", startDate: d(2026, 1, 12), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "zoe", name: "Zoe Adams", email: "zoe@northwind.dev", relationship: "EMPLOYEE", title: "Product Designer", department: "Product", startDate: d(2026, 4, 6), employmentStatus: "ACTIVE", costCenter: "R&D" },
    { key: "omar", name: "Omar Haddad", email: "omar@northwind.dev", relationship: "EMPLOYEE", title: "Field Applications Engineer", department: "Customer", startDate: d(2026, 8, 17), employmentStatus: "ACTIVE", costCenter: "S&M" },
  ];
  const sh: Record<string, { id: string; name: string; email?: string }> = {};
  for (const s of shDefs) {
    const created = await db.stakeholder.create({
      data: {
        companyId: C,
        userId: s.userId,
        name: s.name,
        email: s.email,
        type: s.type ?? "INDIVIDUAL",
        relationship: s.relationship,
        title: s.title,
        department: s.department,
        costCenter: s.costCenter,
        employmentStatus: s.employmentStatus,
        employeeId: (s as { employeeId?: string }).employeeId,
        startDate: s.startDate,
        terminationDate: s.terminationDate,
        terminationReason: s.terminationDate ? "Voluntary" : undefined,
        country: s.country ?? "US",
        accredited: s.accredited ?? false,
        address: s.address,
        tags: JSON.stringify(s.tags ?? []),
        portalInvitedAt: s.userId ? d(2024, 1, 15) : s.relationship === "EMPLOYEE" ? d(2025, 6, 1) : undefined,
        portalAcceptedAt: s.userId ? d(2024, 1, 16) : undefined,
      },
    });
    sh[s.key] = { id: created.id, name: created.name, email: created.email ?? undefined };
  }

  // --------------------------------------------------------------- helpers
  const docs: { id: string }[] = [];
  async function doc(input: { name: string; folder: string; type: string; content: string; securityId?: string; stakeholderId?: string; signatureStatus?: string; visibility?: string; signers?: { name: string; email: string; role: string; status: string; signedAt?: Date | null }[]; createdAt?: Date }) {
    const created = await db.document.create({
      data: {
        companyId: C,
        name: input.name,
        folder: input.folder,
        type: input.type,
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(input.content),
        content: input.content,
        securityId: input.securityId,
        stakeholderId: input.stakeholderId,
        signatureStatus: input.signatureStatus ?? "NOT_REQUIRED",
        visibility: input.visibility ?? "COMPANY",
        createdAt: input.createdAt,
        signatures: input.signers ? { create: input.signers.map((s, i) => ({ ...s, sortOrder: i })) } : undefined,
      },
    });
    docs.push(created);
    return created;
  }

  const certCounter: Record<string, number> = {};
  function nextCert(prefix: string) {
    certCounter[prefix] = (certCounter[prefix] ?? 0) + 1;
    return `${prefix}-${certCounter[prefix]}`;
  }

  async function shares(input: { holder: string; cls: { id: string; prefix: string; name: string; parValue: number }; qty: number; price: number; date: Date; type?: string; vestingId?: string; vestingStart?: Date; cancelled?: number; status?: string; e83b?: { deadline: Date; filed?: Date | null }; notes?: string; fmv?: number }) {
    const cert = nextCert(input.cls.prefix);
    const s = await db.security.create({
      data: {
        companyId: C,
        stakeholderId: sh[input.holder].id,
        type: input.type ?? (input.cls.prefix === "CS" ? "COMMON_SHARES" : "PREFERRED_SHARES"),
        certificateNumber: cert,
        shareClassId: input.cls.id,
        vestingScheduleId: input.vestingId,
        quantity: input.qty,
        pricePerShare: input.price,
        fmvAtGrant: input.fmv ?? input.price,
        totalAmount: input.qty * input.price,
        issueDate: input.date,
        grantDate: input.date,
        vestingStartDate: input.vestingStart ?? (input.vestingId ? input.date : undefined),
        boardApprovalDate: input.date,
        status: input.status ?? "OUTSTANDING",
        cancelledQuantity: input.cancelled ?? 0,
        election83bDeadline: input.e83b?.deadline,
        election83bFiledDate: input.e83b?.filed ?? undefined,
        repurchaseRight: !!input.vestingId,
        notes: input.notes,
      },
    });
    await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: s.id, toStakeholderId: sh[input.holder].id, quantity: input.qty, pricePerShare: input.price, totalAmount: input.qty * input.price, effectiveDate: input.date, notes: `Issued ${cert}` } });
    await doc({
      name: `${cert} — Stock certificate`,
      folder: `Securities/${cert}`,
      type: "CERTIFICATE",
      securityId: s.id,
      stakeholderId: sh[input.holder].id,
      visibility: "HOLDER",
      createdAt: input.date,
      content: shareCertificate({ company: info, certificateNumber: cert, holderName: sh[input.holder].name, shares: input.qty, className: input.cls.name, parValue: input.cls.parValue, issueDate: input.date, pricePerShare: input.price }),
    });
    return s;
  }

  async function option(input: { holder: string; qty: number; strike: number; fmv?: number; grant: Date; vestingId: string; vestingStart?: Date; iso?: boolean; exercised?: number; cancelled?: number; status?: string; early?: boolean; ptep?: number; notes?: string; pending?: boolean }) {
    const cert = nextCert("ES");
    const type = input.iso === false ? "OPTION_NSO" : "OPTION_ISO";
    const s = await db.security.create({
      data: {
        companyId: C,
        stakeholderId: sh[input.holder].id,
        type,
        certificateNumber: cert,
        equityPlanId: plan.id,
        shareClassId: common.id,
        vestingScheduleId: input.vestingId,
        quantity: input.qty,
        exercisePrice: input.strike,
        fmvAtGrant: input.fmv ?? input.strike,
        issueDate: input.grant,
        grantDate: input.grant,
        vestingStartDate: input.vestingStart ?? input.grant,
        expirationDate: addYears(input.grant, 10),
        boardApprovalDate: input.grant,
        status: input.pending ? "PENDING_SIGNATURE" : input.status ?? "OUTSTANDING",
        exercisedQuantity: input.exercised ?? 0,
        cancelledQuantity: input.cancelled ?? 0,
        ptepMonths: input.ptep ?? 3,
        earlyExercise: input.early ?? false,
        notes: input.notes,
      },
    });
    await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: s.id, toStakeholderId: sh[input.holder].id, quantity: input.qty, pricePerShare: input.strike, effectiveDate: input.grant, notes: `Granted ${cert}` } });
    const sched = schedules[input.vestingId];
    await doc({
      name: `${cert} — Option grant notice`,
      folder: `Securities/${cert}`,
      type: "OPTION_AGREEMENT",
      securityId: s.id,
      stakeholderId: sh[input.holder].id,
      visibility: "HOLDER",
      createdAt: input.grant,
      signatureStatus: input.pending ? "PARTIALLY_SIGNED" : "SIGNED",
      signers: [
        { name: "Maya Chen", email: "maya@northwind.dev", role: "COMPANY", status: "SIGNED", signedAt: input.grant },
        { name: sh[input.holder].name, email: sh[input.holder].email ?? "", role: "HOLDER", status: input.pending ? "PENDING" : "SIGNED", signedAt: input.pending ? null : addDays(input.grant, 2) },
      ],
      content: optionGrantNotice({ company: info, planName: plan.name, grantNumber: cert, holderName: sh[input.holder].name, type, quantity: input.qty, exercisePrice: input.strike, grantDate: input.grant, vestingStart: input.vestingStart ?? input.grant, vestingDescription: vestingDescription(sched), expirationDate: addYears(input.grant, 10), ptepMonths: input.ptep ?? 3, earlyExercise: input.early }),
    });
    return s;
  }

  // ------------------------------------------------------------- founders
  const mayaRSA = await shares({ holder: "maya", cls: common, qty: 4_500_000, price: 0.0001, date: d(2022, 3, 15), type: "RSA", vestingId: vNoCliff.id, e83b: { deadline: d(2022, 4, 14), filed: d(2022, 3, 28) } });
  const danielRSA = await shares({ holder: "daniel", cls: common, qty: 4_000_000, price: 0.0001, date: d(2022, 3, 15), type: "RSA", vestingId: vNoCliff.id, e83b: { deadline: d(2022, 4, 14), filed: d(2022, 3, 29) } });
  const priyaRSA = await shares({ holder: "priya", cls: common, qty: 1_500_000, price: 0.0001, date: d(2022, 3, 15), type: "RSA", vestingId: vNoCliff.id, cancelled: 1_000_000, e83b: { deadline: d(2022, 4, 14), filed: d(2022, 4, 1) }, notes: "1,000,000 unvested shares repurchased at cost upon departure (July 15, 2023)." });
  await db.transaction.create({ data: { companyId: C, type: "REPURCHASE", securityId: priyaRSA.id, fromStakeholderId: sh.priya.id, quantity: 1_000_000, pricePerShare: 0.0001, totalAmount: 100, effectiveDate: d(2023, 7, 15), notes: "Repurchase of unvested founder shares at cost" } });
  for (const [holder, id] of [["maya", mayaRSA.id], ["daniel", danielRSA.id], ["priya", priyaRSA.id]] as const) {
    await doc({ name: `83(b) election — ${sh[holder].name}`, folder: "Tax/83(b) elections", type: "ELECTION_83B", securityId: id, stakeholderId: sh[holder].id, visibility: "HOLDER", createdAt: d(2022, 3, 28), content: election83b({ company: info, holderName: sh[holder].name, shares: holder === "maya" ? 4_500_000 : holder === "daniel" ? 4_000_000 : 1_500_000, className: "Common Stock", transferDate: d(2022, 3, 15), fmvPerShare: 0.0001, pricePaidPerShare: 0.0001, taxYear: 2022 }) });
  }

  // --------------------------------------------------- 2022 SAFEs (converted)
  const safeDefs = [
    { holder: "hustle", amount: 500_000, cap: 8_000_000, date: d(2022, 6, 10), shares: 781_250 },
    { holder: "rachel", amount: 250_000, cap: 8_000_000, date: d(2022, 6, 24), shares: 390_625 },
    { holder: "tom", amount: 150_000, cap: 10_000_000, discount: 20, date: d(2022, 8, 2), shares: 234_375 },
  ];
  for (const s of safeDefs) {
    const cert = nextCert("SAFE");
    const sec = await db.security.create({
      data: { companyId: C, stakeholderId: sh[s.holder].id, type: "SAFE", certificateNumber: cert, quantity: 0, totalAmount: s.amount, issueDate: s.date, boardApprovalDate: s.date, status: "CONVERTED", valuationCap: s.cap, discountPercent: s.discount, safeType: "POST_MONEY", notes: `Converted into ${s.shares.toLocaleString()} shares of Series Seed Preferred on April 3, 2023.` },
    });
    await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: sec.id, toStakeholderId: sh[s.holder].id, quantity: 0, totalAmount: s.amount, effectiveDate: s.date, notes: `Issued ${cert}` } });
    await db.transaction.create({ data: { companyId: C, type: "CONVERSION", securityId: sec.id, toStakeholderId: sh[s.holder].id, quantity: s.shares, pricePerShare: s.amount / s.shares, totalAmount: s.amount, effectiveDate: d(2023, 4, 3), notes: `${cert} converted into Series Seed Preferred` } });
    await doc({ name: `${cert} — Post-money SAFE`, folder: `Securities/${cert}`, type: "SAFE", securityId: sec.id, stakeholderId: sh[s.holder].id, visibility: "HOLDER", createdAt: s.date, signatureStatus: "SIGNED", signers: [{ name: "Maya Chen", email: "maya@northwind.dev", role: "COMPANY", status: "SIGNED", signedAt: s.date }, { name: sh[s.holder].name, email: sh[s.holder].email ?? "", role: "INVESTOR", status: "SIGNED", signedAt: s.date }], content: safeAgreement({ company: info, investorName: sh[s.holder].name, amount: s.amount, valuationCap: s.cap, discountPercent: s.discount, safeType: "POST_MONEY", date: s.date }) });
    await shares({ holder: s.holder, cls: seed, qty: s.shares, price: s.amount / s.shares, date: d(2023, 4, 3), notes: `Issued on conversion of ${cert}`, fmv: 0.8 });
  }
  // Seed new money
  await shares({ holder: "basecamp", cls: seed, qty: 1_500_000, price: 0.8, date: d(2023, 4, 3) });
  await shares({ holder: "homebrew", cls: seed, qty: 500_000, price: 0.8, date: d(2023, 4, 3) });
  await db.fundingRound.create({ data: { companyId: C, name: "Series Seed", roundType: "PRICED", shareClassId: seed.id, preMoneyValuation: 8_500_000, postMoneyValuation: 11_225_000, amountRaised: 2_725_000, pricePerShare: 0.8, closeDate: d(2023, 4, 3), status: "CLOSED", leadInvestor: "Basecamp Ventures", notes: "Included conversion of $900K in post-money SAFEs." } });

  // ------------------------------------------------------------- Series A
  await shares({ holder: "ridgeline", cls: seriesA, qty: 2_857_143, price: 2.1, date: d(2024, 9, 15) });
  await shares({ holder: "basecamp", cls: seriesA, qty: 476_190, price: 2.1, date: d(2024, 9, 15), notes: "Pro-rata participation" });
  await shares({ holder: "lakeshore", cls: seriesA, qty: 714_286, price: 2.1, date: d(2024, 9, 15) });
  await db.fundingRound.create({ data: { companyId: C, name: "Series A", roundType: "PRICED", shareClassId: seriesA.id, preMoneyValuation: 30_000_000, postMoneyValuation: 38_500_000, amountRaised: 8_500_000, pricePerShare: 2.1, optionPoolIncrease: 1_200_000, closeDate: d(2024, 9, 15), status: "CLOSED", leadInvestor: "Ridgeline Capital", notes: "Option pool topped up to 10% post-money in the pre-money." } });
  await db.fundingRound.create({ data: { companyId: C, name: "Series B", roundType: "PRICED", preMoneyValuation: 90_000_000, targetAmount: 25_000_000, amountRaised: 0, status: "PLANNED", notes: "Targeting Q1 2027. Term sheet expected from Ridgeline / new lead." } });

  // ----------------------------------------------- outstanding SAFE + note (2025-26)
  const scoutSafe = await db.security.create({ data: { companyId: C, stakeholderId: sh.scout.id, type: "SAFE", certificateNumber: nextCert("SAFE"), quantity: 0, totalAmount: 300_000, issueDate: d(2026, 2, 12), boardApprovalDate: d(2026, 2, 10), status: "OUTSTANDING", valuationCap: 60_000_000, safeType: "POST_MONEY", proRataRight: true } });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: scoutSafe.id, toStakeholderId: sh.scout.id, quantity: 0, totalAmount: 300_000, effectiveDate: d(2026, 2, 12), notes: "Issued SAFE-4" } });
  await doc({ name: "SAFE-4 — Post-money SAFE", folder: "Securities/SAFE-4", type: "SAFE", securityId: scoutSafe.id, stakeholderId: sh.scout.id, visibility: "HOLDER", createdAt: d(2026, 2, 12), signatureStatus: "SIGNED", signers: [{ name: "Maya Chen", email: "maya@northwind.dev", role: "COMPANY", status: "SIGNED", signedAt: d(2026, 2, 12) }, { name: sh.scout.name, email: sh.scout.email ?? "", role: "INVESTOR", status: "SIGNED", signedAt: d(2026, 2, 12) }], content: safeAgreement({ company: info, investorName: sh.scout.name, amount: 300_000, valuationCap: 60_000_000, safeType: "POST_MONEY", proRata: true, date: d(2026, 2, 12) }) });

  const note = await db.security.create({ data: { companyId: C, stakeholderId: sh.tom.id, type: "CONVERTIBLE_NOTE", certificateNumber: nextCert("CN"), quantity: 0, totalAmount: 200_000, issueDate: d(2026, 5, 1), boardApprovalDate: d(2026, 4, 28), status: "OUTSTANDING", valuationCap: 55_000_000, discountPercent: 20, interestRate: 6, interestType: "SIMPLE", maturityDate: d(2028, 5, 1), conversionTrigger: 5_000_000 } });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: note.id, toStakeholderId: sh.tom.id, quantity: 0, totalAmount: 200_000, effectiveDate: d(2026, 5, 1), notes: "Issued CN-1" } });
  await doc({ name: "CN-1 — Convertible promissory note", folder: "Securities/CN-1", type: "CONVERTIBLE_NOTE", securityId: note.id, stakeholderId: sh.tom.id, visibility: "HOLDER", createdAt: d(2026, 5, 1), signatureStatus: "SIGNED", content: convertibleNote({ company: info, investorName: sh.tom.name, principal: 200_000, interestRate: 6, maturityDate: d(2028, 5, 1), valuationCap: 55_000_000, discountPercent: 20, qualifiedFinancing: 5_000_000, date: d(2026, 5, 1) }) });

  // ------------------------------------------------------------- warrant
  const warrant = await db.security.create({ data: { companyId: C, stakeholderId: sh.svb.id, type: "WARRANT", certificateNumber: nextCert("W"), shareClassId: common.id, quantity: 60_000, exercisePrice: 0.8, issueDate: d(2024, 3, 1), expirationDate: d(2034, 3, 1), boardApprovalDate: d(2024, 2, 26), status: "OUTSTANDING", vestingScheduleId: vImmediate.id, vestingStartDate: d(2024, 3, 1), notes: "Issued in connection with $2.0M venture debt facility." } });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: warrant.id, toStakeholderId: sh.svb.id, quantity: 60_000, pricePerShare: 0.8, effectiveDate: d(2024, 3, 1), notes: "Issued W-1" } });

  // ------------------------------------------------------------- 409A history
  const valuations = [
    { date: d(2022, 5, 1), fmv: 0.05, pref: null as number | null, ev: 3_000_000, status: "SUPERSEDED", purpose: "INITIAL", method: "MARKET", vol: 0.6, rf: 0.028, ttl: 4, dlom: 35 },
    { date: d(2023, 5, 15), fmv: 0.18, pref: 0.8, ev: 12_000_000, status: "SUPERSEDED", purpose: "FINANCING", method: "BACKSOLVE", vol: 0.58, rf: 0.037, ttl: 3.5, dlom: 32 },
    { date: d(2024, 10, 1), fmv: 0.62, pref: 2.1, ev: 41_000_000, status: "SUPERSEDED", purpose: "FINANCING", method: "BACKSOLVE", vol: 0.55, rf: 0.039, ttl: 3, dlom: 30 },
    { date: d(2025, 10, 15), fmv: 0.85, pref: 2.1, ev: 52_000_000, status: "ACCEPTED", purpose: "ANNUAL", method: "HYBRID", vol: 0.52, rf: 0.041, ttl: 2.5, dlom: 27 },
  ];
  const valIds: string[] = [];
  for (const v of valuations) {
    const rep = await doc({ name: `409A valuation report — ${v.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, folder: "Valuations", type: "VALUATION_REPORT", visibility: "BOARD", createdAt: addDays(v.date, 5), content: valuationReportSummary({ company: info, valuationDate: v.date, fmv: v.fmv, preferredPrice: v.pref, enterpriseValue: v.ev, equityValue: v.ev - 1_000_000, methodology: v.method, dlomPercent: v.dlom, volatility: v.vol, riskFreeRate: v.rf, timeToLiquidity: v.ttl, provider: "Capt Valuations", analyst: "R. Delgado, CFA" }) });
    const val = await db.valuation.create({ data: { companyId: C, status: v.status, purpose: v.purpose, valuationDate: v.date, effectiveFrom: v.date, effectiveTo: addYears(v.date, 1), fairMarketValue: v.fmv, preferredPrice: v.pref, enterpriseValue: v.ev, equityValue: v.ev - 1_000_000, methodology: v.method, dlomPercent: v.dlom, volatility: v.vol, riskFreeRate: v.rf, timeToLiquidity: v.ttl, provider: "Capt Valuations", analyst: "R. Delgado, CFA", reportDocumentId: rep.id, requestedAt: subDays(v.date, 10), deliveredAt: addDays(v.date, 5), acceptedAt: addDays(v.date, 9) } });
    valIds.push(val.id);
  }
  const pendingVal = await db.valuation.create({ data: { companyId: C, status: "IN_PROGRESS", purpose: "ANNUAL", valuationDate: d(2026, 9, 30), provider: "Capt Valuations", analyst: "R. Delgado, CFA", requestedAt: d(2026, 9, 8), intake: JSON.stringify({ revenueTtm: 6_400_000, revenueForward: 12_000_000, cashBalance: 5_200_000, burnMonthly: 480_000, headcount: 24, materialEvents: "Signed $2.1M contract with Bosch; Series B discussions started." }), notes: "Annual refresh; current valuation expires October 15, 2026." } });

  // ------------------------------------------------------------- option grants
  const grants = [
    { holder: "jordan", qty: 120_000, strike: 0.05, grant: d(2022, 9, 6), vestingId: vStd.id, exercised: 30_000 },
    { holder: "sofia", qty: 400_000, strike: 0.05, grant: d(2023, 1, 9), vestingId: vStd.id, early: true },
    { holder: "wei", qty: 150_000, strike: 0.18, grant: d(2023, 5, 22), vestingId: vStd.id, vestingStart: d(2023, 3, 1) },
    { holder: "amara", qty: 220_000, strike: 0.18, grant: d(2023, 7, 10), vestingId: vStd.id },
    { holder: "liam", qty: 60_000, strike: 0.18, grant: d(2023, 8, 21), vestingId: vStd.id },
    { holder: "advisor1", qty: 40_000, strike: 0.18, grant: d(2023, 9, 1), vestingId: vAdvisor.id, iso: false },
    { holder: "aisha", qty: 90_000, strike: 0.18, grant: d(2024, 2, 5), vestingId: vStd.id },
    { holder: "carlos", qty: 45_000, strike: 0.18, grant: d(2024, 1, 8), vestingId: vStd.id, cancelled: 30_938, exercised: 14_062, status: "EXERCISED", notes: "Terminated April 30, 2025. Vested 14,062 options exercised within PTEP; 30,938 unvested cancelled and returned to pool." },
    { holder: "noah", qty: 35_000, strike: 0.18, grant: d(2024, 4, 15), vestingId: vStd.id },
    { holder: "emma", qty: 70_000, strike: 0.18, grant: d(2024, 6, 3), vestingId: vStd.id },
    { holder: "advisor2", qty: 25_000, strike: 0.62, grant: d(2024, 11, 1), vestingId: vAdvisor.id, iso: false },
    { holder: "yuki", qty: 55_000, strike: 0.62, grant: d(2024, 10, 14), vestingId: vStd.id },
    { holder: "olivia", qty: 30_000, strike: 0.62, grant: d(2024, 11, 4), vestingId: vStd.id },
    { holder: "ravi", qty: 80_000, strike: 0.62, grant: d(2025, 1, 13), vestingId: vStd.id },
    { holder: "hannah", qty: 25_000, strike: 0.62, grant: d(2025, 3, 3), vestingId: vStd.id },
    { holder: "diego", qty: 65_000, strike: 0.62, grant: d(2025, 5, 19), vestingId: vStd.id },
    { holder: "jordan", qty: 40_000, strike: 0.62, grant: d(2025, 6, 2), vestingId: vRefresh.id, notes: "Refresh grant" },
    { holder: "grace", qty: 250_000, strike: 0.85, grant: d(2025, 11, 3), vestingId: vStd.id, vestingStart: d(2025, 9, 2) },
    { holder: "wei", qty: 50_000, strike: 0.85, grant: d(2025, 11, 3), vestingId: vRefresh.id, notes: "Refresh grant" },
    { holder: "sofia", qty: 60_000, strike: 0.85, grant: d(2025, 11, 3), vestingId: vMilestone.id, notes: "Performance grant" },
    { holder: "ben", qty: 50_000, strike: 0.85, grant: d(2026, 2, 10), vestingId: vStd.id, vestingStart: d(2026, 1, 12) },
    { holder: "zoe", qty: 40_000, strike: 0.85, grant: d(2026, 5, 12), vestingId: vStd.id, vestingStart: d(2026, 4, 6) },
    { holder: "omar", qty: 30_000, strike: 0.85, grant: d(2026, 9, 8), vestingId: vStd.id, vestingStart: d(2026, 8, 17), pending: true },
  ];
  const grantIds: Record<string, string[]> = {};
  for (const g of grants) {
    const s = await option(g);
    (grantIds[g.holder] ??= []).push(s.id);
  }
  // RSU grant
  const rsu = await db.security.create({ data: { companyId: C, stakeholderId: sh.amara.id, type: "RSU", certificateNumber: nextCert("RSU"), equityPlanId: plan.id, shareClassId: common.id, vestingScheduleId: vRefresh.id, quantity: 30_000, fmvAtGrant: 0.85, issueDate: d(2025, 11, 3), grantDate: d(2025, 11, 3), vestingStartDate: d(2025, 11, 3), boardApprovalDate: d(2025, 11, 3), status: "OUTSTANDING", notes: "Refresh grant delivered as RSUs; settles in shares on vesting." } });
  await db.transaction.create({ data: { companyId: C, type: "ISSUANCE", securityId: rsu.id, toStakeholderId: sh.amara.id, quantity: 30_000, effectiveDate: d(2025, 11, 3), notes: "Granted RSU-1" } });

  // Exercises
  const jordanGrant = grantIds.jordan[0];
  const exJordan = await db.exerciseRequest.create({ data: { companyId: C, securityId: jordanGrant, stakeholderId: sh.jordan.id, quantity: 30_000, exercisePrice: 0.05, totalCost: 1_500, fmvAtExercise: 0.62, isIso: true, method: "ACH", status: "COMPLETED", requestedAt: d(2025, 2, 3), approvedAt: d(2025, 2, 4), paidAt: d(2025, 2, 6), completedAt: d(2025, 2, 7) } });
  const jordanShares = await shares({ holder: "jordan", cls: common, qty: 30_000, price: 0.05, date: d(2025, 2, 7), notes: "Issued on exercise of ES-1", fmv: 0.62 });
  await db.exerciseRequest.update({ where: { id: exJordan.id }, data: { resultingSecurityId: jordanShares.id } });
  await db.transaction.create({ data: { companyId: C, type: "EXERCISE", securityId: jordanGrant, toStakeholderId: sh.jordan.id, quantity: 30_000, pricePerShare: 0.05, totalAmount: 1_500, effectiveDate: d(2025, 2, 7), notes: "Exercised 30,000 ISOs (ES-1)" } });
  await doc({ name: "Form 3921 (2025) — Jordan Lee", folder: "Tax/Form 3921/2025", type: "FORM_3921", securityId: jordanGrant, stakeholderId: sh.jordan.id, visibility: "HOLDER", createdAt: d(2026, 1, 20), content: form3921({ company: info, ein: company.ein, taxYear: 2025, employeeName: "Jordan Lee", employeeAddress: "88 King St, San Francisco, CA 94107", grantDate: d(2022, 9, 6), exerciseDate: d(2025, 2, 7), exercisePrice: 0.05, fmv: 0.62, shares: 30_000 }) });
  await db.complianceRecord.create({ data: { companyId: C, type: "FORM_3921", taxYear: 2025, referenceId: exJordan.id, status: "FILED", dueDate: d(2026, 1, 31), completedAt: d(2026, 1, 22), data: JSON.stringify({ employee: "Jordan Lee", shares: 30_000 }) } });

  const carlosGrant = grantIds.carlos[0];
  const exCarlos = await db.exerciseRequest.create({ data: { companyId: C, securityId: carlosGrant, stakeholderId: sh.carlos.id, quantity: 14_062, exercisePrice: 0.18, totalCost: 2_531.16, fmvAtExercise: 0.62, isIso: true, method: "WIRE", status: "COMPLETED", requestedAt: d(2025, 6, 20), approvedAt: d(2025, 6, 23), paidAt: d(2025, 6, 27), completedAt: d(2025, 7, 1) } });
  const carlosShares = await shares({ holder: "carlos", cls: common, qty: 14_062, price: 0.18, date: d(2025, 7, 1), notes: "Issued on exercise of ES-8 (post-termination)", fmv: 0.62 });
  await db.exerciseRequest.update({ where: { id: exCarlos.id }, data: { resultingSecurityId: carlosShares.id } });
  await db.transaction.create({ data: { companyId: C, type: "EXERCISE", securityId: carlosGrant, toStakeholderId: sh.carlos.id, quantity: 14_062, pricePerShare: 0.18, totalAmount: 2_531.16, effectiveDate: d(2025, 7, 1), notes: "Exercised 14,062 ISOs (ES-8)" } });
  await db.transaction.create({ data: { companyId: C, type: "CANCELLATION", securityId: carlosGrant, fromStakeholderId: sh.carlos.id, quantity: 30_938, effectiveDate: d(2025, 4, 30), notes: "Unvested options cancelled on termination" } });
  await db.transaction.create({ data: { companyId: C, type: "TERMINATION", fromStakeholderId: sh.carlos.id, quantity: 0, effectiveDate: d(2025, 4, 30), notes: "Carlos Mendes terminated (voluntary)" } });
  await db.complianceRecord.create({ data: { companyId: C, type: "FORM_3921", taxYear: 2025, referenceId: exCarlos.id, status: "FILED", dueDate: d(2026, 1, 31), completedAt: d(2026, 1, 22), data: JSON.stringify({ employee: "Carlos Mendes", shares: 14_062 }) } });

  // Pending exercise requests
  await db.exerciseRequest.create({ data: { companyId: C, securityId: grantIds.sofia[0], stakeholderId: sh.sofia.id, quantity: 100_000, exercisePrice: 0.05, totalCost: 5_000, fmvAtExercise: 0.85, isIso: true, method: "ACH", status: "REQUESTED", requestedAt: subDays(TODAY, 2), notes: "Exercising vested tranche before Series B." } });
  await db.exerciseRequest.create({ data: { companyId: C, securityId: grantIds.wei[0], stakeholderId: sh.wei.id, quantity: 25_000, exercisePrice: 0.18, totalCost: 4_500, fmvAtExercise: 0.85, isIso: true, method: "WIRE", status: "APPROVED", requestedAt: subDays(TODAY, 9), approvedAt: subDays(TODAY, 7) } });

  // ------------------------------------------------------------- board consents
  const boardSigners = [
    { stakeholderId: sh.maya.id, name: "Maya Chen", email: "maya@northwind.dev" },
    { stakeholderId: sh.daniel.id, name: "Daniel Okafor", email: "daniel@northwind.dev" },
    { stakeholderId: sh.elena.id, name: "Elena Vasquez", email: "elena@ridgeline.vc" },
    { stakeholderId: sh.james.id, name: "James Park", email: "james@basecamp.vc" },
  ];
  async function consent(input: { title: string; type: string; body: string; status: string; effectiveDate: Date; sentAt?: Date; approvedAt?: Date; signed?: number; exhibits?: { label: string; description: string; securityId?: string; referenceId?: string; referenceType?: string }[] }) {
    const signers = boardSigners.map((s, i) => ({ ...s, status: input.status === "DRAFT" ? "PENDING" : i < (input.signed ?? 4) ? "SIGNED" : "PENDING", signedAt: input.status === "DRAFT" ? null : i < (input.signed ?? 4) ? addDays(input.sentAt ?? input.effectiveDate, i) : null }));
    const content = boardConsentDocument({ company: info, title: input.title, body: input.body, effectiveDate: input.effectiveDate, signers, exhibits: input.exhibits ?? [] });
    const document = await doc({ name: `Board consent — ${input.title}`, folder: "Board", type: "BOARD_CONSENT", visibility: "BOARD", createdAt: input.effectiveDate, signatureStatus: input.status === "APPROVED" ? "SIGNED" : input.status === "SENT" ? "PARTIALLY_SIGNED" : "NOT_REQUIRED", content });
    return db.boardConsent.create({
      data: {
        companyId: C,
        title: input.title,
        type: input.type,
        body: input.body,
        status: input.status,
        effectiveDate: input.effectiveDate,
        sentAt: input.sentAt,
        approvedAt: input.approvedAt,
        documentId: document.id,
        createdById: maya.id,
        createdAt: subDays(input.sentAt ?? input.effectiveDate, 1),
        signers: { create: signers },
        exhibits: input.exhibits ? { create: input.exhibits } : undefined,
      },
    });
  }
  await consent({ title: "Approval of Series A Preferred Stock financing", type: "ROUND_APPROVAL", status: "APPROVED", effectiveDate: d(2024, 9, 10), sentAt: d(2024, 9, 8), approvedAt: d(2024, 9, 10), body: `**WHEREAS**, the Company proposes to sell up to 4,500,000 shares of Series A Preferred Stock at $2.10 per share pursuant to a Series A Preferred Stock Purchase Agreement (the "Financing");\n\n**RESOLVED**, that the Amended and Restated Certificate of Incorporation is approved and the officers are authorized to file it with the Delaware Secretary of State;\n\n**RESOLVED FURTHER**, that the Financing and the transaction documents are approved, and the number of shares reserved under the 2022 Equity Incentive Plan is increased by 1,200,000 to a total of 3,200,000 shares.`, exhibits: [{ label: "Exhibit A", description: "Amended and Restated Certificate of Incorporation" }, { label: "Exhibit B", description: "Series A Preferred Stock Purchase Agreement" }] });
  await consent({ title: "Approval of 409A valuation (October 15, 2025)", type: "VALUATION_409A", status: "APPROVED", effectiveDate: d(2025, 10, 24), sentAt: d(2025, 10, 22), approvedAt: d(2025, 10, 24), body: `**WHEREAS**, the Board has received the independent valuation report prepared by Capt Valuations as of October 15, 2025, concluding a fair market value of **$0.85 per share** of Common Stock;\n\n**RESOLVED**, that the Board hereby determines, in good faith and in reliance on the report, that the fair market value of the Common Stock is $0.85 per share for purposes of Section 409A, effective until the earlier of twelve months from the valuation date or a material event.`, exhibits: [{ label: "Exhibit A", description: "409A valuation report dated October 15, 2025", referenceId: valIds[3], referenceType: "VALUATION" }] });
  await consent({ title: "Option grants — November 2025", type: "OPTION_GRANT", status: "APPROVED", effectiveDate: d(2025, 11, 3), sentAt: d(2025, 11, 1), approvedAt: d(2025, 11, 3), body: `**RESOLVED**, that the Company grant stock options under the 2022 Equity Incentive Plan to the individuals listed on Exhibit A at an exercise price of $0.85 per share, being the fair market value determined by the Board, subject to the vesting schedules set forth therein.`, exhibits: [{ label: "Exhibit A", description: "Grace Nakamura — 250,000 ISO", securityId: grantIds.grace[0] }, { label: "Exhibit A", description: "Wei Zhang — 50,000 ISO (refresh)", securityId: grantIds.wei[1] }, { label: "Exhibit A", description: "Sofia Martinez — 60,000 ISO (performance)", securityId: grantIds.sofia[1] }, { label: "Exhibit A", description: "Amara Osei — 30,000 RSU (refresh)", securityId: rsu.id }] });
  await consent({ title: "Option grants — May 2026", type: "OPTION_GRANT", status: "APPROVED", effectiveDate: d(2026, 5, 12), sentAt: d(2026, 5, 10), approvedAt: d(2026, 5, 12), body: `**RESOLVED**, that the Company grant stock options under the 2022 Equity Incentive Plan to the individuals listed on Exhibit A at an exercise price of $0.85 per share.`, exhibits: [{ label: "Exhibit A", description: "Zoe Adams — 40,000 ISO", securityId: grantIds.zoe[0] }] });
  await consent({ title: "Option grants — September 2026", type: "OPTION_GRANT", status: "SENT", effectiveDate: d(2026, 9, 8), sentAt: subDays(TODAY, 6), signed: 2, body: `**RESOLVED**, that the Company grant stock options under the 2022 Equity Incentive Plan to the individuals listed on Exhibit A at an exercise price of $0.85 per share, being the fair market value determined by the Board.`, exhibits: [{ label: "Exhibit A", description: "Omar Haddad — 30,000 ISO", securityId: grantIds.omar[0] }] });
  await consent({ title: "Increase of 2022 Equity Incentive Plan reserve", type: "EQUITY_PLAN", status: "DRAFT", effectiveDate: d(2026, 10, 1), body: `**WHEREAS**, approximately 6% of the fully diluted capitalization remains available for future grants and the Company anticipates hiring 12 employees over the next 12 months;\n\n**RESOLVED**, that the number of shares reserved for issuance under the 2022 Equity Incentive Plan be increased by 800,000 shares, subject to stockholder approval.`, exhibits: [{ label: "Exhibit A", description: "Hiring plan and pool forecast (FY2027)" }] });

  // ------------------------------------------------------------- other documents
  await doc({ name: "Amended and Restated Certificate of Incorporation (Series A)", folder: "Corporate", type: "CHARTER", visibility: "COMPANY", createdAt: d(2024, 9, 15), content: `# Amended and Restated Certificate of Incorporation of Northwind Robotics, Inc.\n\n**ARTICLE IV** — The total number of shares of all classes of stock which the Corporation has authority to issue is 28,000,000, consisting of 20,000,000 shares of Common Stock, $0.0001 par value, and 8,000,000 shares of Preferred Stock, $0.0001 par value, of which 3,500,000 are designated Series Seed Preferred Stock and 4,500,000 are designated Series A Preferred Stock.\n\n**Liquidation preference.** Series A Preferred is senior to Series Seed Preferred; each is entitled to 1x its Original Issue Price, non-participating, before any distribution to Common Stock.\n\n**Conversion.** Each share of Preferred Stock converts into Common Stock at a 1:1 ratio, subject to broad-based weighted-average anti-dilution adjustment.` });
  await doc({ name: "2022 Equity Incentive Plan", folder: "Equity plans", type: "PLAN_DOCUMENT", visibility: "HOLDER", createdAt: d(2022, 4, 1), content: `# Northwind Robotics, Inc. 2022 Equity Incentive Plan\n\n**1. Purpose.** The Plan is intended to attract and retain the best available personnel and to promote the success of the Company's business through the grant of Incentive Stock Options, Nonstatutory Stock Options, Restricted Stock, and Restricted Stock Units.\n\n**2. Shares subject to the Plan.** Subject to adjustment, the maximum aggregate number of Shares that may be issued under the Plan is 3,200,000 Shares (as amended September 2024).\n\n**3. Eligibility.** Awards may be granted to Employees, Directors and Consultants. ISOs may be granted only to Employees.\n\n**4. Term of Options.** No Option shall be exercisable after ten years from the date of grant.\n\n**5. Post-termination exercise.** Unless otherwise provided in the Award Agreement, vested Options remain exercisable for three months following termination of service (twelve months in the case of death or disability).\n\n**6. Change in Control.** Awards shall be treated as set forth in the applicable Award Agreement; the Administrator may provide for acceleration.` });
  await doc({ name: "Series A term sheet (executed)", folder: "Fundraising/Series A", type: "TERM_SHEET", visibility: "COMPANY", createdAt: d(2024, 8, 12), content: `# Term Sheet — Series A Preferred Stock Financing\n\n| Term | Value |\n|---|---|\n| Investors | Ridgeline Capital (lead), Basecamp Ventures, Lakeshore Partners |\n| Amount raised | $8,500,000 |\n| Pre-money valuation | $30,000,000 (fully diluted, including a 10% post-money unallocated option pool) |\n| Price per share | $2.10 |\n| Liquidation preference | 1x non-participating, senior to Series Seed |\n| Dividends | 8% non-cumulative, when and if declared |\n| Anti-dilution | Broad-based weighted average |\n| Board | 2 founders, 1 Ridgeline, 1 Basecamp, 1 independent (vacant) |\n| Pro rata | Major investors (> $500K) |\n| Protective provisions | Standard NVCA |` });
  await doc({ name: "FY2025 audited financial statements", folder: "Financials", type: "FINANCIALS", visibility: "INVESTORS", createdAt: d(2026, 3, 31), content: `# Northwind Robotics, Inc. — Financial Statements FY2025 (audited)\n\n| | FY2025 | FY2024 |\n|---|---|---|\n| Revenue | $4,850,000 | $1,920,000 |\n| Gross margin | 41% | 33% |\n| Operating expenses | $9,600,000 | $6,100,000 |\n| Net loss | $(7,650,000) | $(5,420,000) |\n| Cash and equivalents | $5,200,000 | $10,900,000 |\n| Total assets | $9,800,000 | $13,100,000 |\n\nStock-based compensation expense recognized under ASC 718: $612,000 (FY2025).` });
  await doc({ name: "Rule 701 disclosure package (FY2026)", folder: "Compliance/Rule 701", type: "RULE_701", visibility: "HOLDER", createdAt: d(2026, 1, 15), content: `# Rule 701 Information Statement\n\nNorthwind Robotics, Inc. provides this information to holders of awards under the 2022 Equity Incentive Plan. Aggregate sales under compensatory plans during the trailing twelve months remain below the $10,000,000 enhanced-disclosure threshold; this statement is provided voluntarily.\n\nIncluded: summary of plan terms, risk factors, and FY2025 financial statements (see Financials folder).` });

  // ------------------------------------------------------------- offer letters
  await db.offerLetter.create({ data: { companyId: C, candidateName: "Priyanka Desai", candidateEmail: "priyanka.desai@gmail.com", title: "Staff Software Engineer", department: "Engineering", level: "L6", salary: 215_000, equityQuantity: 90_000, equityType: "OPTION_ISO", strikePrice: 0.85, vestingScheduleId: vStd.id, startDate: d(2026, 10, 19), expiresAt: addDays(TODAY, 5), status: "SENT", createdAt: subDays(TODAY, 4), sentAt: subDays(TODAY, 3), viewedAt: subDays(TODAY, 2), createdById: maya.id, packages: JSON.stringify([{ label: "Balanced", salary: 215_000, equityQuantity: 90_000 }, { label: "More equity", salary: 195_000, equityQuantity: 130_000 }, { label: "More cash", salary: 235_000, equityQuantity: 55_000 }]), message: "We were blown away by your systems design interview. We'd love for you to lead our platform team." } });
  await db.offerLetter.create({ data: { companyId: C, candidateName: "Omar Haddad", candidateEmail: "omar@northwind.dev", title: "Field Applications Engineer", department: "Customer", level: "L4", salary: 145_000, equityQuantity: 30_000, equityType: "OPTION_ISO", strikePrice: 0.85, vestingScheduleId: vStd.id, startDate: d(2026, 8, 17), status: "ACCEPTED", sentAt: d(2026, 7, 20), viewedAt: d(2026, 7, 20), acceptedAt: d(2026, 7, 22), selectedPackage: 0, stakeholderId: sh.omar.id, createdById: maya.id, packages: JSON.stringify([{ label: "Standard", salary: 145_000, equityQuantity: 30_000 }]) } });
  await db.offerLetter.create({ data: { companyId: C, candidateName: "Lucas Moreau", candidateEmail: "lucas.moreau@proton.me", title: "Head of Manufacturing", department: "Operations", level: "L7", salary: 240_000, bonus: 40_000, equityQuantity: 180_000, equityType: "OPTION_ISO", strikePrice: 0.85, vestingScheduleId: vStd.id, startDate: d(2026, 11, 2), status: "DRAFT", createdById: maya.id, packages: JSON.stringify([{ label: "Standard", salary: 240_000, equityQuantity: 180_000 }]) } });

  // ------------------------------------------------------------- scenarios
  await db.scenario.create({ data: { companyId: C, name: "Series B — $25M at $90M pre", type: "FINANCING", description: "Base case from the Ridgeline conversation. 12% post-money pool.", createdById: maya.id, params: JSON.stringify({ preMoneyValuation: 90_000_000, investors: [{ name: "New lead", amount: 18_000_000 }, { name: "Ridgeline Capital Partners II, L.P.", amount: 5_000_000, stakeholderId: sh.ridgeline.id }, { name: "Basecamp Ventures Fund III, L.P.", amount: 2_000_000, stakeholderId: sh.basecamp.id }], targetPoolPct: 12, poolTiming: "PRE", convertSafes: true, convertNotes: true, newShareClassName: "Series B Preferred" }) } });
  await db.scenario.create({ data: { companyId: C, name: "Series B — downside $15M at $60M pre", type: "FINANCING", description: "If market softens.", createdById: aisha.id, params: JSON.stringify({ preMoneyValuation: 60_000_000, investors: [{ name: "New lead", amount: 15_000_000 }], targetPoolPct: 10, poolTiming: "PRE", convertSafes: true, convertNotes: true, newShareClassName: "Series B Preferred" }) } });
  await db.scenario.create({ data: { companyId: C, name: "Acquisition at $150M", type: "EXIT", description: "Strategic acquirer interest (Q3 2026).", createdById: maya.id, params: JSON.stringify({ exitValue: 150_000_000, debt: 2_000_000, transactionCostPct: 2, includeUnvestedOptions: true }) } });
  await db.scenario.create({ data: { companyId: C, name: "FY2027 hiring plan", type: "HIRING", description: "12 hires across engineering and GTM.", createdById: aisha.id, params: JSON.stringify({ hires: [{ title: "Staff Engineer", count: 2, equity: 90_000 }, { title: "Senior Engineer", count: 4, equity: 45_000 }, { title: "Account Executive", count: 3, equity: 20_000 }, { title: "Product Manager", count: 1, equity: 50_000 }, { title: "Recruiter", count: 1, equity: 12_000 }, { title: "Support Engineer", count: 1, equity: 15_000 }] }) } });

  // ------------------------------------------------------------- updates
  const upd1 = await db.investorUpdate.create({ data: { companyId: C, title: "Q2 2026 investor update", status: "PUBLISHED", audience: JSON.stringify(["INVESTOR", "BOARD_MEMBER"]), publishedAt: d(2026, 7, 14), createdById: maya.id, publicToken: "q2-2026-nw", body: `## Highlights\n\n- **ARR $6.4M** (+38% QoQ), driven by the Bosch rollout and two new automotive customers.\n- Gen-2 gripper now shipping; field failure rate down 61%.\n- Hired Grace Nakamura as VP Sales.\n\n## Metrics\n\n| Metric | Q2 2026 | Q1 2026 |\n|---|---|---|\n| ARR | $6.4M | $4.6M |\n| Gross margin | 44% | 41% |\n| Net burn | $480K/mo | $520K/mo |\n| Runway | 11 months | 13 months |\n| Headcount | 24 | 21 |\n\n## Asks\n\n- Intros to Tier-1 automotive suppliers in Germany.\n- We're beginning Series B conversations — happy to share the deck.` } });
  await db.investorUpdate.create({ data: { companyId: C, title: "Q1 2026 investor update", status: "PUBLISHED", audience: JSON.stringify(["INVESTOR", "BOARD_MEMBER"]), publishedAt: d(2026, 4, 12), createdById: maya.id, publicToken: "q1-2026-nw", body: `## Highlights\n\n- ARR crossed **$4.6M**.\n- Signed a $2.1M multi-year agreement with Bosch.\n- Closed a $300K SAFE from a Sequoia scout to extend runway.\n\n## Lowlights\n\n- Supply chain delays on actuators pushed Gen-2 shipping by 6 weeks.` } });
  await db.investorUpdate.create({ data: { companyId: C, title: "FY2025 annual letter", status: "PUBLISHED", audience: JSON.stringify(["INVESTOR", "BOARD_MEMBER", "ADVISOR"]), publishedAt: d(2026, 1, 20), createdById: maya.id, publicToken: "fy2025-nw", body: `## 2025 in review\n\nWe grew revenue 2.5x to $4.85M, shipped Gen-2, and grew the team to 21. Thank you for your support.` } });
  await db.investorUpdate.create({ data: { companyId: C, title: "Q3 2026 investor update (draft)", status: "DRAFT", audience: JSON.stringify(["INVESTOR", "BOARD_MEMBER"]), createdById: maya.id, body: `## Highlights\n\n- ARR tracking to $8M by quarter end.\n- Series B process kicked off; first partner meetings scheduled.` } });
  for (const [who, days] of [["basecamp", 60], ["ridgeline", 61], ["homebrew", 58], ["rachel", 55], ["hustle", 50], ["elena", 62], ["james", 62]] as const) {
    await db.updateView.create({ data: { updateId: upd1.id, stakeholderId: sh[who].id, email: sh[who].email, viewedAt: subDays(TODAY, days) } });
  }

  // ------------------------------------------------------------- tender offer
  await db.tenderOffer.create({ data: { companyId: C, name: "2026 employee liquidity program", buyerName: "Ridgeline Capital Partners II, L.P.", pricePerShare: 1.75, maxShares: 400_000, maxPercentPerHolder: 20, startDate: d(2026, 11, 1), endDate: d(2026, 11, 30), eligibility: JSON.stringify(["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER"]), status: "DRAFT", notes: "Secondary at a 17% discount to the Series A price. Requires board and ROFR waiver." } });

  // ------------------------------------------------------------- integrations
  await db.integration.createMany({
    data: [
      { companyId: C, provider: "GUSTO", category: "HRIS", status: "CONNECTED", connectedAt: d(2024, 3, 12), lastSyncAt: subDays(TODAY, 0), config: JSON.stringify({ syncNewHires: true, syncTerminations: true, employeesSynced: 22 }) },
      { companyId: C, provider: "SLACK", category: "COMMUNICATION", status: "CONNECTED", connectedAt: d(2024, 5, 2), lastSyncAt: subDays(TODAY, 0), config: JSON.stringify({ channel: "#equity-ops", notifyOn: ["EXERCISE_REQUEST", "CONSENT_SIGNED", "VESTING_MILESTONE"] }) },
      { companyId: C, provider: "QUICKBOOKS", category: "ACCOUNTING", status: "DISCONNECTED", config: "{}" },
      { companyId: C, provider: "DOCUSIGN", category: "ESIGN", status: "DISCONNECTED", config: "{}" },
    ],
  });

  // ------------------------------------------------------------- notifications
  await db.notification.createMany({
    data: [
      { companyId: C, type: "DEADLINE", title: "409A valuation expires October 15", body: "The October 15, 2025 valuation reaches its 12-month safe-harbor limit on October 15, 2026. A refresh is in progress.", link: `/app/${C}/valuations`, dueDate: d(2026, 10, 15), status: "OPEN" },
      { companyId: C, type: "TASK", title: "Board consent awaiting 2 signatures", body: "Option grants — September 2026 has been signed by 2 of 4 directors.", link: `/app/${C}/board`, status: "OPEN" },
      { companyId: C, type: "TASK", title: "Exercise request from Sofia Martinez", body: "100,000 ISOs at $0.05 — total $5,000. Review and approve.", link: `/app/${C}/exercises`, status: "OPEN" },
      { companyId: C, type: "TASK", title: "Omar Haddad has not accepted grant ES-23", body: "Grant notice sent September 8, 2026; reminder scheduled.", link: `/app/${C}/securities`, status: "OPEN" },
      { companyId: C, type: "ALERT", title: "Option pool at 63% utilization", body: "About 1.17M shares remain unallocated against a 12-hire plan. Review the reserve before the Series B sets a new pool target.", link: `/app/${C}/equity-plans`, status: "OPEN" },
      { companyId: C, type: "INFO", title: "Gusto sync completed", body: "22 employees synced. 1 new hire detected: Omar Haddad.", link: `/app/${C}/settings/integrations`, status: "DONE", createdAt: subDays(TODAY, 1) },
      { companyId: C, type: "TASK", title: "Offer letter expiring: Priyanka Desai", body: "The offer has been viewed twice and not yet accepted.", link: `/app/${C}/offers`, dueDate: addDays(TODAY, 5), status: "OPEN" },
    ],
  });

  // ------------------------------------------------------------- audit log
  await db.auditLog.createMany({
    data: [
      { companyId: C, userId: maya.id, action: "ISSUE", entityType: "Security", entityId: grantIds.omar[0], summary: "Granted 30,000 ISOs (ES-23) to Omar Haddad at $0.85", createdAt: d(2026, 9, 8) },
      { companyId: C, userId: maya.id, action: "CREATE", entityType: "BoardConsent", summary: "Sent board consent “Option grants — September 2026” to 4 directors", createdAt: subDays(TODAY, 6) },
      { companyId: C, userId: elena.id, action: "SIGN", entityType: "BoardConsent", summary: "Elena Vasquez signed “Option grants — September 2026”", createdAt: subDays(TODAY, 5) },
      { companyId: C, userId: aisha.id, action: "EXPORT", entityType: "CapTable", summary: "Exported cap table (fully diluted) to Excel", createdAt: subDays(TODAY, 4) },
      { companyId: C, userId: aisha.id, action: "CREATE", entityType: "Valuation", entityId: pendingVal.id, summary: "Requested annual 409A valuation refresh", createdAt: d(2026, 9, 8) },
      { companyId: C, userId: sam.id, action: "UPDATE", entityType: "Stakeholder", entityId: sh.omar.id, summary: "Updated address and tax residency for Omar Haddad", createdAt: subDays(TODAY, 3) },
      { companyId: C, userId: jordan.id, action: "LOGIN", entityType: "User", summary: "Jordan Lee signed in to the employee portal", createdAt: subDays(TODAY, 1) },
      { companyId: C, userId: maya.id, action: "APPROVE", entityType: "ExerciseRequest", summary: "Approved exercise request from Wei Zhang (25,000 ISOs)", createdAt: subDays(TODAY, 7) },
    ],
  });

  // ------------------------------------------------------------- second company (switcher demo)
  const acme = await db.company.create({ data: { name: "Acme Labs", legalName: "Acme Labs, Inc.", slug: "acme-labs", incorporationState: "Delaware", incorporationDate: d(2026, 5, 20), plan: "STARTUP", stage: "PRE_SEED", authorizedShares: 10_000_000, memberships: { create: [{ userId: maya.id, role: "ADMIN" }, { userId: sam.id, role: "LEGAL" }] } } });
  const acmeCommon = await db.shareClass.create({ data: { companyId: acme.id, name: "Common Stock", prefix: "CS", type: "COMMON", authorizedShares: 10_000_000, seniority: 99 } });
  const acmeVest = await db.vestingSchedule.create({ data: { companyId: acme.id, name: "4 years, 1 year cliff, monthly", type: "TIME", totalMonths: 48, cliffMonths: 12, frequency: "MONTHLY" } });
  await db.vestingSchedule.create({ data: { companyId: acme.id, name: "Immediate", type: "IMMEDIATE", totalMonths: 0, cliffMonths: 0, frequency: "MONTHLY" } });
  const acmeMaya = await db.stakeholder.create({ data: { companyId: acme.id, userId: maya.id, name: "Maya Chen", email: "maya@northwind.dev", relationship: "FOUNDER", title: "Founder" } });
  const acmeKai = await db.stakeholder.create({ data: { companyId: acme.id, name: "Kai Nguyen", email: "kai@acmelabs.io", relationship: "FOUNDER", title: "Founder" } });
  const acmeAngel = await db.stakeholder.create({ data: { companyId: acme.id, name: "Rachel Kim", email: "rachel@angel.vc", relationship: "INVESTOR", accredited: true } });
  for (const [holder, qty, num] of [[acmeMaya, 3_000_000, 1], [acmeKai, 3_000_000, 2]] as const) {
    const s = await db.security.create({ data: { companyId: acme.id, stakeholderId: holder.id, type: "RSA", certificateNumber: `CS-${num}`, shareClassId: acmeCommon.id, vestingScheduleId: acmeVest.id, quantity: qty, pricePerShare: 0.00001, issueDate: d(2026, 5, 25), vestingStartDate: d(2026, 5, 25), status: "OUTSTANDING", election83bDeadline: d(2026, 6, 24), repurchaseRight: true } });
    await db.transaction.create({ data: { companyId: acme.id, type: "ISSUANCE", securityId: s.id, toStakeholderId: holder.id, quantity: qty, pricePerShare: 0.00001, effectiveDate: d(2026, 5, 25) } });
  }
  await db.security.create({ data: { companyId: acme.id, stakeholderId: acmeAngel.id, type: "SAFE", certificateNumber: "SAFE-1", quantity: 0, totalAmount: 150_000, issueDate: d(2026, 8, 1), status: "OUTSTANDING", valuationCap: 6_000_000, safeType: "POST_MONEY" } });
  await db.equityPlan.create({ data: { companyId: acme.id, shareClassId: acmeCommon.id, name: "2026 Stock Plan", authorizedShares: 1_000_000, adoptionDate: d(2026, 6, 1), status: "ACTIVE" } });

  console.log("Seeded Northwind Robotics with", Object.keys(sh).length, "stakeholders and", docs.length, "documents.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
