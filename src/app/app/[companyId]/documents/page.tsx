import Link from "next/link";
import { ChevronRight, FolderOpen, Folder, Files, PenLine, Upload } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Stat } from "@/components/ui/page";
import { DocumentsTable, type DocumentRow } from "./documents-table";
import { UploadDialog } from "./upload-dialog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Documents" };

interface FolderNode {
  name: string;
  path: string;
  count: number;
  total: number;
  children: FolderNode[];
}

function buildTree(folders: { folder: string; count: number }[]): FolderNode[] {
  const root: FolderNode[] = [];
  for (const f of folders) {
    const parts = f.folder.split("/").filter(Boolean);
    let level = root;
    let path = "";
    for (let i = 0; i < parts.length; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i];
      let node = level.find((n) => n.path === path);
      if (!node) {
        node = { name: parts[i], path, count: 0, total: 0, children: [] };
        level.push(node);
      }
      node.total += f.count;
      if (i === parts.length - 1) node.count += f.count;
      level = node.children;
    }
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root);
  return root;
}

export default async function DocumentsPage(props: PageProps<"/app/[companyId]/documents">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireWorkspace(companyId);
  const C = ctx.company.id;
  const folder = typeof sp.folder === "string" ? sp.folder : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const [docs, folderCounts, securities, stakeholders] = await Promise.all([
    db.document.findMany({ where: { companyId: C }, include: { security: { select: { id: true, certificateNumber: true } }, stakeholder: { select: { id: true, name: true } }, signatures: { select: { status: true } } }, orderBy: { updatedAt: "desc" } }),
    db.document.groupBy({ by: ["folder"], where: { companyId: C }, _count: { _all: true } }),
    db.security.findMany({ where: { companyId: C }, select: { id: true, certificateNumber: true, stakeholder: { select: { name: true } } }, orderBy: { certificateNumber: "asc" } }),
    db.stakeholder.findMany({ where: { companyId: C }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const tree = buildTree(folderCounts.map((f) => ({ folder: f.folder, count: f._count._all })));
  const folderNames = folderCounts.map((f) => f.folder).sort();
  const pending = docs.filter((d) => d.signatureStatus === "PENDING" || d.signatureStatus === "PARTIALLY_SIGNED");
  const filtered = docs.filter((d) => (!folder || d.folder === folder || d.folder.startsWith(folder + "/")) && (status !== "pending" || d.signatureStatus === "PENDING" || d.signatureStatus === "PARTIALLY_SIGNED"));
  const rows: DocumentRow[] = filtered.map((d) => ({
    id: d.id,
    name: d.name,
    folder: d.folder,
    type: d.type,
    visibility: d.visibility,
    signatureStatus: d.signatureStatus,
    signed: d.signatures.filter((s) => s.status === "SIGNED").length,
    signers: d.signatures.length,
    version: d.version,
    sizeBytes: d.sizeBytes,
    updatedAt: d.updatedAt.toISOString(),
    security: d.security ? { id: d.security.id, certificateNumber: d.security.certificateNumber } : null,
    stakeholder: d.stakeholder ? { id: d.stakeholder.id, name: d.stakeholder.name } : null,
  }));

  const within = (path: string) => folder === path || folder.startsWith(path + "/");

  // Desktop tree: a branch opens only along the selected path, so 40+ per-security folders stay tucked away.
  const FolderLink = ({ node, depth }: { node: FolderNode; depth: number }) => {
    const active = folder === node.path;
    const row = cn("flex items-center rounded-md text-[13px] hover:bg-muted", active && "bg-accent-soft font-medium text-accent-foreground");
    const link = (
      <Link href={`/app/${C}/documents?folder=${encodeURIComponent(node.path)}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2">
        {active ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0 text-muted-foreground" />}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular">{node.total}</span>
      </Link>
    );
    const indent = { paddingLeft: 4 + depth * 14 };
    if (!node.children.length) {
      return (
        <li>
          <div className={row} style={indent}>
            <span className="w-5 shrink-0" />
            {link}
          </div>
        </li>
      );
    }
    return (
      <li>
        <details open={within(node.path)} className="group/folder">
          <summary className={cn(row, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")} style={indent} title={`Show folders in ${node.name}`}>
            <span className="flex w-5 shrink-0 items-center justify-center self-stretch text-muted-foreground">
              <ChevronRight className="size-3.5 transition-transform group-open/folder:rotate-90" />
            </span>
            {link}
          </summary>
          <ul className="mt-0.5 space-y-0.5">
            {node.children.map((c) => (
              <FolderLink key={c.path} node={c} depth={depth + 1} />
            ))}
          </ul>
        </details>
      </li>
    );
  };

  // Phones and tablets: folders become scrollable chip rows, one row per level of the selected path.
  const activePath: FolderNode[] = [];
  for (let level = tree, parts = folder ? folder.split("/") : [], i = 0; i < parts.length; i++) {
    const node = level.find((n) => n.name === parts[i]);
    if (!node) break;
    activePath.push(node);
    level = node.children;
  }
  const chip = (active: boolean) => cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px]", active ? "border-transparent bg-accent-soft font-medium text-accent-foreground" : "border-border bg-card hover:bg-muted");
  const chipRow = "-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6";

  return (
    <>
      <PageHeader
        title="Documents"
        description="Your data room: certificates, agreements, consents, valuations and filings — organised by folder and permissioned by audience."
        actions={ctx.canEdit ? <UploadDialog companyId={C} folders={folderNames} defaultFolder={folder || "General"} securities={securities.map((s) => ({ id: s.id, label: `${s.certificateNumber} · ${s.stakeholder.name}` }))} stakeholders={stakeholders} /> : null}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Documents" value={docs.length} icon={Files} hint={`${folderCounts.length} folders`} />
        <Stat label="Awaiting signature" value={pending.length} icon={PenLine} tone={pending.length ? "warning" : "default"} hint={pending.length ? <Link href={`/app/${C}/documents?status=pending`} className="hover:underline">Show pending</Link> : "All signed"} />
        <Stat label="Generated this month" value={docs.filter((d) => d.createdAt.getMonth() === new Date().getMonth() && d.createdAt.getFullYear() === new Date().getFullYear()).length} icon={Upload} />
        <Stat label="Storage" value={`${(docs.reduce((a, d) => a + d.sizeBytes, 0) / 1024).toFixed(0)} KB`} hint="Text documents are stored inline" />
      </div>
      <nav className="mb-4 space-y-2 lg:hidden" aria-label="Folders">
        <div className={chipRow}>
          <Link href={`/app/${C}/documents`} className={chip(!folder && status !== "pending")}>
            <Files className="size-3.5" /> All <span className="text-[11px] tabular opacity-70">{docs.length}</span>
          </Link>
          <Link href={`/app/${C}/documents?status=pending`} className={chip(status === "pending")}>
            <PenLine className="size-3.5" /> Awaiting signature <span className="text-[11px] tabular opacity-70">{pending.length}</span>
          </Link>
          {/* The selected branch moves to the front so it is visible without scrolling the strip. */}
          {[...tree]
            .sort((a, b) => Number(within(b.path)) - Number(within(a.path)))
            .map((n) => (
              <Link key={n.path} href={`/app/${C}/documents?folder=${encodeURIComponent(n.path)}`} className={chip(within(n.path))}>
                <Folder className="size-3.5" /> {n.name} <span className="text-[11px] tabular opacity-70">{n.total}</span>
              </Link>
            ))}
        </div>
        {activePath
          .filter((n) => n.children.length)
          .map((parent) => (
            <div key={parent.path} className={chipRow}>
              {parent.children.map((n) => (
                <Link key={n.path} href={`/app/${C}/documents?folder=${encodeURIComponent(n.path)}`} className={chip(within(n.path))}>
                  {n.name} <span className="text-[11px] tabular opacity-70">{n.total}</span>
                </Link>
              ))}
            </div>
          ))}
      </nav>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="hidden h-fit rounded-lg border border-border bg-card p-2 lg:block" aria-label="Folders">
          <ul className="space-y-0.5">
            <li>
              <Link href={`/app/${C}/documents`} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", !folder && status !== "pending" && "bg-accent-soft text-accent-foreground font-medium")}>
                <Files className="size-4" /> All documents
                <span className="ml-auto text-[11px] text-muted-foreground tabular">{docs.length}</span>
              </Link>
            </li>
            <li>
              <Link href={`/app/${C}/documents?status=pending`} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", status === "pending" && "bg-accent-soft text-accent-foreground font-medium")}>
                <PenLine className="size-4" /> Awaiting signature
                <span className="ml-auto text-[11px] text-muted-foreground tabular">{pending.length}</span>
              </Link>
            </li>
            <li className="px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Folders</li>
            {tree.map((n) => (
              <FolderLink key={n.path} node={n} depth={0} />
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <DocumentsTable companyId={C} rows={rows} folder={folder} pendingOnly={status === "pending"} />
        </div>
      </div>
    </>
  );
}
