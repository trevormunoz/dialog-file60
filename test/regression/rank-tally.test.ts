import { rankTally, RANK_PAGE, isWordIndexedField } from "../../src/dialog/rank";

test("values are ranked by count, descending, ties broken by the index's own collation", () => {
  expect(rankTally([["BELTSVILLE", 3], ["AMES", 3], ["FARGO", 5]])).toEqual([
    { rank: 1, items: 5, term: "FARGO" },
    { rank: 2, items: 3, term: "AMES" },
    { rank: 3, items: 3, term: "BELTSVILLE" },
  ]);
});

test("the first page shows eight rows", () => { expect(RANK_PAGE).toBe(8); });

// TI is documented as word-indexed only in this build (WORD_FIELDS carries "/TI", no phrase
// index): RANK refuses it with the word-field-specific message, not the generic unknown-field
// one -- 2001's own restriction, "RANK ... does not work in any word-indexed fields."
test("a word-indexed field (TI) is refused by RANK, not a phrase-indexed one (CY)", () => {
  expect(isWordIndexedField("TI")).toBe(true);
  expect(isWordIndexedField("CY")).toBe(false);
});
