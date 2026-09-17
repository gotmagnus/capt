import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireCompany } from "@/lib/auth";
import { loadPortal, canViewDocument } from "@/lib/portal-data";
import { date, dateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { PageHeader, Alert } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";
import { ActionForm, SubmitButton } from "@/components/forms";
import { signDocument } from "../../actions";

export const metadata = { title: "Document" };

export default async function PortalDocumentPage(props: PageProps<"/portal/[companyId]/documents/[id]">) {
  const { companyId, id } = await props.params;
  const ctx = await requireCompany(companyId);
  const p = await loadPortal(ctx.company.id, ctx);
  const C = ctx.company.id;
  const doc = await canViewDocument(p, id);
  if (!doc) notFound();
  const email = ctx.user.email.toLowerCase();
  const mySignature = doc.signatures.find((s) => s.status === "PENDING" && (s.email.toLowerCase() === email || (s.stakeholderId && p.myIds.has(s.stakeholderId))));

  return (
    <>
      <PageHeader
        title={doc.name}
        description={`${DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type} · ${date(doc.createdAt, "long")}${doc.security ? ` · ${doc.security.certificateNumber}` : ""}`}
        breadcrumbs={[{ label: "Documents", href: `/portal/${C}/documents` }, { label: doc.folder }, { label: doc.name }]}
        actions={
          <>
            {doc.signatureStatus !== "NOT_REQUIRED" ? <StatusBadge status={doc.signatureStatus} /> : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Printer className="size-3.5" /> Use your browser's print to save a PDF
            </span>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">{doc.content ? <Markdown content={doc.content} className={PROSE_FIXES} /> : <p className="text-[13px] text-muted-foreground">This document was uploaded as a file ({doc.mimeType}); ask your equity team for a copy.</p>}</CardContent>
        </Card>
        <div className="space-y-4">
          {mySignature ? (
            <Card className="border-warning/50">
              <CardHeader>
                <div>
                  <CardTitle>Your signature is required</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ActionForm action={signDocument} hidden={{ companyId: C, documentId: doc.id }} className="space-y-3" successMessage="Signed">
                  <p className="text-[13px] text-muted-foreground">
                    Signing as <span className="font-medium text-foreground">{mySignature.name}</span> ({mySignature.role.toLowerCase()}). Your electronic signature is legally binding under the E-SIGN Act.
                  </p>
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-blue-600" /> I have read this document and agree to be bound by its terms.
                  </label>
                  <SubmitButton className="w-full">Sign document</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
          {doc.signatures.length ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Signatures</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {doc.signatures.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-[13px]">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.role.toLowerCase()}
                        {s.signedAt ? ` · ${dateTime(s.signedAt)}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {doc.type === "ELECTION_83B" ? <Alert tone="info">Print this election, sign it and mail it to the IRS office where you file your return within 30 days of the transfer date. Keep a copy and send one to the company.</Alert> : null}
          {doc.type === "FORM_3921" ? <Alert tone="info">Keep this form with your tax records. You may need Box 3 and Box 4 to compute the AMT adjustment on Form 6251.</Alert> : null}
        </div>
      </div>
    </>
  );
}
