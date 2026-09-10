import { field, fields, type LogicalRecord } from "@barcstory/cris-formatb";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import { MAP } from "./map";

const HEADER = registry.get("render.type.header").value as string[];
const JUST = registry.get("render.text.justify").value as { width: number };
const JOIN = registry.get("render.headings.join").value as string;
registry.get("render.format5.layout"); registry.get("map.AN.display_padding"); registry.get("map.PO.displays_PF_PI");
registry.get("map.PC.composite"); registry.get("map.GC.composite"); registry.get("map.SC.percent_from_SN"); registry.get("map.PP.display_from_PX");
registry.get("proto.error.bad_format");

const v = (rec: LogicalRecord, tag: string, i = 0): string => field(rec, tag)?.values[i]?.raw ?? "";
const has = (rec: LogicalRecord, tag: string): boolean => field(rec, tag) !== undefined;
const vals = (rec: LogicalRecord, tag: string) => fields(rec, tag).flatMap(f => f.values);
const src = (t: string, valueIndex?: number) => valueIndex === undefined ? { tag: t } : { tag: t, valueIndex };
/** `valueIndex`, when given, links every listed tag to its single value at that position
 * (a classification-grid row, an SC/SN row) instead of the whole field. */
const L = (text: string, tags: string[], valueIndex?: number): OutputLine =>
  line(text, { sources: tags.map(t => src(t, valueIndex)), registryKeys: tags.map(t => MAP[t]?.registry ?? "render.format5.layout") });
/** Like L, but for a line justify() actually reflowed: render.text.justify (the 65-column
 * greedy-fill-and-stretch rule) shapes the line's own spacing, not just the source field's
 * mapping, so it belongs in that line's own registryKeys. Read only at module scope it would
 * never reach the inspect panel's evidence card. */
const LJ = (text: string, tags: string[]): OutputLine =>
  line(text, { sources: tags.map(t => src(t)), registryKeys: [...tags.map(t => MAP[t]?.registry ?? "render.format5.layout"), "render.text.justify"] });
const lit = (text: string): OutputLine => line(text, { registryKeys: ["render.format5.layout"] });
/** The two-line banner is documented only from a 1998 source (render.type.header's own
 * claim); cite that key directly rather than the generic render.format5.layout, so a reader
 * inspecting the one visibly anachronistic line in a 1990-1994 session is told why. */
const hdr = (text: string): OutputLine => line(text, { registryKeys: ["render.type.header"] });
const pad = (s: string, w: number) => s.length >= w ? s : s + " ".repeat(w - s.length);

/**
 * Greedy fill to `width`. `stretch` (default true) full-justifies every line but the last
 * (chosen algorithm; registry render.text.justify) -- the form measured for the OBJECTIVES,
 * APPROACH, and PROGRESS narrative in the 1998 sample (fixtures/SOURCES.md). The title and
 * the SH= heading lines wrap the same way but do not stretch to width in that sample (every
 * measured line falls short of the width); render5() below passes stretch:false for those.
 * The `stretch` parameter and its two call sites exist because that measurement of the
 * sample showed title and heading lines unstretched.
 *
 * render.text.justify's stored width is 65, the sample's own measured continuation-line
 * width (fixtures/SOURCES.md). TI's wrap call below uses this width directly rather than
 * width - 1, and reproduces the sample's TI break exactly (see the registry entry's note
 * for the trial).
 */
export function justify(text: string, width = JUST.width, stretch = true): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[][] = []; let cur: string[] = []; let len = 0;
  for (const w of words) {
    if (cur.length && len + 1 + w.length > width) { rows.push(cur); cur = []; len = 0; }
    len += (cur.length ? 1 : 0) + w.length; cur.push(w);
  }
  if (cur.length) rows.push(cur);
  return rows.map((r, i) => {
    if (!stretch || i === rows.length - 1 || r.length === 1) return r.join(" ");
    const gaps = r.length - 1, spaces = width - r.reduce((a, w) => a + w.length, 0);
    const base = Math.floor(spaces / gaps), extra = spaces % gaps;
    return r.map((w, j) => j < gaps ? w + " ".repeat(base + (j < extra ? 1 : 0)) : w).join("");
  });
}

