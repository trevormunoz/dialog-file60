import { describe, it, expect } from "vitest";
import { buildIndexes } from "../../src/loader/index-builder";
import { PHRASE_FIELDS } from "../../src/loader/corpus-format";
import { readFileSync } from "node:fs";

// Reuse the small committed fixture the formatb tests use.
const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));

describe("buildIndexes emits per-phrase-code term counts", () => {
  it("phraseTerms has an entry for every PHRASE_FIELDS code equal to its distinct-term count", () => {
    const { indexes, report } = buildIndexes(bytes, "fixture", []);
    for (const code of PHRASE_FIELDS) {
      expect(report.phraseTerms[code]).toBe(Object.keys(indexes[code]!.terms).length);
    }
  });
});
