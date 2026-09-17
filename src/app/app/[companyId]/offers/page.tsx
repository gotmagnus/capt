import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { percent, shares } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { OffersTable } from "@/components/offers-table";

export const metadata = { title: "Offer letters" };

export default async function OffersPage(props: PageProps<"/app/[companyId]/offers">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const offers = await db.offerLetter.findMany({ where: { companyId: C }, orderBy: { createdAt: "desc" } });
  const open = offers.filter((o) => ["SENT", "VIEWED"].includes(o.status));
  const answered = offers.filter((o) => ["ACCEPTED", "DECLINED"].includes(o.status));
  const accepted = offers.filter((o) => o.status === "ACCEPTED");
  const avgEquity = offers.length ? offers.reduce((a, o) => a + o.equityQuantity, 0) / offers.length : 0;
  return (
    <>
      <PageHeader
        title="Offer letters"
        description="Interactive offers that show candidates their equity, vesting and potential value — and flow straight into a grant once accepted."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/offers/new`}>
                <Plus /> New offer
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Outstanding offers" value={open.length} icon={Mail} hint={`${open.filter((o) => o.viewedAt).length} viewed`} />
        <Stat label="Acceptance rate" value={answered.length ? percent(accepted.length / answered.length, 0) : "—"} hint={`${accepted.length} accepted · ${answered.length - accepted.length} declined`} />
        <Stat label="Average equity" value={shares(avgEquity)} hint="Shares per offer" />
        <Stat label="Drafts" value={offers.filter((o) => o.status === "DRAFT").length} />
      </div>
      <OffersTable
        companyId={C}
        rows={offers.map((o) => ({
          id: o.id,
          candidateName: o.candidateName,
          candidateEmail: o.candidateEmail,
          title: o.title,
          department: o.department,
          level: o.level,
          salary: o.salary,
          equityQuantity: o.equityQuantity,
          equityType: o.equityType,
          strikePrice: o.strikePrice,
          status: o.status,
          sentAt: o.sentAt?.toISOString() ?? null,
          viewedAt: o.viewedAt?.toISOString() ?? null,
          acceptedAt: o.acceptedAt?.toISOString() ?? null,
          expiresAt: o.expiresAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
