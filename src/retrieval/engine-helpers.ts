// Prefix-scan and sort helpers extracted from RetrievalEngine (src/retrieval/engine.ts), plus
// the byte-order collation they share with search()'s own term-list ordering. Pure functions
// over the state RetrievalEngine passes in, not classes of their own: RetrievalEngine's public
// prefixPostings/sortKey/sortOrdinals methods stay in place as thin wrappers, so callers see no
// difference (test/archival/truncation-corpus.test.ts's engine.prefixPostings(...) and
// commands/sort.ts's session.engine.sortOrdinals(...) are unchanged). Split out only to keep
// engine.ts under this project's 300-line guideline ahead of Block B's proximity-evaluation and
// rankValues additions -- a behavior-preserving refactor, not a new feature.
import type { Index } from "../loader/corpus-format";
import { registry } from "../registry";

registry.get("proto.sort.multivalue_key");

/** Byte order of the uppercased keys -- the same collation EXPAND's browse list uses
 * (proto.expand.collation). Duplicated from src/dialog/expand.ts's own copy rather than
 * imported, so retrieval keeps no dependency on the dialog layer. */
export const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
