import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/companies/[companyId]/search">) {
  const { companyId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !user.memberships.some((m) => m.companyId === companyId)) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const [stakeholders, securities] = await Promise.all([
    db.stakeholder.findMany({ where: { companyId, OR: [{ name: { contains: q } }, { email: { contains: q } }] }, take: 6, select: { id: true, name: true, relationship: true } }),
    db.security.findMany({ where: { companyId, certificateNumber: { contains: q } }, take: 6, select: { id: true, certificateNumber: true, type: true, stakeholder: { select: { name: true } } } }),
  ]);
  return NextResponse.json({
    hits: [
      ...stakeholders.map((s) => ({ type: "stakeholder", label: s.name, hint: s.relationship.replace(/_/g, " ").toLowerCase(), href: `/app/${companyId}/stakeholders/${s.id}` })),
      ...securities.map((s) => ({ type: "security", label: s.certificateNumber, hint: `${SECURITY_TYPE_LABELS[s.type as SecurityType] ?? s.type} · ${s.stakeholder.name}`, href: `/app/${companyId}/securities/${s.id}` })),
    ],
  });
}
