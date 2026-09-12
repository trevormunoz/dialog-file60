import { readFileSync } from "node:fs";
import { RetrievalEngine, UnknownSet, UnknownField, UnknownSuffix, type RangeReader } from "../../src/retrieval/engine";
import { MemoryWordIndex } from "../../src/retrieval/words";
import { parse } from "../../src/dialog/parser";

const fixture = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const reader: RangeReader = { async read(offset, length) { return fixture.subarray(offset - 6810182, offset - 6810182 + length); } };
const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "x", records: [["9049442", 83052, 83173] as [string, number, number], ["0000001", 1, 5] as [string, number, number]] };
const indexes = { CY: { code: "CY", terms: { BELTSVILLE: [0, 1] } }, IN: { code: "IN", terms: { "HAMMERSCHLAG  F A": [0] } } };
const engine = new RetrievalEngine(offsets, indexes, reader, "fy1991plus");

test("term search returns per-term postings and matching ordinals", () => {
  const r = engine.search({ kind: "term", field: "CY", term: "beltsville" }, new Map());
  expect(r.perTerm).toEqual([{ display: "CY=BELTSVILLE", postings: 2 }]);
  expect(r.ordinals).toEqual([0, 1]);
});

test("AND of a set and a term reports per-term postings then the intersection", () => {
  const sets = new Map([[1, [0, 1]]]);
  const r = engine.search({ kind: "and", left: { kind: "set", id: 1 }, right: { kind: "term", field: "IN", term: "hammerschlag  f a" } }, sets);
  expect(r.perTerm).toEqual([{ display: "IN=HAMMERSCHLAG  F A", postings: 1 }]);
  expect(r.ordinals).toEqual([0]);
});

test("unknown term yields zero, unknown set throws a typed UnknownSet naming the id", () => {
  expect(engine.search({ kind: "term", field: "CY", term: "nowhere" }, new Map()).ordinals).toEqual([]);
  expect(() => engine.search({ kind: "set", id: 9 }, new Map())).toThrow(UnknownSet);
  try { engine.search({ kind: "set", id: 9 }, new Map()); expect.fail("expected UnknownSet"); }
  catch (e) { expect(e).toBeInstanceOf(UnknownSet); expect((e as UnknownSet).id).toBe(9); }
});

test("unknown field throws a typed UnknownField naming the field and term, no message-string parsing", () => {
  expect(() => engine.search({ kind: "term", field: "ZZ", term: "x" }, new Map())).toThrow(UnknownField);
  try { engine.search({ kind: "term", field: "ZZ", term: "x" }, new Map()); expect.fail("expected UnknownField"); }
  catch (e) { expect(e).toBeInstanceOf(UnknownField); expect((e as UnknownField).field).toBe("ZZ"); expect((e as UnknownField).term).toBe("x"); }
});

test("UnknownField flags a Blue Sheet documented prefix with no built index as documented; a prefix the Blue Sheet does not list is not", () => {
  try { engine.search({ kind: "term", field: "FY", term: "1992" }, new Map()); expect.fail("expected UnknownField"); }
  catch (e) { expect(e).toBeInstanceOf(UnknownField); expect((e as UnknownField).documented).toBe(true); }
  try { engine.search({ kind: "term", field: "ZZ", term: "x" }, new Map()); expect.fail("expected UnknownField"); }
  catch (e) { expect(e).toBeInstanceOf(UnknownField); expect((e as UnknownField).documented).toBe(false); }
});

test("record() reads bytes by offset and parses", async () => {
  const rec = await engine.record(0);
  expect(rec.an).toBe("9049442");
  expect(rec.offset).toBe(6810182);
});

test("record() throws a named error for an out-of-range ordinal", async () => {
  await expect(engine.record(99)).rejects.toMatchObject({
    code: "CorpusRangeInvalid",
    detail: expect.stringContaining("no record at ordinal"),
  });
});

test("record() rejects an inverted offset pair as CorpusRangeInvalid", async () => {
  const offsets = { file: "f", sha256: "x", records: [["A", 10, 5] as [string, number, number]] };
  const eng = new RetrievalEngine(offsets, {}, { async read() { return new Uint8Array(0); } }, "fy1991plus");
  await expect(eng.record(0)).rejects.toMatchObject({ code: "CorpusRangeInvalid" });
});

// A word SELECT's expression, taken from parse()'s own output rather than hand-built: the
// grammar these tests exercise is the parser's, not a shape this file invents.
const parseExpression = (operand: string) => {
  const cmd = parse(`s ${operand}`);
  return cmd.cmd === "select" ? cmd.expr : null;
};

