export interface FaqSection {
  id: string;
  title: string;
  audience: "company" | "employee" | "both";
  items: { q: string; a: string }[];
}

export const FAQ: FaqSection[] = [
  {
    id: "cap-table",
    title: "Cap table basics",
    audience: "company",
    items: [
      { q: "What is the difference between outstanding and fully diluted shares?", a: "Outstanding shares are shares that have actually been issued and are held by stockholders (common and preferred, counted as-converted). Fully diluted adds everything that could become shares: unexercised options and warrants, unsettled RSUs and the unallocated option pool. Ownership percentages on term sheets are almost always quoted on a fully diluted basis." },
      { q: "Why don't SAFEs and convertible notes appear in the fully diluted count?", a: "Their share count isn't known until they convert at a priced round. Capt lists them separately as unconverted instruments and models their conversion in the round modeler so you can see the post-conversion ownership." },
      { q: "How are certificate numbers assigned?", a: "Each share class and instrument type has a prefix (CS for common, PS-A for Series A, ES for option grants, SAFE, CN, W). Numbers increment per prefix and are never reused, so a certificate number uniquely identifies a security for the life of the company." },
      { q: "Can I see the cap table as of a past date?", a: "Yes. The cap table and most reports accept an as-of date. Capt reconstructs holdings from the transaction ledger, unwinding exercises, cancellations and transfers that happened after that date." },
      { q: "What does 'as-converted' mean for preferred stock?", a: "Preferred shares convert into common at a conversion ratio (usually 1:1, but it changes after anti-dilution adjustments or stock splits). As-converted counts show how many common shares the preferred would become, which is how voting and ownership percentages are calculated." },
    ],
  },
  {
    id: "409a",
    title: "409A & fair market value",
    audience: "both",
    items: [
      { q: "What is a 409A valuation?", a: "An independent appraisal of the fair market value (FMV) of a private company's common stock. Under IRC Section 409A, options must be granted with an exercise price at or above FMV; a qualifying independent valuation gives the company a 'safe harbor' presumption that the price is reasonable." },
      { q: "How often do we need a new one?", a: "At least every 12 months, and sooner after a material event such as a priced financing round, a major contract, an acquisition offer or a significant change in projections. The dashboard warns 60 days before the current valuation expires." },
      { q: "Why is the common FMV lower than the price investors paid?", a: "Investors buy preferred stock with liquidation preferences, anti-dilution protection and other rights. Common stock lacks those rights and is illiquid, so appraisers apply an allocation method (usually OPM) and a discount for lack of marketability (DLOM)." },
      { q: "Does FMV affect existing grants?", a: "No. An option's exercise price is fixed at grant. A new FMV only affects the strike price of future grants and the spread (taxable gain) calculation when options are exercised." },
    ],
  },
  {
    id: "iso-nso",
    title: "ISO vs NSO",
    audience: "both",
    items: [
      { q: "What's the difference between an ISO and an NSO?", a: "Incentive Stock Options (ISOs) can only go to employees and get favorable tax treatment: no ordinary income at exercise (though the spread counts for AMT) and long-term capital gains if holding periods are met. Non-qualified Stock Options (NSOs) can go to anyone; the spread at exercise is ordinary income subject to withholding." },
      { q: "What is the $100,000 ISO limit?", a: "Only $100,000 worth of ISOs (valued at the grant-date FMV) may first become exercisable in any calendar year. Anything above that is automatically treated as an NSO. Capt's compliance page splits grants accordingly." },
      { q: "What happens to my options when I leave?", a: "Unvested options are cancelled and return to the pool. Vested options usually remain exercisable for a post-termination exercise period (commonly 90 days for ISOs to keep their tax status). After that they expire." },
    ],
  },
  {
    id: "83b",
    title: "83(b) elections",
    audience: "both",
    items: [
      { q: "What is an 83(b) election?", a: "A letter filed with the IRS within 30 days of receiving restricted stock (or early-exercising options) electing to be taxed on the value at grant rather than as the shares vest. For early-stage stock with a near-zero value this usually means little or no tax now and capital gains later." },
      { q: "What if the 30-day deadline is missed?", a: "There is no extension. Without an election, each vesting tranche is taxed as ordinary income at its then-current value. Capt tracks the deadline for every restricted grant and reminds holders in the portal." },
      { q: "Do I need an 83(b) for regular options?", a: "No. Standard options are not taxed at grant. An 83(b) only matters for restricted stock awards and options that are exercised before they vest (early exercise)." },
    ],
  },
  {
    id: "safes",
    title: "SAFEs & convertible notes",
    audience: "company",
    items: [
      { q: "How does a post-money SAFE convert?", a: "The SAFE holder's ownership equals the purchase amount divided by the post-money valuation cap, measured after all SAFEs convert but before new money in the priced round. The conversion price is the cap divided by the company capitalization including converting SAFEs and the pool top-up. If the SAFE has a discount, the holder gets whichever price is lower." },
      { q: "What is the difference from a pre-money SAFE?", a: "A pre-money SAFE's conversion price uses the capitalization before any SAFEs convert, so each additional SAFE dilutes every other SAFE holder. Post-money SAFEs (the YC standard since 2018) fix each investor's ownership and put the dilution on founders instead." },
      { q: "What does MFN mean?", a: "Most Favored Nation: if the company later issues a SAFE with better terms (lower cap, bigger discount), the MFN holder may adopt those terms. Capt applies MFN automatically in the round modeler when enabled." },
      { q: "How is interest on a convertible note handled?", a: "Simple or compound interest accrues from the issue date at the note's rate and is added to the principal when the note converts. The convertibles report shows accrued interest as of any date." },
    ],
  },
  {
    id: "vesting",
    title: "Vesting & acceleration",
    audience: "both",
    items: [
      { q: "What does '4 years, 1 year cliff, monthly' mean?", a: "Nothing vests during the first 12 months. On the one-year anniversary of the vesting start date, 25% vests at once (the cliff). The remaining 75% vests in equal monthly installments over the following 36 months." },
      { q: "What are single- and double-trigger acceleration?", a: "Single-trigger accelerates unvested equity when the company is acquired. Double-trigger requires two events: an acquisition and a qualifying termination (typically without cause) within a window afterwards. Double-trigger is the norm for employees; single-trigger is common for advisors." },
      { q: "How are fractional shares handled?", a: "Shares vest in whole units. Capt floors each tranche and rolls the remainder forward so the final tranche completes the grant exactly." },
      { q: "Does vesting continue on leave?", a: "It depends on the plan and local law. Companies often pause vesting for unpaid leave longer than a set period. Record a termination or vesting modification in Capt to reflect the outcome." },
    ],
  },
  {
    id: "compliance",
    title: "Rule 701 & Form 3921",
    audience: "company",
    items: [
      { q: "What is Rule 701?", a: "The securities-law exemption private companies rely on to issue equity to employees without registering the offering. In any 12-month period, compensatory issuances may not exceed the greatest of $1 million, 15% of total assets, or 15% of the outstanding class. Above $10 million in sales, enhanced disclosure (financial statements and risk factors) must be delivered to holders." },
      { q: "What counts toward the Rule 701 limit?", a: "For options, the aggregate exercise price of options granted (not exercised). For restricted stock and RSUs, the fair market value at grant. Capt aggregates these on a rolling 12-month basis." },
      { q: "When is Form 3921 due?", a: "Form 3921 reports each ISO exercise. Copy B goes to the employee by January 31 of the year after exercise; Copy A goes to the IRS by February 28 (paper) or March 31 (electronic). Capt generates all copies from the exercise record." },
    ],
  },
  {
    id: "exercising",
    title: "Exercising options",
    audience: "employee",
    items: [
      { q: "How do I exercise?", a: "In the portal, open Exercise, pick a grant, choose how many vested options to exercise and submit a request. The company approves it, you pay the exercise price (and any withholding for NSOs), and shares are issued to you with a new certificate." },
      { q: "What will it cost?", a: "The exercise price times the number of options, plus tax withholding for NSOs. ISO exercises have no withholding but the spread may trigger Alternative Minimum Tax. The simulator estimates all of these — it's an estimate, not tax advice." },
      { q: "What is a cashless or net exercise?", a: "Instead of paying cash, some plans let you surrender part of the option's value to cover the exercise price (net exercise) or sell shares immediately in a liquidity event (cashless). Availability depends on your plan and company approval." },
      { q: "Should I exercise early?", a: "Early exercise lets you buy unvested shares (subject to repurchase if you leave) and file an 83(b) to start the capital gains clock while the spread is small. It ties up cash and carries risk; talk to a tax advisor." },
    ],
  },
  {
    id: "board",
    title: "Board consents",
    audience: "company",
    items: [
      { q: "Why do option grants need board approval?", a: "Under most equity plans and Delaware law, equity awards must be approved by the board (or a committee). Capt drafts a written consent listing the grants as an exhibit, collects director signatures and links the approval to each grant." },
      { q: "What is a unanimous written consent?", a: "A resolution adopted by all directors signing a document instead of holding a meeting. It's the standard way private companies approve grants, valuations and financings between board meetings." },
      { q: "Can a consent be approved with fewer than all signatures?", a: "Written consents generally require unanimity unless the bylaws permit otherwise. Capt marks a consent approved when every listed signer has signed, or when the configured required-approval threshold is met." },
    ],
  },
];

