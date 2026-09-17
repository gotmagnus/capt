import "server-only";
import { addMonths } from "date-fns";
import type { CapTableData } from "@/lib/data/captable";
import { computeVesting } from "@/lib/equity/vesting";

export const PEOPLE_RELATIONSHIPS = ["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER", "ADVISOR", "CONSULTANT"];
const GRANT_TYPES = ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"];
const LIVE_STATUSES = ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"];

export interface EmployeeGrantRow {
  securityId: string;
  certificateNumber: string;
  type: string;
  status: string;
  quantity: number;
  cancelled: number;
  exercised: number;
  vested: number;
  unvested: number;
  forfeited: number;
  exercisable: number;
  exercisePrice: number | null;
  grantDate: string;
  vestingStart: string;
  cliffDate: string | null;
  fullyVestedDate: string | null;
  nextVestDate: string | null;
  nextVestAmount: number;
  percentVested: number;
  scheduleName: string | null;
}

export interface EmployeeRow {
  stakeholderId: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  relationship: string;
  employmentStatus: string | null;
  startDate: string | null;
  terminationDate: string | null;
  grants: EmployeeGrantRow[];
  grantCount: number;
  granted: number;
  vested: number;
  unvested: number;
  exercisable: number;
  exercised: number;
  forfeited: number;
  sharesHeld: number;
  nextVestDate: string | null;
  nextVestAmount: number;
  avgStrike: number | null;
  vestedValue: number; // in-the-money value of exercisable options + vested full-value awards at FMV
  percentVested: number;
  originalGrantDate: string | null;
  cliffDate: string | null;
  fullyVestedDate: string | null;
  monthsToFullyVested: number | null;
  refreshDue: boolean;
  suggestedRefresh: number;
}

