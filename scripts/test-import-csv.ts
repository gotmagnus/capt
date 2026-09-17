// Exercises the CSV import parser/validator against the seeded company (no writes).
import { PrismaClient } from "@prisma/client";
import { parseCsv, toRawRows, validateRows, importTemplateCsv, normalizeSecurityType } from "../src/lib/import-csv";

async function main() {
  const db = new PrismaClient();
  const company = await db.company.findUniqueOrThrow({ where: { slug: "northwind" } });
  const ctx = {
    shareClasses: await db.shareClass.findMany({ where: { companyId: company.id } }),
    equityPlans: await db.equityPlan.findMany({ where: { companyId: company.id } }),
    vestingSchedules: await db.vestingSchedule.findMany({ where: { companyId: company.id } }),
    stakeholders: await db.stakeholder.findMany({ where: { companyId: company.id }, select: { id: true, name: true, email: true } }),
  };
  const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error("FAIL: " + msg); console.log("ok  ", msg); };

  const quoted = parseCsv('a,"b, with comma","c ""quoted"""\r\n1,2,3\n');
  assert(quoted.length === 2 && quoted[0][1] === "b, with comma" && quoted[0][2] === 'c "quoted"', "parses quotes, escaped quotes and CRLF");
  assert(normalizeSecurityType("iso") === "OPTION_ISO" && normalizeSecurityType("Preferred Stock") === "PREFERRED_SHARES" && normalizeSecurityType("bogus") === null, "normalizes security type aliases");

  const { rows, missing } = toRawRows(importTemplateCsv());
  assert(missing.length === 0 && rows.length === 3, "template has all required columns and 3 example rows");
  const validated = validateRows(rows, ctx);
  const ada = validated[0];
  assert(ada.errors.length === 0 && ada.equityPlanId && ada.vestingScheduleId && ada.existingStakeholderId === null, `template row 1 valid: plan+schedule resolved, new holder (${ada.errors.join("; ")})`);
  const basecamp = validated[1];
  assert(basecamp.errors.length === 0 && basecamp.shareClassId && basecamp.existingStakeholderId === null, `template row 2 resolves Series A class; generic example holder is new (${basecamp.errors.join("; ")})`);
  const matched = validateRows(toRawRows("Holder name,Email,Security type,Quantity,Issue date,Share class or plan\nWhatever Name,james@basecamp.vc,preferred,100,2026-01-01,Series A Preferred\nMaya Chen,,common,100,2026-01-01,Common Stock").rows, ctx);
  assert(matched[0].existingStakeholderId && matched[1].existingStakeholderId, "existing stakeholders matched by email and by exact name");
  const grace = validated[2];
  assert(grace.errors.length === 0 && grace.securityType === "RSA" && grace.shareClassId, "template row 3 RSA resolves common class");

  const bad = validateRows(toRawRows("Holder name,Security type,Quantity,Issue date,Share class or plan,Vesting schedule\n,iso,-5,not-a-date,Nope Plan,Nope Schedule\nJane,safe,25000,2026-01-01,,").rows, ctx);
  assert(bad[0].errors.length >= 4, `bad row collects errors: ${bad[0].errors.join(" | ")}`);
  assert(bad[1].errors.length === 0 && bad[1].securityType === "SAFE" && bad[1].quantity === 25000, "SAFE row uses quantity as principal and needs no class");

  const noHeader = toRawRows("Name,Qty\nx,1");
  assert(noHeader.missing.includes("securityType") && noHeader.missing.includes("issueDate"), "reports missing required columns");
  await db.$disconnect();
  console.log("\nAll CSV import checks passed.");
}
main().catch((e) => { console.error(e); process.exit(1); });
