import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCapTable } from "@/lib/data/captable";
import { PageHeader, Stat } from "@/components/ui/page";
import { money, shares } from "@/lib/format";
import { TransactionsTable, type TransactionRow } from "./transactions-table";
import { StockSplitDialog } from "./stock-split-dialog";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage(props: PageProps<"/app/[companyId]/transactions">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [data, transactions] = await Promise.all([
    loadCapTable(C),
    db.transaction.findMany({
      where: { companyId: C },
      include: { security: { select: { id: true, certificateNumber: true, type: true } }, fromStakeholder: { select: { id: true, name: true } }, toStakeholder: { select: { id: true, name: true } } },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const userIds = [...new Set(transactions.map((t) => t.createdById).filter((x): x is string => !!x))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const rows: TransactionRow[] = transactions.map((t) => ({
    id: t.id,
    effectiveDate: t.effectiveDate.toISOString(),
    type: t.type,
    securityId: t.security?.id ?? null,
    certificateNumber: t.security?.certificateNumber ?? null,
    securityType: t.security?.type ?? null,
    fromId: t.fromStakeholder?.id ?? null,
    fromName: t.fromStakeholder?.name ?? null,
    toId: t.toStakeholder?.id ?? null,
    toName: t.toStakeholder?.name ?? null,
    quantity: t.quantity,
    pricePerShare: t.pricePerShare,
    totalAmount: t.totalAmount,
    notes: t.notes,
    recordedBy: t.createdById ? userName.get(t.createdById) ?? null : null,
    createdAt: t.createdAt.toISOString(),
  }));

  const year = new Date().getFullYear();
  const thisYear = transactions.filter((t) => t.effectiveDate.getFullYear() === year);
  const issuedThisYear = thisYear.filter((t) => t.type === "ISSUANCE").reduce((a, t) => a + t.quantity, 0);
  const exercisedThisYear = thisYear.filter((t) => t.type === "EXERCISE").reduce((a, t) => a + t.quantity, 0);
  const cancelledThisYear = thisYear.filter((t) => ["CANCELLATION", "REPURCHASE"].includes(t.type)).reduce((a, t) => a + t.quantity, 0);
  const proceedsThisYear = thisYear.filter((t) => ["EXERCISE", "ISSUANCE"].includes(t.type)).reduce((a, t) => a + (t.totalAmount ?? 0), 0);

  return (
    <>
      <PageHeader title="Transactions" description="The immutable ledger behind the cap table. Every issuance, exercise, cancellation, transfer and conversion." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-5">
        <Stat className="sm:col-span-2 xl:col-span-1" label="Transactions" value={transactions.length} hint={`${thisYear.length} in ${year}`} />
        <Stat className="sm:col-span-2 xl:col-span-1" label={`Issued in ${year}`} value={shares(issuedThisYear)} hint="Shares, options & units" />
        <Stat className="sm:col-span-2 xl:col-span-1" label={`Exercised in ${year}`} value={shares(exercisedThisYear)} />
        <Stat className="sm:col-span-3 xl:col-span-1" label={`Cancelled in ${year}`} value={shares(cancelledThisYear)} hint="Returned to pool or treasury" />
        <Stat className="col-span-2 sm:col-span-3 xl:col-span-1" label={`Proceeds in ${year}`} value={money(proceedsThisYear)} hint="From issuances & exercises" />
      </div>
      <TransactionsTable
        companyId={C}
        rows={rows}
        stakeholders={data.stakeholders.map((s) => ({ id: s.id, name: s.name }))}
        initialStakeholder={typeof sp.stakeholder === "string" ? sp.stakeholder : undefined}
        toolbar={ctx.canEdit ? <StockSplitDialog key="stock-split" companyId={C} fullyDiluted={data.summary.totals.fullyDilutedShares} /> : null}
      />
    </>
  );
}
