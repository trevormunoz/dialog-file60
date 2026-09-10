import { buildIndexes } from "../../src/loader/index-builder";

/** One 82-byte line: a two-byte tag, then `data` from column 4 (byte index 3). */
function tagLine(tag: string, data: string): Uint8Array {
  const b = new Uint8Array(82).fill(0x20);
  b[0] = tag.charCodeAt(0);
  if (tag.length > 1) b[1] = tag.charCodeAt(1);
  for (let i = 0; i < data.length; i++) b[3 + i] = data.charCodeAt(i);
  b[80] = 0x0d; b[81] = 0x0a;
  return b;
}

/** A continuation line ("  " tag). The 0xAC marker byte, when `newValue` is set, starts a
 * fresh value in the open field's `values` array instead of joining the previous one. */
function continuationLine(data: string, newValue: boolean): Uint8Array {
  const b = new Uint8Array(82).fill(0x20);
  let at = 3;
  if (newValue) { b[3] = 0xac; at = 4; }
  for (let i = 0; i < data.length; i++) b[at + i] = data.charCodeAt(i);
  b[80] = 0x0d; b[81] = 0x0a;
  return b;
}

/** A record: "$$" separator, "AN" line, then the given field lines. */
function record(an: string, lines: Uint8Array[]): Uint8Array {
  const out = new Uint8Array((lines.length + 2) * 82);
  out.set(tagLine("$$", ""), 0);
  out.set(tagLine("AN", an), 82);
  lines.forEach((l, i) => out.set(l, (i + 2) * 82));
  return out;
}

function corpus(records: Uint8Array[]): Uint8Array {
  const total = records.reduce((n, r) => n + r.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const r of records) { out.set(r, at); at += r.length; }
  return out;
}

test("buildIndexes reports a GC (PA/JC) length mismatch by AN", () => {
  const gc = record("GCTEST1", [
    tagLine("PA", "AAAA"),
    tagLine("JC", "BBBB"),
    continuationLine("CCCC", true), // JC's second value; PA still has one
  ]);
  const { report } = buildIndexes(corpus([gc]), "synthetic");
  expect(report.gcMismatches).toEqual(["GCTEST1"]);
});

test("buildIndexes reports an SC/SN length mismatch by AN", () => {
  const scsn = record("SCTEST1", [
    tagLine("SC", "S100"),
    tagLine("SN", "010%"),
    continuationLine("020%", true), // SN's second value; SC still has one
  ]);
  const { report } = buildIndexes(corpus([scsn]), "synthetic");
  expect(report.scSnMismatches).toEqual(["SCTEST1"]);
});

test("a record with balanced GC and SC/SN columns triggers neither report", () => {
  const balanced = record("OK0001", [
    tagLine("PA", "AAAA"),
    tagLine("JC", "BBBB"),
    tagLine("SC", "S100"),
    tagLine("SN", "010%"),
  ]);
  const { report } = buildIndexes(corpus([balanced]), "synthetic");
  expect(report.gcMismatches).toEqual([]);
  expect(report.scSnMismatches).toEqual([]);
});
