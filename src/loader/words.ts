import { registry } from "../registry";

registry.get("index.word.tokens");
registry.get("index.word.stopwords");
registry.get("index.word.hyphen");
registry.get("index.word.shards");
registry.get("map.TX.composite");
registry.get("index.sh.phrase_only"); // why WORD_FIELDS below has no "SH=" entry

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
 * /DF is an alias of /DE in the Blue Sheet. PO= is word and phrase over PI and PF (Format B elements
 * 7 and 13); the phrase half is built by the phrase indexer, this map is the word half.
 * SP= is HNRIMS-only (FY 1994 count 0) and is not built.
 */
export const WORD_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "/TI": ["TI"], "/OB": ["OB"], "/AP": ["AP"], "/DE": ["DE"], "/DF": ["DE"],
  "/PR": ["PR"], "/PB": ["PB"], "/TX": ["AP", "OB", "PR"], "PO=": ["PF", "PI"],
};
export const WORD_CODES: readonly string[] = Object.keys(WORD_FIELDS);
