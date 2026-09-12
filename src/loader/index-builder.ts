import { createHash } from "node:crypto";
import { scanRecords, parseRecord, fields, type LogicalRecord } from "@barcstory/cris-formatb";
import { phraseKey } from "./phrase";
import { PHRASE_FIELDS, PHRASE_PREFIX_TAGS, type Offsets, type Index, type Report, type WordIndex } from "./corpus-format";
import { WORD_CODES, WORD_FIELDS, tokenize, shardOf, STOP_WORDS, FIELD_STRIDE, POSITIONAL_CODES, type PositionalIndex } from "./words";

// Node-only: hashes the corpus bytes with node:crypto. Kept out of corpus-format.ts, which
// src/app/main.ts imports for its browser-safe exports (PHRASE_FIELDS, indexUrls, the
// Offsets/Index types) -- Vite externalizes node builtins for the browser bundle, and a
// static import of a named binding from an externalized module throws on module evaluation,
// before any of this file's code would even run. Only src/loader/cli.ts (Node, never loaded
// by the browser) and tests import buildIndexes from here.

const COMPOSITE = ["RP", "AC", "CM", "FS", "CT"] as const;
const GC = ["PA", "JC"] as const;
const SC_SN = ["SC", "SN"] as const;

// The four word codes the Basic Index (EXPAND with no prefix) merges -- src/retrieval/engine.ts
// termList("*") and termOrdinals("*") union these same four.
const MERGED_WORD_CODES = ["/TX", "/TI", "/DE", "/PB"] as const;

const mismatched = (rec: LogicalRecord, tags: readonly string[]): boolean =>
  new Set(tags.map(t => fields(rec, t).flatMap(f => f.values).length)).size > 1;

/**
 * One record's positional postings across `codes`, beside the tokenize()-based word shards
 * buildIndexes builds separately for every WORD_CODES entry. `fieldOrdinal` counts field
 * VALUES across every tag WORD_FIELDS[code] names, continuously -- so a composite code's
 * second component tag (e.g. /TX's OB, after AP) starts its own words at the next field
 * ordinal, never the same one AP just used; a word in AP and a word in OB never look like
 * they share a field, which is what keeps (F) from joining them (registry: index.word.positions).
 *
 * Unlike tokenize(), this counts every whitespace-separated word, INCLUDING stop words -- so
 * "adjacent in the text" survives a dropped stop word: "FRESH WATER" and "FRESH THE WATER"
 * must not both look adjacent. No source states how DIALOG itself counted positions across
 * stop words; this is this reconstruction's own chosen rule (registry: index.word.positions).
 */
function buildPositions(
  rec: LogicalRecord,
  ordinal: number,
  pushPosition: (code: string, term: string, ordinal: number, packed: number) => void,
  codes: readonly string[],
): void {
  for (const code of codes) {
    let fieldOrdinal = 0;
    for (const tag of WORD_FIELDS[code]!) {
      for (const f of fields(rec, tag)) for (const v of f.values) {
        const fieldWords = v.raw.toUpperCase().split(/[^A-Z0-9-]+/).filter(Boolean);
        fieldWords.forEach((rawWord, i) => {
          const t = rawWord.replace(/^-+|-+$/g, "");
          if (!t || STOP_WORDS.has(t)) return;
          const packed = fieldOrdinal * FIELD_STRIDE + i;
          pushPosition(code, t, ordinal, packed);
          // A hyphenated token's parts share the whole token's position: they are the same
          // word of the field, indexed three ways (index.word.hyphen), so a proximity
          // operator must see one position, not three consecutive ones.
          if (t.includes("-")) {
            for (const part of t.split("-")) if (part && !STOP_WORDS.has(part)) pushPosition(code, part, ordinal, packed);
          }
        });
        fieldOrdinal++;
      }
    }
  }
}

/** One code's occurrence count and (when `withBytes`) total serialized shard bytes --
 * Report.posPostings and Report.posBytes, computed once per code rather than inline in
 * buildIndexes. posPostings counts occurrences (every packed position, not one per record) and
 * is cheap: no serialization, just array-length sums, so it is always computed, even for a
 * code buildPositions() never populated (then trivially 0). posBytes sums each shard's
 * serialized length, the same bytes src/loader/cli.ts writes to
 * public/corpus/pos/<CODE>/<shard>.json -- computed only `withBytes` (buildIndexes passes
 * `positionalCodes.includes(code)`): JSON.stringify-ing the full eight-code positional index
 * (205,241,665 bytes measured 2026-09-11) on every buildIndexes() call, including from archival
 * tests that never read posBytes, was itself enough to push several fresh full-corpus test
 * files past Vitest's 60s per-file RPC timeout, before buildPositions() was made to skip
 * uncomputed codes entirely (see buildIndexes's own doc comment). `bytes` is 0 for a code this
 * is not computed for; docs/indexes.md records the one-time full-set measurement separately. */
function posCounts(index: PositionalIndex, withBytes: boolean): { postings: number; bytes: number } {
  let postings = 0;
  let bytes = 0;
  for (const shardData of Object.values(index)) {
    if (withBytes) bytes += JSON.stringify(shardData).length;
    for (const ordMap of Object.values(shardData)) for (const arr of Object.values(ordMap)) postings += arr.length;
  }
  return { postings, bytes };
}

