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
}

export const PHRASE_FIELDS = ["CY", "IN", "DS", "ST", "SF", "AN"] as const;
/**
 * The 1998 Blue Sheet's full list of documented File 60 Additional Index (phrase-indexed)
 * prefixes,
 * including PO and SP (word and phrase both). Version 1 builds an index for only
 * PHRASE_FIELDS; every other prefix here is documented for File 60 but has no built index in
 * this milestone. Used by RetrievalEngine to tell "a documented prefix this build has not
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
export { indexUrl, indexUrls, offsetsUrl, corpusUrl, corpusBase, wordDir, wordTermsUrl, wordShardUrl, type UrlEnv } from "./corpus-urls";
