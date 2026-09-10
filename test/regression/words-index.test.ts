import { tokenize, shardOf, STOP_WORDS, WORD_FIELDS, WORD_CODES, WORD_ALIASES, resolveWordCode } from "../../src/loader/words";

// spec 6.4's worked examples, each stated there with its expected result.
test("spec 6.4's tokenizer examples", () => {
  expect(tokenize("disease")).toEqual(["DISEASE"]);
  expect(tokenize("DISEASE,")).toEqual(["DISEASE"]);
  expect(tokenize("GENE-TRANSFER")).toEqual(["GENE-TRANSFER", "GENE", "TRANSFER"]);
  expect(tokenize("ABA")).toEqual(["ABA"]);
  expect(tokenize("1)")).toEqual(["1"]);
});

test("case is folded, digits are tokens, punctuation other than the hyphen is not indexed", () => {
  expect(tokenize("Soil pH 6.5; corn/soy rotation")).toEqual(["SOIL", "PH", "6", "5", "CORN", "SOY", "ROTATION"]);
});

test("the nine 2001 stop words are dropped, and nothing else is", () => {
  expect([...STOP_WORDS].sort()).toEqual(["AN", "AND", "BY", "FOR", "FROM", "OF", "THE", "TO", "WITH"]);
  expect(tokenize("the effects of nitrogen on the growth")).toEqual(["EFFECTS", "NITROGEN", "ON", "GROWTH"]);
});

test("a token is sharded by its first character, everything else to the catch-all", () => {
  expect(shardOf("DISEASE")).toBe("D");
  expect(shardOf("1994")).toBe("1");
  expect(shardOf("")).toBe("_");
});

test("the word fields are the ones the corpus carries, and /TX is the documented union", () => {
  expect(Object.keys(WORD_FIELDS).sort()).toEqual(["/AP", "/DE", "/OB", "/PB", "/PR", "/TI", "/TX", "PO="]);
  expect(WORD_FIELDS["/TX"]).toEqual(["AP", "OB", "PR"]);
  expect(WORD_FIELDS["PO="]).toEqual(["PF", "PI"]);
});

test("/DF is a query-time alias of /DE, not a built word field", () => {
  expect(WORD_ALIASES["/DF"]).toBe("/DE");
  expect(resolveWordCode("/DF")).toBe("/DE");
  expect(WORD_CODES).not.toContain("/DF");
});
