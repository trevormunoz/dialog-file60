// test/public-api.test.ts
import { test, expect } from "vitest";
import * as api from "../src-ts/index";
import { scanRecords, parseRecord, field, fields } from "../src-ts/index";
import type {
  RecordSpan, FileStructure, ScanResult,
  SourceValue, SourceField, LogicalRecord, Profile,
} from "../src-ts/index";

const EXPECTED_VALUE_EXPORTS = [
  "scanRecords", "parseRecord", "field", "fields",
  "lineToOffset", "offsetToLine", "LINE_BYTES", "DATA_START", "DATA_END",
  "latin1", "PROFILES", "PROFILE_NAMES",
].sort();

test("public value-export names are exactly the frozen set", () => {
  const actual = Object.keys(api).sort();
  expect(actual).toEqual(EXPECTED_VALUE_EXPORTS);
});

// Type-surface lock: types erase at runtime, so the value test above cannot see them.
// If any public type export is dropped from the barrel, this fails `tsc --noEmit`.
export type _PublicTypeSurface = {
  RecordSpan: RecordSpan; FileStructure: FileStructure; ScanResult: ScanResult;
  SourceValue: SourceValue; SourceField: SourceField; LogicalRecord: LogicalRecord; Profile: Profile;
};

test("scanRecords returns arrays + plain structure (runtime representation)", () => {
  const bytes = new Uint8Array(82 * 0); // empty corpus
  const r = scanRecords(bytes, 1);
  expect(Array.isArray(r.spans)).toBe(true);
  expect(typeof r.badLines).toBe("number");
  expect(typeof r.structure).toBe("object");
});

test("parseRecord rejects a span whose length is not a multiple of 82", () => {
  // A caller-built span, not one scanRecords produced: its length (83) is not a
  // whole number of 82-byte lines. The buffer is large enough that the existing
  // out-of-buffer check passes, so this reaches the parse path. A misaligned
  // span is a category-D structural impossibility (README "Failure handling"),
  // the same class scanRecords rejects for a misaligned buffer — it must throw a
  // clear boundary error, never crash the Gleam engine with a misleading assert.
  const line = (s: string) => {
    const b = new Uint8Array(82).fill(0x20);
    for (let i = 0; i < s.length && i < 80; i++) b[i] = s.charCodeAt(i);
    b[80] = 0x0d; b[81] = 0x0a; return b;
  };
  const bytes = new Uint8Array([...line("$$"), ...line("AN 900")]); // 164 bytes
  const span: RecordSpan = { firstLine: 1, lastLine: 1, offset: 0, length: 83, an: "" };
  expect(() => parseRecord(bytes, span, "synthetic", "fy1991plus", 1)).toThrow(/multiple of 82/);
});

test("parseRecord yields arrays and undefined (not null/wrapper) for absent fields", () => {
  // 82-byte record: "$$" separator then an "AN" line.
  const line = (s: string) => {
    const b = new Uint8Array(82).fill(0x20);
    for (let i = 0; i < s.length && i < 80; i++) b[i] = s.charCodeAt(i);
    b[80] = 0x0d; b[81] = 0x0a; return b;
  };
  const bytes = new Uint8Array([...line("$$"), ...line("AN 900")]);
  const { spans } = scanRecords(bytes, 1);
  const rec = parseRecord(bytes, spans[0]!, "t", "fy1991plus", 1);
  expect(Array.isArray(rec.fields)).toBe(true);
  expect(field(rec, "ZZ")).toBeUndefined();           // absent tag -> undefined, not null
  expect(Array.isArray(fields(rec, "AN"))).toBe(true);
  const v = rec.fields[0]!.values[0]!;
  expect(["string", "undefined"]).toContain(typeof v.code); // optional -> string|undefined
});
