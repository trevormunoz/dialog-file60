// Prefix-scan and sort helpers extracted from RetrievalEngine (src/retrieval/engine.ts), plus
// the byte-order collation they share with search()'s own term-list ordering. Pure functions
// over the state RetrievalEngine passes in, not classes of their own: RetrievalEngine's public
// prefixPostings/sortKey/sortOrdinals methods stay in place as thin wrappers, so callers see no
// difference (test/archival/truncation-corpus.test.ts's engine.prefixPostings(...) and
// commands/sort.ts's session.engine.sortOrdinals(...) are unchanged). Split out only to keep
// engine.ts under this project's 300-line guideline ahead of Block B's proximity-evaluation and
// rankValues additions -- a behavior-preserving refactor, not a new feature.
import type { Index, PositionalShard } from "../loader/corpus-format";
import type { PositionalSource } from "./words";
import type { SearchExpression, SearchResult } from "./engine";
import { resolveWordCode, POSITIONAL_CODES, shardOf, FIELD_STRIDE } from "../loader/words";
import { phraseKey } from "../loader/phrase";
import { registry } from "../registry";

registry.get("proto.sort.multivalue_key");

/** Byte order of the uppercased keys -- the same collation EXPAND's browse list uses
 * (proto.expand.collation). Duplicated from src/dialog/expand.ts's own copy rather than
 * imported, so retrieval keeps no dependency on the dialog layer. */
export const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** AND/OR/NOT's own set arithmetic over ordinal lists -- pure functions, moved here alongside
 * this module's other RetrievalEngine primitives to keep engine.ts under this project's
 * 300-line guideline. */
export const intersect = (a: number[], b: number[]): number[] => { const s = new Set(b); return a.filter(x => s.has(x)); };
export const union = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])];
export const difference = (a: number[], b: number[]): number[] => { const s = new Set(b); return a.filter(x => !s.has(x)); };

/** Every posting of every term in `code` whose key begins with `stem`. The sorted term list
 * gives the run of matching keys in one contiguous block, so this binary-searches for the
 * first key >= stem and walks while the key still starts with stem. For a word suffix the
 * postings themselves live in the shards, which are loaded per first character -- a stem
 * never spans two shards, since every matching term shares the stem's first character.
 * `termList` and `termOrdinals` are RetrievalEngine's own methods, passed in rather than
 * imported, since they close over the engine's shard/index caches. */
export async function prefixPostings(
  termList: (code: string) => Promise<[string, number][]>,
  termOrdinals: (code: string, term: string) => Promise<number[]>,
  code: string,
  stem: string,
): Promise<number[]> {
  const terms = await termList(code);
  let lo = 0, hi = terms.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (collate(terms[mid]![0], stem) < 0) lo = mid + 1; else hi = mid; }
  const out = new Set<number>();
  for (let i = lo; i < terms.length && terms[i]![0].startsWith(stem); i++) {
    for (const o of await termOrdinals(code, terms[i]![0])) out.add(o);
  }
  return [...out].sort((a, b) => a - b);
}

/** The sort key for one record under one phrase field code: the collation-first (smallest
 * under `collate`) of the record's own values for that field, uppercased by phraseKey, or ""
 * when it carries none (either the field is not a built phrase index at all -- a Blue Sheet
 * sortable field with no CRIS value in this corpus -- or this record's own postings under
 * `code` are empty). For a single-valued field this is simply that one value; for a
 * multi-valued field (e.g. IN, multiple investigators) it is a stated tie-break rule this
 * reconstruction chose, not a reading of any source (proto.sort.multivalue_key). Read from
 * the already-loaded phrase index rather than by re-reading the record's bytes -- the index
 * is the same text the field prints, and a sort of 669 records must not fetch 669 byte
 * ranges. `sortReverse` is RetrievalEngine's own per-code cache, mutated in place here the
 * same way the inlined version did. */
