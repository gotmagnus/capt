import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadCapTable } from "@/lib/data/captable";
import { securityStateAsOf } from "@/lib/equity/captable";
import { accruedInterest } from "@/lib/equity/conversion";
import { parseAsOf } from "@/lib/captable-actions";
import { toInputDate } from "@/lib/format";
import { CONVERTIBLE_TYPES, SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CapTableView, type ConvertibleRow, type LedgerRow } from "./cap-table-view";

export const metadata = { title: "Cap table" };

export default async function CapTablePage(props: PageProps<"/app/[companyId]/cap-table">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const asOf = parseAsOf(sp.asOf);
  const tab = typeof sp.tab === "string" ? sp.tab : "stakeholders";
  const data = await loadCapTable(C, asOf);

  // Status and quantities as they stood on the as-of date, the same reconstruction the summary
  // uses. Reading today's row instead left a historical view with "3 SAFEs" in the header and an
  // empty Convertibles tab, because those SAFEs have since converted.
  const stateAsOf = new Map(data.securities.map((s) => [s.id, securityStateAsOf(s, asOf, data.transactions)]));
  const existed = (id: string) => stateAsOf.get(id)?.exists ?? false;

  const ledger: LedgerRow[] = data.securities
    .filter((s) => existed(s.id))
    .map((s) => ({
      id: s.id,
      certificateNumber: s.certificateNumber,
      holderId: s.stakeholderId,
      holderName: s.stakeholder.name,
      type: s.type,
      typeLabel: SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type,
      classOrPlan: s.equityPlan?.name ?? s.shareClass?.name ?? "—",
      quantity: CONVERTIBLE_TYPES.includes(s.type as never) ? null : s.quantity - (stateAsOf.get(s.id)?.cancelled ?? 0),
      principal: CONVERTIBLE_TYPES.includes(s.type as never) ? s.totalAmount ?? 0 : null,
      price: s.exercisePrice ?? s.pricePerShare ?? null,
      issueDate: s.issueDate.toISOString(),
      status: stateAsOf.get(s.id)?.status ?? s.status,
    }));

  const convertibles: ConvertibleRow[] = data.securities
    .filter((s) => CONVERTIBLE_TYPES.includes(s.type as never) && existed(s.id) && stateAsOf.get(s.id)?.status === "OUTSTANDING")
    .map((s) => ({
      id: s.id,
      certificateNumber: s.certificateNumber,
      holderId: s.stakeholderId,
      holderName: s.stakeholder.name,
      type: s.type,
      principal: s.totalAmount ?? 0,
      valuationCap: s.valuationCap,
      discountPercent: s.discountPercent,
      safeType: s.safeType,
      mfn: s.mfn,
      proRataRight: s.proRataRight,
      interestRate: s.interestRate,
      maturityDate: s.maturityDate?.toISOString() ?? null,
      issueDate: s.issueDate.toISOString(),
      accruedInterest: accruedInterest({ id: s.id, type: s.type, stakeholderId: s.stakeholderId, principal: s.totalAmount ?? 0, interestRate: s.interestRate, interestType: s.interestType, issueDate: s.issueDate }, asOf),
    }));

  const asOfIso = toInputDate(asOf);
  const exportBase = `/api/companies/${C}/exports/cap-table?asOf=${asOfIso}`;

  return (
    <>
      <PageHeader
        title="Cap table"
        description={`${ctx.company.legalName} · computed live from the ledger`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`${exportBase}&format=xlsx`}>Excel workbook (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`${exportBase}&format=csv`}>Summary by stakeholder (.csv)</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {ctx.canEdit ? (
              <Button asChild>
                <Link href={`/app/${C}/securities/new`}>
                  <Plus /> Issue equity
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <CapTableView
        companyId={C}
        asOf={asOfIso}
        isHistorical={asOfIso !== toInputDate(new Date())}
        initialTab={tab}
        summary={data.summary}
        preferredClasses={data.summary.classTotals.filter((c) => c.type === "PREFERRED").map((c) => ({ id: c.shareClassId, name: c.name, prefix: c.prefix }))}
        ledger={ledger}
        convertibles={convertibles}
      />
    </>
  );
}
