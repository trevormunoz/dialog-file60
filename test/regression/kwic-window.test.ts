import { kwicWindows, KWIC_DEFAULT, KWIC_MIN, KWIC_MAX, kwicTerms } from "../../src/dialog/kwic";
import { parse } from "../../src/dialog/parser";

// The pure window builder: no session, no record, no registry-backed rendering -- just the
// word-count mechanics the 2001 manual states (SET KWIC's window size, its default, and the
// leading space before each side's ellipsis). Real-record content is asserted separately, in
// test/evidence/kwic.test.ts, over the FY 1994 corpus fixture.

test("a window is nn words wide, centred on the match, with a space before each ellipsis", () => {
  const text = "ALPHA BRAVO CHARLIE PEACH DELTA ECHO FOXTROT";
  expect(kwicWindows(text, ["PEACH"], 4)).toEqual(["... BRAVO CHARLIE PEACH DELTA ..."]);
});

test("a match near the start does not pad; the window is shifted, not filled", () => {
  const text = "PEACH ALPHA BRAVO CHARLIE DELTA";
  expect(kwicWindows(text, ["PEACH"], 4)).toEqual(["PEACH ALPHA BRAVO CHARLIE ..."]);
});

test("a match near the end shifts left instead of padding past the end", () => {
  const text = "ALPHA BRAVO CHARLIE DELTA PEACH";
  expect(kwicWindows(text, ["PEACH"], 4)).toEqual(["... BRAVO CHARLIE DELTA PEACH"]);
});

test("a window at least as wide as the text carries no ellipsis on either side", () => {
  const text = "ALPHA BRAVO PEACH CHARLIE";
  expect(kwicWindows(text, ["PEACH"], 30)).toEqual(["ALPHA BRAVO PEACH CHARLIE"]);
});

test("matching is case-insensitive and strips trailing punctuation, but the window shows the text as written", () => {
  const text = "alpha bravo Peach, charlie delta";
  expect(kwicWindows(text, ["PEACH"], 4)).toEqual(["alpha bravo Peach, charlie ..."]);
});

test("overlapping windows from two nearby matches merge into one", () => {
  const text = "ALPHA PEACH BRAVO CHARLIE PEACH DELTA";
  expect(kwicWindows(text, ["PEACH"], 4)).toEqual(["ALPHA PEACH BRAVO CHARLIE PEACH DELTA"]);
});

test("no match returns no windows", () => {
  expect(kwicWindows("ALPHA BRAVO CHARLIE", ["PEACH"], 4)).toEqual([]);
});

test("the default window is 30 words", () => {
  expect(KWIC_DEFAULT).toBe(30);
});

test("the settable range is 2 to 50 words", () => {
  expect(KWIC_MIN).toBe(2);
  expect(KWIC_MAX).toBe(50);
});

test("SET KWIC refuses a size outside 2..50", () => {
  expect(parse("set kwic 1")).toEqual({ cmd: "unknown", text: "set kwic 1" });
  expect(parse("set kwic 51")).toEqual({ cmd: "unknown", text: "set kwic 51" });
});

test("SET KWIC nn parses inside the range, inclusive", () => {
  expect(parse("set kwic 2")).toEqual({ cmd: "setkwic", size: 2 });
  expect(parse("set kwic 50")).toEqual({ cmd: "setkwic", size: 50 });
  expect(parse("SET KWIC 14")).toEqual({ cmd: "setkwic", size: 14 });
});

// kwicTerms: a phrase operand (a "term" node, CY=BELTSVILLE) is not a word in a text field
// KWIC reads, so it contributes nothing; a word operand contributes its term as an exact
// match; a truncation contributes its stem, matched as a prefix; AND/OR/NOT recurse.
test("kwicTerms reads word and truncation operands, and skips phrase operands", () => {
  expect(kwicTerms({ kind: "word", codes: ["/TI"], term: "peach" })).toEqual([{ term: "PEACH", prefix: false }]);
  expect(kwicTerms({ kind: "trunc", codes: ["/TI"], stem: "TECHNOLOG", echo: "TECHNOLOG?" })).toEqual([
    { term: "TECHNOLOG", prefix: true },
  ]);
  expect(kwicTerms({ kind: "term", field: "CY", term: "BELTSVILLE" })).toEqual([]);
  expect(kwicTerms({ kind: "set", id: 1 })).toEqual([]);
  expect(
    kwicTerms({
      kind: "and",
      left: { kind: "word", codes: ["/TI"], term: "peach" },
      right: { kind: "term", field: "CY", term: "BELTSVILLE" },
    }),
  ).toEqual([{ term: "PEACH", prefix: false }]);
});
