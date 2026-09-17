// Dev helper: mints a session cookie for a seeded user so pages can be fetched with curl.
// Usage: npx tsx scripts/dev-session.ts [email]
import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const email = process.argv[2] ?? "maya@northwind.dev";
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { memberships: true } });
  const token = "dev-" + email.replace(/[^a-z]/g, "");
  await db.session.upsert({ where: { token }, update: { expiresAt: new Date(Date.now() + 86400000) }, create: { userId: u.id, token, expiresAt: new Date(Date.now() + 86400000) } });
  console.log(token, u.memberships[0].companyId);
  await db.$disconnect();
}
main();
