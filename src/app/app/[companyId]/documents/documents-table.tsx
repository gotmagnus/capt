"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { DataTable, FilterSelect, type Column } from "@/components/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relative } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/types";

export interface DocumentRow {
  id: string;
  name: string;
  folder: string;
  type: string;
  visibility: string;
  signatureStatus: string;
  signed: number;
  signers: number;
  version: number;
  sizeBytes: number;
  updatedAt: string;
  security: { id: string; certificateNumber: string } | null;
  stakeholder: { id: string; name: string } | null;
}

const phoneHidden = "max-sm:hidden";
const VISIBILITY: Record<string, string> = { COMPANY: "Company", HOLDER: "Holder", INVESTORS: "Investors", BOARD: "Board", PUBLIC: "Public" };

export function DocumentsTable({ companyId, rows, folder, pendingOnly }: { companyId: string; rows: DocumentRow[]; folder: string; pendingOnly: boolean }) {
  const [type, setType] = useState("");
  const [visibility, setVisibility] = useState("");
  const filtered = rows.filter((r) => (!type || r.type === type) && (!visibility || r.visibility === visibility));
  const columns: Column<DocumentRow>[] = [
    {
      key: "name",
      header: "Document",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-start gap-2 sm:items-center">
          <FileText className="size-4 shrink-0 text-muted-foreground max-sm:mt-0.5" />
          <div className="min-w-0">
            <Link href={`/app/${companyId}/documents/${r.id}`} className="block max-w-[16rem] truncate font-medium hover:underline sm:max-w-[360px]" title={r.name}>
              {r.name}
            </Link>
            <div className="max-w-[16rem] truncate text-xs text-muted-foreground sm:max-w-[360px]">{r.folder}</div>
            {/* Phones show a single column: type and signature state fold under the name. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
              <Badge variant="outline">{DOCUMENT_TYPE_LABELS[r.type as DocumentType] ?? r.type}</Badge>
              {r.signatureStatus !== "NOT_REQUIRED" ? <StatusBadge status={r.signatureStatus} /> : null}
              {r.signers ? (
                <span className="text-xs text-muted-foreground tabular">
                  {r.signed}/{r.signers}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", className: phoneHidden, sortValue: (r) => r.type, cell: (r) => <Badge variant="outline">{DOCUMENT_TYPE_LABELS[r.type as DocumentType] ?? r.type}</Badge> },
    {
      key: "related",
      header: "Related",
      className: phoneHidden,
      sortValue: (r) => r.security?.certificateNumber ?? r.stakeholder?.name ?? "",
      cell: (r) => (
        <div className="text-xs">
          {r.security ? (
            <Link href={`/app/${companyId}/securities/${r.security.id}`} className="font-mono hover:underline" onClick={(e) => e.stopPropagation()}>
              {r.security.certificateNumber}
            </Link>
          ) : null}
          {r.security && r.stakeholder ? " · " : ""}
          {r.stakeholder ? (
            <Link href={`/app/${companyId}/stakeholders/${r.stakeholder.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {r.stakeholder.name}
            </Link>
          ) : null}
          {!r.security && !r.stakeholder ? <span className="text-muted-foreground">—</span> : null}
        </div>
      ),
    },
    { key: "visibility", header: "Visibility", className: phoneHidden, sortValue: (r) => r.visibility, cell: (r) => <span className="text-xs">{VISIBILITY[r.visibility] ?? r.visibility}</span> },
    {
      key: "signature",
      header: "Signatures",
      className: phoneHidden,
      sortValue: (r) => r.signatureStatus,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.signatureStatus} />
          {r.signers ? (
            <span className="text-xs text-muted-foreground tabular">
              {r.signed}/{r.signers}
            </span>
          ) : null}
        </div>
      ),
    },
    { key: "version", header: "v", align: "right", className: phoneHidden, sortValue: (r) => r.version, cell: (r) => <span className="text-muted-foreground">v{r.version}</span> },
    { key: "size", header: "Size", align: "right", className: phoneHidden, sortValue: (r) => r.sizeBytes, cell: (r) => <span className="text-muted-foreground">{r.sizeBytes < 1024 ? `${r.sizeBytes} B` : `${(r.sizeBytes / 1024).toFixed(1)} KB`}</span> },
    { key: "updated", header: "Updated", className: phoneHidden, sortValue: (r) => r.updatedAt, cell: (r) => <span className="text-muted-foreground">{relative(r.updatedAt)}</span> },
    {
      key: "dl",
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="ghost" size="icon-sm" asChild data-no-row>
          <a href={`/api/companies/${companyId}/documents/${r.id}/download`} aria-label="Download" onClick={(e) => e.stopPropagation()}>
            <Download />
          </a>
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/app/${companyId}/documents/${r.id}`}
      searchable={(r) => `${r.name} ${r.folder} ${r.type} ${r.security?.certificateNumber ?? ""} ${r.stakeholder?.name ?? ""}`}
      searchPlaceholder={folder ? `Search in ${folder}…` : "Search all documents…"}
      defaultSort={{ key: "updated", dir: "desc" }}
      emptyTitle={pendingOnly ? "Nothing awaiting signature" : folder ? "This folder is empty" : "No documents yet"}
      emptyDescription={pendingOnly ? "All signature requests are complete." : "Upload agreements or generate them from securities and consents."}
      filters={
        <>
          <FilterSelect label="Type" value={type} onChange={setType} options={Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Visibility" value={visibility} onChange={setVisibility} options={Object.entries(VISIBILITY).map(([value, label]) => ({ value, label }))} />
        </>
      }
      toolbar={<span className="text-xs text-muted-foreground">{filtered.length} document{filtered.length === 1 ? "" : "s"}</span>}
    />
  );
}
