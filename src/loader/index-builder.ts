import { createHash } from "node:crypto";
import { scanRecords, parseRecord, fields, type LogicalRecord } from "@barcstory/cris-formatb";
import { phraseKey } from "./phrase";
import { PHRASE_FIELDS, PHRASE_PREFIX_TAGS, type Offsets, type Index, type Report, type WordIndex } from "./corpus-format";
import { WORD_CODES, WORD_FIELDS, tokenize, shardOf } from "./words";

// Node-only: hashes the corpus bytes with node:crypto. Kept out of corpus-format.ts, which
// src/app/main.ts imports for its browser-safe exports (PHRASE_FIELDS, indexUrls, the
// Offsets/Index types) -- Vite externalizes node builtins for the browser bundle, and a
// static import of a named binding from an externalized module throws on module evaluation,
// before any of this file's code would even run. Only src/loader/cli.ts (Node, never loaded
// by the browser) and tests import buildIndexes from here.

const COMPOSITE = ["RP", "AC", "CM", "FS", "CT"] as const;
const GC = ["PA", "JC"] as const;
const SC_SN = ["SC", "SN"] as const;

const mismatched = (rec: LogicalRecord, tags: readonly string[]): boolean =>
  new Set(tags.map(t => fields(rec, t).flatMap(f => f.values).length)).size > 1;

export function buildIndexes(bytes: Uint8Array, file: string) {
  // `structure` (NARA's own header/trailer lines) is returned alongside the rest so callers
  // -- the archival full-corpus test in particular -- can compare the file's self-declared
  // record count against the parsed one.
  const { spans, badLines, structure } = scanRecords(bytes);
  const offsets: Offsets = { file, sha256: createHash("sha256").update(bytes).digest("hex"), records: [] };
  const indexes: Record<string, Index> = Object.fromEntries(PHRASE_FIELDS.map(c => [c, { code: c, terms: {} }]));
  const words: Record<string, WordIndex> = Object.fromEntries(WORD_CODES.map(c => [c, { code: c, shards: {}, terms: [] }]));
  const report: Report = {
    compositeMismatches: [], badLines, orphanContinuations: 0, gcMismatches: [], scSnMismatches: [],
    wordTerms: {}, wordPostings: {},
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
  }
  return { offsets, indexes, words, report, structure };
}
