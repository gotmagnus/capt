import "server-only";
import type { CapTableData } from "@/lib/data/captable";
import { computeVesting } from "@/lib/equity/vesting";

export interface TenderSecurity {
  securityId: string;
  certificateNumber: string;
  type: string;
  kind: "SHARES" | "OPTIONS";
  held: number;
  sellable: number;
  exercisePrice: number | null;
}

export interface TenderHolder {
  stakeholderId: string;
  userId: string | null;
  name: string;
  relationship: string;
  email: string | null;
  sharesHeld: number;
  vestedOptions: number;
  sellable: number;
  cap: number;
  securities: TenderSecurity[];
}

/** Holders eligible for a tender offer with what each could sell (vested shares + vested unexercised options). */
export function tenderHolders(data: CapTableData, eligibility: string[], maxPercentPerHolder: number, asOf = new Date()): TenderHolder[] {
  const out: TenderHolder[] = [];
  for (const sh of data.stakeholders) {
    if (!eligibility.includes(sh.relationship)) continue;
    const securities: TenderSecurity[] = [];
    let sharesHeld = 0;
    let vestedOptions = 0;
    for (const s of data.securities) {
      if (s.stakeholderId !== sh.id || !["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(s.status)) continue;
      const schedule = s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null;
      if (["COMMON_SHARES", "RSA"].includes(s.type)) {
        const held = s.quantity - s.cancelledQuantity;
        if (held <= 0) continue;
        const vest = s.type === "RSA" ? computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate: sh.terminationDate, cancelled: s.cancelledQuantity }) : null;
        const sellable = vest ? Math.min(held, vest.vested) : held;
        sharesHeld += held;
        securities.push({ securityId: s.id, certificateNumber: s.certificateNumber, type: s.type, kind: "SHARES", held, sellable, exercisePrice: null });
      } else if (["OPTION_ISO", "OPTION_NSO"].includes(s.type)) {
        const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate: sh.terminationDate, cancelled: s.cancelledQuantity });
        const unexercised = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
        const sellable = Math.max(0, Math.min(unexercised, vest.vested - s.exercisedQuantity));
        if (unexercised <= 0) continue;
        vestedOptions += sellable;
        securities.push({ securityId: s.id, certificateNumber: s.certificateNumber, type: s.type, kind: "OPTIONS", held: unexercised, sellable, exercisePrice: s.exercisePrice });
      }
    }
    const sellable = securities.reduce((a, s) => a + s.sellable, 0);
    if (securities.length === 0) continue;
    out.push({ stakeholderId: sh.id, userId: sh.userId, name: sh.name, relationship: sh.relationship, email: sh.email, sharesHeld, vestedOptions, sellable, cap: Math.floor((sellable * maxPercentPerHolder) / 100), securities: securities.filter((s) => s.sellable > 0) });
  }
  return out.sort((a, b) => b.sellable - a.sellable);
}
