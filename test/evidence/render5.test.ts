import { readFileSync } from "node:fs";
import { render5 } from "../../src/dialog/render5";
import type { LogicalRecord, SourceField } from "@barcstory/cris-formatb";

const rawLines = readFileSync("fixtures/bluesheet-sample-1998.txt", "utf8").split("\n");
const sample = rawLines.filter(l => !l.startsWith("#"));
// Lines the fixture itself marks "# unreproduced:" (a documented delta
// between the sample's transcription and render5's own reflow -- see fixtures/SOURCES.md and
// the comments beside each marker) are comment lines, so the `sample` filter above already
// drops them silently. This makes that exclusion explicit and reports its size, so a marker
// added or removed from the fixture is caught here rather than passing unnoticed.
const unreproduced = rawLines.filter(l => l.startsWith("# unreproduced:"));
const F = (tag: string, ...values: string[]): SourceField => ({ tag, values: values.map(raw => ({ raw, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });
const CL = (tag: string, ...pairs: [string, string][]): SourceField => ({ tag, values: pairs.map(([code, label]) => ({ raw: `${code}  ${label}`, code, label, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });

/** The Blue Sheet sample record's CRIS fields, reconstructed as source fields. */
const rec: LogicalRecord = { file: "sample", firstLine: 0, lastLine: 0, offset: 0, length: 0, an: "9089306", orphanContinuations: 0, fields: [
  F("AN", "9089306"), F("PN", "OHO00748"), F("AS", "CSRS"), F("DS", "OHO"), F("PT", "HATCH"), F("RG", "NC"), F("RN", "00167"),
  F("SX", "01 OCT 87"), F("TX", "30 SEP 92"), F("FY", "1989"), F("IN", "SNOOK J T"), F("PF", "HOME ECONOMICS"), F("PI", "OHIO STATE UNIV"),
  F("CY", "COLUMBUS"), F("ST", "OHIO"), F("ZP", "43210"),
  F("TI", "HEALTH MAINTENANCE ASPECTS OF DIETARY RECOMMENDATIONS DESIGNED TO MODIFY LIPID METABOLISM"),
  F("RP", "R708", "R708", "R708", "R708"), F("AC", "A6360", "A6360", "A6360", "A6360"), F("CM", "C2500", "C3100", "C1400", "C4000"),
  F("FS", "F0913", "F0913", "F0913", "F0913"), F("CT", "040%", "020%", "020%", "020%"), F("PA", "P8.01", "P8.01", "P8.01", "P8.01"), F("JC", "J4A", "J4A", "J4A", "J4A"),
  CL("PH", ["R708", "Human Nutrition"], ["A6360", "Metabolism, Function of Nutrients-Food"], ["C2500", "Other Oilseeds and Oil Crops"], ["C3100", "Dairy Cattle"], ["C1400", "Corn"], ["C4000", "People as Individual Workers, Consumers"], ["F0913", "Nutrition and Metabolism-Human"]),
  CL("GH", ["P8.01", "Human Nutrition"], ["J4A", "Human Nutrition"]),
  CL("SC", ["XHMR", "Health and Medical Related"], ["S2540", "Safflower"], ["S2550", "Sunflower"], ["S3110", "Butter"]), F("SN", "100%", "020%", "020%", "020%"),
  F("BT", "050%"), F("AT", "050%"), F("DT", "000%"),
  F("PX", "8901 TO 8912"), F("IC", "001370"), F("OC", "003090"), F("RE", "3"), F("PD", "880304"), F("UP", "900618"), F("PS", "REVISED"), F("SF", "CRIS"),
]};

test("header, identity block, title, grid, headings, special classification, percents", () => {
  const out = render5(rec).map(l => l.text);
  for (const expected of [
    " DIALOG(R)File  60:CRIS/USDA",
    " (c) format only 1998 The Dialog Corporation plc",
    " 09089306",
    " PROJ NO: OHO00748   AGENCY : CSRS OHO",
    " PROJ TYPE: HATCH               REGIONAL PROJ NO: NC 00167",
    " START: 01 OCT 87  TERM: 30 SEP 92              FY: 1989",
    " INVEST: SNOOK J T",
    " HOME ECONOMICS",
    " OHIO STATE UNIV",
    " COLUMBUS OHIO 43210",
    "        RPA   ACTVTY  CMMDTY  SCNCE   PRCNT    PRGM   JTC",
    "        R708  A6360   C2500   F0913   040%     P8.01  J4A",
    "        R708  A6360   C4000   F0913   020%     P8.01  J4A",
    "         S2540   Safflower                                 020%",
    "      BASIC 050%    APPLIED 050%    DEVELOPMENTAL 000%",
    "  PROGRESS: 8901 TO 8912",
    " CRIS SUPPLEMENTARY DATA:  INST CODE:  001370;  ORG CODE:  003090;",
    " PROJECT STATUS:  REVISED",
    " SUBFILE: CRIS",
  ]) expect(out, `missing: ${expected}`).toContain(expected);
});

test("the '(p' truncation filter removes nothing today: it is a residual guard against a naive HTML-tag-strip artifact, not an active exclusion", () => {
  expect(sample.filter(l => l.endsWith("(p")).length).toBe(0);
});

test("reports how many sample lines are marked unreproduced and skipped by the in-order check below", () => {
  // 4 markers cover the PRIMARY HEADINGS wrap (the sample's stray 0xA6 byte and its own hard
  // wrap points, which render5's greedy-fill does not reproduce) and 1 covers GENERAL
  // HEADINGS (the sample doubles the space before each label; render5's fixed form does not).
  expect(unreproduced, "the fixture's set of '# unreproduced:' markers changed -- update this count").toHaveLength(5);
});

// render.text.justify (inferred, 65-column greedy fill and stretch) shapes every reflowed
// line -- TI, PH, GH, and textBlock's OB/AP/DE/PR/PB rows -- so it must be cited on the lines
// it shaped, not only read at module scope, or it never reaches the inspect panel's evidence
// card.
test("the title line and heading lines cite render.text.justify, the rule that reflowed them", () => {
  const out = render5(rec);
  const ti = out.find(l => l.text.includes("HEALTH MAINTENANCE"));
  expect(ti?.provenance?.registryKeys, "TI line").toContain("render.text.justify");
  const ph = out.find(l => l.text.startsWith(" PRIMARY HEADINGS"));
  expect(ph?.provenance?.registryKeys, "PH line").toContain("render.text.justify");
  const gh = out.find(l => l.text.startsWith(" GENERAL HEADINGS"));
  expect(gh?.provenance?.registryKeys, "GH line").toContain("render.text.justify");
});

// The two-line banner is documented only from a 1998 source (the registry's own claim), so it
// cites render.type.header rather than the render.format5.layout key every other structural
// line carries. Otherwise a reader inspecting the one visibly anachronistic line in the
// session would be told nothing about the 1998 date.
test("the two header lines cite render.type.header, not the generic layout key", () => {
  const out = render5(rec);
  expect(out[0]!.text).toBe(" DIALOG(R)File  60:CRIS/USDA");
  expect(out[0]!.provenance?.registryKeys).toEqual(["render.type.header"]);
  expect(out[1]!.text).toBe(" (c) format only 1998 The Dialog Corporation plc");
  expect(out[1]!.provenance?.registryKeys).toEqual(["render.type.header"]);
});

test("every non-truncated CRIS-only sample line is produced in order", () => {
  const out = render5(rec).map(l => l.text.replace(/\s+$/, ""));
  const wanted = sample.filter(l => !l.endsWith("(p")).map(l => l.replace(/\s+$/, ""));
  let cursor = 0;
  for (const w of wanted) {
    const i = out.indexOf(w, cursor);
    expect(i, `not found in order: ${JSON.stringify(w)}`).toBeGreaterThanOrEqual(0);
    cursor = i + 1;
  }
});