function textBlock(rec: LogicalRecord, tag: string, label: string): OutputLine[] {
  if (!has(rec, tag)) return [];
  const rows = justify(`${label} ${v(rec, tag)}`);
  return [lit(""), ...rows.map((r, i) => LJ((i === 0 ? "  " : " ") + r, [tag]))];
}

export function render5(rec: LogicalRecord): OutputLine[] {
  const out: OutputLine[] = [hdr(HEADER[0]!), hdr(HEADER[1]!), lit("")];
  out.push(L(" " + v(rec, "AN").padStart(8, "0"), ["AN"]));
  const agency = [v(rec, "AS"), v(rec, "DS")].filter(Boolean).join(" ");
  out.push(L(` PROJ NO: ${v(rec, "PN")}   AGENCY : ${agency}`, ["PN", "AS", "DS"]));
  const proj = pad(` PROJ TYPE: ${v(rec, "PT")}`, 32) + (has(rec, "RG") ? `REGIONAL PROJ NO: ${v(rec, "RG")} ${v(rec, "RN")}` : "");
  out.push(L(proj.trimEnd(), ["PT", "RG", "RN"]));
  out.push(L(pad(` START: ${v(rec, "SX")}  TERM: ${v(rec, "TX")}`, 48) + `FY: ${v(rec, "FY")}`, ["SX", "TX", "FY"]));
  for (const f of fields(rec, "IN")) out.push(L(` INVEST: ${f.values[0]!.raw}`, ["IN"]));
  for (const t of ["PF", "PI"]) for (const f of fields(rec, t)) for (const x of f.values) out.push(L(` ${x.raw}`, [t]));
  out.push(L(` ${[v(rec, "CY"), v(rec, "ST"), v(rec, "ZP")].filter(Boolean).join(" ")}`, ["CY", "ST", "ZP"]));
  out.push(lit(""));
  for (const r of justify(v(rec, "TI"), JUST.width, false)) out.push(LJ("  " + r, ["TI"]));
  out.push(lit(""), lit("                                                 GENERAL"), lit("              PRIMARY CLASSIFICATION         CLASSIFICATION"), lit(""),
    lit("        RPA   ACTVTY  CMMDTY  SCNCE   PRCNT    PRGM   JTC"));
  const pcTags = ["RP", "AC", "CM", "FS", "CT"] as const;
  const gcTags = ["PA", "JC"] as const;
  const tags7 = [...pcTags, ...gcTags] as const;
  const cols = tags7.map(t => vals(rec, t));
  const pcCols = cols.slice(0, pcTags.length);
  const gcCols = cols.slice(pcTags.length);
  // PC row n is formed from the nth value of RP, AC, CM, FS, CT alone. GC
  // (PA, JC) prints on the same grid row, but forms its own row only up to its own shorter
  // column -- the mismatch rule that governs PC applies to GC too: a GC
  // value beyond gcN has no row relationship to any PC row and is preserved as surplus below
  // the grid instead, even at an index still inside the PC row count. Any column's surplus
  // beyond its own row count, PC or GC, is preserved below the grid (unaligned, never dropped).
  const n = Math.min(...pcCols.map(c => c.length));
  const gcN = Math.min(gcCols[0]!.length, gcCols[1]!.length);
  for (let i = 0; i < n; i++) {
    const [rp, ac, cm, fs, ct] = pcCols.map(c => c[i]!.raw);
    const pa = i < gcN ? gcCols[0]![i]!.raw : "", jc = i < gcN ? gcCols[1]![i]!.raw : "";
    out.push(L(`        ${pad(rp!, 6)}${pad(ac!, 8)}${pad(cm!, 8)}${pad(fs!, 8)}${pad(ct!, 9)}${pad(pa, 7)}${jc}`, [...tags7], i));
  }
  tags7.forEach((t, i) => { for (const extra of cols[i]!.slice(i < pcTags.length ? n : Math.min(gcN, n))) out.push(L(`        ${t} ${extra.raw}`, [t])); }); // unaligned surplus, never dropped
  const heads = (tag: string) => fields(rec, tag).flatMap(f => f.values).map(x => `${x.code} ${x.label}`).join(JOIN);
  if (fields(rec, "PH").length) { out.push(lit("")); for (const r of justify("PRIMARY HEADINGS: " + heads("PH"), JUST.width, false)) out.push(LJ(" " + r, ["PH"])); }
  if (fields(rec, "GH").length) { out.push(lit("")); for (const r of justify("GENERAL HEADINGS: " + heads("GH"), JUST.width, false)) out.push(LJ(" " + r, ["GH"])); }
  const sc = vals(rec, "SC"), sn = vals(rec, "SN");
  if (sc.length) {
    out.push(lit(""), lit("                     SPECIAL CLASSIFICATION AND HEADINGS"));
    // 9 leading spaces; code and label as one field padded to 50 so the percent lands at
    // column 59 (measured: XHMR/S2540/S2550/S3110 rows all put the percent at that column,
    // whether the code is 4 or 5 characters -- the code-label gap is a fixed 3 spaces, not
    // a fixed code width).
    sc.forEach((x, i) => out.push(L(`         ${pad(`${x.code ?? x.raw}   ${x.label ?? ""}`, 50)}${sn[i]?.raw ?? ""}`, ["SC", "SN"], i)));
    for (const extra of sn.slice(sc.length)) out.push(L(`         SN ${extra.raw}`, ["SN"]));
  }
  out.push(lit(""), L(`      BASIC ${v(rec, "BT")}    APPLIED ${v(rec, "AT")}    DEVELOPMENTAL ${v(rec, "DT")}`, ["BT", "AT", "DT"]));
  out.push(...textBlock(rec, "OB", "OBJECTIVES:"), ...textBlock(rec, "AP", "APPROACH:"), ...textBlock(rec, "DE", "KEYWORDS:"));
  if (has(rec, "PX")) { out.push(lit(""), L(`  PROGRESS: ${v(rec, "PX")}`, ["PX"])); for (const r of justify(v(rec, "PR"))) out.push(LJ(" " + r, ["PR"])); }
  if (has(rec, "PB")) { out.push(lit(""), lit("  PUBLICATIONS:")); for (const r of justify(v(rec, "PB"), JUST.width - 4)) out.push(LJ("     " + r, ["PB"])); }
  out.push(lit(""), L(` CRIS SUPPLEMENTARY DATA:  INST CODE:  ${v(rec, "IC")};  ORG CODE:  ${v(rec, "OC")};`, ["IC", "OC"]));
  out.push(L(` REG:  ${v(rec, "RE")};   PROCESS  DATE:   ${v(rec, "PD")};   PROGRESS  UPDATE:   ${v(rec, "UP")};`, ["RE", "PD", "UP"]));
  out.push(L(` PROJECT STATUS:  ${v(rec, "PS")}`, ["PS"]), lit(""), L(` SUBFILE: ${v(rec, "SF")}`, ["SF"]));
  return out;
}

/**
 * TYPE's format dispatch: format 5 is the only implemented layout; every other format number
 * or code list prints the simulated "? /<format>" error line, citing proto.error.bad_format.
 * Exported so src/app/main.ts and scripts/cast.ts share one wiring instead of each writing
 * this fallback out by hand -- separate copies drifted, and scripts/cast.ts's copy dropped
 * the registry key, so an unimplemented format printed a line citing nothing in the cast
 * while the live app cited proto.error.bad_format.
 */
export const renderFor = (rec: LogicalRecord, format: string): OutputLine[] =>
  format === "5" ? render5(rec) : [line(`? /${format}`, { registryKeys: ["proto.error.bad_format"] })];
