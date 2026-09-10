import { render5 } from "../../src/dialog/render5";
import type { LogicalRecord, SourceField } from "@barcstory/cris-formatb";

const F = (tag: string, ...values: string[]): SourceField => ({ tag, values: values.map(raw => ({ raw, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });
const CL = (tag: string, ...pairs: [string, string][]): SourceField => ({ tag, values: pairs.map(([code, label]) => ({ raw: `${code}  ${label}`, code, label, line: 0, offset: 0 })), lineStart: 0, lineEnd: 0, offset: 0, length: 0 });

// Three SC values, one SN value: SN is shorter than SC.
const rec: LogicalRecord = {
  file: "synthetic", firstLine: 0, lastLine: 0, offset: 0, length: 0, an: "TEST0002", orphanContinuations: 0,
  fields: [
    CL("SC", ["S1015", "Peaches"], ["S2610", "Flue-Cured Tobacco"], ["S3110", "Sweet Potatoes"]),
    F("SN", "070%"),
  ],
};

test("an SC row is formed only where SN has a value; the rest print unaligned under their own tag", () => {
  const out = render5(rec).map(l => l.text);
  expect(out.some(l => /^ {9}S1015 {3}Peaches\s+070%$/.test(l))).toBe(true);
  expect(out).toContain("         SC S2610   Flue-Cured Tobacco");
  expect(out).toContain("         SC S3110   Sweet Potatoes");
  expect(out.some(l => /Flue-Cured Tobacco\s+$/.test(l))).toBe(false); // no blank-percent row
});

test("a surplus SN value still prints under its own tag", () => {
  const recWithExtraSn: LogicalRecord = {
    ...rec,
    fields: [CL("SC", ["S1015", "Peaches"]), F("SN", "070%", "030%")],
  };
  const out = render5(recWithExtraSn).map(l => l.text);
  expect(out).toContain("         SN 030%");
});

test("the provenance of an unaligned line names one tag, not the pair", () => {
  const l = render5(rec).find(x => x.text.includes("SC S2610"))!;
  expect(l.provenance!.sources).toEqual([{ tag: "SC", valueIndex: 1 }]);
});
