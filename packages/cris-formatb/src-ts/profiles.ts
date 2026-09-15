export type Profile = "fy1988" | "fy1991plus";
export const PROFILE_NAMES: readonly Profile[] = ["fy1988", "fy1991plus"];

/**
 * Registry keys: formatb.encoding.continuation_0xAC, formatb.encoding.separator_0xA0_0x02,
 * formatb.encoding.fy1988_sc_percent
 *
 * FY 1988 has no SN or BP lines; an SC value's percent is carried inside the SC block itself,
 * as a third 0xA0 0x02 segment on a continuation line of the same value. FY 1991 onward keeps
 * the percent out of the SC block, in a separate SN tag, so a value's raw text has only the
 * one code/label separator -- `percentInBlock` is what tells `splitSegments` (record.ts)
 * which of those two shapes it is reading.
 */
export const PROFILES = {
  fy1991plus: { continuationByte: 0xac, sepA: 0xa0, sepB: 0x02, percentInBlock: false },
  fy1988:     { continuationByte: 0xac, sepA: 0xa0, sepB: 0x02, percentInBlock: true },
} as const;
