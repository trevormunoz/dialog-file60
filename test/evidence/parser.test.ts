import { parse } from "../../src/dialog/parser";

test("BEGIN forms", () => {
  expect(parse("b 60")).toEqual({ cmd: "begin", file: 60 });
  expect(parse("BEGIN 60")).toEqual({ cmd: "begin", file: 60 });
  expect(parse("begin60")).toEqual({ cmd: "begin", file: 60 });
});

test("SELECT prefix term keeps internal double spaces and uppercases the echo", () => {
  expect(parse("s in=hammerschlag  f a")).toEqual({
    cmd: "select", echo: "IN=HAMMERSCHLAG  F A",
    expr: { kind: "term", field: "IN", term: "hammerschlag  f a" },
  });
});

test("SELECT set AND term", () => {
  expect(parse("s s1 and cy=beltsville")).toEqual({
    cmd: "select", echo: "S1 AND CY=BELTSVILLE",
    expr: { kind: "and", left: { kind: "set", id: 1 }, right: { kind: "term", field: "CY", term: "beltsville" } },
  });
});

test("TYPE set/format/items", () => {
  expect(parse("t s2/5/1")).toEqual({ cmd: "type", set: 2, format: "5", items: [1] });
  expect(parse("TYPE S2/5/1-3")).toEqual({ cmd: "type", set: 2, format: "5", items: [1, 2, 3] });
  expect(parse("t s2/in,ob/2,4")).toEqual({ cmd: "type", set: 2, format: "IN,OB", items: [2, 4] });
});

test("unsupported input is total", () => {
  // The bounded truncation form ("??") is still refused (proto.select.truncation's statement
  // of absence; see test/regression/truncation.test.ts) -- a single trailing "?" is now a
  // truncation (TRUNCATED below), so this example moved off "peach?/ti" to a form that stays
  // out of this milestone's slice.
  expect(parse("s peach??/ti")).toEqual({ cmd: "unknown", text: "s peach??/ti" });
  expect(parse("")).toEqual({ cmd: "unknown", text: "" });
});

test("a reversed TYPE item range is unknown, not an empty item list", () => {
  expect(parse("t s2/5/3-1")).toEqual({ cmd: "unknown", text: "t s2/5/3-1" });
});

test("out-of-slice SELECT syntax is unknown, not a fabricated phrase term", () => {
  expect(parse("s in=smith?")).toEqual({ cmd: "unknown", text: "s in=smith?" });
  expect(parse("s in=hammerschlag/ti")).toEqual({ cmd: "unknown", text: "s in=hammerschlag/ti" });
  expect(parse("s in=x and")).toEqual({ cmd: "unknown", text: "s in=x and" });
});

// OR and NOT are in this milestone's slice (proto.select.precedence, proto.select.boolean):
// see test/regression/boolean.test.ts for the full precedence and evaluation coverage. This
// pins only that parse() itself reaches parseExpression for them and echoes correctly.
test("SELECT combines terms with OR and NOT", () => {
  expect(parse("s cy=beltsville or cy=greenbelt")).toEqual({
    cmd: "select", echo: "CY=BELTSVILLE OR CY=GREENBELT",
    expr: { kind: "or", left: { kind: "term", field: "CY", term: "beltsville" }, right: { kind: "term", field: "CY", term: "greenbelt" } },
  });
  expect(parse("s cy=beltsville not cy=greenbelt")).toEqual({
    cmd: "select", echo: "CY=BELTSVILLE NOT CY=GREENBELT",
    expr: { kind: "not", left: { kind: "term", field: "CY", term: "beltsville" }, right: { kind: "term", field: "CY", term: "greenbelt" } },
  });
});

// A word term followed by a suffix: everything up to the last "/" is the search word, the
// codes after it are the suffix list. Not a boolean AND of two operands -- the whole operand
// is one word node.
test("SELECT term/suffix parses to a word node, not a phrase term", () => {
  expect(parse("s peach/ti")).toEqual({
    cmd: "select", echo: "PEACH/TI",
    expr: { kind: "word", codes: ["/TI"], term: "peach" },
  });
  expect(parse("s peach/ti,de")).toEqual({
    cmd: "select", echo: "PEACH/TI,DE",
    expr: { kind: "word", codes: ["/TI", "/DE"], term: "peach" },
  });
});

// A trailing "?" on the word part of a suffixed operand is now truncation (TRUNCATED,
// tested in test/regression/truncation.test.ts), not this catch-all -- SUFFIXED's own word-
// part character class already excludes "= / ? ( )", the same guard a plain PREFIX=value's
// value carries, so any other reserved character there still falls through to unknown.
test("a suffixed operand with a reserved character other than truncation's trailing ? is unknown", () => {
  expect(parse("s peach(x)/ti")).toEqual({ cmd: "unknown", text: "s peach(x)/ti" });
});

// The suffix word part excludes "=" and a second "/": an operand shaped like PREFIX=value
// (an "=" before the slash) is never read as a word/suffix, and a `/subfile` limit
// (/CRIS /HNRIMS /ICAR /CZARIS) or any other trailing "/CODE" on a PREFIX=value's value falls
// to RESERVED_IN_TERM_VALUE, the same as before this parser had a word/suffix grammar at all.
test("a PREFIX=value with a subfile suffix or another suffix-shaped tail is unknown, not a fabricated word or phrase term", () => {
  expect(parse("s cy=beltsville/cris")).toEqual({ cmd: "unknown", text: "s cy=beltsville/cris" });
  expect(parse("s in=smith/ti")).toEqual({ cmd: "unknown", text: "s in=smith/ti" });
});

