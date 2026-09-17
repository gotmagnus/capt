import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Pencil } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, dateTime, percent, relative } from "@/lib/format";
import { parseJson } from "@/lib/utils";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";
import { CopyLink } from "@/components/offers-copy-link";
import { deleteUpdate, sendReminder, unpublishUpdate } from "../actions";

export const metadata = { title: "Update" };

export default async function UpdateDetailPage(props: PageProps<"/app/[companyId]/updates/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const update = await db.investorUpdate.findFirst({ where: { id, companyId: C }, include: { views: { include: { stakeholder: true }, orderBy: { viewedAt: "desc" } } } });
  if (!update) notFound();
  const audience = parseJson<string[]>(update.audience, []);
  const external = parseJson<string[]>(update.externalEmails, []);
  const stakeholders = await db.stakeholder.findMany({ where: { companyId: C, relationship: { in: audience } }, orderBy: { name: "asc" } });
  const viewsById = new Map<string, Date>();
  const viewsByEmail = new Map<string, Date>();
  for (const v of update.views) {
    if (v.stakeholderId && !viewsById.has(v.stakeholderId)) viewsById.set(v.stakeholderId, v.viewedAt);
    if (v.email && !viewsByEmail.has(v.email.toLowerCase())) viewsByEmail.set(v.email.toLowerCase(), v.viewedAt);
  }
  const recipients = [
    ...stakeholders.map((s) => ({ key: s.id, name: s.name, email: s.email, relationship: s.relationship, viewedAt: viewsById.get(s.id) ?? (s.email ? viewsByEmail.get(s.email.toLowerCase()) : undefined) ?? null, stakeholderId: s.id })),
    ...external.map((e) => ({ key: e, name: e, email: e, relationship: "EXTERNAL", viewedAt: viewsByEmail.get(e) ?? null, stakeholderId: null as string | null })),
  ];
  const opened = recipients.filter((r) => r.viewedAt).length;
  const anonymous = update.views.filter((v) => !v.stakeholderId && !v.email).length;
  const openRate = recipients.length ? opened / recipients.length : 0;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Investor updates", href: `/app/${C}/updates` }, { label: update.title }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {update.title} <StatusBadge status={update.status} />
          </span>
        }
        description={update.publishedAt ? `Published ${dateTime(update.publishedAt)} · ${recipients.length} recipients` : `Draft · last edited ${relative(update.updatedAt)}`}
        actions={
          ctx.canEdit ? (
            <>
              <Button variant="secondary" asChild>
                <Link href={`/app/${C}/updates/${update.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              {update.status === "PUBLISHED" ? (
                <>
                  <ConfirmButton action={sendReminder} hidden={{ companyId: C, id: update.id }} title="Send reminder" description={`Nudges the ${recipients.length - opened} recipients who haven't opened this update.`} confirmLabel="Send reminder" variant="secondary">
                    <Bell /> Remind unopened
                  </ConfirmButton>
                  <ConfirmButton action={unpublishUpdate} hidden={{ companyId: C, id: update.id }} title="Unpublish" description="The public link will stop working until you publish again." confirmLabel="Unpublish" variant="ghost">
                    Unpublish
                  </ConfirmButton>
                </>
              ) : (
                <ConfirmButton action={deleteUpdate} hidden={{ companyId: C, id: update.id }} title="Delete draft" confirmLabel="Delete" variant="ghost" redirectTo={`/app/${C}/updates`}>
                  Delete
                </ConfirmButton>
              )}
            </>
          ) : null
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <Markdown content={update.body} className={PROSE_FIXES} />
          </CardContent>
        </Card>
        <div className="grid content-start items-start gap-5 md:grid-cols-2 lg:grid-cols-1">
          {update.status === "PUBLISHED" && update.publicToken ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Public link</CardTitle>
                  <CardDescription>Anyone with the link can read this update.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <CopyLink path={`/u/${update.publicToken}`} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Engagement</CardTitle>
                <CardDescription>
                  {opened} of {recipients.length} opened{anonymous ? ` · ${anonymous} anonymous views` : ""}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Progress value={openRate * 100} tone={openRate > 0.6 ? "success" : "accent"} className="flex-1" />
                <span className="text-sm font-semibold tabular">{percent(openRate, 0)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {audience.map((a) => (
                  <Badge key={a} variant="outline">
                    {RELATIONSHIP_LABELS[a as StakeholderRelationship] ?? a}
                  </Badge>
                ))}
                {external.length ? <Badge variant="neutral">{external.length} external</Badge> : null}
              </div>
              <ul className="mt-4 max-h-80 divide-y divide-border overflow-y-auto scrollbar-thin">
                {recipients.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 py-2">
                    <Avatar name={r.name} size="xs" />
                    <div className="min-w-0 flex-1">
                      {r.stakeholderId ? (
                        <Link href={`/app/${C}/stakeholders/${r.stakeholderId}`} className="block truncate text-[13px] hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="block truncate text-[13px]">{r.name}</span>
                      )}
                      <span className="block text-[11px] text-muted-foreground">{r.relationship === "EXTERNAL" ? "External" : RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship]}</span>
                    </div>
                    {r.viewedAt ? <span className="shrink-0 text-[11px] text-success">Opened {date(r.viewedAt)}</span> : <span className="shrink-0 text-[11px] text-muted-foreground">Not opened</span>}
                  </li>
                ))}
                {recipients.length === 0 ? <li className="py-3 text-[13px] text-muted-foreground">No recipients selected.</li> : null}
              </ul>
            </CardContent>
          </Card>
          {update.views.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Views timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-xs">
                  {update.views.slice(0, 12).map((v) => (
                    <li key={v.id} className="flex justify-between gap-2">
                      <span className="truncate">{v.stakeholder?.name ?? v.email ?? "Anonymous"}</span>
                      <span className="shrink-0 text-muted-foreground">{dateTime(v.viewedAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
