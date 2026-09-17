import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, FileText, Printer } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { date, dateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { DocumentHeaderActions, SignaturePanel } from "./document-actions";

export const metadata = { title: "Document" };

export default async function DocumentPage(props: PageProps<"/app/[companyId]/documents/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const doc = await db.document.findFirst({
    where: { id, companyId: C },
    include: { security: { include: { stakeholder: true } }, stakeholder: true, signatures: { orderBy: { sortOrder: "asc" } } },
  });
  if (!doc) notFound();
  const [uploader, consent, candidates, versions] = await Promise.all([
    doc.uploadedById ? db.user.findUnique({ where: { id: doc.uploadedById } }) : null,
    db.boardConsent.findFirst({ where: { documentId: doc.id } }),
    db.stakeholder.findMany({ where: { companyId: C, email: { not: null } }, select: { id: true, name: true, email: true, relationship: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ where: { companyId: C, entityType: "Document", entityId: doc.id }, orderBy: { createdAt: "desc" }, take: 15, include: { user: true } }),
  ]);
  const crumbs = doc.folder.split("/").filter(Boolean);
  const isBinary = !doc.content || (doc.storagePath && !doc.mimeType.startsWith("text/"));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Documents", href: `/app/${C}/documents` }, ...crumbs.map((c, i) => ({ label: c, href: `/app/${C}/documents?folder=${encodeURIComponent(crumbs.slice(0, i + 1).join("/"))}` })), { label: doc.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="min-w-0 break-words">{doc.name}</span>
            <span className="flex items-center gap-2">
              <Badge variant="outline">v{doc.version}</Badge> <StatusBadge status={doc.signatureStatus} />
            </span>
          </span>
        }
        description={`${DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type} · ${doc.mimeType} · ${doc.sizeBytes < 1024 ? `${doc.sizeBytes} B` : `${(doc.sizeBytes / 1024).toFixed(1)} KB`} · updated ${dateTime(doc.updatedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <a href={`/api/companies/${C}/documents/${doc.id}/download`}>
                <Download /> Download
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/api/companies/${C}/documents/${doc.id}/download?print=1`} target="_blank" rel="noreferrer">
                <Printer /> Print
              </a>
            </Button>
            <DocumentHeaderActions companyId={C} doc={{ id: doc.id, name: doc.name, folder: doc.folder, type: doc.type, visibility: doc.visibility, version: doc.version, signatureStatus: doc.signatureStatus, isCertificateOfLive: doc.type === "CERTIFICATE" && !!doc.security && ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(doc.security.status), isConsentRecord: !!consent && consent.status !== "DRAFT" }} canEdit={ctx.canEdit} />
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="h-fit">
          <CardContent className="px-5 py-5 sm:px-8 sm:py-6">
            {isBinary ? (
              <div className="rounded-md border border-dashed border-border-strong bg-muted/40 p-6 text-center sm:p-10">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <div className="mt-2 text-[13px] font-medium">{doc.name}</div>
                <div className="text-xs text-muted-foreground">{doc.mimeType} · stored in the document store</div>
                {doc.content ? <div className="mt-4 text-left"><Markdown content={doc.content} /></div> : null}
              </div>
            ) : (
              <Markdown content={doc.content ?? ""} />
            )}
          </CardContent>
        </Card>
        <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <Card className="md:row-span-2 xl:row-span-1">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                className="sm:max-md:grid-cols-2"
                items={[
                  { label: "Folder", value: <span className="flex flex-wrap items-center gap-1">{crumbs.map((c, i) => (<span key={i} className="flex items-center gap-1">{i > 0 ? <ChevronRight className="size-3 text-muted-foreground" /> : null}{c}</span>))}</span> },
                  { label: "Type", value: DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type },
                  { label: "Visibility", value: { COMPANY: "Company", HOLDER: "Related holder", INVESTORS: "Investors", BOARD: "Board", PUBLIC: "Public link" }[doc.visibility] ?? doc.visibility },
                  { label: "Related security", value: doc.security ? <Link href={`/app/${C}/securities/${doc.security.id}`} className="font-mono hover:underline">{doc.security.certificateNumber} <span className="font-sans text-muted-foreground">· {doc.security.stakeholder.name}</span></Link> : "—" },
                  { label: "Related stakeholder", value: doc.stakeholder ? <Link href={`/app/${C}/stakeholders/${doc.stakeholder.id}`} className="hover:underline">{doc.stakeholder.name}</Link> : "—" },
                  { label: "Board consent", value: consent ? <Link href={`/app/${C}/board/${consent.id}`} className="hover:underline">{consent.title}</Link> : "—" },
                  { label: "Uploaded by", value: uploader?.name ?? "System (generated)" },
                  { label: "Created", value: dateTime(doc.createdAt) },
                  { label: "Version", value: `v${doc.version}` },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Signatures</CardTitle>
                <CardDescription>{doc.signatures.length ? `${doc.signatures.filter((s) => s.status === "SIGNED").length} of ${doc.signatures.length} signed` : "No signatures requested"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SignaturePanel companyId={C} documentId={doc.id} signatures={doc.signatures.map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, status: s.status, signedAt: s.signedAt?.toISOString() ?? null, token: s.token, ipAddress: s.ipAddress }))} candidates={candidates.map((c) => ({ id: c.id, name: c.name, email: c.email as string, relationship: c.relationship }))} currentEmail={ctx.user.email} isAdmin={ctx.role === "ADMIN"} canEdit={ctx.canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs">
                {versions.map((a) => (
                  <li key={a.id}>
                    <div>{a.summary}</div>
                    <div className="text-muted-foreground">
                      {a.user?.name ?? "System"} · {date(a.createdAt)}
                    </div>
                  </li>
                ))}
                {versions.length === 0 ? <li className="text-muted-foreground">Generated {date(doc.createdAt)}.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
