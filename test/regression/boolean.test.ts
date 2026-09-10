import { parseExpression } from "../../src/dialog/parser";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";

const reader: RangeReader = { async read() { return new Uint8Array(0); } };
const offsets = { file: "f", sha256: "x", records: [] as [string, number, number][] };
const indexes = {
  CY: { code: "CY", terms: { BELTSVILLE: [0, 1, 2], AMES: [3, 4] } },
  ST: { code: "ST", terms: { MARYLAND: [0, 1, 5] } },
};
const engine = new RetrievalEngine(offsets, indexes, reader, "fy1991plus");
const run = (src: string, sets = new Map<number, number[]>()) => engine.search(parseExpression(src)!, sets);

test("NOT binds tighter than AND, and AND tighter than OR", () => {
  expect(parseExpression("cy=ames or cy=beltsville and st=maryland")).toEqual({
    kind: "or",
    left: { kind: "term", field: "CY", term: "ames" },
    right: { kind: "and", left: { kind: "term", field: "CY", term: "beltsville" }, right: { kind: "term", field: "ST", term: "maryland" } },
  });
  expect(parseExpression("cy=beltsville not st=maryland and cy=ames")).toEqual({
    kind: "and",
    left: { kind: "not", left: { kind: "term", field: "CY", term: "beltsville" }, right: { kind: "term", field: "ST", term: "maryland" } },
    right: { kind: "term", field: "CY", term: "ames" },
  });
});

test("parentheses override the order, innermost first", () => {
  expect(parseExpression("(cy=ames or cy=beltsville) and st=maryland")).toEqual({
    kind: "and",
    left: { kind: "or", left: { kind: "term", field: "CY", term: "ames" }, right: { kind: "term", field: "CY", term: "beltsville" } },
    right: { kind: "term", field: "ST", term: "maryland" },
  });
});

test("same-operator chains associate left to right", () => {
  expect(parseExpression("cy=a or cy=b or cy=c")).toEqual({
    kind: "or",
    left: { kind: "or", left: { kind: "term", field: "CY", term: "a" }, right: { kind: "term", field: "CY", term: "b" } },
    right: { kind: "term", field: "CY", term: "c" },
  });
});

test("an unmatched parenthesis and a leading NOT do not parse", () => {
  expect(parseExpression("(cy=ames or cy=beltsville")).toBeNull();
  expect(parseExpression("not cy=ames")).toBeNull();
});

test("OR unions and NOT subtracts, both in ascending file order", () => {
  expect(run("cy=beltsville or cy=ames").ordinals).toEqual([0, 1, 2, 3, 4]);
  expect(run("cy=beltsville not st=maryland").ordinals).toEqual([2]);
  expect(run("cy=beltsville and st=maryland").ordinals).toEqual([0, 1]);
});

test("per-term postings print in the order the terms were entered, once each", () => {
  expect(run("cy=beltsville or st=maryland").perTerm).toEqual([
    { display: "CY=BELTSVILLE", postings: 3 },
    { display: "ST=MARYLAND", postings: 3 },
  ]);
});

test("a phrase value keeps its internal spacing through the parser", () => {
  expect(parseExpression("in=hammerschlag  f a")).toEqual({ kind: "term", field: "IN", term: "hammerschlag  f a" });
});

test("set references evaluate on stored lists and are never re-run", () => {
  const sets = new Map([[1, [0, 5]]]);
  expect(run("s1 or cy=ames", sets).ordinals).toEqual([0, 3, 4, 5]);
  expect(run("s1 not st=maryland", sets).ordinals).toEqual([]);
});
