import { readFileSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";

// A real slice of AN 9000001, cut from RG310.CRIS.FY88.txt with dd (see fixtures/SOURCES.md).
// Kept as a fast, corpus-free regression check alongside test/archival/fy88-record.test.ts,
// which re-derives the same values by scanning the real file directly.
const bytes = new Uint8Array(readFileSync(new URL("../../packages/cris-formatb/fixtures/fy88-9000001.bin", import.meta.url)));
const { spans: [span] } = scanRecords(bytes, 1);

test("under fy1988 an SC value carries its percent from the third separator segment", () => {
  const rec = parseRecord(bytes, span!, "RG310.CRIS.FY88.txt", "fy1988");
  const sc = fields(rec, "SC").flatMap(f => f.values);
  expect(sc.map(v => [v.code, v.label, v.percent])).toEqual([
    ["XFRS", "Forestry Related", "100%"],
    ["S0613", "Other Western Conifers", "100%"],
  ]);
  expect(sc[1]!.continuation).toBe(true);
  expect(fields(rec, "SN")).toEqual([]); // FY 1988 has no SN lines (spec 6.1)
});

test("under fy1991plus the same bytes keep the two-segment split, so the profile is observable", () => {
  const rec = parseRecord(bytes, span!, "RG310.CRIS.FY88.txt", "fy1991plus");
  const sc = fields(rec, "SC").flatMap(f => f.values);
  expect(sc[0]!.percent).toBeUndefined();
  expect(sc[0]!.label).toContain("100%"); // the percent is still inside the label
});
