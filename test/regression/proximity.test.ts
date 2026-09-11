import { parseExpression } from "../../src/dialog/parser";
import { near } from "../../src/retrieval/engine";
import { FIELD_STRIDE } from "../../src/loader/words";

// The Blue Sheet's four File 60 Basic Index examples (bluesheet-1998-text) parse to the
// documented operator, distance, and a shared suffix pushed onto both leaves --
// SERUM(W)LIPID?/DE searches /DE for both operands, not only the right one.
test("the four Blue Sheet File 60 examples parse", () => {
  expect(parseExpression("serum(w)lipid?/de")).toMatchObject({
    kind: "prox", op: "W", distance: 1,
    left: { kind: "word", term: "SERUM", codes: ["/DE"] },
    right: { kind: "trunc", stem: "LIPID", codes: ["/DE"] },
  });
  expect(parseExpression("fish(f)oil?/nr")).toMatchObject({
    kind: "prox", op: "F", distance: 1,
    left: { kind: "word", term: "FISH", codes: ["/NR"] },
    right: { kind: "trunc", stem: "OIL", codes: ["/NR"] },
  });
  expect(parseExpression("lipid?(n)level?/ob")).toMatchObject({
    kind: "prox", op: "N", distance: 1,
    left: { kind: "trunc", stem: "LIPID", codes: ["/OB"] },
    right: { kind: "trunc", stem: "LEVEL", codes: ["/OB"] },
  });
  expect(parseExpression("lipid?(3n)metabol?/ti")).toMatchObject({ op: "N", distance: 3 });
});

// (S), (L) and (T) are each defined only relative to something "as defined by the database" --
// no held source states File 60's own subfield unit, descriptor unit, or chemical-name parts
// (statement of absence: not found by grepping "(S)", "(L)", "(T)", "subfield", "descriptor
// unit" and "chemical name" across the stripped 1998 Blue Sheet text and the 2001 manual text
// on 2026-09-10). Refused outright rather than approximated -- proto.select.proximity.unimplemented.
test("(S), (L) and (T) are refused rather than approximated", () => {
  for (const op of ["s", "l", "t"]) expect(parseExpression(`alpha(${op})bravo/ti`)).toBeNull();
});

// The numbered forms' meaning (n bounds the word-position distance between the two terms,
// so at most n-1 words may fall between them) is inferred, not documented --
// proto.select.proximity.numbered. A bare (W)/(N)/(F) is the numbered form with n = 1.
test("a bare (W)/(N) is the numbered form with distance 1", () => {
  expect(parseExpression("alpha(w)bravo/ti")).toMatchObject({ distance: 1 });
  expect(parseExpression("alpha(1w)bravo/ti")).toMatchObject({ distance: 1 });
  expect(parseExpression("alpha(n)bravo/ti")).toMatchObject({ distance: 1 });
});

// The proximity alternative in lex()'s regex must be tried before the bare "(" -- otherwise
// "(3N)" is mis-split into "(", "3N", ")" and the whole expression fails to parse. This is the
// likeliest bug in this task (parser.ts's own note), so it is exercised directly here rather
// than only through the parse results above.
test("a numbered proximity operator is not mis-split as a bare parenthesis", () => {
  const expr = parseExpression("alpha(3n)bravo/ti");
  expect(expr).not.toBeNull();
  expect(expr).toMatchObject({ kind: "prox", op: "N", distance: 3 });
});

// Pure position arithmetic over FIELD_STRIDE-packed positions (the same packing Task 7's
// positional index uses, src/loader/words.ts) -- exercised directly, without the corpus (the
// corpus-backed equality is test/archival/proximity-corpus.test.ts's job).
test("(W) is ordered and adjacent; (N) is adjacent either way; (F) only checks the field", () => {
  const a = 0 * FIELD_STRIDE + 4; // field 0, word 4
  const bAdjacentAfter = 0 * FIELD_STRIDE + 5; // field 0, word 5 -- immediately after a
  const bAdjacentBefore = 0 * FIELD_STRIDE + 3; // field 0, word 3 -- immediately before a
  const bSameFieldFar = 0 * FIELD_STRIDE + 40; // same field, far away
  const bOtherField = 1 * FIELD_STRIDE + 5; // a different field entirely

  expect(near("W", 1, a, bAdjacentAfter)).toBe(true);
  expect(near("W", 1, a, bAdjacentBefore)).toBe(false); // (W) requires order, not just adjacency
  expect(near("N", 1, a, bAdjacentAfter)).toBe(true);
  expect(near("N", 1, a, bAdjacentBefore)).toBe(true); // (N) allows either order
  expect(near("W", 1, a, bSameFieldFar)).toBe(false);
  expect(near("N", 3, a, bSameFieldFar)).toBe(false);
  expect(near("F", 1, a, bSameFieldFar)).toBe(true); // (F) ignores distance within the field
  expect(near("W", 1, a, bOtherField)).toBe(false);
  expect(near("F", 1, a, bOtherField)).toBe(false); // (F) still requires the same field
  expect(near("N", 3, a, a + 3)).toBe(true); // (3N): distance 3 (2 intervening words), at the bound
  expect(near("N", 3, a, a + 4)).toBe(false); // one word too far for (3N)
});
