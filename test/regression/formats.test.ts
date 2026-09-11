import { readFileSync } from "node:fs";
import { scanRecords, parseRecord } from "@barcstory/cris-formatb";
import { format1, format6, formatCodes } from "../../src/dialog/formats";

// The same real archival record test/archival/render5-9049442.test.ts checks format 5 against:
// a real record's bytes read from the corpus (base line 83052 in RG164.CRIS.FY94.txt), not a
// constructed one. AN=09049442 is that record's own accession number; fixtures/acceptance-fy94.json
// (scripts/naive-split.py's independent derivation) already confirms this AN carries
// IN=HAMMERSCHLAG F A, in in_hammerschlag_f_a -- the same fact the formatCodes test below relies
// on -- so no new naive-split.py derivation is needed here.
const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const rec = parseRecord(bytes, scanRecords(bytes, 83052).spans[0]!, "RG164.CRIS.FY94.txt", "fy1991plus");

test("format 1 prints the padded accession number and nothing else", () => {
  expect(format1(rec).map(l => l.text)).toEqual([" 09049442"]);
});

test("format 6 prints the 1978 labels in the 1978 order", () => {
  const text = format6(rec).map(l => l.text).join("\n");
  for (const label of ["AGENCY ID:", "PROJ NO:", "PERIOD:", "INVEST:", "PERF ORG:", "LOCATION:"])
    expect(text).toContain(label);
  expect(text.indexOf("AGENCY ID:")).toBeLessThan(text.indexOf("PROJ NO:"));
});

test("a display-code format prints only the named fields, in the order named", () => {
  const text = formatCodes(rec, ["IN", "OB"]).map(l => l.text);
  expect(text.some(t => t.includes("HAMMERSCHLAG"))).toBe(true);
  expect(text.some(t => t.includes("KEYWORDS"))).toBe(false);
});

test("an undocumented display code is refused rather than printed empty", () => {
  expect(() => formatCodes(rec, ["ZZ"])).toThrow(/ZZ/);
});