test("a word part with a second slash matches neither branch and is unknown", () => {
  expect(parse("s peach/ti/de")).toEqual({ cmd: "unknown", text: "s peach/ti/de" });
});

test("a hyphenated word with one suffix parses to a word node", () => {
  expect(parse("s x-ray/ti")).toEqual({
    cmd: "select", echo: "X-RAY/TI",
    expr: { kind: "word", codes: ["/TI"], term: "x-ray" },
  });
});

test("digits after a slash are not suffix codes: unknown, not a fabricated word term", () => {
  expect(parse("s 9/10")).toEqual({ cmd: "unknown", text: "s 9/10" });
});

// Parentheses now group a sub-expression (proto.select.precedence); a parenthesized AND
// parses the same as the ungrouped form, since nothing else in this expression competes with
// it for precedence.
test("a parenthesized group parses like its ungrouped contents", () => {
  expect(parse("s (cy=beltsville and in=smith)")).toEqual({
    cmd: "select", echo: "(CY=BELTSVILLE AND IN=SMITH)",
    expr: { kind: "and", left: { kind: "term", field: "CY", term: "beltsville" }, right: { kind: "term", field: "IN", term: "smith" } },
  });
});

// A capability-notice stub. Each of these is a documented File 60 command but outside this
// milestone's slice; the parser recognizes the command word and returns
// { cmd: "unsupported" } instead of treating it the same as a typo.
// EXPAND, PAGE, DISPLAY SETS, LOGOFF, SORT and PRINT (by set number) are implemented (see
// test/evidence/expand.test.ts, test/evidence/displaysets.test.ts, test/evidence/logoff.test.ts,
// test/evidence/sort.test.ts and test/evidence/print.test.ts) and no longer parse to this stub;
// they are dropped from this list rather than moved, since they now have their own
// DialogCommand variants ({ cmd: "expand" }, { cmd: "page" }, { cmd: "displaysets" },
// { cmd: "logoff" }, { cmd: "sort" }, { cmd: "print" }), not { cmd: "unsupported" }. PRINT by
// accession number stays on this stub -- the same channel TYPE by accession number already uses.
test("capability-notice command words parse to unsupported, not unknown", () => {
  expect(parse("print 09136021/2")).toEqual({ cmd: "unsupported", command: "PRINT (by accession number)", rest: "09136021/2" });
  expect(parse("pr 09136021/2")).toEqual({ cmd: "unsupported", command: "PRINT (by accession number)", rest: "09136021/2" });
});

// PRINT's own set form: bare set number, as the 1978 session writes it, and S-prefixed, as the
// Blue Sheet writes it. `echo` is everything after the command word, uppercased.
test("PRINT's set form parses set, format, items and trailing sort codes", () => {
  expect(parse("print s1/5/1-3")).toEqual({
    cmd: "print", set: 1, format: "5", items: "1-3", sortCodes: "", echo: "S1/5/1-3",
  });
  expect(parse("pr 16/5/1-35/as/pn")).toEqual({
    cmd: "print", set: 16, format: "5", items: "1-35", sortCodes: "/AS/PN", echo: "16/5/1-35/AS/PN",
  });
});

// KWIC is implemented as of Task 4 (test/regression/kwic-window.test.ts, test/evidence/kwic.test.ts):
// there is no bare "KWIC" command to route to the capability-notice stub, only SET KWIC nn and
// TYPE's format K.
test("a bare 'kwic' line is not a recognized command", () => {
  expect(parse("kwic s1/ti")).toEqual({ cmd: "unknown", text: "kwic s1/ti" });
});

test("LOGOFF parses to its own command, not the capability-notice stub", () => {
  expect(parse("logoff")).toEqual({ cmd: "logoff" });
  expect(parse("LOGOFF")).toEqual({ cmd: "logoff" });
});

test("TYPE by accession number parses to unsupported, distinct from TYPE set/format/items", () => {
  expect(parse("t 09143165/5")).toEqual({ cmd: "unsupported", command: "TYPE (by accession number)", rest: "09143165/5" });
  expect(parse("type 09143165/5")).toEqual({ cmd: "unsupported", command: "TYPE (by accession number)", rest: "09143165/5" });
});

// offendingToken (session.ts) blames the whole unparsed remainder for a
// recognized command word, not just the word itself -- pinned here as the parser's contract:
// a malformed TYPE-by-accession-shaped input (no slash) does not match either TYPE form and
// stays unknown, carrying the full original text so the session can still name it fully.
test("a malformed TYPE that matches neither TYPE form is unknown, carrying the full text", () => {
  expect(parse("t 5")).toEqual({ cmd: "unknown", text: "t 5" });
});

// A set TYPE with its item range missing has the same shape as an accession TYPE
// (number, slash, format) but a set number is at most 3 digits and an accession number 7 or
// 8; the accession form must not claim it.
test("a set-number TYPE missing its items is unknown, not an accession-number TYPE", () => {
  expect(parse("t 1/5")).toEqual({ cmd: "unknown", text: "t 1/5" });
  expect(parse("t s1/5")).toEqual({ cmd: "unknown", text: "t s1/5" });
  expect(parse("t 9049442/5").cmd).toBe("unsupported");
});
