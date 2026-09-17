import Link from "next/link";
import { Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalState } from "@/lib/governance-consents";
import { PageHeader, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { BoardTable, type ConsentRow } from "./board-table";

export const metadata = { title: "Board consents" };

export default async function BoardPage(props: PageProps<"/app/[companyId]/board">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const consents = await db.boardConsent.findMany({ where: { companyId: C }, include: { signers: true, exhibits: true }, orderBy: { createdAt: "desc" } });
  const year = new Date().getFullYear();
  const awaiting = consents.filter((c) => c.status === "SENT");
  const approvedThisYear = consents.filter((c) => c.status === "APPROVED" && c.approvedAt && c.approvedAt.getFullYear() === year);
  const drafts = consents.filter((c) => c.status === "DRAFT");
  const pendingSignatures = awaiting.reduce((a, c) => a + c.signers.filter((s) => s.status === "PENDING").length, 0);

  const rows: ConsentRow[] = consents.map((c) => {
    const st = approvalState(c);
    return {
      id: c.id,
      title: c.title,
      type: c.type,
      status: c.status,
      effectiveDate: c.effectiveDate?.toISOString() ?? null,
      sentAt: c.sentAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      signed: st.signed,
      total: st.total,
      required: st.required,
      exhibits: c.exhibits.length,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return (
    <>
      <PageHeader
        title="Board consents"
        description="Draft written consents, collect director signatures and apply approvals to grants, valuations and plans."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/board/new`}>
                <Plus /> New consent
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Awaiting signature" value={awaiting.length} hint={`${pendingSignatures} signatures outstanding`} tone={awaiting.length ? "warning" : "default"} />
        <Stat label={`Approved in ${year}`} value={approvedThisYear.length} hint={`${consents.filter((c) => c.status === "APPROVED").length} approved all time`} tone="success" />
        <Stat label="Drafts" value={drafts.length} hint="Not yet sent" />
        <Stat label="Directors on file" value={new Set(consents.flatMap((c) => c.signers.map((s) => s.email.toLowerCase()))).size} hint="Unique signers across consents" />
      </div>
      <BoardTable companyId={C} rows={rows} />
    </>
  );
}
