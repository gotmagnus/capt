import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireCompany } from "@/lib/auth";
import { loadPortal, portalUpdates } from "@/lib/portal-data";
import { date } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { NoHoldings } from "../no-holdings";
import { markdownPreview } from "@/components/people-labels";

export const metadata = { title: "Updates" };

export default async function PortalUpdatesPage(props: PageProps<"/portal/[companyId]/updates">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const updates = await portalUpdates(p);

  return (
    <>
      <PageHeader title="Company updates" description={`Updates ${ctx.company.name} has shared with ${p.isInvestorView ? "investors and the board" : "its team"}.`} />
      {updates.length === 0 ? (
        <EmptyState icon={Megaphone} title="No updates yet" description="Published updates addressed to you will appear here." />
      ) : (
        <div className="space-y-3">
          {updates.map((u) => {
            const seen = u.views.some((v) => v.stakeholderId && p.myIds.has(v.stakeholderId));
            return (
              <Link key={u.id} href={`/portal/${C}/updates/${u.id}`} className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-[15px] font-semibold">{u.title}</h3>
                  {!seen ? <Badge variant="accent" className="mt-0.5 shrink-0">New</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{date(u.publishedAt, "long")}</p>
                <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{markdownPreview(u.body, 240)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
