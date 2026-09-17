import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { csvResponse, xlsxResponse, type ExportSheet } from "@/lib/export";
import { parseAsOf, routeAccess } from "@/lib/captable-actions";
import { toInputDate } from "@/lib/format";
import { RELATIONSHIP_LABELS, SECURITY_TYPE_LABELS, type SecurityType, type StakeholderRelationship } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/cap-table">) {
  const { companyId } = await ctx.params;
  const access = await routeAccess(companyId);
  if ("response" in access) return access.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const asOf = parseAsOf(url.searchParams.get("asOf") ?? undefined);
  const data = await loadCapTable(companyId, asOf);
  const s = data.summary;
  const preferred = s.classTotals.filter((c) => c.type === "PREFERRED");
  const asOfIso = toInputDate(asOf);
  const slug = data.company.slug;

  const summarySheet: ExportSheet = {
    name: "By stakeholder",
    title: `${data.company.legalName} — Capitalization table`,
    subtitle: `As of ${asOfIso} · fully diluted includes options, RSUs, warrants and the unallocated pool`,
    columns: [
      { key: "name", header: "Stakeholder", width: 36 },
      { key: "relationship", header: "Relationship", width: 16 },
      { key: "common", header: "Common", type: "shares" },
      ...preferred.map((c) => ({ key: `class_${c.shareClassId}`, header: c.name, type: "shares" as const })),
      { key: "options", header: "Options outstanding", type: "shares" },
      { key: "optionsVested", header: "Options vested", type: "shares" },
      { key: "rsus", header: "RSUs", type: "shares" },
      { key: "warrants", header: "Warrants", type: "shares" },
      { key: "outstanding", header: "Outstanding shares", type: "shares" },
      { key: "outstandingPct", header: "% Outstanding", type: "percent" },
      { key: "fullyDiluted", header: "Fully diluted shares", type: "shares" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
      { key: "invested", header: "Invested", type: "money" },
    ],
    rows: [
      ...s.rows.map((r) => ({
        name: r.name,
        relationship: RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship] ?? r.relationship,
        common: r.commonShares,
        ...Object.fromEntries(preferred.map((c) => [`class_${c.shareClassId}`, r.byClass[c.shareClassId] ?? 0])),
        options: r.optionsOutstanding,
        optionsVested: r.optionsVested,
        rsus: r.rsus,
        warrants: r.warrants,
        outstanding: r.outstandingShares,
        outstandingPct: r.outstandingPct,
        fullyDiluted: r.fullyDilutedShares,
        fullyDilutedPct: r.fullyDilutedPct,
        invested: r.invested,
      })),
      {
        name: "Unallocated option pool",
        relationship: "Pool",
        common: 0,
        ...Object.fromEntries(preferred.map((c) => [`class_${c.shareClassId}`, 0])),
        options: s.totals.poolAvailable,
        optionsVested: 0,
        rsus: 0,
        warrants: 0,
        outstanding: 0,
        outstandingPct: 0,
        fullyDiluted: s.totals.poolAvailable,
        fullyDilutedPct: s.totals.fullyDilutedShares ? s.totals.poolAvailable / s.totals.fullyDilutedShares : 0,
        invested: 0,
      },
      {
        name: "Total",
        relationship: "",
        common: s.totals.commonOutstanding,
        ...Object.fromEntries(preferred.map((c) => [`class_${c.shareClassId}`, c.issued])),
        options: s.totals.optionsOutstanding + s.totals.poolAvailable,
        optionsVested: s.totals.optionsVested,
        rsus: s.totals.rsus,
        warrants: s.totals.warrants,
        outstanding: s.totals.outstandingShares,
        outstandingPct: 1,
        fullyDiluted: s.totals.fullyDilutedShares,
        fullyDilutedPct: 1,
        invested: s.totals.totalInvested,
      },
    ],
  };

  if (format === "csv") return csvResponse(summarySheet, `${slug}-cap-table-${asOfIso}`);

  const classSheet: ExportSheet = {
    name: "By share class",
    title: `${data.company.legalName} — Share classes`,
    subtitle: `As of ${asOfIso}`,
    columns: [
      { key: "name", header: "Share class", width: 30 },
      { key: "type", header: "Type" },
      { key: "authorized", header: "Authorized", type: "shares" },
      { key: "issued", header: "Issued", type: "shares" },
      { key: "asConverted", header: "As-converted", type: "shares" },
      { key: "reserved", header: "Reserved for plans", type: "shares" },
      { key: "available", header: "Available", type: "shares" },
      { key: "outstandingPct", header: "% Outstanding", type: "percent" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
      { key: "pref", header: "Liquidation preference", type: "money" },
    ],
    rows: s.classTotals.map((c) => ({
      name: c.name,
      type: c.type === "PREFERRED" ? "Preferred" : "Common",
      authorized: c.authorized,
      issued: c.issued,
      asConverted: c.asConverted,
      reserved: c.reservedForPlans,
      available: c.available,
      outstandingPct: c.outstandingPct,
      fullyDilutedPct: c.fullyDilutedPct,
      pref: c.liquidationPreference,
    })),
  };

  const ledgerSheet: ExportSheet = {
    name: "Ledger",
    title: `${data.company.legalName} — Securities ledger`,
    subtitle: `As of ${asOfIso}`,
    columns: [
      { key: "cert", header: "Certificate" },
      { key: "holder", header: "Holder", width: 36 },
      { key: "type", header: "Type", width: 18 },
      { key: "classOrPlan", header: "Class / plan", width: 28 },
      { key: "quantity", header: "Quantity", type: "shares" },
      { key: "exercised", header: "Exercised", type: "shares" },
      { key: "cancelled", header: "Cancelled", type: "shares" },
      { key: "principal", header: "Principal", type: "money" },
      { key: "price", header: "Price / strike", type: "money" },
      { key: "issueDate", header: "Issue date", type: "date" },
      { key: "vestingStart", header: "Vesting start", type: "date" },
      { key: "status", header: "Status" },
    ],
    rows: data.securities
      .filter((x) => x.issueDate <= asOf)
      .map((x) => ({
        cert: x.certificateNumber,
        holder: x.stakeholder.name,
        type: SECURITY_TYPE_LABELS[x.type as SecurityType] ?? x.type,
        classOrPlan: x.equityPlan?.name ?? x.shareClass?.name ?? "",
        quantity: x.quantity,
        exercised: x.exercisedQuantity,
        cancelled: x.cancelledQuantity,
        principal: x.totalAmount ?? null,
        price: x.exercisePrice ?? x.pricePerShare ?? null,
        issueDate: x.issueDate,
        vestingStart: x.vestingStartDate,
        status: x.status,
      })),
  };

  await db.auditLog.create({ data: { companyId, userId: access.user.id, action: "EXPORT", entityType: "CapTable", summary: `Exported cap table workbook as of ${asOfIso}` } });
  return xlsxResponse([summarySheet, classSheet, ledgerSheet], `${slug}-cap-table-${asOfIso}`);
}
