export type Profile = "fy1988" | "fy1991plus";
export const PROFILE_NAMES: readonly Profile[] = ["fy1988", "fy1991plus"];

/**
 * Registry keys: formatb.encoding.continuation_0xAC, formatb.encoding.separator_0xA0_0x02
 *
 * fy1988 is a reserved name, not yet a distinct behavior. The FY 1988 layout differs (no SN
 * or BP lines; SC percents carried inside the SC block with control bytes), but nothing in
 * this reader reads those differently from fy1991plus yet -- both profiles below are
 * identical in every field a caller can observe. Continuation and separator handling for the
 * FY 1988 layout is not implemented here; until it is, the name exists so a caller can
 * already say which corpus year it is parsing (--profile fy1988) without that choice
 * changing anything.
 */
export const PROFILES = {
  fy1991plus: { continuationByte: 0xac, sepA: 0xa0, sepB: 0x02 },
  fy1988:     { continuationByte: 0xac, sepA: 0xa0, sepB: 0x02 },
} as const;
