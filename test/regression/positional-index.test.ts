import { readFileSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";
import { buildIndexes } from "../../src/loader/index-builder";
import { FIELD_STRIDE, STOP_WORDS, WORD_CODES } from "../../src/loader/words";

// Built once over the committed record fixture bytes (a real record, not a constructed
// Format B record) -- the same fixture test/archival/render5-9049442.test.ts and
// test/archival/fixture-bytes.test.ts already read. AN 9049442's TI is "GENE TRANSFER AND
// TISSUE CULTURE TECHNOLOGIES FOR IMPROVEMENT OF PEACH, SOYBEAN, AND TOBACCO"; its AP, OB and
// PR each mention "peach" too, which test 3 below relies on.
//
// buildIndexes()'s third argument, the codes to build positions for, defaults to
// POSITIONAL_CODES (/TI and /DE, the codes version 1 actually ships -- see
// src/loader/index-builder.ts's own doc comment on why the default is not every WORD_CODES
// entry: computing positions for all eight unconditionally, on every call, pushed several
// archival tests that build fresh over the real corpus past Vitest's 60s per-file RPC timeout).
// Test 3 below needs /TX, the one composite code, so this file asks for the full set
// explicitly -- cost is irrelevant here, since it runs against the tiny fixture record, not
// the corpus.
const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const { positions } = buildIndexes(bytes, "fixture", WORD_CODES);

test("a term's positions name the field and the word position within it", () => {
  const posting = positions["/TI"]!["P"]!["PEACH"]?.["0"];
  expect(posting).toBeDefined();
  for (const p of posting!) expect(p % FIELD_STRIDE).toBeGreaterThanOrEqual(0);
});

test("two words adjacent in the text are adjacent in the packed positions", () => {
  // Read the record's own TI text directly (not through the loader's tokenizer) and find the
  // first pair of consecutive whitespace-separated words that both survive the stop-word
  // filter, the same way the loader would keep both as postings.
  const rec = parseRecord(bytes, scanRecords(bytes).spans[0]!, "fixture", "fy1991plus", 1);
  const tiValues = fields(rec, "TI").flatMap(f => f.values);
  expect(tiValues.length).toBeGreaterThan(0);
  const words = tiValues[0]!.raw.toUpperCase().split(/[^A-Z0-9-]+/).filter(Boolean);
  let pairIndex = -1;
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]!) && !STOP_WORDS.has(words[i + 1]!)) { pairIndex = i; break; }
  }
  expect(pairIndex).toBeGreaterThanOrEqual(0);
  const first = words[pairIndex]!;
  const second = words[pairIndex + 1]!;
  const firstPosting = positions["/TI"]![first[0]!]?.[first]?.["0"];
  const secondPosting = positions["/TI"]![second[0]!]?.[second]?.["0"];
  expect(firstPosting).toBeDefined();
  expect(secondPosting).toBeDefined();
  // Both words occur once each in this record's single-valued TI field, so each posting is a
  // single packed position naming the field these two words share and the two consecutive
  // positions within it.
  const firstPacked = firstPosting!.find(p => p % FIELD_STRIDE === pairIndex);
  const secondPacked = secondPosting!.find(p => p % FIELD_STRIDE === pairIndex + 1);
  expect(firstPacked).toBeDefined();
  expect(secondPacked).toBeDefined();
  expect(Math.floor(firstPacked! / FIELD_STRIDE)).toBe(Math.floor(secondPacked! / FIELD_STRIDE));
  expect(secondPacked! - firstPacked!).toBe(1);
});

test("a composite code's component tags do not share a field ordinal", () => {
  // /TX is AP + OB + PR (map.TX.composite): "peach" occurs in this record's AP, OB and PR text
  // (see the fixture comment above), so its /TX positions must carry more than one distinct
  // field ordinal -- if AP and OB shared one field ordinal, (F) would treat a word in one as
  // adjacent-in-field to a word in the other.
  const posting = positions["/TX"]!["P"]!["PEACH"]?.["0"];
  expect(posting).toBeDefined();
  const fieldOrdinals = new Set(posting!.map(p => Math.floor(p / FIELD_STRIDE)));
  expect(fieldOrdinals.size).toBeGreaterThan(1);
});
