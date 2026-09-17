import Link from "next/link";
import { Eye, Megaphone, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, percent } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import { PageHeader, Stat, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { markdownPreview } from "@/components/people-labels";

export const metadata = { title: "Investor updates" };

export default async function UpdatesPage(props: PageProps<"/app/[companyId]/updates">) {
  const { companyId } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const [updates, stakeholders] = await Promise.all([
    db.investorUpdate.findMany({ where: { companyId: C }, include: { views: true }, orderBy: [{ status: "asc" }, { publishedAt: "desc" }, { updatedAt: "desc" }] }),
    db.stakeholder.findMany({ where: { companyId: C }, select: { id: true, relationship: true, email: true } }),
  ]);
  const rows = updates.map((u) => {
    const audience = parseJson<string[]>(u.audience, []);
    const external = parseJson<string[]>(u.externalEmails, []);
    const recipients = stakeholders.filter((s) => audience.includes(s.relationship));
    const viewedIds = new Set(u.views.map((v) => v.stakeholderId).filter(Boolean));
    const viewedEmails = new Set(u.views.map((v) => v.email?.toLowerCase()).filter(Boolean));
    const opened = recipients.filter((r) => viewedIds.has(r.id) || (r.email && viewedEmails.has(r.email.toLowerCase()))).length + external.filter((e) => viewedEmails.has(e)).length;
    const total = recipients.length + external.length;
    const preview = markdownPreview(u.body, 140);
    return { ...u, audience, external, opened, total, openRate: total ? opened / total : 0, preview };
  });
  const published = rows.filter((r) => r.status === "PUBLISHED");
  const avgOpen = published.length ? published.reduce((a, r) => a + r.openRate, 0) / published.length : 0;
  const subscriberGroups = new Set(published.flatMap((r) => r.audience));
  const subscribers = stakeholders.filter((s) => subscriberGroups.has(s.relationship)).length;

  return (
    <>
      <PageHeader
        title="Investor updates"
        description="Your communications hub: write once, send to investors, board members and advisors, and see who opened it."
        actions={
          ctx.canEdit ? (
            <Button asChild>
              <Link href={`/app/${C}/updates/new`}>
                <Plus /> New update
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Published" value={published.length} icon={Megaphone} hint={`${rows.length - published.length} draft${rows.length - published.length === 1 ? "" : "s"}`} />
        <Stat label="Average open rate" value={percent(avgOpen, 0)} icon={Eye} tone={avgOpen > 0.6 ? "success" : "default"} />
        <Stat label="Subscribers" value={subscribers} hint="Stakeholders in your audiences" />
        <Stat label="Last sent" value={published[0]?.publishedAt ? date(published[0].publishedAt) : "—"} hint={published[0]?.title} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="No updates yet" description="Keep investors engaged with a monthly or quarterly update. Templates get you started in seconds." action={ctx.canEdit ? <Button asChild><Link href={`/app/${C}/updates/new`}>Write your first update</Link></Button> : undefined} />
      ) : (
        <>
          {/* Phones: one tappable row per update instead of a 6-column table */}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Link href={`/app/${C}/updates/${u.id}`} className="block px-4 py-3 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-[13px] font-medium">{u.title}</span>
                    <StatusBadge status={u.status} className="mt-0.5 shrink-0" />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{u.preview}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="shrink-0 tabular">{u.publishedAt ? date(u.publishedAt) : "Not published"}</span>
                    {u.status === "PUBLISHED" ? (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Progress value={u.openRate * 100} tone={u.openRate > 0.6 ? "success" : "accent"} className="max-w-32" />
                        <span className="shrink-0 tabular">
                          {u.opened}/{u.total} opened
                        </span>
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Update</th>
                  <th>Status</th>
                  <th>Audience</th>
                  <th>Published</th>
                  <th>Opens</th>
                  <th>Public link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/app/${C}/updates/${u.id}`} className="font-medium hover:underline">
                        {u.title}
                      </Link>
                      <div className="max-w-[420px] truncate text-xs text-muted-foreground">{u.preview}</div>
                    </td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {u.audience.map((a) => (
                          <Badge key={a} variant="outline">
                            {RELATIONSHIP_LABELS[a as StakeholderRelationship] ?? a}
                          </Badge>
                        ))}
                        {u.external.length ? <Badge variant="neutral">+{u.external.length} external</Badge> : null}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{u.publishedAt ? date(u.publishedAt) : "—"}</td>
                    <td>
                      {u.status === "PUBLISHED" ? (
                        <div className="flex w-36 items-center gap-2">
                          <Progress value={u.openRate * 100} tone={u.openRate > 0.6 ? "success" : "accent"} />
                          <span className="text-xs tabular text-muted-foreground">
                            {u.opened}/{u.total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>{u.publicToken && u.status === "PUBLISHED" ? <a href={`/u/${u.publicToken}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent-foreground hover:underline">/u/{u.publicToken}</a> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
