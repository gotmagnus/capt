import { subDays } from "date-fns";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentValuation } from "@/lib/data/captable";
import { PageHeader } from "@/components/ui/page";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { ConsentBuilder, type ExhibitCandidate, type SignerCandidate } from "./consent-builder";
import { shares, price, money, date } from "@/lib/format";

export const metadata = { title: "New board consent" };

export default async function NewConsentPage(props: PageProps<"/app/[companyId]/board/new">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const sp = await props.searchParams;
  const preselect = typeof sp.security === "string" ? sp.security.split(",") : Array.isArray(sp.security) ? sp.security : [];
  const presetType = typeof sp.type === "string" ? sp.type : undefined;

  const [securities, valuations, plans, rounds, shareClasses, boardPeople, fmv] = await Promise.all([
    db.security.findMany({
      where: {
        companyId: C,
        type: { in: ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA", "SAFE", "CONVERTIBLE_NOTE", "WARRANT"] },
        OR: [{ issueDate: { gte: subDays(new Date(), 90) } }, { status: { in: ["PENDING_SIGNATURE", "DRAFT"] } }, { id: { in: preselect } }],
      },
      include: { stakeholder: true, exhibits: { include: { consent: true } } },
      orderBy: { issueDate: "desc" },
    }),
    db.valuation.findMany({ where: { companyId: C, boardConsentId: null, status: { in: ["DRAFT_DELIVERED", "ACCEPTED", "IN_PROGRESS"] } }, orderBy: { valuationDate: "desc" } }),
    db.equityPlan.findMany({ where: { companyId: C } }),
    db.fundingRound.findMany({ where: { companyId: C, status: { in: ["PLANNED", "OPEN"] } } }),
    db.shareClass.findMany({ where: { companyId: C } }),
    db.stakeholder.findMany({ where: { companyId: C, relationship: { in: ["BOARD_MEMBER", "FOUNDER"] } }, orderBy: { name: "asc" } }),
    currentValuation(C),
  ]);

  const exhibits: ExhibitCandidate[] = [
    ...securities.map((s) => {
      const qty = s.type === "SAFE" || s.type === "CONVERTIBLE_NOTE" ? money(s.totalAmount) : `${shares(s.quantity)} ${SECURITY_TYPE_LABELS[s.type as SecurityType]}`;
      const approvedBy = s.exhibits.find((e) => e.consent.status === "APPROVED");
      return {
        key: `SECURITY:${s.id}`,
        kind: "SECURITY" as const,
        id: s.id,
        group: s.type === "SAFE" || s.type === "CONVERTIBLE_NOTE" ? "Convertibles" : "Equity awards",
        label: `${s.stakeholder.name} — ${qty}${s.exercisePrice ? ` @ ${price(s.exercisePrice)}` : ""}`,
        hint: `${s.certificateNumber} · ${date(s.issueDate)} · ${s.status.toLowerCase().replace(/_/g, " ")}${approvedBy ? ` · approved by “${approvedBy.consent.title}”` : ""}`,
        description: `${s.stakeholder.name} — ${qty}${s.exercisePrice ? ` at ${price(s.exercisePrice)}` : ""} (${s.certificateNumber})`,
        checked: preselect.includes(s.id) || (!approvedBy && (s.status === "DRAFT" || s.status === "PENDING_SIGNATURE")),
      };
    }),
    ...valuations.map((v) => ({
      key: `VALUATION:${v.id}`,
      kind: "VALUATION" as const,
      id: v.id,
      group: "409A valuations",
      label: `409A valuation as of ${date(v.valuationDate)}${v.fairMarketValue ? ` — FMV ${price(v.fairMarketValue)}` : ""}`,
      hint: `${v.provider} · ${v.status.toLowerCase().replace(/_/g, " ")}`,
      description: `409A valuation report dated ${date(v.valuationDate, "long")}${v.fairMarketValue ? ` concluding a fair market value of ${price(v.fairMarketValue)} per share` : ""}`,
      checked: false,
    })),
    ...plans.map((p) => ({ key: `EQUITY_PLAN:${p.id}`, kind: "EQUITY_PLAN" as const, id: p.id, group: "Equity plans", label: p.name, hint: `${shares(p.authorizedShares)} shares reserved · ${p.status.toLowerCase()}`, description: `${p.name} (${shares(p.authorizedShares)} shares reserved)`, checked: false })),
    ...rounds.map((r) => ({ key: `ROUND:${r.id}`, kind: "ROUND" as const, id: r.id, group: "Financing rounds", label: r.name, hint: `${r.roundType.toLowerCase()} · ${r.preMoneyValuation ? `${money(r.preMoneyValuation)} pre-money` : "terms TBD"}`, description: `${r.name} financing${r.preMoneyValuation ? ` at a ${money(r.preMoneyValuation)} pre-money valuation` : ""}`, checked: false })),
    ...shareClasses.map((c) => ({ key: `SHARE_CLASS:${c.id}`, kind: "SHARE_CLASS" as const, id: c.id, group: "Share classes", label: c.name, hint: `${shares(c.authorizedShares)} authorized`, description: `${c.name} — ${shares(c.authorizedShares)} shares authorized`, checked: false })),
  ];

  const signers: SignerCandidate[] = boardPeople.filter((p) => p.email).map((p) => ({ stakeholderId: p.id, name: p.name, email: p.email as string, title: p.title ?? (p.relationship === "FOUNDER" ? "Founder" : "Director"), checked: true }));

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Board consents", href: `/app/${C}/board` }, { label: "New consent" }]} title="New board consent" description="Draft a written consent, attach exhibits and send it to directors for electronic signature." />
      <ConsentBuilder companyId={C} exhibits={exhibits} signers={signers} fmv={fmv?.fairMarketValue ?? null} planName={plans[0]?.name ?? "the Equity Incentive Plan"} companyName={ctx.company.legalName} presetType={presetType} canEdit={ctx.canEdit} />
    </>
  );
}
