// Verifies the termination math used by terminateStakeholder against the seeded data (read-only).
import { PrismaClient } from "@prisma/client";
import { computeVesting } from "../src/lib/equity/vesting";
async function main() {
  const db = new PrismaClient();
  const sh = await db.stakeholder.findFirstOrThrow({ where: { name: "Noah Williams" }, include: { securities: { include: { vestingSchedule: { include: { milestones: true } } } } } });
  const terminationDate = new Date(2026, 8, 30);
  for (const s of sh.securities) {
    const sched = s.vestingSchedule ? { ...s.vestingSchedule, milestones: s.vestingSchedule.milestones } : null;
    const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, sched, { asOf: terminationDate, terminationDate, cancelled: s.cancelledQuantity });
    const unexercised = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
    const unvested = Math.max(0, Math.min(unexercised, vest.total - vest.vested));
    console.log(s.certificateNumber, { granted: s.quantity, vestedAtTermination: vest.vested, unvestedToCancel: unvested, stillExercisable: unexercised - unvested, forfeited: vest.forfeited, terminated: vest.terminated });
    // 35,000 granted 2024-04-15, 4y/1y cliff monthly: at 2026-09-30, 29 full months → floor(35000*29/48) = 21,145 vested
    if (s.certificateNumber === "ES-9") {
      const expected = Math.floor((35_000 * 29) / 48);
      if (vest.vested !== expected) throw new Error(`expected ${expected} vested, got ${vest.vested}`);
      if (unvested !== 35_000 - expected) throw new Error("unvested mismatch");
      console.log("✓ termination math matches expectation");
    }
  }
  await db.$disconnect();
}
main();
