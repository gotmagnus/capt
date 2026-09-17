import { loadCapTable } from "@/lib/data/captable";
import { csvResponse, type ExportSheet } from "@/lib/export";
import { routeAccess } from "@/lib/captable-actions";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import { parseJson } from "@/lib/utils";
import { toInputDate } from "@/lib/format";

export async function GET(_request: Request, ctx: RouteContext<"/api/companies/[companyId]/exports/stakeholders">) {
  const { companyId } = await ctx.params;
  const access = await routeAccess(companyId);
  if ("response" in access) return access.response;
  const data = await loadCapTable(companyId);
  const byId = new Map(data.summary.rows.map((r) => [r.stakeholderId, r]));
  const sheet: ExportSheet = {
    name: "Stakeholders",
    columns: [
      { key: "name", header: "Name" },
      { key: "email", header: "Email" },
      { key: "type", header: "Type" },
      { key: "relationship", header: "Relationship" },
      { key: "title", header: "Title" },
      { key: "department", header: "Department" },
      { key: "employmentStatus", header: "Employment status" },
      { key: "startDate", header: "Start date" },
      { key: "terminationDate", header: "Termination date" },
      { key: "country", header: "Country" },
      { key: "accredited", header: "Accredited" },
      { key: "outstanding", header: "Outstanding shares", type: "shares" },
      { key: "options", header: "Options outstanding", type: "shares" },
      { key: "fullyDiluted", header: "Fully diluted shares", type: "shares" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
      { key: "invested", header: "Invested", type: "money" },
      { key: "portal", header: "Portal status" },
      { key: "tags", header: "Tags" },
    ],
    rows: data.stakeholders.map((s) => {
      const r = byId.get(s.id);
      return {
        name: s.name,
        email: s.email ?? "",
        type: s.type,
        relationship: RELATIONSHIP_LABELS[s.relationship as StakeholderRelationship] ?? s.relationship,
        title: s.title ?? "",
        department: s.department ?? "",
        employmentStatus: s.employmentStatus ?? "",
        startDate: toInputDate(s.startDate),
        terminationDate: toInputDate(s.terminationDate),
        country: s.country,
        accredited: s.accredited ? "Yes" : "No",
        outstanding: r?.outstandingShares ?? 0,
        options: r?.optionsOutstanding ?? 0,
        fullyDiluted: r?.fullyDilutedShares ?? 0,
        fullyDilutedPct: r?.fullyDilutedPct ?? 0,
        invested: r?.invested ?? 0,
        portal: s.portalAcceptedAt ? "Active" : s.portalInvitedAt ? "Invited" : "Not invited",
        tags: parseJson<string[]>(s.tags, []).join("; "),
      };
    }),
  };
  return csvResponse(sheet, `${data.company.slug}-stakeholders`);
}
