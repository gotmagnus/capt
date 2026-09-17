/**
 * Markdown document generators. Generated documents are stored in Document.content and
 * rendered with the `prose-doc` styles; they are intentionally plain so they print cleanly.
 */

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "____________";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function fmtNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function fmtMoney(n: number, decimals = 2) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 4) })}`;
}

export interface CompanyInfo {
  legalName: string;
  incorporationState: string;
  address?: string | null;
}

export function shareCertificate(input: {
  company: CompanyInfo;
  certificateNumber: string;
  holderName: string;
  shares: number;
  className: string;
  parValue: number;
  issueDate: Date | string;
  pricePerShare?: number | null;
  legend?: string | null;
}) {
  return `# ${input.company.legalName}

**Certificate No. ${input.certificateNumber}** · Incorporated under the laws of the State of ${input.company.incorporationState}

---

**THIS CERTIFIES THAT** **${input.holderName}** is the registered holder of **${fmtNum(input.shares)}** fully paid and non-assessable shares of **${input.className}**, par value $${input.parValue} per share, of ${input.company.legalName} (the "Company"), transferable only on the books of the Company by the holder hereof in person or by duly authorized attorney upon surrender of this Certificate properly endorsed.

| | |
|---|---|
| Holder | ${input.holderName} |
| Number of shares | ${fmtNum(input.shares)} |
| Class | ${input.className} |
| Issue date | ${fmtDate(input.issueDate)} |
| Price per share | ${input.pricePerShare != null ? fmtMoney(input.pricePerShare, 4) : "—"} |

${input.legend ?? `THE SECURITIES REPRESENTED HEREBY HAVE NOT BEEN REGISTERED UNDER THE SECURITIES ACT OF 1933, AS AMENDED, OR UNDER THE SECURITIES LAWS OF ANY STATE. THESE SECURITIES ARE SUBJECT TO RESTRICTIONS ON TRANSFERABILITY AND RESALE AND MAY NOT BE TRANSFERRED OR RESOLD EXCEPT AS PERMITTED UNDER THE ACT AND APPLICABLE STATE SECURITIES LAWS, PURSUANT TO REGISTRATION OR EXEMPTION THEREFROM.`}

**IN WITNESS WHEREOF**, the Company has caused this Certificate to be signed by its duly authorized officers as of ${fmtDate(input.issueDate)}.

<br/>

_____________________________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________
Chief Executive Officer &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Secretary

*This certificate is issued electronically and recorded in the Company's stock ledger.*
`;
}

export function optionGrantNotice(input: {
  company: CompanyInfo;
  planName: string;
  grantNumber: string;
  holderName: string;
  type: string; // ISO | NSO
  quantity: number;
  exercisePrice: number;
  grantDate: Date | string;
  vestingStart: Date | string;
  vestingDescription: string;
  expirationDate?: Date | string | null;
  ptepMonths?: number | null;
  earlyExercise?: boolean;
}) {
  return `# ${input.company.legalName}
## ${input.planName}
### Notice of Stock Option Grant — ${input.grantNumber}

${input.company.legalName} (the "Company") hereby grants to the Optionee named below an option (the "Option") to purchase shares of the Company's Common Stock under the ${input.planName} (the "Plan"), subject to the terms of the Plan and the Stock Option Agreement.

| | |
|---|---|
| Optionee | ${input.holderName} |
| Grant number | ${input.grantNumber} |
| Date of grant | ${fmtDate(input.grantDate)} |
| Vesting commencement date | ${fmtDate(input.vestingStart)} |
| Type of option | ${input.type === "OPTION_ISO" ? "Incentive Stock Option (ISO)" : "Non-Qualified Stock Option (NSO)"} |
| Number of shares | ${fmtNum(input.quantity)} |
| Exercise price per share | ${fmtMoney(input.exercisePrice, 2)} |
| Total exercise price | ${fmtMoney(input.quantity * input.exercisePrice, 2)} |
| Expiration date | ${fmtDate(input.expirationDate)} |
| Post-termination exercise period | ${input.ptepMonths ?? 3} months |
| Early exercise permitted | ${input.earlyExercise ? "Yes" : "No"} |

**Vesting schedule.** ${input.vestingDescription}

**Exercise.** The Option may be exercised, to the extent vested, by delivering a notice of exercise and payment of the aggregate exercise price in a form permitted by the Plan.

**Tax matters.** ${input.type === "OPTION_ISO" ? "This Option is intended to qualify as an incentive stock option under Section 422 of the Internal Revenue Code to the maximum extent permitted; any portion in excess of the $100,000 annual limit will be treated as a non-qualified stock option." : "This Option is a non-qualified stock option. The spread at exercise is taxable as ordinary income and subject to withholding."} The Optionee should consult a tax advisor.