export const GLOSSARY: { term: string; definition: string }[] = [
  { term: "409A valuation", definition: "Independent appraisal of common stock fair market value used to set option exercise prices." },
  { term: "83(b) election", definition: "IRS filing (within 30 days) to be taxed on restricted stock at grant instead of at vesting." },
  { term: "Acceleration", definition: "Vesting of unvested equity earlier than scheduled, typically on a change of control." },
  { term: "AMT", definition: "Alternative Minimum Tax — a parallel tax calculation that can be triggered by the spread on ISO exercises." },
  { term: "Anti-dilution", definition: "Adjustment to preferred conversion price if the company later sells shares at a lower price (broad-based weighted average is standard)." },
  { term: "As-converted", definition: "Preferred stock counted as the number of common shares it would convert into." },
  { term: "ASC 718", definition: "US GAAP standard for expensing stock-based compensation over the vesting period." },
  { term: "Authorized shares", definition: "Maximum shares a company may issue under its charter, per class." },
  { term: "Black-Scholes", definition: "Option pricing model used to estimate the fair value of options for ASC 718 expense." },
  { term: "Cliff", definition: "Period at the start of a vesting schedule during which nothing vests; a lump vests at its end." },
  { term: "Conversion price", definition: "Price per share at which a SAFE or note converts into equity." },
  { term: "Convertible note", definition: "Debt that converts to equity at a financing, usually with interest, a cap and/or a discount." },
  { term: "Discount", definition: "Percentage reduction to the round price a SAFE or note holder receives on conversion." },
  { term: "DLOM", definition: "Discount for lack of marketability applied in 409A valuations to illiquid private stock." },
  { term: "Double-trigger", definition: "Acceleration requiring both a change of control and a qualifying termination." },
  { term: "Exercise price (strike)", definition: "Fixed price per share an option holder pays to buy the underlying shares." },
  { term: "FMV", definition: "Fair market value — the appraised value of one share of common stock." },
  { term: "Fully diluted", definition: "All outstanding shares plus everything convertible into shares: options, warrants, RSUs and the unallocated pool." },
  { term: "ISO", definition: "Incentive stock option — employee-only option with favorable tax treatment under IRC §422." },
  { term: "Liquidation preference", definition: "Amount preferred holders receive before common in an exit, expressed as a multiple of the original issue price." },
  { term: "MFN", definition: "Most favored nation — right of a SAFE holder to adopt better terms offered to later investors." },
  { term: "NSO", definition: "Non-qualified stock option — option without ISO tax treatment; spread at exercise is ordinary income." },
  { term: "Option pool", definition: "Shares reserved under an equity incentive plan for grants to employees, advisors and consultants." },
  { term: "Participating preferred", definition: "Preferred that receives its preference and then shares in the remaining proceeds with common." },
  { term: "Post-money valuation", definition: "Company value immediately after a financing: pre-money plus new money." },
  { term: "Pro rata right", definition: "Investor's right to buy enough of a future round to maintain their ownership percentage." },
  { term: "PTEP", definition: "Post-termination exercise period — time after leaving during which vested options may still be exercised." },
  { term: "RSA", definition: "Restricted stock award — actual shares issued at grant, subject to a repurchase right that lapses as they vest." },
  { term: "RSU", definition: "Restricted stock unit — a promise to deliver shares when vesting (and sometimes a liquidity) condition is met." },
  { term: "Rule 701", definition: "Securities Act exemption for compensatory equity issuances by private companies, with annual limits." },
  { term: "SAFE", definition: "Simple Agreement for Future Equity — converts to preferred at the next priced round; not debt." },
  { term: "Seniority", definition: "Order in which preferred classes are paid their liquidation preference in an exit." },
  { term: "Spread", definition: "Difference between FMV and exercise price on the exercised shares; the taxable gain at exercise." },
  { term: "Tender offer", definition: "Structured secondary transaction where a buyer offers to purchase shares from many holders at a set price." },
  { term: "Valuation cap", definition: "Maximum valuation at which a SAFE or note converts, protecting early investors from high round prices." },
  { term: "Vesting commencement date", definition: "Date from which vesting is measured — often the start date, which may precede the grant date." },
  { term: "Warrant", definition: "Right to purchase shares at a fixed price, usually issued to lenders or partners rather than employees." },
  { term: "Waterfall", definition: "Allocation of exit proceeds across share classes in order of preference, then pro rata." },
];