const words = {
  "/TI": { code: "/TI", terms: [["PEACH", 2], ["PEACHES", 1]] as [string, number][],
           shards: { P: { PEACH: [0, 2], PEACHES: [1] } } },
  "/DE": { code: "/DE", terms: [["PEACH", 1]] as [string, number][], shards: { P: { PEACH: [2] } } },
};
const wordEngine = new RetrievalEngine(offsets, indexes, reader, "fy1991plus", new MemoryWordIndex(words));

test("a suffix term searches the word index and prints the suffix in the per-term line", async () => {
  const expr = parseExpression("peach/ti")!;
  expect(expr).toEqual({ kind: "word", codes: ["/TI"], term: "peach" });
  await wordEngine.prepare(expr);
  const r = wordEngine.search(expr, new Map());
  expect(r.perTerm).toEqual([{ display: "PEACH/TI", postings: 2 }]);
  expect(r.ordinals).toEqual([0, 2]);
});

test("two suffixes on one term union their postings, and the echo keeps both", async () => {
  const expr = parseExpression("peach/ti,de")!;
  expect(expr).toEqual({ kind: "word", codes: ["/TI", "/DE"], term: "peach" });
  await wordEngine.prepare(expr);
  expect(wordEngine.search(expr, new Map()).ordinals).toEqual([0, 2]);
  expect(wordEngine.search(expr, new Map()).perTerm).toEqual([{ display: "PEACH/TI,DE", postings: 2 }]);
});

test("an unknown suffix is refused rather than searched as nothing", async () => {
  await expect(wordEngine.prepare(parseExpression("peach/zz")!)).rejects.toThrow(UnknownSuffix);
  try { await wordEngine.prepare(parseExpression("peach/zz")!); expect.fail("expected UnknownSuffix"); }
  catch (e) { expect(e).toBeInstanceOf(UnknownSuffix); expect((e as UnknownSuffix).code).toBe("/ZZ"); }
});

test("a word term combines with a phrase term under the documented order", async () => {
  const expr = parseExpression("peach/ti and cy=beltsville")!;
  expect(expr).toEqual({
    kind: "and",
    left: { kind: "word", codes: ["/TI"], term: "peach" },
    right: { kind: "term", field: "CY", term: "beltsville" },
  });
  await wordEngine.prepare(expr);
  expect(wordEngine.search(expr, new Map()).ordinals).toEqual([0]);
});

test("/DF resolves to /DE's shard at query time, so a /DE SELECT after a /DF prepare() needs no reload", async () => {
  const df = parseExpression("peach/df")!;
  expect(df).toEqual({ kind: "word", codes: ["/DF"], term: "peach" });
  await wordEngine.prepare(df);
  const dfResult = wordEngine.search(df, new Map());
  expect(dfResult.ordinals).toEqual([2]);
  expect(dfResult.perTerm).toEqual([{ display: "PEACH/DF", postings: 1 }]);

  const de = parseExpression("peach/de")!;
  expect(() => wordEngine.search(de, new Map())).not.toThrow();
  const deResult = wordEngine.search(de, new Map());
  expect(deResult.ordinals).toEqual([2]);
  expect(deResult.perTerm).toEqual([{ display: "PEACH/DE", postings: 1 }]);
});

test("search() throws when a word expression is evaluated without a prior prepare()", () => {
  const expr = parseExpression("peach/ti")!;
  const unprepared = new RetrievalEngine(offsets, indexes, reader, "fy1991plus", new MemoryWordIndex(words));
  expect(() => unprepared.search(expr, new Map())).toThrow("prepare() was not called for /TI:P");
});

// sortKey's own comment used to say it returns the record's first value, but it actually
// walked idx.terms in index-insertion order ("first write wins") -- honest for a single-valued
// field only. Ordinal 0 carries two IN values under a *reversed* insertion order (OWENS before
// HAMMERSCHLAG in the object literal below), so a first-write-wins bug and the collation-first
// fix disagree: first-write-wins would answer OWENS, the fix answers the alphabetically-first
// HAMMERSCHLAG (proto.sort.multivalue_key). Ordinal 1 carries one IN value, ADAMS -- smaller
// than either of ordinal 0's -- so the fixed ascending order is [1, 0], not [0, 1].
const multiIndexes = {
  IN: { code: "IN", terms: { "OWENS  L D": [0], "HAMMERSCHLAG  F A": [0], "ADAMS  J": [1] } },
};
const multiEngine = new RetrievalEngine(offsets, multiIndexes, reader, "fy1991plus");

test("sortKey picks the collation-first of a record's own values for a multi-valued field", () => {
  expect(multiEngine.sortKey("IN", 0)).toBe("HAMMERSCHLAG  F A");
  expect(multiEngine.sortKey("IN", 1)).toBe("ADAMS  J");
});

test("sortOrdinals orders records by that same collation-first key", () => {
  expect(multiEngine.sortOrdinals([0, 1], [{ field: "IN", descending: false }])).toEqual([1, 0]);
});
