// Output formats other than 5: format 1 (accession number alone), format 6 (heading and
// title, the 1978 File 60 session's own labels), and user-defined display-code formats
// (`T S3/IN,OB/1-5`). Formats 2,3,4,7,8,9,10,12,13,14 stay notices -- docs/not-implemented.md.
import { field, fields, type LogicalRecord } from "@barcstory/cris-formatb";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import { MAP } from "./map";
import { justify, L } from "./render5";

registry.get("render.format1.layout");
registry.get("render.format6.labels");
registry.get("render.format6.columns");
registry.get("render.userformat.codes");

const v = (rec: LogicalRecord, tag: string, i = 0): string => field(rec, tag)?.values[i]?.raw ?? "";
const vals = (rec: LogicalRecord, tag: string) => fields(rec, tag).flatMap(f => f.values);

/** The display codes the Blue Sheet's Search Options tables list, mapped to the Format B
 * tags each one prints. A user-defined format is a comma-separated list of these. Re-derived
 * from the DISPLAY CODE column of the Basic Index and Additional Indexes tables in
 * sources/bluesheets/file60/bl0060_19980423153346.html -- every code the Blue Sheet lists
 * under a real display code (not "None") is here, including several codes the Blue Sheet
 * footnotes to a record system other than CRIS: AG, AI, CD, GD, N1, NC, SP, UL are HNRIMS
 * Records only (footnote 3), and XP is HNRIMS and CZARIS Records (footnotes 3,5). GY, ID, SD
 * and TD (raw tags GY, ID, SX, TX -- SD and TD display through the same SX/TX fields map.ts's
 * own dialog-code note uses) sit in the same "absent from FY 1994" group below, but none of
 * the four is HNRIMS/ICAR/CZARIS-only: GY is CRIS Records (footnote 1); SD carries no footnote
 * at all; TD is CRIS and ICAR Records (footnotes 1,4); ID is CRIS and HNRIMS Records
 * (footnotes 1,3). A code the Blue Sheet lists whose tag is absent from FY 1994 is kept in the
 * map and prints nothing for a CRIS record -- that is the record's content, not a missing
 * feature.
 *
 * `AT` (Activity Type Code and Name, footnote 3, HNRIMS-only) is the one code left out rather
 * than guessed: its raw Format B tag is not independently held anywhere in this project's
 * sources, and the two-letter tag "AT" is already this reconstruction's own tag for a
 * different field entirely (Applied Percent, displayed under "A1=" -- map.ts, render5.ts's
 * BASIC/APPLIED/DEVELOPMENTAL line). Mapping display code AT to raw tag AT would print the
 * wrong field's value on a CRIS record instead of nothing, so it is a statement of absence,
 * not a silent guess. `SO` and `SU` carry no display code at all ("None" in the Blue Sheet's
 * own column) and are not display codes to begin with.
 *
 * TX (Text) is the Blue Sheet's documented union of AP, NR, OB and PR (footnote 6), but this
 * reconstruction already built its /TX word index as AP + OB + PR only (map.TX.composite,
 * docs/indexes.md): the HNRIMS narrative tag has a measured count of 0 on this corpus. Display
 * follows the same precedent rather than adding NR/NA back in for this one code alone.
 */
export const DISPLAY_CODES: Readonly<Record<string, readonly string[]>> = {
  // Basic Index (search suffix / display code column)
  AP: ["AP"], DE: ["DE"], NR: ["NA"], OB: ["OB"], PB: ["PB"], PR: ["PR"], TI: ["TI"],
  TX: ["AP", "OB", "PR"],
  // Additional Indexes -- CRIS-applicable and cross-subfile codes already established in map.ts
  A1: ["AT"], AN: ["AN"], AS: ["AS"], B1: ["BT"], CY: ["CY"], D1: ["DT"], DS: ["DS"],
  FY: ["FY"], GC: ["PA", "JC"], IC: ["IC"], IN: ["IN"], OC: ["OC"], PC: ["RP", "AC", "CM", "FS", "CT"],
  PD: ["PD"], PN: ["PN"], PO: ["PF", "PI"], PP: ["PX"], PS: ["PS"], PT: ["PT"], RE: ["RE"],
  RG: ["RG"], RN: ["RN"], SC: ["SC", "SN"], SF: ["SF"], SH: ["PH", "GH"], ST: ["ST"], UP: ["UP"],
  ZP: ["ZP"], CG: ["CG"], SD: ["SX"], TD: ["TX"],
  // Additional Indexes -- not in map.ts because Format 5 never shows them; a real CRIS record
  // has no data under these tags. Most are HNRIMS-only (AG, AI, CD, GD, N1, NC, SP -- footnote
  // 3) or HNRIMS/CZARIS (XP -- footnotes 3,5); GY and ID are not HNRIMS-only despite living
  // here (GY is CRIS, footnote 1; ID is CRIS and HNRIMS, footnotes 1,3) -- see the doc comment
  // above.
  AG: ["AG"], AI: ["AI"], CD: ["CD"], GD: ["GD"], GY: ["GY"], ID: ["ID"], N1: ["N1"], NC: ["NC"],
  SP: ["SP"], UL: ["UL"], XP: ["XP"],
};

