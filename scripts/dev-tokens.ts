// Dev helper: prints seeded signing tokens and document ids for curl checks.
import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const consentSigner = await db.consentSigner.findFirst({ where: { status: "PENDING", consent: { status: "SENT" } } });
  const sentConsent = await db.boardConsent.findFirst({ where: { status: "SENT" } });
  const signature = await db.signature.findFirst({ where: { status: "PENDING" } });
  const cert = await db.document.findFirst({ where: { type: "CERTIFICATE" } });
  const consentDoc = await db.document.findFirst({ where: { type: "BOARD_CONSENT" } });
  console.log(JSON.stringify({ consentSignerToken: consentSigner?.token, sentConsentId: sentConsent?.id, signatureToken: signature?.token, certDocId: cert?.id, consentDocId: consentDoc?.id }));
  await db.$disconnect();
}
main();