/**
 * `positionalCodes` (default POSITIONAL_CODES, /TI and /DE) names which WORD_CODES entries
 * buildPositions() actually computes -- not a restriction on the shape of `positions`, which
 * always has one key per WORD_CODES entry (empty for a code not in `positionalCodes`), only on
 * the work done. Defaulting to the small, shipped subset rather than every WORD_CODES entry is
 * a performance choice, not a design one: the full eight-code positional computation, run
 * unconditionally, pushed several archival tests that call buildIndexes() fresh over the real
 * 277,539,004-byte corpus past Vitest's 60s per-file RPC timeout (test/archival/loader.test.ts
 * and siblings, none of which read `positions` at all). test/regression/positional-index.test.ts
 * passes the full WORD_CODES list explicitly, since its composite-code check needs /TX -- cost
 * is irrelevant there, since it runs against the tiny committed record fixture, not the corpus.
 */
export function buildIndexes(bytes: Uint8Array, file: string, positionalCodes: readonly string[] = POSITIONAL_CODES) {
  // `structure` (NARA's own header/trailer lines) is returned alongside the rest so callers
  // -- the archival full-corpus test in particular -- can compare the file's self-declared
  // record count against the parsed one.
  const { spans, badLines, structure } = scanRecords(bytes);
  const offsets: Offsets = { file, sha256: createHash("sha256").update(bytes).digest("hex"), records: [] };
  const indexes: Record<string, Index> = Object.fromEntries(PHRASE_FIELDS.map(c => [c, { code: c, terms: {} }]));
  const words: Record<string, WordIndex> = Object.fromEntries(WORD_CODES.map(c => [c, { code: c, shards: {}, terms: [] }]));
  const positions: Record<string, PositionalIndex> = Object.fromEntries(WORD_CODES.map(c => [c, {}]));
  const report: Report = {
    compositeMismatches: [], badLines, orphanContinuations: 0, gcMismatches: [], scSnMismatches: [],
    wordTerms: {}, wordPostings: {}, posPostings: {}, posBytes: {}, phraseTerms: {},
  };
  // Records one occurrence's packed position under (code, term)'s shard, for the given record
  // ordinal. A record can carry more than one occurrence of a term (a repeating field, or the
  // same word twice in one field value), so postings accumulate into an array.
  const pushPosition = (code: string, term: string, ordinal: number, packed: number): void => {
    const byShard = positions[code]!;
    const shard = shardOf(term);
    const terms = (byShard[shard] ??= {});
    const ords = (terms[term] ??= {});
    (ords[String(ordinal)] ??= []).push(packed);
  };
  spans.forEach((span, ordinal) => {
    const rec = parseRecord(bytes, span, file, "fy1991plus", 1); // whole-file buffer begins at line 1
    offsets.records.push([rec.an, rec.firstLine, rec.lastLine]);
    for (const code of PHRASE_FIELDS) {
      const seen = new Set<string>();
      for (const tag of PHRASE_PREFIX_TAGS[code]!) {
        for (const f of fields(rec, tag)) for (const v of f.values) {
          const k = phraseKey(v.raw);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          (indexes[code]!.terms[k] ??= []).push(ordinal);
        }
      }
    }
    for (const code of WORD_CODES) {
      const seen = new Set<string>();
      for (const tag of WORD_FIELDS[code]!) {
        for (const f of fields(rec, tag)) for (const v of f.values) {
          for (const t of tokenize(v.raw)) {
            if (seen.has(t)) continue;      // postings count records, not occurrences
            seen.add(t);
            const w = words[code]!;
            ((w.shards[shardOf(t)] ??= {})[t] ??= []).push(ordinal);
          }
        }
      }
    }
    buildPositions(rec, ordinal, pushPosition, positionalCodes); // positional postings, beside the word shards above
    if (mismatched(rec, COMPOSITE)) report.compositeMismatches.push(rec.an);
    if (mismatched(rec, GC)) report.gcMismatches.push(rec.an);
    if (mismatched(rec, SC_SN)) report.scSnMismatches.push(rec.an);
    report.orphanContinuations += rec.orphanContinuations;
  });
  // Fill each WordIndex.terms with [term, postings.length] pairs from every shard, sorted by
  // byte order of the uppercased key -- the same collation EXPAND uses -- and record
  // the counts in Report rather than leaving them to be guessed from file sizes.
  for (const code of WORD_CODES) {
    const w = words[code]!;
    const pairs: [string, number][] = [];
    for (const shard of Object.values(w.shards)) for (const [term, postings] of Object.entries(shard)) pairs.push([term, postings.length]);
    pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    w.terms = pairs;
    report.wordTerms[code] = pairs.length;
    report.wordPostings[code] = pairs.reduce((sum, [, n]) => sum + n, 0);
    const { postings, bytes: posBytes } = posCounts(positions[code]!, positionalCodes.includes(code));
    report.posPostings[code] = postings;
    report.posBytes[code] = posBytes;
  }
  for (const code of PHRASE_FIELDS) report.phraseTerms[code] = Object.keys(indexes[code]!.terms).length;
  // The merged Basic Index term list: every term any of the four codes carries, paired with
  // the true union count of its postings across all four -- the same figure a SELECT on the
  // term's E-number retrieves, built once here rather than recomputed in the browser.
  const mergedPostings = new Map<string, Set<number>>();
  for (const code of MERGED_WORD_CODES) {
    for (const shard of Object.values(words[code]!.shards)) {
      for (const [term, postings] of Object.entries(shard)) {
        const set = mergedPostings.get(term) ?? new Set<number>();
        for (const o of postings) set.add(o);
        mergedPostings.set(term, set);
      }
    }
  }
  const mergedTerms: [string, number][] = [...mergedPostings.entries()]
    .map(([term, set]): [string, number] => [term, set.size])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { offsets, indexes, words, positions, report, structure, mergedTerms };
}