export function sortKey(
  indexes: Record<string, Index>,
  sortReverse: Map<string, Map<number, string>>,
  code: string,
  ordinal: number,
): string {
  let rev = sortReverse.get(code);
  if (!rev) {
    rev = new Map<number, string>();
    const idx = indexes[code];
    if (idx) {
      for (const [term, ords] of Object.entries(idx.terms)) {
        for (const o of ords) {
          const current = rev.get(o);
          if (current === undefined || collate(term, current) < 0) rev.set(o, term);
        }
      }
    }
    sortReverse.set(code, rev);
  }
  return rev.get(ordinal) ?? "";
}

/** Ordinals of `ordinals`, ordered by `keys`. Stable: equal keys keep their input order,
 * which is `render.record.order` (ascending) for a SORT operand's source set -- relies on
 * Array.prototype.sort's spec-guaranteed stability (ES2019+) rather than an explicit tie-
 * break. Uses the same byte-order collation as EXPAND's browse list (proto.expand.collation),
 * reused rather than restated. `sortKeyFn` is RetrievalEngine's own sortKey method, passed in
 * so this stays a pure function of its inputs. */
export function sortOrdinals(
  sortKeyFn: (code: string, ordinal: number) => string,
  ordinals: number[],
  keys: { field: string; descending: boolean }[],
): number[] {
  return ordinals
    .map(o => ({ o, keys: keys.map(k => sortKeyFn(k.field, o)) }))
    .sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const cmp = collate(a.keys[i]!, b.keys[i]!);
        if (cmp !== 0) return keys[i]!.descending ? -cmp : cmp;
      }
      return 0;
    })
    .map(w => w.o);
}

/** A proximity leaf named a suffix outside POSITIONAL_CODES (/TI and /DE only -- Trevor's
 * pre-approved decision (a): the full eight-code positional index measured 205,241,665 bytes,
 * over this reconstruction's 150 MB ceiling, so only /TI and /DE shipped -- registry key
 * proto.select.proximity.unimplemented). `code` is the offending suffix, uppercased with its
 * leading slash. This names a real File 60 search this reconstruction has not implemented, not
 * a typo -- the caller routes it to the capability-notice channel, the same as
 * UnknownField.documented. Re-exported from src/retrieval/engine.ts, where it historically
 * lived, so that import path stays valid. */
export class UnimplementedProximityField extends Error {
  constructor(readonly code: string) { super(`proximity not indexed for ${code}`); }
}

/** (W): b follows a in the same field, with at most distance-1 words between it and a. (N):
 * the same, in either order. (F): the same field, any distance -- distance is not read. Pure
 * arithmetic over two packed positions (fieldOrdinal * FIELD_STRIDE + wordPosition,
 * src/loader/words.ts); registry: index.word.positions (the packing rule this reads) and
 * proto.select.proximity (the operator definitions this implements). Exported for
 * test/regression/proximity.test.ts's own pure position-comparison cases (re-exported from
 * src/retrieval/engine.ts, where it historically lived, so that import path stays valid). n is
 * the maximum distance between the two terms' word positions -- adjacent terms are distance 1,
 * so a bare (W)/(N) (n = 1) requires adjacency and a numbered (nW)/(nN) allows at most n-1
 * intervening words (proto.select.proximity.numbered's inferred reading). */
export const near = (op: "W" | "N" | "F", distance: number, a: number, b: number): boolean => {
  if (Math.floor(a / FIELD_STRIDE) !== Math.floor(b / FIELD_STRIDE)) return false;
  if (op === "F") return true;
  const d = (b % FIELD_STRIDE) - (a % FIELD_STRIDE);
  return op === "W" ? d > 0 && d <= distance : d !== 0 && Math.abs(d) <= distance;
};

/** Loads the positional shard(s) a proximity leaf's own codes need -- POSITIONAL_CODES only
 * (/TI, /DE) after resolving an alias code (e.g. /DF -> /DE, src/loader/words.ts's
 * resolveWordCode) to the code whose index actually carries it, the same resolution the
 * "word"/"trunc" prepare() cases already apply: any other resolved code throws
 * UnimplementedProximityField before any fetch is attempted, the same guard shape UnknownSuffix
 * gives an unrecognized word code. A "trunc" leaf's stem shares its shard with every term it can
 * match, since shardOf keys on a term's first character and a truncation stem's first character
 * is the same for every match. */
