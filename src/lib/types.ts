// String-typed enums shared by the Prisma schema, the engine and the UI.

export const ROLES = ["ADMIN", "LEGAL", "FINANCE", "BOARD", "EMPLOYEE", "INVESTOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  LEGAL: "Legal",
  FINANCE: "Finance",
  BOARD: "Board member",
  EMPLOYEE: "Employee",
  INVESTOR: "Investor",
  VIEWER: "Viewer",
};

/** Roles that can see the full company workspace (vs. the stakeholder portal). */
export const WORKSPACE_ROLES: Role[] = ["ADMIN", "LEGAL", "FINANCE", "BOARD", "VIEWER"];
/** Roles that can mutate cap table data. */
export const EDITOR_ROLES: Role[] = ["ADMIN", "LEGAL", "FINANCE"];

export const STAKEHOLDER_RELATIONSHIPS = [
  "FOUNDER",
  "EMPLOYEE",
  "ADVISOR",
  "INVESTOR",
  "BOARD_MEMBER",
  "CONSULTANT",
  "FORMER_EMPLOYEE",
  "OTHER",
] as const;
export type StakeholderRelationship = (typeof STAKEHOLDER_RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<StakeholderRelationship, string> = {
  FOUNDER: "Founder",
  EMPLOYEE: "Employee",
  ADVISOR: "Advisor",
  INVESTOR: "Investor",
  BOARD_MEMBER: "Board member",
  CONSULTANT: "Consultant",
  FORMER_EMPLOYEE: "Former employee",
  OTHER: "Other",
};

export const SECURITY_TYPES = [
  "COMMON_SHARES",
  "PREFERRED_SHARES",
  "OPTION_ISO",
  "OPTION_NSO",
  "RSU",
  "RSA",
  "WARRANT",
  "SAFE",
  "CONVERTIBLE_NOTE",
  "PROFITS_INTEREST",
] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const SECURITY_TYPE_LABELS: Record<SecurityType, string> = {
  COMMON_SHARES: "Common stock",
  PREFERRED_SHARES: "Preferred stock",
  OPTION_ISO: "ISO",
  OPTION_NSO: "NSO",
  RSU: "RSU",
  RSA: "Restricted stock",
  WARRANT: "Warrant",
  SAFE: "SAFE",
  CONVERTIBLE_NOTE: "Convertible note",
  PROFITS_INTEREST: "Profits interest",
};

export const SHARE_TYPES: SecurityType[] = ["COMMON_SHARES", "PREFERRED_SHARES", "RSA"];
export const OPTION_TYPES: SecurityType[] = ["OPTION_ISO", "OPTION_NSO"];
export const EXERCISABLE_TYPES: SecurityType[] = ["OPTION_ISO", "OPTION_NSO", "WARRANT"];
export const CONVERTIBLE_TYPES: SecurityType[] = ["SAFE", "CONVERTIBLE_NOTE"];
export const PLAN_TYPES: SecurityType[] = ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"];

export const SECURITY_STATUSES = [
  "DRAFT",
  "PENDING_SIGNATURE",
  "OUTSTANDING",
  "EXERCISED",
  "CANCELLED",
  "REPURCHASED",
  "CONVERTED",
  "EXPIRED",
  "TRANSFERRED",
  "FORFEITED",
] as const;
export type SecurityStatus = (typeof SECURITY_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_SIGNATURE: "Pending signature",
  OUTSTANDING: "Outstanding",
  EXERCISED: "Fully exercised",
  CANCELLED: "Cancelled",
  REPURCHASED: "Repurchased",
  CONVERTED: "Converted",
  EXPIRED: "Expired",
  TRANSFERRED: "Transferred",
  FORFEITED: "Forfeited",
  REQUESTED: "Requested",
  IN_PROGRESS: "In progress",
  DRAFT_DELIVERED: "Draft delivered",
  ACCEPTED: "Accepted",
  SUPERSEDED: "Superseded",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  PENDING: "Pending",
  SIGNED: "Signed",
  DECLINED: "Declined",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  COMPLETED: "Completed",
  PLANNED: "Planned",
  OPEN: "Open",
  CLOSED: "Closed",
  SETTLED: "Settled",
  PUBLISHED: "Published",
  VIEWED: "Viewed",
  ACTIVE: "Active",
  TERMINATED: "Terminated",
  CONNECTED: "Connected",
  DISCONNECTED: "Not connected",
  SYNCING: "Syncing",
  ERROR: "Error",
  GENERATED: "Generated",
  FILED: "Filed",
  ACKNOWLEDGED: "Acknowledged",
  WAIVED: "Waived",
  DONE: "Done",
  DISMISSED: "Dismissed",
  NOT_REQUIRED: "Not required",
  PARTIALLY_SIGNED: "Partially signed",
};

export const TRANSACTION_TYPES = [
  "ISSUANCE",
  "EXERCISE",
  "CANCELLATION",
  "TRANSFER",
  "REPURCHASE",
  "CONVERSION",
  "STOCK_SPLIT",
  "ACCELERATION",
  "MODIFICATION",
  "TERMINATION",
  "REPRICING",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  ISSUANCE: "Issuance",
  EXERCISE: "Exercise",
  CANCELLATION: "Cancellation",
  TRANSFER: "Transfer",
  REPURCHASE: "Repurchase",
  CONVERSION: "Conversion",
  STOCK_SPLIT: "Stock split",
  ACCELERATION: "Acceleration",
  MODIFICATION: "Modification",
  TERMINATION: "Termination",
  REPRICING: "Repricing",
};

export const CONSENT_TYPES = [
  "OPTION_GRANT",
  "VALUATION_409A",
  "EQUITY_PLAN",
  "SAFE_ISSUANCE",
  "ROUND_APPROVAL",
  "SHARE_CLASS",
  "CUSTOM",
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];
export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  OPTION_GRANT: "Option grants",
  VALUATION_409A: "409A valuation",
  EQUITY_PLAN: "Equity plan",
  SAFE_ISSUANCE: "SAFE issuance",
  ROUND_APPROVAL: "Financing round",
  SHARE_CLASS: "Share class",
  CUSTOM: "Custom",
};

