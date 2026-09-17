// Dev helper: signs the throwaway consent created by e2e-consent-flow.ts setup, exercising
// the shared governance workflow directly. Run with NODE_OPTIONS="--require <shim>" that
// neutralises `server-only`.
import { PrismaClient } from "@prisma/client";
import { signConsentSigner, approvalState } from "@/lib/governance-consents";
async function main() {
  const db = new PrismaClient();
  const consent = await db.boardConsent.findFirstOrThrow({ where: { title: "__e2e__ Option grant approval" }, include: { signers: true } });
  console.log("before:", JSON.stringify(approvalState(consent)));
  const r1 = await signConsentSigner(consent.signers[0].id, { ipAddress: "127.0.0.1", typedName: consent.signers[0].name });
  console.log("after first:", JSON.stringify(r1));
  const mid = await db.boardConsent.findUniqueOrThrow({ where: { id: consent.id } });
  console.log("mid status:", mid.status);
  const r2 = await signConsentSigner(consent.signers[1].id, { ipAddress: "127.0.0.1", typedName: consent.signers[1].name });
  console.log("after second:", JSON.stringify(r2));
  const again = await signConsentSigner(consent.signers[1].id, { ipAddress: "127.0.0.1" }).catch((e) => ({ error: (e as Error).message }));
  console.log("re-sign guard:", JSON.stringify(again));
  await db.$disconnect();
}
main();
