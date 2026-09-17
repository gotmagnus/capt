import { computeVesting, type VestingResult, type VestingScheduleInput } from "@/lib/equity/vesting";
import { parseJson } from "@/lib/utils";
import { CONVERTIBLE_TYPES, EXERCISABLE_TYPES, SHARE_TYPES } from "@/lib/types";

export type SecurityGroup = "SHARES" | "OPTIONS" | "RSU_RSA" | "WARRANTS" | "CONVERTIBLES";

export const GROUP_LABELS: Record<SecurityGroup, string> = {
  SHARES: "Shares",
  OPTIONS: "Options",
  RSU_RSA: "RSUs & RSAs",
  WARRANTS: "Warrants",
  CONVERTIBLES: "Convertibles",
};

export function securityGroup(type: string): SecurityGroup {
  if (type === "COMMON_SHARES" || type === "PREFERRED_SHARES") return "SHARES";
  if (type === "OPTION_ISO" || type === "OPTION_NSO") return "OPTIONS";
  if (type === "RSU" || type === "RSA") return "RSU_RSA";
  if (type === "WARRANT") return "WARRANTS";
  return "CONVERTIBLES";
}

export function isShareType(type: string) {
  return SHARE_TYPES.includes(type as never);
}
export function isExercisable(type: string) {
  return EXERCISABLE_TYPES.includes(type as never);
}
export function isConvertible(type: string) {
  return CONVERTIBLE_TYPES.includes(type as never);
}
export function isVestingType(type: string) {
  return !isConvertible(type) && type !== "COMMON_SHARES" && type !== "PREFERRED_SHARES";
}

/** Certificate prefix for a new security of the given type. */
export function certPrefixFor(type: string, shareClassPrefix?: string | null) {
  switch (type) {
    case "COMMON_SHARES":
    case "PREFERRED_SHARES":
    case "RSA":
      return shareClassPrefix ?? "CS";
    case "OPTION_ISO":
    case "OPTION_NSO":
      return "ES";
    case "RSU":
      return "RSU";
    case "WARRANT":
      return "W";
    case "SAFE":
      return "SAFE";
    case "CONVERTIBLE_NOTE":
      return "CN";
    default:
      return "SEC";
  }
}

export interface AccelerationOverride {
  acceleratedAt?: string;
  shares?: number;
  reason?: string;
}

export interface EffectiveVesting extends VestingResult {
  accelerated: number;
}

/**
 * Vesting for a security, including any acceleration recorded in `accelerationOverride`
 * (the core engine ignores the override, so pages that show vesting use this instead).
 */
export function effectiveVesting(
  s: {
    quantity: number;
    cancelledQuantity: number;
    vestingStartDate?: Date | string | null;
    issueDate: Date | string;
    accelerationOverride?: string | null;
  },
  schedule: VestingScheduleInput | null | undefined,
  terminationDate?: Date | string | null,
  asOf: Date = new Date(),
): EffectiveVesting {
  const v = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule, { asOf, terminationDate, cancelled: s.cancelledQuantity });
  const ov = parseJson<AccelerationOverride | null>(s.accelerationOverride ?? null, null);
  if (ov?.shares && ov.shares > 0 && (!ov.acceleratedAt || new Date(ov.acceleratedAt) <= asOf)) {
    const add = Math.min(v.unvested + v.forfeited, ov.shares);
    const fromUnvested = Math.min(v.unvested, add);
    const fromForfeited = add - fromUnvested;
    const vested = v.vested + add;
    return {
      ...v,
      vested,
      unvested: v.unvested - fromUnvested,
      forfeited: v.forfeited - fromForfeited,
      percentVested: v.total > 0 ? vested / v.total : 0,
      accelerated: add,
    };
  }
  return { ...v, accelerated: 0 };
}

export const EXERCISE_METHODS = [
  { value: "ACH", label: "ACH transfer" },
  { value: "WIRE", label: "Wire" },
  { value: "CHECK", label: "Check" },
  { value: "CASHLESS", label: "Cashless (sell-to-cover)" },
  { value: "NET_EXERCISE", label: "Net exercise" },
];

export const SAFE_TYPES = [
  { value: "POST_MONEY", label: "Post-money valuation cap" },
  { value: "PRE_MONEY", label: "Pre-money valuation cap" },
];
