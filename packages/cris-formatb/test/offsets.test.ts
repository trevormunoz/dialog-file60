import { readFileSync } from "node:fs";
import { lineToOffset, offsetToLine, scanRecords } from "../src/offsets";

const bytes = new Uint8Array(readFileSync(new URL("../fixtures/fy94-9049442.bin", import.meta.url)));

test("line/offset arithmetic is exact for 82-byte lines", () => {
  expect(lineToOffset(1)).toBe(0);
  expect(lineToOffset(83052)).toBe(6810182);
  expect(offsetToLine(6810182)).toBe(83052);
});

test("scanRecords finds one record with its AN and span", () => {
  const { spans } = scanRecords(bytes, 83052);
  expect(spans).toEqual([
    { firstLine: 83052, lastLine: 83173, offset: 6810182, length: 122 * 82, an: "9049442" },
  ]);
});

test("scanRecords rejects a buffer that is not a multiple of 82", () => {
  expect(() => scanRecords(bytes.subarray(0, 100))).toThrow(/multiple of 82/);
});

test("scanRecords closes a record at the next separator and starts the following one", () => {
  // Two copies of the same fixture back to back, so the scan crosses a record
  // boundary. The second span is a synthetic repeat of the same record data,
  // not an archival claim about lines 83174-83295.
  const two = new Uint8Array(bytes.length * 2);
  two.set(bytes, 0);
  two.set(bytes, bytes.length);
  expect(scanRecords(two, 83052).spans).toEqual([
    { firstLine: 83052, lastLine: 83173, offset: 6810182, length: 122 * 82, an: "9049442" },
    { firstLine: 83174, lastLine: 83295, offset: 6820186, length: 122 * 82, an: "9049442" },
  ]);
});