export async function preparePositional(
  posShards: Map<string, PositionalShard>,
  posSource: PositionalSource | undefined,
  leaf: SearchExpression,
): Promise<void> {
  if (leaf.kind !== "word" && leaf.kind !== "trunc") throw new Error("a proximity leaf must be a word or a truncated term");
  for (const code of leaf.codes) {
    const resolved = resolveWordCode(code);
    if (!POSITIONAL_CODES.includes(resolved)) throw new UnimplementedProximityField(code);
    const shard = shardOf(leaf.kind === "word" ? phraseKey(leaf.term) : leaf.stem);
    const key = `${resolved}:${shard}`;
    if (!posShards.has(key)) {
      if (!posSource) throw new Error(`no positional index source configured for ${resolved}`);
      posShards.set(key, await posSource.positions(resolved, shard));
    }
  }
}

/** ordinal -> that record's packed positions for a proximity leaf, read from the shard(s)
 * preparePositional() already cached. Pushes the leaf's own per-term postings line as a side
 * effect -- the same "one line per leaf, in evaluation order" shape every other multi-operand
 * SELECT already prints (proto.select.per_term_postings); no new printing rule
 * (proto.select.proximity.perterm). A truncated leaf's postings union every term in the
 * shard that starts with its stem, the same rule prefixPostings applies for an ordinary
 * truncated SELECT. `display` carries no suffix -- the leaf's own echo/term as typed, since
 * the suffix belongs to the whole proximity expression (the combined line below shows it),
 * matching the 2001 and 1994 (curso) printed examples, whose bare-word operands show no
 * suffix on their own lines either. Resolves an alias code (e.g. /DF -> /DE) the same way
 * preparePositional() does, so the shard key looked up here matches the one it cached under. */
export function positionsOf(
  posShards: Map<string, PositionalShard>,
  leaf: SearchExpression,
  perTerm: SearchResult["perTerm"],
): Map<number, number[]> {
  if (leaf.kind !== "word" && leaf.kind !== "trunc") throw new Error("a proximity leaf must be a word or a truncated term");
  const out = new Map<number, number[]>();
  const seen = new Set<number>();
  for (const code of leaf.codes) {
    const resolved = resolveWordCode(code);
    const shard = shardOf(leaf.kind === "word" ? phraseKey(leaf.term) : leaf.stem);
    const posShard = posShards.get(`${resolved}:${shard}`);
    if (!posShard) throw new Error(`prepare() was not called for ${resolved}:${shard}`);
    const terms = leaf.kind === "word" ? [phraseKey(leaf.term)] : Object.keys(posShard).filter(t => t.startsWith(leaf.stem));
    for (const term of terms) {
      for (const [ordStr, packed] of Object.entries(posShard[term] ?? {})) {
        const ord = Number(ordStr);
        seen.add(ord);
        out.set(ord, (out.get(ord) ?? []).concat(packed));
      }
    }
  }
  perTerm.push({ display: leaf.kind === "word" ? phraseKey(leaf.term) : leaf.echo, postings: seen.size });
  return out;
}

/** The "prox" evaluation case's body: positions both leaves (via `positionsOfLeaf`, engine.ts's
 * bound `this.positionsOf`), keeps every ordinal where some position pair satisfies `near`, and
 * pushes the combined per-term line the same way every other multi-operand SELECT does. Split
 * out of RetrievalEngine.search()'s switch so that switch stays a thin dispatcher. */
export function evalProx(
  positionsOfLeaf: (leaf: SearchExpression) => Map<number, number[]>,
  op: "W" | "N" | "F",
  distance: number,
  left: SearchExpression,
  right: SearchExpression,
  echo: string,
  perTerm: SearchResult["perTerm"],
): number[] {
  const l = positionsOfLeaf(left);
  const r = positionsOfLeaf(right);
  const out: number[] = [];
  for (const [ord, lp] of l) {
    const rp = r.get(ord);
    if (!rp) continue;
    if (lp.some(a => rp.some(b => near(op, distance, a, b)))) out.push(ord);
  }
  const sorted = out.sort((a, b) => a - b);
  perTerm.push({ display: echo, postings: sorted.length });
  return sorted;
}