export function buildEmployeeRows(data: CapTableData, fmv: number | null, asOf = new Date()): EmployeeRow[] {
  const rows: EmployeeRow[] = [];
  for (const sh of data.stakeholders) {
    if (!PEOPLE_RELATIONSHIPS.includes(sh.relationship)) continue;
    const mine = data.securities.filter((s) => s.stakeholderId === sh.id);
    const grants: EmployeeGrantRow[] = [];
    let granted = 0;
    let vested = 0;
    let unvested = 0;
    let exercisable = 0;
    let exercised = 0;
    let forfeited = 0;
    let vestedValue = 0;
    let strikeWeight = 0;
    let strikeSum = 0;
    let nextVestDate: Date | null = null;
    let nextVestAmount = 0;
    let sharesHeld = 0;
    let originalGrant: Date | null = null;
    let cliffDate: Date | null = null;
    let fullyVested: Date | null = null;

    for (const s of mine) {
      if (["COMMON_SHARES", "PREFERRED_SHARES"].includes(s.type) && LIVE_STATUSES.includes(s.status)) {
        sharesHeld += s.quantity - s.cancelledQuantity;
      }
      if (!GRANT_TYPES.includes(s.type) || !LIVE_STATUSES.includes(s.status)) continue;
      const schedule = s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null;
      const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate: sh.terminationDate, cancelled: s.cancelledQuantity });
      const isOption = s.type.startsWith("OPTION");
      const unexercised = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
      const grantExercisable = isOption ? Math.max(0, Math.min(unexercised, vest.vested - s.exercisedQuantity)) : 0;
      granted += s.quantity;
      vested += vest.vested;
      unvested += vest.unvested;
      forfeited += vest.forfeited + s.cancelledQuantity;
      exercised += s.exercisedQuantity;
      exercisable += grantExercisable;
      if (s.type === "RSA") sharesHeld += s.quantity - s.cancelledQuantity;
      if (isOption) {
        strikeWeight += unexercised;
        strikeSum += unexercised * (s.exercisePrice ?? 0);
        if (fmv != null) vestedValue += grantExercisable * Math.max(0, fmv - (s.exercisePrice ?? 0));
      } else if (fmv != null) {
        vestedValue += Math.max(0, vest.vested - s.exercisedQuantity) * fmv;
      }
      if (vest.nextVestDate && (!nextVestDate || vest.nextVestDate < nextVestDate)) {
        nextVestDate = vest.nextVestDate;
        nextVestAmount = vest.nextVestAmount;
      }
      const gd = s.grantDate ?? s.issueDate;
      if (isOption && (!originalGrant || gd < originalGrant)) {
        originalGrant = gd;
        cliffDate = vest.cliffDate;
        fullyVested = vest.fullyVestedDate;
      }
      grants.push({
        securityId: s.id,
        certificateNumber: s.certificateNumber,
        type: s.type,
        status: s.status,
        quantity: s.quantity,
        cancelled: s.cancelledQuantity,
        exercised: s.exercisedQuantity,
        vested: vest.vested,
        unvested: vest.unvested,
        forfeited: vest.forfeited,
        exercisable: grantExercisable,
        exercisePrice: s.exercisePrice,
        grantDate: gd.toISOString(),
        vestingStart: (s.vestingStartDate ?? s.issueDate).toISOString(),
        cliffDate: vest.cliffDate?.toISOString() ?? null,
        fullyVestedDate: vest.fullyVestedDate?.toISOString() ?? null,
        nextVestDate: vest.nextVestDate?.toISOString() ?? null,
        nextVestAmount: vest.nextVestAmount,
        percentVested: vest.percentVested,
        scheduleName: s.vestingSchedule?.name ?? null,
      });
    }
    const live = granted - forfeited;
    const percentVested = live > 0 ? vested / live : 0;
    const monthsToFullyVested = fullyVested ? Math.max(0, Math.round((fullyVested.getTime() - asOf.getTime()) / (30.44 * 86_400_000))) : null;
    const active = sh.employmentStatus === "ACTIVE" && sh.relationship !== "FORMER_EMPLOYEE";
    const refreshDue = active && grants.length > 0 && ((monthsToFullyVested !== null && monthsToFullyVested <= 12) || percentVested > 0.75);
    const originalQty = grants.filter((g) => g.type.startsWith("OPTION")).sort((a, b) => a.grantDate.localeCompare(b.grantDate))[0]?.quantity ?? 0;
    rows.push({
      stakeholderId: sh.id,
      name: sh.name,
      email: sh.email,
      title: sh.title,
      department: sh.department,
      relationship: sh.relationship,
      employmentStatus: sh.employmentStatus,
      startDate: sh.startDate?.toISOString() ?? null,
      terminationDate: sh.terminationDate?.toISOString() ?? null,
      grants,
      grantCount: grants.length,
      granted,
      vested,
      unvested,
      exercisable,
      exercised,
      forfeited,
      sharesHeld,
      nextVestDate: nextVestDate ? (nextVestDate as Date).toISOString() : null,
      nextVestAmount,
      avgStrike: strikeWeight > 0 ? strikeSum / strikeWeight : null,
      vestedValue,
      percentVested,
      originalGrantDate: originalGrant ? (originalGrant as Date).toISOString() : null,
      cliffDate: cliffDate ? (cliffDate as Date).toISOString() : null,
      fullyVestedDate: fullyVested ? (fullyVested as Date).toISOString() : null,
      monthsToFullyVested,
      refreshDue,
      suggestedRefresh: Math.round((originalQty * 0.25) / 1000) * 1000,
    });
  }
  return rows.sort((a, b) => b.granted - a.granted || a.name.localeCompare(b.name));
}

/** Exercisable grants per stakeholder, used by the "record exercise" and tender election dialogs. */
export function exercisableGrants(data: CapTableData, asOf = new Date()) {
  const out: { securityId: string; certificateNumber: string; stakeholderId: string; holderName: string; type: string; exercisable: number; exercisePrice: number; grantDate: string }[] = [];
  for (const s of data.securities) {
    if (!["OPTION_ISO", "OPTION_NSO", "WARRANT"].includes(s.type) || !LIVE_STATUSES.includes(s.status)) continue;
    const schedule = s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null;
    const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
    const unexercised = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
    const exercisable = Math.max(0, Math.min(unexercised, vest.vested - s.exercisedQuantity));
    if (exercisable <= 0) continue;
    out.push({ securityId: s.id, certificateNumber: s.certificateNumber, stakeholderId: s.stakeholderId, holderName: s.stakeholder.name, type: s.type, exercisable, exercisePrice: s.exercisePrice ?? 0, grantDate: (s.grantDate ?? s.issueDate).toISOString() });
  }
  return out.sort((a, b) => a.holderName.localeCompare(b.holderName));
}

export function exercisableForSecurity(data: CapTableData, securityId: string, asOf = new Date()) {
  const s = data.securities.find((x) => x.id === securityId);
  if (!s) return 0;
  const schedule = s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null;
  const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
  const unexercised = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
  return Math.max(0, Math.min(unexercised, vest.vested - s.exercisedQuantity));
}

export function monthKeyFrom(from: Date, offset: number) {
  const d = addMonths(new Date(from.getFullYear(), from.getMonth(), 1), offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
