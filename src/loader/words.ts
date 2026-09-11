import { registry } from "../registry";

registry.get("index.word.tokens");
registry.get("index.word.stopwords");
registry.get("index.word.hyphen");
registry.get("index.word.shards");
registry.get("map.TX.composite");
registry.get("index.sh.phrase_only"); // why WORD_FIELDS below has no "SH=" entry
registry.get("index.word.positions");

/** The nine stop words named in Successful Searching on Dialog (2001). Applied to 1994 by
 * inference; the registry entry names the source and the inference. */
export const STOP_WORDS: ReadonlySet<string> = new Set(["AN", "BY", "FROM", "THE", "WITH", "AND", "FOR", "OF", "TO"]);

/** Split on spaces and on punctuation other than the hyphen; digits are tokens; a hyphenated
 * token is indexed whole and as its parts. Keys are uppercased. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toUpperCase().split(/[^A-Z0-9-]+/)) {
    const t = raw.replace(/^-+|-+$/g, "");
    if (!t || STOP_WORDS.has(t)) continue;
    out.push(t);
    if (t.includes("-")) for (const part of t.split("-")) if (part && !STOP_WORDS.has(part)) out.push(part);
  }
  return out;
}

/** Shard by first character: one file per A-Z and 0-9, plus "_" for anything else. A
 * chosen convenience by construction: DIALOG's own index structure is unknown. */
export function shardOf(term: string): string {
  const c = term[0] ?? "_";
  return /[A-Z0-9]/.test(c) ? c : "_";
}

/**
 * DIALOG suffix code -> the Format B tags whose text it indexes.
 * /TX is the Blue Sheet's union /AP + /NR + /OB + /PR (footnote 6); its /NR component is the
 * HNRIMS narrative tag NA, whose FY 1994 count is 0, so on this corpus /TX is AP + OB + PR.
 * /DF is an alias of /DE in the Blue Sheet; src/retrieval/engine.ts resolves it to /DE's index
 * at query time, so no separate /DF entry is built here. PO= is word and phrase over PI and PF
 * (Format B elements 7 and 13); the phrase half is built by the phrase indexer, this map is the
 * word half. SP= is HNRIMS-only (FY 1994 count 0) and is not built.
 */
export const WORD_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "/TI": ["TI"], "/OB": ["OB"], "/AP": ["AP"], "/DE": ["DE"],
  "/PR": ["PR"], "/PB": ["PB"], "/TX": ["AP", "OB", "PR"], "PO=": ["PF", "PI"],
};
export const WORD_CODES: readonly string[] = Object.keys(WORD_FIELDS);

/** Suffix codes that are not built as their own index but resolve to another code's index at
 * query time. /DF is the Blue Sheet's documented alias of /DE. */
export const WORD_ALIASES: Readonly<Record<string, string>> = { "/DF": "/DE" };
/** Resolves an alias code to the code whose index actually carries it; any other code passes
 * through unchanged. */
export const resolveWordCode = (code: string): string => WORD_ALIASES[code] ?? code;

/**
 * A bound on words per field, measured rather than guessed (index.word.positions): the
 * longest of the TI/OB/AP/PR/DE/PB fields across the FY 1994 corpus, in whitespace-separated
 * words including stop words, is 296 (measured 2026-09-11 by the script recorded at
 * index.word.positions and in docs/indexes.md); FIELD_STRIDE is the next power of two above
 * that. A packed position is `fieldOrdinal * FIELD_STRIDE + wordPosition`, so this bounds how
 * many words a single field value may hold before its word positions overflow into the next
 * field ordinal -- comfortably above the measured maximum.
 */
export const FIELD_STRIDE = 512;

/** One shard of a positional index: term -> record ordinal (as a string, since it is a JSON
 * object key) -> that record's packed positions for the term in this code. A record can carry
 * more than one occurrence of a term (repeating field, or the same word more than once in one
 * field), so the value is an array, not a single number. */
export type PositionalShard = Record<string, Record<string, number[]>>;

/** One code's full positional index, sharded the same way as WordIndex.shards
 * (src/loader/words.ts's shardOf) so a proximity search loads only the shard(s) its terms
 * fall in. */
export type PositionalIndex = Record<string, PositionalShard>;

/**
 * The subset of WORD_CODES whose positional index is actually built and shipped:
 * index-builder.ts's buildIndexes() takes the codes to build positions for as an argument and
 * defaults to this constant, so a plain `buildIndexes(bytes, file)` call -- src/loader/cli.ts's,
 * and every archival test's -- computes positions only for these two, and src/loader/cli.ts
 * writes (and scripts/upload-corpus.sh uploads) only these two directories.
 * test/regression/positional-index.test.ts, whose composite-code check needs /TX, passes the
 * full WORD_CODES list explicitly to override the default -- it runs only against the tiny
 * committed fixture record, so the fuller computation costs nothing there.
 *
 * Trevor's pre-approved decision (a): a one-time run with every WORD_CODES entry passed
 * explicitly measured the full eight-code positional index at 205,241,665 bytes under
 * public/corpus/pos (`pnpm load`, 2026-09-11) -- over this reconstruction's 150 MB ceiling on
 * bytes added to the bucket's v1/ prefix -- so version 1 ships positions for only the two
 * Basic Index codes /TI and /DE (16,883,977 of those bytes). Proximity over /TX, /AP, /OB,
 * /PR, /PB and PO= is recorded as not implemented, with this measured size as the reason
 * (docs/not-implemented.md, docs/indexes.md's Positional index section). Building all eight
 * unconditionally, the first version of this constant's use, also pushed several archival
 * tests that build fresh over the real corpus past Vitest's 60s per-file RPC timeout -- a
 * second reason the default stays narrow.
 */
export const POSITIONAL_CODES: readonly string[] = ["/TI", "/DE"];
