# Feature parity — Capt vs. Pulley vs. Carta

Reference features were taken from pulley.com (product & pricing pages) and carta.com (cap table, scenario modeling, employee portal, compliance, board consents). ✅ implemented · ◐ implemented as a workflow with the external integration stubbed · — out of scope.

| Capability | Pulley | Carta | Capt |
| --- | --- | --- | --- |
| Real-time cap table (outstanding & fully diluted, by holder / by class) | ✅ | ✅ | ✅ `/cap-table` |
| As-of-date historical cap table from the ledger | ✅ | ✅ | ✅ `?asOf=` |
| Share classes with liquidation prefs, participation, seniority, anti-dilution | ✅ | ✅ | ✅ `/share-classes` |
| Common, preferred, ISO/NSO, RSU, RSA, warrants, SAFEs, notes | ✅ | ✅ | ✅ `/securities` |
| Issuance wizard with generated agreements & e-signature | ✅ | ✅ | ✅ `/securities/new`, `/sign/[token]` |
| Share certificates | ✅ | ✅ | ✅ generated per security |
| Vesting templates (cliff, monthly/quarterly, milestone, acceleration) | ✅ | ✅ | ✅ `/vesting-schedules` |
| Option pool / equity plan management | ✅ | ✅ | ✅ `/equity-plans` |
| Transactions ledger, transfers, repurchases, cancellations, stock splits | ✅ | ✅ | ✅ `/transactions` |
| Stakeholder management & portal invitations | ✅ | ✅ | ✅ `/stakeholders` |
| Fundraise / pro-forma round modeler with SAFE conversion & pool top-up | ✅ | ✅ | ✅ `/modeling` |
| Dilution sensitivity, saved scenarios, Excel export | ✅ | ✅ | ✅ |
| Exit waterfall (preferences, participation caps, conversion, options) | ✅ | ✅ | ✅ `/modeling/exit` |
| SAFE & convertible note builders (YC forms, MFN, pro-rata) | ✅ | ✅ | ✅ `/fundraising/safes/new`, `/notes/new` |
| Round closing (issue preferred, convert instruments, pool increase) | ✅ | ✅ | ✅ `/fundraising/rounds/[id]` |
| Term-sheet scanner | ✅ | — | ✅ `/fundraising/term-sheet` |
| 409A valuation requests, delivery, acceptance, FMV history | ✅ | ✅ | ◐ `/valuations` (in-house analyst flow simulated) |
| Board consents with exhibits, signers, approval effects | ✅ | ✅ | ✅ `/board` |
| Rule 701 monitoring & disclosure | ✅ | ✅ | ✅ `/compliance/rule-701` |
| ISO $100K limit split | ✅ | ✅ | ✅ `/compliance/iso-limit` |
| 83(b) election tracking & forms | ✅ | ✅ | ✅ `/compliance/83b` |
| Form 3921 generation | ✅ | ✅ | ✅ `/compliance/form-3921` |
| ASC 718 stock-based compensation reporting (GAAP) | ✅ (Enterprise) | ✅ | ✅ `/compliance/asc-718` |
| Data room / documents with folders, visibility, versions | ✅ | ✅ | ✅ `/documents` |
| Audit log | ✅ | ✅ | ✅ `/audit-log` |
| Employee portal (holdings, vesting, exercise, documents, tax) | ✅ | ✅ | ✅ `/portal/[companyId]` |
| Exercise simulator (cost, AMT, withholding, holding periods) | ✅ | ✅ | ✅ `/portal/[companyId]/exercise` |
| Option exercise workflow (request → approve → pay → issue) | ✅ | ✅ | ◐ `/exercises` (ACH/wire stubbed) |
| Investor portal & permissioned views | ✅ | ✅ | ✅ `/portal/[companyId]/ownership` |
| Interactive offer letters with alternative packages | ✅ | ✅ (Total Comp) | ✅ `/offers`, `/offer/[token]` |
| Hiring planner, refresh grant planner, pool forecast | — | ✅ | ✅ `/employees` |
| Communications hub / investor updates with open tracking | ✅ | — | ✅ `/updates`, `/u/[token]` |
| Tender offers / secondary liquidity | ✅ (NPM) | ✅ | ◐ `/liquidity` (NPM integration stubbed) |
| HRIS / accounting / Slack / e-sign integrations | ✅ | ✅ | ◐ `/settings/integrations` (connection & sync stubbed) |
| Reports & exports (CSV / Excel) | ✅ | ✅ | ✅ `/reports` |
| Role-based access (admin, legal, finance, board, employee, investor) | ✅ | ✅ | ✅ |
| Multi-company workspace | ✅ | ✅ | ✅ company switcher |
| CSV cap table import | ✅ | ✅ | ✅ `/settings/data` |
| Pricing tiers (Startup / Growth / Enterprise) | ✅ | ✅ | ✅ `/settings/billing` |
| Token / crypto cap tables & distributions | ✅ | — | — |
| Fund administration / SPVs (for VC firms) | — | ✅ | — |
| LLC profits interests | ✅ | ✅ | ◐ security type exists; no LLC-specific reporting |