/** Format 1: the accession number alone, the same padding rule render5's own AN line uses
 * (map.AN.display_padding) -- this is the whole of what the Blue Sheet's Predefined Format
 * Options table documents for format 1. */
export function format1(rec: LogicalRecord): OutputLine[] {
  return [line(" " + v(rec, "AN").padStart(8, "0"), {
    sources: [{ tag: "AN" }],
    registryKeys: ["render.format1.layout", "map.AN.display_padding"],
  })];
}

const f6Line = (text: string, tags: string[]): OutputLine =>
  line(text, {
    sources: tags.map(t => ({ tag: t })),
    registryKeys: [...tags.map(t => MAP[t]?.registry ?? "render.format6.labels"), "render.format6.labels", "render.format6.columns"],
  });

/** Format 6: heading and title. The block leads with the record's DIALOG accession number,
 * padded the same way format1's own AN line is (map.AN.display_padding, reused rather than
 * restated) -- the 1978 File 60 session's own two printed examples open `16/6/1` with
 * "0071310          AGENCY ID: ..." before the six labels. Those six labels and their order --
 * AGENCY ID:, PROJ NO:, PERIOD:, INVEST:, PERF ORG:, LOCATION: -- are the same two examples
 * (render.format6.labels); one label per line is this reconstruction's own column choice
 * (render.format6.columns), since the 1978 print is typeset and its layout is not evidence --
 * the AN's own leading line is the one piece of that print's column layout this reconstruction
 * does follow, since it is the block's own leading element, not an inter-column position. The
 * title wraps the same unstretched way render5's TI does. */
export function format6(rec: LogicalRecord): OutputLine[] {
  const agency = [v(rec, "AS"), v(rec, "DS")].filter(Boolean).join(" ");
  const out: OutputLine[] = [
    line(" " + v(rec, "AN").padStart(8, "0"), {
      sources: [{ tag: "AN" }],
      registryKeys: ["render.format6.labels", "map.AN.display_padding"],
    }),
    f6Line(`AGENCY ID: ${agency}`, ["AS", "DS"]),
    f6Line(`PROJ NO: ${v(rec, "PN")}`, ["PN"]),
    f6Line(`PERIOD: ${v(rec, "SX")} TO ${v(rec, "TX")}`, ["SX", "TX"]),
    f6Line(`INVEST: ${v(rec, "IN")}`, ["IN"]),
    f6Line(`PERF ORG: ${v(rec, "PF")}`, ["PF"]),
    f6Line(`LOCATION: ${v(rec, "PI")}`, ["PI"]),
    line(""),
  ];
  for (const r of justify(v(rec, "TI"), undefined, false)) out.push(f6Line(r, ["TI"]));
  return out;
}

/** A user-defined format: a comma-separated list of display codes (`T S3/IN,OB/1-5`). Each
 * code maps through DISPLAY_CODES to the Format B tag(s) it prints, one line per value, in
 * the order the codes were named -- an unknown code is refused the same way an unknown search
 * prefix is, rather than printed empty (render.userformat.codes). */
export function formatCodes(rec: LogicalRecord, codes: string[]): OutputLine[] {
  const out: OutputLine[] = [];
  for (const code of codes) {
    const tags = DISPLAY_CODES[code];
    if (!tags) throw new Error(`unknown display code: ${code}`);
    for (const tag of tags) for (const val of vals(rec, tag)) out.push(L(val.raw, [tag]));
  }
  return out;
}
