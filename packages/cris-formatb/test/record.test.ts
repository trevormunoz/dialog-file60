import { readFileSync } from "node:fs";
import { scanRecords } from "../src/offsets";
import { parseRecord, field, fields } from "../src/record";

const bytes = new Uint8Array(readFileSync(new URL("../fixtures/fy94-9049442.bin", import.meta.url)));
const { spans: [span] } = scanRecords(bytes, 83052);
const rec = parseRecord(bytes, span!, "RG164.CRIS.FY94.txt", "fy1991plus");

test("simple field: single value, padding stripped, offsets kept", () => {
  const ds = field(rec, "DS")!;
  expect(ds.values.map(v => v.raw)).toEqual(["1275"]);
  expect(ds.lineStart).toBe(83057);
  expect(ds.offset).toBe((83057 - 1) * 82);
});

test("repeated tag lines are separate fields (IN twice)", () => {
  expect(fields(rec, "IN").map(f => f.values[0]!.raw)).toEqual(["HAMMERSCHLAG  F A", "OWENS  L D"]);
});

test("continuation lines rejoin text with no inserted character", () => {
  const ti = field(rec, "TI")!;
  expect(ti.values[0]!.raw).toBe("GENE TRANSFER AND TISSUE CULTURE TECHNOLOGIES FOR IMPROVEMENT OF PEACH, SOYBEAN, AND TOBACCO");
});

test("0xAC continuation starts a new value of a repeating field", () => {
  expect(field(rec, "AC")!.values.map(v => v.raw)).toEqual(["A4900", "A5000", "A4900", "A4900"]);
  expect(field(rec, "CT")!.values.map(v => v.raw)).toEqual(["042%", "028%", "015%", "015%"]);
});

test("SC values split into code and label at 0xA0 0x02", () => {
  const sc = field(rec, "SC")!;
  expect(sc.values.map(v => [v.code, v.label])).toEqual([["S1015", "Peaches"], ["S2610", "Flue-Cured Tobacco"]]);
  expect(field(rec, "SN")!.values.map(v => v.raw)).toEqual(["070%", "015%"]);
});

test("PH lines carry code and label too", () => {
  expect(fields(rec, "PH")[0]!.values[0]).toMatchObject({ code: "R304", label: "Biological Efficiency-Fruit, Vegetables" });
});

test("record identity", () => {
  expect(rec.an).toBe("9049442");
  expect(rec.fields.length).toBeGreaterThan(40);
  expect(field(rec, "SF")!.values[0]!.raw).toBe("CRIS");
});

test("parseRecord reads the second record's own bytes from a multi-record buffer", () => {
  // Two copies of the fixture back to back, second copy's AN patched to a distinct value.
  const two = new Uint8Array(bytes.length * 2);
  two.set(bytes, 0);
  two.set(bytes, bytes.length);
  const anLineStart = bytes.length + 82; // second copy, line 2 of the fixture (the "AN " line)
  const patched = "9999999";
  for (let i = 0; i < patched.length; i++) two[anLineStart + 3 + i] = patched.charCodeAt(i);

  const { spans } = scanRecords(two, 1);
  expect(spans.length).toBe(2);
  expect(spans[1]!.an).toBe("9999999");

  const rec2 = parseRecord(two, spans[1]!, "RG164.CRIS.FY94.txt", "fy1991plus", 1);
  expect(rec2.an).toBe("9999999");
  // The parsed AN field's own bytes must come from the second copy, not the first: this is what
  // fails under the pre-fix arithmetic, which always reads from the start of `bytes`.
  expect(field(rec2, "AN")!.values[0]!.raw).toBe("9999999");
  const ds2 = field(rec2, "DS")!;
  expect(ds2.values.map(v => v.raw)).toEqual(["1275"]);
});

test("parseRecord throws when the span falls outside the given buffer", () => {
  expect(() => parseRecord(bytes, span!, "RG164.CRIS.FY94.txt", "fy1991plus", span!.firstLine + 1)).toThrow();
});

/** Builds one 82-byte line: `text` left-justified, space-padded, CRLF-terminated. */
function makeLine(text: string): Uint8Array {
  const b = new Uint8Array(82).fill(0x20);
  for (let i = 0; i < text.length; i++) b[i] = text.charCodeAt(i);
  b[80] = 0x0d; b[81] = 0x0a;
  return b;
}
function buffer(lines: string[]): Uint8Array {
  const out = new Uint8Array(lines.length * 82);
  lines.forEach((l, i) => out.set(makeLine(l), i * 82));
  return out;
}

test("a continuation line before any tagged line is counted, not silently dropped", () => {
  const buf = buffer(["$$", "  ORPHANDATA", "AN 1234567"]);
  const { spans } = scanRecords(buf, 1);
  const orphan = parseRecord(buf, spans[0]!, "synthetic", "fy1991plus");
  expect(orphan.orphanContinuations).toBe(1);
});

test("a record with no unopened continuation line has zero orphans", () => {
  const buf = buffer(["$$", "AN 1234567", "TI SOME TITLE"]);
  const { spans } = scanRecords(buf, 1);
  const clean = parseRecord(buf, spans[0]!, "synthetic", "fy1991plus");
  expect(clean.orphanContinuations).toBe(0);
});

test("parseRecord refuses a larger buffer when bufferBaseLine is omitted", () => {
  const two = new Uint8Array(bytes.length * 2);
  two.set(bytes, 0);
  two.set(bytes, bytes.length);
  const { spans } = scanRecords(two, 1);
  expect(() => parseRecord(two, spans[1]!, "RG164.CRIS.FY94.txt", "fy1991plus")).toThrow(/bufferBaseLine/);
});
