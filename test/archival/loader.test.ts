import { readFileSync, existsSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";
import { phraseKey, indexUrls, PHRASE_FIELDS, DOCUMENTED_PHRASE_PREFIXES, type WordIndex } from "../../src/loader/corpus-format";
import { buildIndexes } from "../../src/loader/index-builder";
import { WORD_CODES } from "../../src/loader/words";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
// Skip only on an explicit opt-out; otherwise a missing corpus fails
// loudly, naming the file and the extraction script, instead of `pnpm test` reporting
// success on a run that never touched the real file. See docs/development.md's "Archival tests and the
// corpus file" section.
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
function requireCorpus() {
  if (!exists) {
    throw new Error(
      `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
    );
  }
}
// One full-corpus build shared by every test in this file. buildIndexes is synchronous and
// takes about 15 seconds; four separate builds blocked this worker's event loop for over a
// minute, and vitest's reply timeout for a worker-to-host call is 60 seconds, so the run
// ended with "[vitest-worker]: Timeout calling onTaskUpdate" even though every test passed.
let built: (ReturnType<typeof buildIndexes> & { bytes: Uint8Array }) | undefined;
function corpus() {
  requireCorpus();
  if (!built) {
    const bytes = new Uint8Array(readFileSync(FILE));
    built = { bytes, ...buildIndexes(bytes, "RG164.CRIS.FY94.txt") };
  }
  return built;
}

test("phraseKey uppercases and strips trailing padding only", () => {
  expect(phraseKey("Hammerschlag  F A   ")).toBe("HAMMERSCHLAG  F A");
});

test.skipIf(skip)("full-file phrase indexes agree with the independent checker", () => {
  const { offsets, indexes } = corpus();
  expect(offsets.records.length).toBe(acc.records);
  const belt = indexes.CY!.terms["BELTSVILLE"]!.map(i => offsets.records[i]![0]).sort();
  expect(belt).toEqual(acc.cy_beltsville.an);
  const ham = new Set(indexes.IN!.terms["HAMMERSCHLAG  F A"]!);
  const both = indexes.CY!.terms["BELTSVILLE"]!.filter(i => ham.has(i)).map(i => offsets.records[i]![0]).sort();
  expect(both).toEqual(acc.cy_beltsville_and_in_hammerschlag_f_a.an);
}, 120_000);

test.skipIf(skip)("full-corpus checks: no duplicate AN, every record has SF CRIS", () => {
  const { offsets, indexes, report } = corpus();
  expect(new Set(offsets.records.map(r => r[0])).size).toBe(offsets.records.length);
  expect(indexes.SF!.terms["CRIS"]!.length).toBe(offsets.records.length);
  expect(report.compositeMismatches).toEqual([]);
  // Full-corpus checks: badLines (not 82 bytes or not CRLF-terminated),
  // orphanContinuations (a continuation line with no open field), and mismatched-length
  // composites for GC (PA/JC) and SC/SN, alongside the existing PC (RP/AC/CM/FS/CT) check.
  expect(report.badLines).toBe(0);
  expect(report.orphanContinuations).toBe(0);
  expect(report.gcMismatches).toEqual([]);
  expect(report.scSnMismatches).toEqual([]);
  // The last record does not absorb NARA's ">>" trailer line.
  expect(offsets.records[offsets.records.length - 1]![2]).toBe(3384621);
}, 120_000);

// The corpus states its own record count in its trailer line
// (">> 003384620000034090" -- 3,384,620 data lines, 34,090 records). It is the one authority that does not share the "$$" record-boundary
// assumption both derivations (this loader and the independent naive-split.py checker) rest
// on -- both split on the same marker, so an agreement between them says nothing about
// whether that marker is the right one to split on. The trailer does.
test.skipIf(skip)("the corpus trailer's self-declared line and record counts match the parsed count", () => {
  const { offsets, structure } = corpus();
  expect(structure.trailer).toBeDefined();
  const trailer = structure.trailer!;
  expect(Number(trailer.slice(3, 12))).toBe(3384620); // NARA's declared data-line count
  expect(Number(trailer.slice(12, 21))).toBe(offsets.records.length); // NARA's declared record count
}, 120_000);

// Every word index has terms, every posting list is a strictly ascending set
// of ordinals with no duplicate, the terms count matches the report the loader printed, and
// an independent regex tokenizer (written here, not importing src/loader/words.ts) agrees with
// what the loader actually indexed for /TI, for twenty records at fixed ordinals.
test.skipIf(skip)("word indexes: non-empty terms, strictly-ascending unique postings, counts match the report, and an independent regex tokenizer agrees for twenty records", () => {
  const { bytes, words, report, offsets } = corpus();
  for (const code of WORD_CODES) {
    const w = words[code]!;
    expect(w.terms.length, code).toBeGreaterThan(0);
    expect(w.terms.length, code).toBe(report.wordTerms[code]);
    // Strictly ascending implies no duplicate ordinal, so one pass checks both. Plain JS in
    // the inner loop, not expect() per comparison -- millions of postings across the nine
    // codes make a per-comparison assertion too slow; one assertion per code reports the
    // first violation, if any. The same pass also tracks the highest ordinal seen and the
    // total posting count, so a second full pass isn't needed for the two checks below.
    let violation: string | null = null;
    let maxPosting = -1;
    let postingsSum = 0;
    outer: for (const shard of Object.values(w.shards)) for (const postings of Object.values(shard)) {
      postingsSum += postings.length;
      const last = postings[postings.length - 1];
      if (last !== undefined && last > maxPosting) maxPosting = last;
      for (let i = 1; i < postings.length; i++) {
        if (!(postings[i]! > postings[i - 1]!)) { violation = `${postings[i - 1]} then ${postings[i]}`; break outer; }
      }
    }
    expect(violation, code).toBeNull();
    // Postings are record ordinals (index-builder.ts pushes `ordinal` from spans.forEach), so
    // the highest one must index into offsets.records, never past it.
    expect(maxPosting, code).toBeLessThan(offsets.records.length);
    // report.wordPostings[code] is the loader's own sum of every term's posting-list length for
    // that code (index-builder.ts), recorded rather than left to be guessed from file sizes.
    expect(postingsSum, code).toBe(report.wordPostings[code]);
  }

  // Second half: an independent regex tokenizer (written here rather than
  // imported from src/loader/words.ts) agrees with what the loader actually indexed for /TI,
  // for twenty records at fixed ordinals. Reuses the build above instead of a second full pass.
  const STOP_WORDS_INLINE = new Set(["AN", "BY", "FROM", "THE", "WITH", "AND", "FOR", "OF", "TO"]);
  function naiveTokenize(text: string): string[] {
    const out: string[] = [];
    for (const raw of text.toUpperCase().match(/[A-Z0-9-]+/g) ?? []) {
      const t = raw.replace(/^-+|-+$/g, "");
      if (!t || STOP_WORDS_INLINE.has(t)) continue;
      out.push(t);
      if (t.includes("-")) for (const part of t.split("-")) if (part && !STOP_WORDS_INLINE.has(part)) out.push(part);
    }
    return out;
  }
  function termsForOrdinal(w: WordIndex, ordinal: number): Set<string> {
    const out = new Set<string>();
    for (const shard of Object.values(w.shards)) for (const [term, postings] of Object.entries(shard)) if (postings.includes(ordinal)) out.add(term);
    return out;
  }
  const { spans } = scanRecords(bytes);
  const ti = words["/TI"]!;
  for (let ordinal = 0; ordinal < 20; ordinal++) {
    const rec = parseRecord(bytes, spans[ordinal]!, "RG164.CRIS.FY94.txt", "fy1991plus", 1);
    const naive = new Set<string>();
    for (const f of fields(rec, "TI")) for (const v of f.values) for (const t of naiveTokenize(v.raw)) naive.add(t);
    expect(termsForOrdinal(ti, ordinal), `ordinal ${ordinal}`).toEqual(naive);
  }
}, 120_000);

// The merged Basic Index term list (src/loader/index-builder.ts's mergedTerms, written by
// `pnpm load` to public/corpus/word/_merged/terms.json) is checked two ways: the file the
// loader wrote to disk exists, and one sampled term's count on disk equals a union of the
// four codes' own postings computed here, independently of buildIndexes' own union logic.
test.skipIf(skip)("merged Basic Index terms file exists on disk and a sampled term's count is the true union of the four codes' postings", () => {
  const { words } = corpus();
  expect(existsSync("public/corpus/word/_merged/terms.json")).toBe(true);
  const onDisk: [string, number][] = JSON.parse(readFileSync("public/corpus/word/_merged/terms.json", "utf8"));
  expect(onDisk.length).toBeGreaterThan(0);
  const [term, count] = onDisk[Math.floor(onDisk.length / 2)]!;
  const union = new Set<number>();
  for (const code of ["/TX", "/TI", "/DE", "/PB"] as const) {
    for (const shard of Object.values(words[code]!.shards)) {
      for (const p of shard[term] ?? []) union.add(p);
    }
  }
  expect(count).toBe(union.size);
}, 120_000);

// Every documented phrase prefix but SP now has a built index (round-3 finding: the
// remaining prefixes for fields the corpus carries). SP's Format B tag is HNRIMS-only and has
// a measured count of 0 on this corpus, so it stays the one documented prefix with no index.
test.skipIf(skip)("every documented phrase prefix but SP has a non-empty full-corpus index", () => {
  const { indexes } = corpus();
  expect(new Set(PHRASE_FIELDS)).toEqual(new Set((DOCUMENTED_PHRASE_PREFIXES as readonly string[]).filter(p => p !== "SP")));
  for (const code of PHRASE_FIELDS) {
    expect(Object.keys(indexes[code]!.terms).length, code).toBeGreaterThan(0);
  }
}, 120_000);

// indexUrls() takes the environment as an explicit argument (see
// test/regression/corpus-urls.test.ts for the base-path resolution rules); { BASE_URL: "/" }
// reproduces this test's prior no-base assumption.
test("indexUrls() equals PHRASE_FIELDS mapped to their corpus index URLs", () => {
  const env = { BASE_URL: "/" };
  const pairs = indexUrls(PHRASE_FIELDS, env);
  expect(pairs.map(([c]) => c)).toEqual([...PHRASE_FIELDS]);
  for (const [c, url] of pairs) expect(url).toBe(`/corpus/index/${c}.json`);
  expect(indexUrls(["ZZ"], env)).toEqual([["ZZ", "/corpus/index/ZZ.json"]]);
});

test("app/main.ts routes its fetch loop through indexUrls(), never a hand-duplicated literal", () => {
  // indexUrls() is unit-tested above for the actual equality that matters (main's
  // fetch list equals PHRASE_FIELDS); this is a secondary guard that main.ts still routes
  // through that pure function rather than rebuilding the URL list by hand (main.ts cannot be
  // imported directly -- it runs top-level await fetch()/document access on module load).
  const mainSrc = readFileSync("src/app/main.ts", "utf8");
  expect(mainSrc).toMatch(/\bindexUrls\s*\(/);
  expect(mainSrc).not.toMatch(/\[\s*"CY",\s*"IN",\s*"DS",\s*"ST",\s*"SF",\s*"AN"\s*\]/);
});
