import { render5 } from "../../src/dialog/render5";
import type { LogicalRecord, SourceField } from "@barcstory/cris-formatb";

const F = (tag: string, ...values: string[]): SourceField => ({ tag, values: values.map(raw => ({ raw, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });
const CL = (tag: string, ...pairs: [string, string][]): SourceField => ({ tag, values: pairs.map(([code, label]) => ({ raw: `${code}  ${label}`, code, label, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });

// A synthetic record with unequal composite-column lengths: the five PC
// columns (RP, AC, CM, FS, CT) carry two values each; PA (a GC column) carries only one,
// shorter than the PC row count; JC (the other GC column) carries three, longer than it.
const rec: LogicalRecord = {
  file: "synthetic", firstLine: 0, lastLine: 0, offset: 0, length: 0, an: "TEST0001", orphanContinuations: 0,
  fields: [
    F("RP", "R100", "R200"), F("AC", "A100", "A200"), F("CM", "C100", "C200"),
    F("FS", "F100", "F200"), F("CT", "010%", "020%"),
    F("PA", "P1.00"), F("JC", "J1", "J2", "J3"),
  ],
};

test("the PC row count comes from the five PC columns, not the shorter GC column", () => {
  const out = render5(rec);
  const rows = out.filter(l => l.provenance?.sources?.some(s => s.tag === "RP" && s.valueIndex !== undefined));
  expect(rows).toHaveLength(2); // min(RP,AC,CM,FS,CT lengths) = 2, not min(...,PA's 1)
});

test("a GC column shorter than the row count pads its cell blank, never shrinking the grid", () => {
  const out = render5(rec).map(l => l.text);
  const row2 = out.find(t => t.includes("R200") && t.includes("A200"));
  expect(row2, "second PC row missing").toBeDefined();
  expect(row2).not.toContain("P1.00"); // PA has no second value; the row 2 cell is blank
});

test("a GC column longer than the row count prints its surplus value separately, never dropped", () => {
  const out = render5(rec).map(l => l.text);
  expect(out).toContain("        JC J3");
});

test("the first PC row still carries the GC values that are present", () => {
  const out = render5(rec).map(l => l.text);
  const row1 = out.find(t => t.includes("R100") && t.includes("A100"));
  expect(row1).toContain("P1.00");
  expect(row1).toContain("J1");
});

test("a GC row is formed only up to the shorter GC column, never inside a PC row it has no partner in", () => {
  // JC's second value ("J2") falls at index 1, inside the PC row count (n=2) but beyond
  // gcN=min(PA.length=1, JC.length=3)=1. A row is formed only for an index present in every
  // column, so "J2" asserts no row relationship and is preserved as surplus under its own
  // tag, not printed inside PC row 2 the way the pre-fix code did.
  const out = render5(rec).map(l => l.text);
  expect(out).toContain("        JC J2");
  const row2 = out.find(t => t.includes("R200") && t.includes("A200"));
  expect(row2, "second PC row missing").toBeDefined();
  expect(row2).not.toContain("J2");
});

test("a missing tag (BT/AT/DT absent here) renders as blank, never the literal 'undefined'", () => {
  const out = render5(rec).map(l => l.text).join("\n");
  expect(out).not.toContain("undefined");
  const basicLine = render5(rec).map(l => l.text).find(t => t.includes("BASIC"));
  expect(basicLine).toBe("      BASIC     APPLIED     DEVELOPMENTAL ");
});

const text = (r: LogicalRecord) => render5(r).map(l => l.text).join("\n");

test("GC values beyond the PC row count are still printed, as tagged surplus", () => {
  const r: LogicalRecord = { ...rec, fields: [F("RP", "R1"), F("AC", "A1"), F("CM", "C1"), F("FS", "F1"), F("CT", "100"), F("PA", "P1", "P2", "P3"), F("JC", "J1", "J2", "J3")] };
  const t = text(r);
  for (const v of ["P2", "P3", "J2", "J3"]) expect(t).toContain(v);
});

test("GC values with no PC fields at all are still printed", () => {
  const r: LogicalRecord = { ...rec, fields: [F("PA", "P1"), F("JC", "J1")] };
  const t = text(r);
  expect(t).toContain("P1"); expect(t).toContain("J1");
});

// This pinned string belongs here rather than among the evidence tests: the
// Blue Sheet sample record marks its own GENERAL HEADINGS line "# unreproduced:" (it doubles
// the space before each label; render5's fixed form below does not), so pinning this exact
// text as evidence overstated what the sample documents. It freezes render5's own reflow
// choice (single space, semicolon join, per render.headings.join) as a regression, not a claim
// about the sample.
test("GENERAL HEADINGS joins code/label pairs with a single space and a semicolon", () => {
  const r: LogicalRecord = { ...rec, fields: [CL("GH", ["P8.01", "Human Nutrition"], ["J4A", "Human Nutrition"])] };
  expect(text(r)).toContain(" GENERAL HEADINGS: P8.01 Human Nutrition; J4A Human Nutrition");
});
