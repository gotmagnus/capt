import { ArrowDown, CheckCircle2, FileText, XCircle } from "lucide-react";
import { Logo } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { PROSE_FIXES } from "@/components/people-labels";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { resolveSigningToken } from "@/lib/governance-consents";
import { date, dateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { SignForm } from "./sign-form";

export const metadata = { title: "Sign document" };

export default async function SignPage(props: PageProps<"/sign/[token]">) {
  const { token } = await props.params;
  const resolved = await resolveSigningToken(token);

  if (!resolved) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <XCircle className="mx-auto size-8 text-danger" />
          <h1 className="mt-3 text-lg font-semibold">This signing link isn't valid</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">The link may have been revoked or already used. Contact the company for a new one.</p>
        </div>
      </Shell>
    );
  }

  const isConsent = resolved.kind === "CONSENT";
  const signerName = isConsent ? resolved.signer.name : resolved.signature.name;
  const signerEmail = isConsent ? resolved.signer.email : resolved.signature.email;
  const role = isConsent ? "Director" : resolved.signature.role;
  const signerStatus = isConsent ? resolved.signer.status : resolved.signature.status;
  const signedAt = isConsent ? resolved.signer.signedAt : resolved.signature.signedAt;
  const docTitle = isConsent ? resolved.consent.title : resolved.document.name;
  const content = resolved.document?.content ?? (isConsent ? resolved.consent.body : null);
  const closed = isConsent ? resolved.consent.status !== "SENT" : false;
  const parties = isConsent ? resolved.consent.signers.map((s) => ({ name: s.name, status: s.status, signedAt: s.signedAt })) : resolved.document.signatures.map((s) => ({ name: `${s.name} (${s.role.toLowerCase()})`, status: s.status, signedAt: s.signedAt }));
  const signed = parties.filter((p) => p.status === "SIGNED").length;
  const canSign = signerStatus !== "SIGNED" && signerStatus !== "DECLINED" && !(closed && isConsent);

  return (
    <Shell company={resolved.company.name}>
      <div className="mx-auto grid max-w-6xl gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Phones: the document comes first and can be long — offer a shortcut to the signature block. */}
        {canSign ? (
          <a href="#sign" className="flex h-9 items-center justify-center gap-2 rounded-md border border-border-strong bg-card text-[13px] font-medium shadow-sm lg:hidden">
            Your signature is requested — jump to sign <ArrowDown className="size-3.5" />
          </a>
        ) : null}
        <div className="min-w-0 rounded-lg border border-border bg-card">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold leading-snug">{docTitle}</h1>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {resolved.company.legalName} · {isConsent ? `Board consent · effective ${date(resolved.consent.effectiveDate)}` : `${DOCUMENT_TYPE_LABELS[resolved.document.type as DocumentType] ?? "Document"} · v${resolved.document.version}`}
                </div>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              {signed}/{parties.length} signed
            </Badge>
          </div>
          <div className="px-4 py-5 sm:px-8 sm:py-6">{content ? <Markdown content={content} className={PROSE_FIXES} /> : <p className="text-[13px] text-muted-foreground">This document is stored as a file. Ask the company for a copy before signing.</p>}</div>
        </div>

        <div id="sign" className="scroll-mt-4 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signer</div>
            <div className="mt-1 text-[15px] font-semibold">{signerName}</div>
            <div className="break-words text-xs text-muted-foreground">
              {signerEmail} · {role.charAt(0) + role.slice(1).toLowerCase()}
            </div>
            <div className="mt-4">
              {signerStatus === "SIGNED" ? (
                <div className="rounded-md border border-emerald-200 bg-success-soft p-4 text-[13px] text-success">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-4" /> Already signed
                  </div>
                  <div className="mt-1 opacity-90">Signed {dateTime(signedAt)}. No further action is needed.</div>
                </div>
              ) : signerStatus === "DECLINED" ? (
                <div className="rounded-md border border-red-200 bg-danger-soft p-4 text-[13px] text-danger">
                  <div className="flex items-center gap-2 font-semibold">
                    <XCircle className="size-4" /> You declined to sign
                  </div>
                  <div className="mt-1 opacity-90">The company has been notified.</div>
                </div>
              ) : closed && resolved.kind === "CONSENT" ? (
                <div className="rounded-md border border-border bg-muted p-4 text-[13px] text-muted-foreground">
                  This consent is no longer open for signature (status: <StatusBadge status={resolved.consent.status} />).
                </div>
              ) : (
                <SignForm token={token} signerName={signerName} role={role} />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All parties</div>
            <ul className="mt-2 divide-y divide-border">
              {parties.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular">
                    {p.signedAt ? date(p.signedAt) : ""}
                    <StatusBadge status={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 py-3">
          <Logo size={22} />
          {company ? (
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              <span className="hidden sm:inline">Signature request from </span>
              {company}
            </span>
          ) : null}
        </div>
      </header>
      <main className="px-4 py-5 sm:px-6 sm:py-8">{children}</main>
      <footer className="px-4 pb-8 text-center text-[11px] text-muted-foreground sm:px-6">Powered by Capt · Electronic signatures are legally binding under the ESIGN Act and UETA.</footer>
    </div>
  );
}