export const DOCUMENT_TYPES = [
  "CERTIFICATE",
  "GRANT_AGREEMENT",
  "OPTION_AGREEMENT",
  "SAFE",
  "CONVERTIBLE_NOTE",
  "BOARD_CONSENT",
  "VALUATION_REPORT",
  "PLAN_DOCUMENT",
  "OFFER_LETTER",
  "FORM_3921",
  "ELECTION_83B",
  "RULE_701",
  "CHARTER",
  "TERM_SHEET",
  "FINANCIALS",
  "OTHER",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CERTIFICATE: "Certificate",
  GRANT_AGREEMENT: "Grant agreement",
  OPTION_AGREEMENT: "Option agreement",
  SAFE: "SAFE",
  CONVERTIBLE_NOTE: "Convertible note",
  BOARD_CONSENT: "Board consent",
  VALUATION_REPORT: "409A report",
  PLAN_DOCUMENT: "Plan document",
  OFFER_LETTER: "Offer letter",
  FORM_3921: "Form 3921",
  ELECTION_83B: "83(b) election",
  RULE_701: "Rule 701 disclosure",
  CHARTER: "Charter",
  TERM_SHEET: "Term sheet",
  FINANCIALS: "Financials",
  OTHER: "Other",
};

export const INTEGRATION_PROVIDERS = [
  { id: "GUSTO", name: "Gusto", category: "HRIS" },
  { id: "RIPPLING", name: "Rippling", category: "HRIS" },
  { id: "BAMBOOHR", name: "BambooHR", category: "HRIS" },
  { id: "WORKDAY", name: "Workday", category: "HRIS" },
  { id: "JUSTWORKS", name: "Justworks", category: "HRIS" },
  { id: "DEEL", name: "Deel", category: "HRIS" },
  { id: "QUICKBOOKS", name: "QuickBooks", category: "ACCOUNTING" },
  { id: "XERO", name: "Xero", category: "ACCOUNTING" },
  { id: "NETSUITE", name: "NetSuite", category: "ACCOUNTING" },
  { id: "SLACK", name: "Slack", category: "COMMUNICATION" },
  { id: "DOCUSIGN", name: "DocuSign", category: "ESIGN" },
  { id: "NASDAQ_PRIVATE_MARKET", name: "Nasdaq Private Market", category: "LIQUIDITY" },
] as const;

export const PLANS = {
  STARTUP: { name: "Startup", price: 100, stakeholders: 25 },
  GROWTH: { name: "Growth", price: 300, stakeholders: 40 },
  ENTERPRISE: { name: "Enterprise", price: null, stakeholders: null },
} as const;
export type PlanId = keyof typeof PLANS;
