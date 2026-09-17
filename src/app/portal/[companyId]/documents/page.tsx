import Link from "next/link";
import { FileText, FolderOpen, PenLine } from "lucide-react";
import { requireCompany } from "@/lib/auth";
import { loadPortal, portalDocuments } from "@/lib/portal-data";
import { date } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { PageHeader, EmptyState, Alert } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoHoldings } from "../no-holdings";

export const metadata = { title: "Documents" };

export default async function PortalDocumentsPage(props: PageProps<"/portal/[companyId]/documents">) {
  const { companyId } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  if (p.myStakeholders.length === 0) return <NoHoldings companyId={C} isWorkspace={ctx.isWorkspace} name={ctx.user.name} />;
  const docs = await portalDocuments(p);
  const email = ctx.user.email.toLowerCase();
  const needsMe = (d: (typeof docs)[number]) => d.signatures.some((s) => s.status === "PENDING" && (s.email.toLowerCase() === email || (s.stakeholderId && p.myIds.has(s.stakeholderId))));
  const pending = docs.filter(needsMe);
  const folders = new Map<string, typeof docs>();
  for (const d of docs) folders.set(d.folder, [...(folders.get(d.folder) ?? []), d]);

  return (
    <>
      <PageHeader title="Documents" description="Your certificates, agreements, elections and tax forms, plus company documents shared with you." />
      {pending.length ? (
        <Alert tone="warning" icon={PenLine} className="mb-5" title={`${pending.length} document${pending.length === 1 ? "" : "s"} awaiting your signature`}>
          <ul className="mt-1 space-y-1">
            {pending.map((d) => (
              <li key={d.id}>
                <Link href={`/portal/${C}/documents/${d.id}`} className="font-medium underline">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {docs.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No documents yet" />
      ) : (
        <div className="space-y-5">
          {[...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => (
            <div key={folder}>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
                <FolderOpen className="size-4" /> {folder}
              </h2>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/portal/${C}/documents/${d.id}`} className="text-[13px] font-medium hover:underline">
                        {d.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type} · {date(d.createdAt)}
                        {d.security ? ` · ${d.security.certificateNumber}` : ""}
                      </div>
                    </div>
                    {d.signatureStatus !== "NOT_REQUIRED" ? <StatusBadge status={d.signatureStatus} /> : null}
                    {needsMe(d) ? (
                      <Button size="xs" asChild>
                        <Link href={`/portal/${C}/documents/${d.id}`}>Sign</Link>
                      </Button>
                    ) : (
                      <Button size="xs" variant="ghost" asChild>
                        <Link href={`/portal/${C}/documents/${d.id}`}>View</Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
