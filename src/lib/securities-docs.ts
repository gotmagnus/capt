// Document templates for security types not covered by the shared template module.

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

export function rsuAwardNotice(input: {
  company: CompanyInfo;
  planName: string;
  awardNumber: string;
  holderName: string;
  quantity: number;
  grantDate: Date | string;
  vestingStart: Date | string;
  vestingDescription: string;
}) {
  return `# ${input.company.legalName}
## ${input.planName}
### Notice of Restricted Stock Unit Award — ${input.awardNumber}

${input.company.legalName} (the "Company") hereby grants to the Participant named below an award of Restricted Stock Units ("RSUs") under the ${input.planName} (the "Plan"), subject to the terms of the Plan and the RSU Award Agreement.

| | |
|---|---|
| Participant | ${input.holderName} |
| Award number | ${input.awardNumber} |
| Date of grant | ${fmtDate(input.grantDate)} |
| Vesting commencement date | ${fmtDate(input.vestingStart)} |
| Number of RSUs | ${fmtNum(input.quantity)} |

**Vesting.** ${input.vestingDescription}

**Settlement.** Each vested RSU will be settled in one share of the Company's Common Stock as soon as practicable following the applicable vesting date, subject to applicable tax withholding.

**Tax matters.** RSUs are taxed as ordinary income at settlement based on the fair market value of the shares delivered. The Participant should consult a tax advisor.

By accepting this award electronically, the Participant acknowledges receipt of the Plan and the RSU Award Agreement and agrees to be bound by their terms.

_____________________________ &nbsp;&nbsp;&nbsp;&nbsp; _____________________________
${input.company.legalName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Participant
`;
}

export function warrantCertificate(input: {
  company: CompanyInfo;
  warrantNumber: string;
  holderName: string;
  quantity: number;
  className: string;
  exercisePrice: number;
  issueDate: Date | string;
  expirationDate?: Date | string | null;
}) {
  return `# ${input.company.legalName}
## Warrant to Purchase ${input.className} — ${input.warrantNumber}

THIS CERTIFIES THAT, for value received, **${input.holderName}** (the "Holder") is entitled, subject to the terms and conditions of this Warrant, to purchase from ${input.company.legalName}, a ${input.company.incorporationState} corporation (the "Company"), up to **${fmtNum(input.quantity)}** shares of ${input.className} (the "Warrant Shares") at an exercise price of **${fmtMoney(input.exercisePrice, 2)}** per share (the "Exercise Price").

| | |
|---|---|
| Holder | ${input.holderName} |
| Warrant number | ${input.warrantNumber} |
| Issue date | ${fmtDate(input.issueDate)} |
| Number of Warrant Shares | ${fmtNum(input.quantity)} |
| Exercise Price | ${fmtMoney(input.exercisePrice, 2)} |
| Expiration date | ${fmtDate(input.expirationDate)} |

**1. Exercise.** This Warrant may be exercised in whole or in part at any time prior to the Expiration Date by delivery of a notice of exercise and payment of the aggregate Exercise Price in cash or, at the Holder's election, by net exercise.

**2. Adjustments.** The number of Warrant Shares and the Exercise Price are subject to proportional adjustment for stock splits, stock dividends, reclassifications and similar events.

**3. Transfer.** This Warrant may not be transferred without the prior written consent of the Company, except to an affiliate of the Holder.

**4. Governing law.** This Warrant is governed by the laws of the State of ${input.company.incorporationState}.

_____________________________
${input.company.legalName}
`;
}
