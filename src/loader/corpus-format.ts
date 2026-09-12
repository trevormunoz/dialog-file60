import { phraseKey } from "./phrase";
import { registry } from "../registry";

export { phraseKey };

registry.get("index.format");

export interface Offsets { file: string; sha256: string; records: [an: string, firstLine: number, lastLine: number][]; }
export interface Index { code: string; terms: Record<string, number[]>; }
/** One word index per DIALOG suffix code. `shards` maps a shard letter
 * (src/loader/words.ts's shardOf) to a term -> postings map; `terms` is every term in the
 * code paired with its postings count, sorted by byte order of the uppercased key (the
 * same collation EXPAND uses), so a reader of terms.json need not re-sort it. */
export interface WordIndex { code: string; shards: Record<string, Record<string, number[]>>; terms: [string, number][]; }
/** Full-corpus checks, all asserted zero/empty in test/archival/loader.test.ts. */
export interface Report {
  compositeMismatches: string[];
  badLines: number;
  orphanContinuations: number;
  gcMismatches: string[];
  scSnMismatches: string[];
  /** Per-code word-index counts, recorded rather than guessed. wordTerms is
   * the distinct-term count per code; wordPostings is the summed postings-list length. */
  wordTerms: Record<string, number>;
  wordPostings: Record<string, number>;
  /** Per-code positional-index counts. posPostings counts occurrences (one per packed
   * position, unlike wordPostings, which counts records); posBytes sums each code's shard
   * files' serialized length, the same bytes src/loader/cli.ts writes under
   * public/corpus/pos/<CODE>. */
  posPostings: Record<string, number>;
  posBytes: Record<string, number>;
  /** Per-phrase-code distinct-term count, the load-time manifest the app checks each served
   * phrase index against (an empty served index is drift unless this count is 0). */
  phraseTerms: Record<string, number>;
}

/**
 * Each built phrase prefix's Format B source tag(s), measured against the FY 1994 corpus
 * (`LC_ALL=C grep -c "^<tag>" data/RG164.CRIS.FY94.txt`, 2026-09-10; every tag below occurs at
 * least once in the corpus's 34,090 records). Most prefixes are a direct one-tag reading of
 * their own DIALOG label; the composites follow render5.ts's own field grouping: B1/A1/D1
 * print the BT/AT/DT percentages (map.BT, map.AT, map.DT), GC is PA+JC (map.GC.composite), PC
 * is RP+AC+CM+FS+CT (map.PC.composite), PP is PX (map.PP.display_from_PX), PO is PF+PI
 * (map.PO.displays_PF_PI), and SH is PH+GH, the same Format B "Word and Phrase" reading for
 * PH/GH already recorded at index.sh.phrase_only. A code's component tags are deduplicated
 * per record before indexing, the same rule the word indexer applies to a composite code like
 * /TX -- a term present under two component tags of one record posts once, not twice.
 */
export const PHRASE_PREFIX_TAGS: Readonly<Record<string, readonly string[]>> = {
  AN: ["AN"], CY: ["CY"], DS: ["DS"], IN: ["IN"], SF: ["SF"], ST: ["ST"],
  AS: ["AS"], B1: ["BT"], A1: ["AT"], D1: ["DT"], FY: ["FY"], GC: ["PA", "JC"],
  GY: ["GY"], IC: ["IC"], OC: ["OC"], PC: ["RP", "AC", "CM", "FS", "CT"], PD: ["PD"],
  PN: ["PN"], PP: ["PX"], PS: ["PS"], PT: ["PT"], RE: ["RE"], SC: ["SC"], SD: ["SD"],
  SH: ["PH", "GH"], TD: ["TD"], UP: ["UP"], ZP: ["ZP"], PO: ["PF", "PI"],
};
export const PHRASE_FIELDS = Object.keys(PHRASE_PREFIX_TAGS);
/**
 * The 1998 Blue Sheet's full list of documented File 60 Additional Index (phrase-indexed)
 * prefixes, including PO and SP (word and phrase both). Version 1 builds an index for every
 * prefix in PHRASE_FIELDS. SP is the one documented prefix left unbuilt: its Format B tag SP
 * is HNRIMS-only and has a measured count of 0 on this CRIS-only corpus (same measurement
 * method as the note on PHRASE_PREFIX_TAGS), matching PO='s own word-index comment about SP in
 * src/loader/words.ts. Used by RetrievalEngine to tell "a documented prefix this build has not
 * implemented" (routed to the capability-notice channel) apart from "not a File 60 code at
 * all" (the simulated typo error).
 */
export const DOCUMENTED_PHRASE_PREFIXES = [
  "AN", "AS", "B1", "A1", "D1", "CY", "DS", "FY", "GC", "GY", "IC", "IN", "OC", "PC", "PD",
  "PN", "PP", "PS", "PT", "RE", "SC", "SD", "SF", "SH", "ST", "TD", "UP", "ZP", "PO", "SP",
] as const;
/**
 * The corpus index file URL for each phrase-indexed field code, re-exported from
 * ./corpus-urls so main.ts has one import site for the browser-safe surface. corpus-urls
 * holds the rules themselves; this module holds the types,
 * PHRASE_FIELDS, DOCUMENTED_PHRASE_PREFIXES, and phraseKey. The actual index-building
 * (buildIndexes, node:crypto) lives in ./index-builder, and the CLI entry point (node:fs)
 * in ./cli -- both Node-only, neither ever loaded by the browser.
 */
export { indexUrl, indexUrls, offsetsUrl, corpusUrl, corpusBase, wordDir, wordTermsUrl, wordShardUrl, posShardUrl, POS_DIR, type UrlEnv } from "./corpus-urls";
/** The positional index's types are defined in ./words, beside the position-packing logic
 * (FIELD_STRIDE, WORD_CODES, WORD_FIELDS) they depend on; re-exported here so every other
 * corpus-format consumer keeps its one import site. */
export { FIELD_STRIDE, type PositionalShard, type PositionalIndex } from "./words";