By accepting this grant electronically, the Optionee acknowledges receipt of the Plan, the Stock Option Agreement and the Plan prospectus, and agrees to be bound by their terms.

_____________________________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________
${input.company.legalName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Optionee
`;
}

export function safeAgreement(input: {
  company: CompanyInfo;
  investorName: string;
  amount: number;
  valuationCap?: number | null;
  discountPercent?: number | null;
  safeType: string;
  mfn?: boolean;
  proRata?: boolean;
  date: Date | string;
}) {
  const kind = input.valuationCap && input.discountPercent ? "Valuation Cap and Discount" : input.valuationCap ? "Valuation Cap, no Discount" : input.discountPercent ? "Discount, no Valuation Cap" : "MFN, no Valuation Cap, no Discount";
  return `# ${input.company.legalName}
## SAFE (Simple Agreement for Future Equity)
### ${input.safeType === "PRE_MONEY" ? "Pre-Money" : "Post-Money"} Valuation Cap — ${kind}

THIS CERTIFIES THAT in exchange for the payment by **${input.investorName}** (the "Investor") of **${fmtMoney(input.amount, 0)}** (the "Purchase Amount") on or about ${fmtDate(input.date)}, ${input.company.legalName}, a ${input.company.incorporationState} corporation (the "Company"), issues to the Investor the right to certain shares of the Company's Capital Stock, subject to the terms described below.

| Term | Value |
|---|---|
| Purchase Amount | ${fmtMoney(input.amount, 0)} |
| ${input.safeType === "PRE_MONEY" ? "Pre-Money" : "Post-Money"} Valuation Cap | ${input.valuationCap ? fmtMoney(input.valuationCap, 0) : "None"} |
| Discount Rate | ${input.discountPercent ? `${100 - input.discountPercent}% (${input.discountPercent}% discount)` : "None"} |
| Most Favored Nation | ${input.mfn ? "Yes" : "No"} |
| Pro rata right | ${input.proRata ? "Yes (side letter)" : "No"} |

**1. Events.**
(a) *Equity Financing.* If there is an Equity Financing before the termination of this Safe, on the initial closing of such Equity Financing, this Safe will automatically convert into the greater of (1) the number of shares of Standard Preferred Stock equal to the Purchase Amount divided by the lowest price per share of the Standard Preferred Stock; or (2) the number of shares of Safe Preferred Stock equal to the Purchase Amount divided by the Safe Price.
(b) *Liquidity Event.* If there is a Liquidity Event before the termination of this Safe, this Safe will automatically be entitled to receive a portion of Proceeds, due and payable to the Investor immediately prior to, or concurrent with, the consummation of such Liquidity Event, equal to the greater of (i) the Purchase Amount or (ii) the amount payable on the number of shares of Common Stock equal to the Purchase Amount divided by the Liquidity Price.
(c) *Dissolution Event.* If there is a Dissolution Event before the termination of this Safe, the Investor will automatically be entitled to receive a portion of Proceeds equal to the Purchase Amount.

**2. Definitions.** "Safe Price" means the price per share equal to the ${input.safeType === "PRE_MONEY" ? "Pre-Money" : "Post-Money"} Valuation Cap divided by the Company Capitalization. Capitalized terms not defined here have the meanings given in the Y Combinator ${input.safeType === "PRE_MONEY" ? "pre-money" : "post-money"} SAFE form.

**3. Company Representations.** The Company is a corporation duly organized, validly existing and in good standing under the laws of its state of incorporation.

**4. Investor Representations.** The Investor is an accredited investor as defined in Rule 501 of Regulation D and has full legal capacity to enter into this Safe.

**5. Miscellaneous.** This Safe is governed by the laws of the State of ${input.company.incorporationState}.

IN WITNESS WHEREOF, the undersigned have caused this Safe to be duly executed and delivered.

**${input.company.legalName}** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **INVESTOR: ${input.investorName}**

_____________________________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________
`;
}

export function convertibleNote(input: {
  company: CompanyInfo;
  investorName: string;
  principal: number;
  interestRate: number;
  maturityDate: Date | string;
  valuationCap?: number | null;
  discountPercent?: number | null;
  qualifiedFinancing?: number | null;
  date: Date | string;
}) {
  return `# ${input.company.legalName}
## Convertible Promissory Note

**Principal Amount:** ${fmtMoney(input.principal, 0)} &nbsp;&nbsp;&nbsp; **Issue Date:** ${fmtDate(input.date)}

FOR VALUE RECEIVED, ${input.company.legalName}, a ${input.company.incorporationState} corporation (the "Company"), promises to pay to **${input.investorName}** (the "Holder") the principal sum of ${fmtMoney(input.principal, 0)} together with simple interest at **${input.interestRate}% per annum**, on the terms set forth below.

| Term | Value |
|---|---|
| Interest rate | ${input.interestRate}% simple, non-compounding |
| Maturity date | ${fmtDate(input.maturityDate)} |
| Valuation cap | ${input.valuationCap ? fmtMoney(input.valuationCap, 0) : "None"} |
| Conversion discount | ${input.discountPercent ? `${input.discountPercent}%` : "None"} |
| Qualified financing threshold | ${input.qualifiedFinancing ? fmtMoney(input.qualifiedFinancing, 0) : "$1,000,000"} |

**1. Conversion upon Qualified Financing.** Upon the closing of a Qualified Financing, the outstanding principal and accrued interest will automatically convert into the equity securities issued in such financing at a price per share equal to the lesser of (a) the price per share paid by investors in the Qualified Financing multiplied by (100% minus the Conversion Discount) and (b) the Valuation Cap divided by the Company's fully-diluted capitalization immediately prior to the closing.

**2. Maturity.** If not converted before the Maturity Date, the Holder may elect to have the outstanding balance repaid or converted into Common Stock at the Valuation Cap price.

**3. Change of Control.** Upon a Change of Control prior to conversion, the Holder will receive the greater of (a) 2x the outstanding balance or (b) the amount the Holder would receive had the Note converted immediately prior to the Change of Control.

**4. Governing law.** This Note is governed by the laws of the State of ${input.company.incorporationState}.

**${input.company.legalName}** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **HOLDER: ${input.investorName}**

_____________________________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________
`;
}

export function boardConsentDocument(input: {
  company: CompanyInfo;
  title: string;
  body: string;
  effectiveDate: Date | string | null;
  signers: { name: string; status: string; signedAt?: Date | string | null }[];
  exhibits: { label: string; description: string }[];
}) {
  return `# ${input.company.legalName}
## Action by Unanimous Written Consent of the Board of Directors
### ${input.title}

The undersigned, being all of the members of the Board of Directors (the "Board") of ${input.company.legalName}, a ${input.company.incorporationState} corporation (the "Company"), pursuant to Section 141(f) of the Delaware General Corporation Law and the Company's Bylaws, hereby adopt the following resolutions by written consent, effective as of ${fmtDate(input.effectiveDate)}.

${input.body}

${input.exhibits.length ? `### Exhibits\n\n${input.exhibits.map((e) => `- **${e.label}** — ${e.description}`).join("\n")}\n` : ""}

This written consent may be executed in counterparts and by electronic signature, each of which shall be deemed an original.

### Directors

${input.signers.map((s) => `| ${s.name} | ${s.status === "SIGNED" ? `Signed ${fmtDate(s.signedAt)}` : "_____________________________"} |`).join("\n")}
`;
}

export function valuationReportSummary(input: {
  company: CompanyInfo;
  valuationDate: Date | string;
  fmv: number;
  preferredPrice?: number | null;
  enterpriseValue?: number | null;
  equityValue?: number | null;
  methodology?: string | null;
  dlomPercent?: number | null;
  volatility?: number | null;
  riskFreeRate?: number | null;
  timeToLiquidity?: number | null;
  provider: string;
  analyst?: string | null;
}) {
  return `# ${input.company.legalName}
## 409A Valuation Report — Summary of Conclusions

**Valuation date:** ${fmtDate(input.valuationDate)} &nbsp;&nbsp; **Prepared by:** ${input.provider}${input.analyst ? ` (${input.analyst})` : ""}

### Conclusion of value

| | |
|---|---|
| Fair market value per share of Common Stock | **${fmtMoney(input.fmv, 2)}** |
| Most recent preferred price per share | ${input.preferredPrice != null ? fmtMoney(input.preferredPrice, 2) : "—"} |
| Enterprise value | ${input.enterpriseValue != null ? fmtMoney(input.enterpriseValue, 0) : "—"} |
| Equity value | ${input.equityValue != null ? fmtMoney(input.equityValue, 0) : "—"} |

### Methodology

The valuation was prepared in accordance with IRC Section 409A, the AICPA Practice Aid *Valuation of Privately-Held-Company Equity Securities Issued as Compensation*, and ASC 820. Enterprise value was determined using the ${input.methodology === "BACKSOLVE" ? "market approach (backsolve to the most recent arm's-length financing)" : input.methodology === "PWERM" ? "probability-weighted expected return method" : input.methodology === "OPM" ? "option pricing method" : input.methodology === "HYBRID" ? "hybrid of the option pricing method and PWERM" : "market and income approaches"} and allocated across share classes using the Option Pricing Method (OPM).

| Assumption | Value |
|---|---|
| Expected volatility | ${input.volatility != null ? `${(input.volatility * 100).toFixed(1)}%` : "—"} |
| Risk-free rate | ${input.riskFreeRate != null ? `${(input.riskFreeRate * 100).toFixed(2)}%` : "—"} |
| Time to liquidity | ${input.timeToLiquidity != null ? `${input.timeToLiquidity} years` : "—"} |
| Discount for lack of marketability | ${input.dlomPercent != null ? `${input.dlomPercent}%` : "—"} |

### Safe harbor

This report is intended to establish a presumption of reasonableness under Treasury Regulation §1.409A-1(b)(5)(iv)(B)(2)(i) (independent appraisal) for equity awards granted within 12 months of the valuation date, absent a material event.
`;
}

export function offerLetterDocument(input: {
  company: CompanyInfo;
  candidateName: string;
  title: string;
  startDate?: Date | string | null;
  salary?: number | null;
  bonus?: number | null;
  equityQuantity: number;
  equityType: string;
  strikePrice?: number | null;
  vestingDescription: string;
  expiresAt?: Date | string | null;
  fullyDiluted?: number | null;
  message?: string | null;
}) {
  const pct = input.fullyDiluted ? ((input.equityQuantity / input.fullyDiluted) * 100).toFixed(3) : null;
  return `# ${input.company.legalName}
## Offer of Employment

Dear ${input.candidateName},

${input.message ?? `We are thrilled to offer you the position of **${input.title}** at ${input.company.legalName.replace(/\.$/, "")}. We believe you will be a tremendous addition to the team.`}

| | |
|---|---|
| Position | ${input.title} |
| Start date | ${fmtDate(input.startDate)} |
| Base salary | ${input.salary != null ? `${fmtMoney(input.salary, 0)} per year` : "—"} |
| Target bonus | ${input.bonus != null ? fmtMoney(input.bonus, 0) : "—"} |
| Equity | ${fmtNum(input.equityQuantity)} ${input.equityType === "RSU" ? "restricted stock units" : input.equityType === "RSA" ? "shares of restricted stock" : "stock options"}${pct ? ` (~${pct}% fully diluted)` : ""} |
| Exercise price | ${input.strikePrice != null ? `${fmtMoney(input.strikePrice, 2)} per share (subject to board approval at the then-current 409A fair market value)` : "—"} |
| Vesting | ${input.vestingDescription} |

**Equity.** Subject to approval by the Board of Directors, you will be granted the equity award described above under the Company's equity incentive plan. The award will be governed by the plan and the applicable award agreement.

**At-will employment.** Your employment with the Company is at will and may be terminated by you or the Company at any time, with or without cause.

**Confidentiality.** As a condition of employment you will sign the Company's Confidential Information and Invention Assignment Agreement.

${input.expiresAt ? `This offer expires on ${fmtDate(input.expiresAt)}.` : ""}

We look forward to working with you.

Sincerely,
${input.company.legalName}
`;
}

export function election83b(input: {
  company: CompanyInfo;
  holderName: string;
  holderAddress?: string | null;
  taxId?: string | null;
  shares: number;
  className: string;
  transferDate: Date | string;
  fmvPerShare: number;
  pricePaidPerShare: number;
  taxYear: number;
}) {
  const fmvTotal = input.shares * input.fmvPerShare;
  const paidTotal = input.shares * input.pricePaidPerShare;
  return `# Election Under Section 83(b) of the Internal Revenue Code

The undersigned taxpayer hereby elects, pursuant to Section 83(b) of the Internal Revenue Code of 1986, as amended, to include in gross income for the taxable year **${input.taxYear}** the excess (if any) of the fair market value of the property described below over the amount paid for such property.

1. **Taxpayer:** ${input.holderName}
   **Address:** ${input.holderAddress ?? "____________________"}
   **Taxpayer identification number:** ${input.taxId ?? "___-__-____"}
2. **Property:** ${fmtNum(input.shares)} shares of ${input.className} of ${input.company.legalName}.
3. **Date of transfer:** ${fmtDate(input.transferDate)}. Taxable year: ${input.taxYear}.
4. **Restrictions:** The shares are subject to a repurchase right in favor of the Company that lapses over time based on continued service.
5. **Fair market value at transfer (disregarding lapse restrictions):** ${fmtMoney(input.fmvPerShare, 4)} per share, ${fmtMoney(fmvTotal, 2)} total.
6. **Amount paid:** ${fmtMoney(input.pricePaidPerShare, 4)} per share, ${fmtMoney(paidTotal, 2)} total.
7. **Amount to include in gross income:** ${fmtMoney(Math.max(0, fmvTotal - paidTotal), 2)}.

The undersigned will file this election with the Internal Revenue Service office with which the taxpayer files their annual income tax return not later than 30 days after the date of transfer, and has furnished a copy to the Company.

Dated: ____________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________ (Taxpayer)
`;
}

export function form3921(input: {
  company: CompanyInfo;
  ein?: string | null;
  taxYear: number;
  employeeName: string;
  employeeAddress?: string | null;
  employeeTin?: string | null;
  grantDate: Date | string;
  exerciseDate: Date | string;
  exercisePrice: number;
  fmv: number;
  shares: number;
}) {
  return `# Form 3921 — Exercise of an Incentive Stock Option Under Section 422(b)
## Tax year ${input.taxYear}

| Box | Field | Value |
|---|---|---|
| — | Transferor (Company) | ${input.company.legalName}${input.ein ? `, EIN ${input.ein}` : ""} |
| — | Employee | ${input.employeeName} |
| — | Employee address | ${input.employeeAddress ?? "—"} |
| — | Employee TIN | ${input.employeeTin ?? "—"} |
| 1 | Date option granted | ${fmtDate(input.grantDate)} |
| 2 | Date option exercised | ${fmtDate(input.exerciseDate)} |
| 3 | Exercise price per share | ${fmtMoney(input.exercisePrice, 2)} |
| 4 | Fair market value per share on exercise date | ${fmtMoney(input.fmv, 2)} |
| 5 | Number of shares transferred | ${fmtNum(input.shares)} |
| 6 | If other than transferor, name of corporation whose stock is being transferred | — |

Copy A is filed with the IRS (due ${input.taxYear + 1}-02-28 on paper or ${input.taxYear + 1}-03-31 electronically). Copy B is furnished to the employee by January 31, ${input.taxYear + 1}. Copy C is retained by the Company.
`;
}

export function rule701Disclosure(input: { company: CompanyInfo; asOf: Date | string; planName: string; totalSalesTwelveMonths: number }) {
  return `# ${input.company.legalName}
## Rule 701 Disclosure Statement

As of ${fmtDate(input.asOf)}, ${input.company.legalName} has issued securities under the ${input.planName} with an aggregate sales price of ${fmtMoney(input.totalSalesTwelveMonths, 0)} during the preceding 12-month period, exceeding the $10,000,000 threshold under Rule 701(e) of the Securities Act of 1933.

Accordingly, the Company is furnishing the following to each award holder a reasonable period of time before the date of sale:

1. A copy of the summary plan description for the ${input.planName};
2. Information about the risks associated with investment in the securities; and
3. Financial statements required to be furnished by Part F/S of Form 1-A under Regulation A, as of a date no more than 180 days before the sale.

These materials are available in the Documents section of the equity portal. Please review them carefully before exercising any award.
`;
}

export function vestingDescription(schedule: { type: string; totalMonths: number; cliffMonths: number; frequency: string; cliffPercent?: number | null } | null | undefined) {
  if (!schedule) return "Fully vested at grant.";
  if (schedule.type === "IMMEDIATE") return "Fully vested at grant.";
  if (schedule.type === "MILESTONE") return "Vests upon achievement of the performance milestones set out in the award agreement.";
  const years = schedule.totalMonths / 12;
  const freq = { MONTHLY: "monthly", QUARTERLY: "quarterly", ANNUALLY: "annually", DAILY: "daily" }[schedule.frequency] ?? "monthly";
  const yearsText = Number.isInteger(years) ? `${years} year${years === 1 ? "" : "s"}` : `${schedule.totalMonths} months`;
  if (schedule.cliffMonths > 0) {
    const cliffPct = schedule.cliffPercent ?? Math.round((schedule.cliffMonths / schedule.totalMonths) * 100);
    return `Vests over ${yearsText}: ${cliffPct}% vests on the ${schedule.cliffMonths}-month anniversary of the vesting commencement date, and the remainder vests ${freq} thereafter.`;
  }
  return `Vests ${freq} in equal installments over ${yearsText} from the vesting commencement date.`;
}
