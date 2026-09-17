import { NextResponse } from "next/server";
import { marked } from "marked";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/documents/[id]/download">) {
  const { companyId, id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !user.memberships.some((m) => m.companyId === companyId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const doc = await db.document.findFirst({ where: { id, companyId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.auditLog.create({ data: { companyId, userId: user.id, action: "EXPORT", entityType: "Document", entityId: doc.id, summary: `Downloaded “${doc.name}”` } });
  const safeName = doc.name.replace(/[^a-zA-Z0-9._ -]/g, "").trim() || "document";
  const print = new URL(request.url).searchParams.get("print") === "1";
  if (print) {
    const body = marked.parse(doc.content ?? `*${doc.name}* (binary file)`) as string;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title><style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6;font-size:14px;color:#101828}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #d0d5dd;padding:6px 8px;text-align:left}th{background:#f1f2f4}h1{font-size:22px}h2{font-size:17px}h3{font-size:15px}hr{border:0;border-top:1px solid #e4e7ec}@media print{body{margin:0}}</style></head><body onload="window.print()">${body}</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const isText = doc.content && (doc.mimeType.startsWith("text/") || !doc.storagePath);
  const ext = doc.mimeType === "text/markdown" ? "md" : doc.mimeType === "text/csv" ? "csv" : "txt";
  return new Response(isText ? doc.content ?? "" : doc.content ?? "", {
    headers: {
      "Content-Type": `${isText ? doc.mimeType : "text/markdown"}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${safeName}.${isText ? ext : "md"}"`,
    },
  });
}
