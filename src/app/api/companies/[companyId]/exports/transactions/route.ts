import { db } from "@/lib/db";
import { csvResponse, type ExportSheet } from "@/lib/export";
import { routeAccess } from "@/lib/captable-actions";
import { TRANSACTION_LABELS, type TransactionType } from "@/lib/types";
import { toInputDate } from "@/lib/format";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/transactions">) {
  const { companyId } = await ctx.params;
  const access = await routeAccess(companyId);
  if ("response" in access) return access.response;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? undefined;
  const stakeholder = url.searchParams.get("stakeholder") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const [company, transactions] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } }),
    db.transaction.findMany({
      where: {
        companyId,
        type: type || undefined,
        ...(stakeholder ? { OR: [{ fromStakeholderId: stakeholder }, { toStakeholderId: stakeholder }] } : {}),
        effectiveDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59`) : undefined },
      },
      include: { security: { select: { certificateNumber: true, type: true } }, fromStakeholder: { select: { name: true } }, toStakeholder: { select: { name: true } } },
      orderBy: { effectiveDate: "desc" },
    }),
  ]);
  const sheet: ExportSheet = {
    name: "Transactions",
    columns: [
      { key: "date", header: "Effective date" },
      { key: "type", header: "Type" },
      { key: "certificate", header: "Security" },
      { key: "securityType", header: "Security type" },
      { key: "from", header: "From" },
      { key: "to", header: "To" },
      { key: "quantity", header: "Quantity", type: "shares" },
      { key: "price", header: "Price per share", type: "money" },
      { key: "amount", header: "Amount", type: "money" },
      { key: "notes", header: "Notes" },
      { key: "recorded", header: "Recorded at" },
    ],
    rows: transactions.map((t) => ({
      date: toInputDate(t.effectiveDate),
      type: TRANSACTION_LABELS[t.type as TransactionType] ?? t.type,
      certificate: t.security?.certificateNumber ?? "",
      securityType: t.security?.type ?? "",
      from: t.fromStakeholder?.name ?? (t.type === "ISSUANCE" ? "Company" : ""),
      to: t.toStakeholder?.name ?? "",
      quantity: t.quantity,
      price: t.pricePerShare,
      amount: t.totalAmount,
      notes: t.notes ?? "",
      recorded: toInputDate(t.createdAt),
    })),
  };
  return csvResponse(sheet, `${company.slug}-transactions`);
}
