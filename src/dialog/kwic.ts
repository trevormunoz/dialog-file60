// Format K (KWIC, Key Word In Context): a window of text around each matched word. This
// module is a pure builder -- no session, no engine, no rendering -- so its window mechanics
// (kwicWindows) can be tested against literal strings, and its real-record use (kwicLines)
// stays a thin wrapper session.ts's TYPE handler calls directly, bypassing renderFor: format K
// needs the set's own search expression and the session's window size, neither of which
// renderFor (pure over one record) has access to.
import { fields, type LogicalRecord } from "@barcstory/cris-formatb";
import type { SearchExpression } from "../retrieval/engine";
import { WORD_FIELDS } from "../loader/words";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";

registry.get("proto.kwic.window");
registry.get("proto.kwic.layout");

/** SET KWIC nn: any window size between 2 and 50 words, system default 30 (Successful
 * Searching on Dialog, 2001). */
export const KWIC_DEFAULT = 30;
export const KWIC_MIN = 2, KWIC_MAX = 50;

const stripPunctuation = (word: string): string => word.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Word positions in `words` whose punctuation-stripped, uppercased form is an exact match
 * for an exact term, or starts with a prefix term. */
function matchIndices(words: string[], terms: { term: string; prefix: boolean }[]): number[] {
  const out: number[] = [];
  words.forEach((w, i) => {
    const key = stripPunctuation(w);
    if (key && terms.some(t => (t.prefix ? key.startsWith(t.term) : key === t.term))) out.push(i);
  });
  return out;
}

/** One `size`-word window per match index, centred on the match (one more word of context
 * before the match than after, when size - 1 is odd -- Test 1 of the brief: size 4 around one
 * match puts 2 words before, 1 after). A window that would run past either edge of `words`
 * shifts back onto the text instead of padding with nothing (Test 2). Overlapping or adjacent
 * windows are merged into one rather than printed twice -- a choice, recorded at
 * proto.kwic.layout, not a reading of any source. " ..." marks a side the window was actually
 * cut on (2001: "A space precedes the ellipses (...) to each window"); a side that reaches the
 * start or end of `words` carries no ellipsis. */
function windowsFromIndices(words: string[], indices: number[], size: number): string[] {
  if (!indices.length) return [];
  const before = Math.ceil((size - 1) / 2), after = Math.floor((size - 1) / 2);
  const spans = indices.map((m): [number, number] => {
    let start = m - before, end = m + after;
    if (start < 0) { end += -start; start = 0; }
    if (end > words.length - 1) { start -= end - (words.length - 1); end = words.length - 1; }
    return [Math.max(0, start), end];
  });
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([s, e]) => {
    const left = s > 0 ? "... " : "";
    const right = e < words.length - 1 ? " ..." : "";
    return `${left}${words.slice(s, e + 1).join(" ")}${right}`;
  });
}

/**
 * One window per match, `size` words wide, centred on the matched word. Do **not** use
 * tokenize() (src/loader/words.ts): it drops stop words and splits hyphenated forms, and a
 * window must show the text as written. Split on whitespace, so the window is *displayed* as
 * stored; compare each word's uppercased, punctuation-stripped form against `terms`, the same
 * normalized form the word index keys use, so the window is *matched* the way the index was
 * built, even though what prints is the raw word.
 */
export function kwicWindows(text: string, terms: string[], size = KWIC_DEFAULT): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const wanted = terms.map(t => ({ term: t.toUpperCase(), prefix: false }));
  return windowsFromIndices(words, matchIndices(words, wanted), size);
}

/** The word-index terms a set's own expression searched for -- the terms a KWIC display of
 * that set shows in context. A phrase operand (CY=BELTSVILLE) contributes nothing: it is not
 * a word in the text fields KWIC reads. A truncation contributes its stem, matched as a
 * prefix. A set or EXPAND-ref operand carries no term of its own here -- only the ordinals it
 * already resolved to -- so it contributes nothing either. */
export function kwicTerms(expr: SearchExpression): { term: string; prefix: boolean }[] {
  switch (expr.kind) {
    case "word": return [{ term: expr.term.toUpperCase(), prefix: false }];
    case "trunc": return [{ term: expr.stem.toUpperCase(), prefix: true }];
    case "and": case "or": case "not": return [...kwicTerms(expr.left), ...kwicTerms(expr.right)];
    default: return [];
  }
}

/** The Format B tags a KWIC display reads text from -- the same four suffix codes
 * (/TX, /TI, /DE, /PB) src/loader/index-builder.ts merges into the Basic Index, read through
 * WORD_FIELDS rather than restated here. /TX alone already covers AP, OB and PR. */
const KWIC_TEXT_CODES = ["/TI", "/TX", "/DE", "/PB"];
const KWIC_TEXT_TAGS: readonly string[] = [...new Set(KWIC_TEXT_CODES.flatMap(c => WORD_FIELDS[c] ?? []))];

/** Format K over one record: every window, across every text field KWIC reads, that contains
 * one of `terms`. Layout is this reconstruction's own choice (proto.kwic.layout, no source
 * shows a rendered KWIC block): one window per line, in field order, with no field label and
 * no window separator beyond the existing item header TYPE already prints. */
export function kwicLines(rec: LogicalRecord, terms: { term: string; prefix: boolean }[], size = KWIC_DEFAULT): OutputLine[] {
  const out: OutputLine[] = [];
  for (const tag of KWIC_TEXT_TAGS) {
    for (const f of fields(rec, tag)) {
      for (const val of f.values) {
        const words = val.raw.split(/\s+/).filter(Boolean);
        for (const w of windowsFromIndices(words, matchIndices(words, terms), size)) {
          out.push(line(w, { sources: [{ tag }], registryKeys: ["proto.kwic.window", "proto.kwic.layout"] }));
        }
      }
    }
  }
  return out;
}
