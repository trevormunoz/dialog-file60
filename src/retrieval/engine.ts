import { parseRecord, lineToOffset, LINE_BYTES, type LogicalRecord, type Profile } from "@barcstory/cris-formatb";
import type { Offsets, Index } from "../loader/corpus-format";
import { DOCUMENTED_PHRASE_PREFIXES } from "../loader/corpus-format";
import { phraseKey } from "../loader/phrase";
import { WORD_CODES, shardOf } from "../loader/words";
import type { WordIndexSource } from "./words";
import { registry } from "../registry";
export type { RangeReader } from "./reader";
import type { RangeReader } from "./reader";

registry.get("proto.select.per_term_postings");
registry.get("render.record.order");
registry.get("proto.select.boolean");
// index.phrase.uppercase (the loader's uppercase-and-strip phrase rule, applied below by
// phraseKey) is cited here, at the point where a SELECT term is looked up: this is the one
// place in the retrieval layer that applies it.
registry.get("index.phrase.uppercase");

export type SearchExpression =
  | { kind: "term"; field: string; term: string }
  | { kind: "set"; id: number }
  | { kind: "and"; left: SearchExpression; right: SearchExpression }
  | { kind: "or"; left: SearchExpression; right: SearchExpression }
  | { kind: "not"; left: SearchExpression; right: SearchExpression }
  | { kind: "word"; codes: string[]; term: string }
  /** An EXPAND ref (E3) or ref range (E3:E5) named as a SELECT operand. `ordinals` starts
   * empty as parsed -- DialogSession resolves it against the open EXPAND display before
   * search() ever sees the node, so search() itself learns nothing about what an E-number is,
   * only a pre-resolved ordinal list. `echo` is the token as typed, uppercased. */
  | { kind: "refs"; ordinals: number[]; echo: string };
export interface SearchResult { perTerm: { display: string; postings: number }[]; ordinals: number[]; }

/** Byte order of the uppercased keys -- the same collation EXPAND's browse list uses
 * (proto.expand.collation). Duplicated here as one line rather than imported from the dialog
 * layer, so retrieval keeps no dependency on dialog. */
const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** SELECT named a set number with no set open in the session yet (e.g. `S S7` with no S7).
 * Carries the offending id, not a message string, so the caller builds its own printed token
 * instead of parsing this class's message text. */
export class UnknownSet extends Error { constructor(readonly id: number) { super(`unknown set S${id}`); } }
/** SELECT named a field or index code the loaded indexes do not carry (e.g. `S ZZ=X`).
 * `documented` is true when `field` is one of the 1998 Blue Sheet's documented File 60
 * phrase prefixes with no built index in this milestone (e.g. `FY=`) -- the caller routes that
 * case to the capability-notice channel rather than the simulated typo error, since it
 * names a real File 60 search this reconstruction has not implemented, not a mistyped code. */
export class UnknownField extends Error {
  readonly documented: boolean;
  constructor(readonly field: string, readonly term: string) {
    super(`unknown field ${field}`);
    this.documented = (DOCUMENTED_PHRASE_PREFIXES as readonly string[]).includes(field.toUpperCase());
  }
}

/** SELECT named a `/suffix` code the word indexes do not carry (e.g. `peach/zz`). The suffix
 * as typed, uppercased with its leading slash, so the caller builds its own printed token
 * instead of parsing this class's message text -- the same shape UnknownField already gives
 * its callers. */
export class UnknownSuffix extends Error {
  constructor(readonly code: string) { super(`unknown suffix ${code}`); }
}

/** SELECT named an EXPAND ref (E3 or E3:E5) with no EXPAND open, or naming a row outside the
 * page currently displayed. `echo` is the token as typed -- the caller prints it bare (`? E3`),
 * unlike UnknownField, which appends "=" and a value neither ref case has. */
export class UnknownRef extends Error {
  constructor(readonly echo: string) { super(`unknown ref ${echo}`); }
}

const intersect = (a: number[], b: number[]): number[] => { const s = new Set(b); return a.filter(x => s.has(x)); };
const union = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])];
const difference = (a: number[], b: number[]): number[] => { const s = new Set(b); return a.filter(x => !s.has(x)); };

export class RetrievalEngine {
  /** Word-index shards already fetched, keyed `${code}:${shard}`. A word SELECT loads only
   * the shards it names, and only once: prepare() checks this map before calling wordSource. */
  private shards = new Map<string, Record<string, number[]>>();
  /** Sorted [term, postings.length] lists for a phrase field, cached per code since the
   * indexes never change during a session -- termList()'s phrase branch. */
  private phraseTerms = new Map<string, [string, number][]>();
  /** The merged Basic Index browse list (BASIC_INDEX), built once and reused by every bare
   * EXPAND. */
  private basicIndexTerms: [string, number][] | null = null;

  constructor(
    private offsets: Offsets,
    private indexes: Record<string, Index>,
    private reader: RangeReader,
    private profile: Profile,
    private wordSource?: WordIndexSource,
  ) {}

  /** Walks `expr` for its "word" operands and loads any (code, shard) pair search() will
   * need that is not already cached. Must run, and be awaited, before search() when expr may
   * contain a word operand -- search() itself stays synchronous and only ever reads the
   * cache. Throws UnknownSuffix for a code that is not one of WORD_CODES, before any fetch is
   * attempted for it. */
  async prepare(expr: SearchExpression): Promise<void> {
    switch (expr.kind) {
      case "and": case "or": case "not":
        await this.prepare(expr.left); await this.prepare(expr.right); return;
      case "word": {
        const shard = shardOf(phraseKey(expr.term));
        for (const code of expr.codes) {
          if (!WORD_CODES.includes(code)) throw new UnknownSuffix(code);
          const key = `${code}:${shard}`;
          if (!this.shards.has(key)) {
            if (!this.wordSource) throw new Error(`no word index source configured for ${code}`);
            this.shards.set(key, await this.wordSource.shard(code, shard));
          }
        }
        return;
      }
      default: return;
    }
  }

  /** Every term the given field or suffix carries, paired with its postings count -- used by
   * the EXPAND browse list (not used by search()). BASIC_INDEX ("*") merges the /TX, /TI, /DE
   * and /PB word-term lists (proto.expand.display's note); a word suffix code reads its
   * prebuilt terms.json; a phrase field code (e.g. "IN", "CY") is derived from the loaded
   * phrase index and sorted here, once, then cached. */
  async termList(code: string): Promise<[string, number][]> {
    if (code === "*") {
      if (this.basicIndexTerms) return this.basicIndexTerms;
      const merged = new Map<string, number>();
      for (const c of ["/TX", "/TI", "/DE", "/PB"]) {
        for (const [term, count] of await this.termList(c)) merged.set(term, Math.max(merged.get(term) ?? 0, count));
      }
      const out = [...merged.entries()].sort((a, b) => collate(a[0], b[0]));
      this.basicIndexTerms = out;
      return out;
    }
    if (code.startsWith("/") || code === "PO=") {
      if (!WORD_CODES.includes(code)) throw new UnknownSuffix(code);
      if (!this.wordSource) throw new Error(`no word index source configured for ${code}`);
      return this.wordSource.terms(code);
    }
    const cached = this.phraseTerms.get(code);
    if (cached) return cached;
    const idx = this.indexes[code];
    if (!idx) throw new UnknownField(code, "");
    const out = Object.entries(idx.terms).map(([t, o]) => [t, o.length] as [string, number]).sort((a, b) => collate(a[0], b[0]));
    this.phraseTerms.set(code, out);
    return out;
  }

  /** The postings for one already-known (code, term) pair -- what a SELECT on an EXPAND ref
   * resolves to. Loads a word shard on demand, same as prepare(); a phrase field reads its
   * already-loaded index directly; BASIC_INDEX unions the same four codes termList() merges,
   * using each code's real postings rather than termList()'s cheaper max-count approximation. */
  async termOrdinals(code: string, term: string): Promise<number[]> {
    if (code === "*") {
      const parts = await Promise.all(["/TX", "/TI", "/DE", "/PB"].map(c => this.termOrdinals(c, term)));
      return [...new Set(parts.flat())].sort((a, b) => a - b);
    }
    if (code.startsWith("/") || code === "PO=") {
      if (!WORD_CODES.includes(code)) throw new UnknownSuffix(code);
      const key = phraseKey(term);
      const shard = shardOf(key);
      const cacheKey = `${code}:${shard}`;
      if (!this.shards.has(cacheKey)) {
        if (!this.wordSource) throw new Error(`no word index source configured for ${code}`);
        this.shards.set(cacheKey, await this.wordSource.shard(code, shard));
      }
      return this.shards.get(cacheKey)![key] ?? [];
    }
    const idx = this.indexes[code];
    if (!idx) throw new UnknownField(code, term);
    return idx.terms[phraseKey(term)] ?? [];
  }

  search(expr: SearchExpression, sets: Map<number, number[]>): SearchResult {
    const perTerm: SearchResult["perTerm"] = [];
    const evalExpr = (e: SearchExpression): number[] => {
      switch (e.kind) {
        case "term": {
          const key = phraseKey(e.term);
          const idx = this.indexes[e.field];
          if (!idx) throw new UnknownField(e.field, e.term);
          const ords = idx.terms[key] ?? [];
          perTerm.push({ display: `${e.field}=${key}`, postings: ords.length });
          return ords;
        }
        case "set": { const s = sets.get(e.id); if (!s) throw new UnknownSet(e.id); return s; }
        case "and": { const l = evalExpr(e.left); const r = evalExpr(e.right); return intersect(l, r); }
        case "or": { const l = evalExpr(e.left); const r = evalExpr(e.right); return union(l, r); }
        case "not": { const l = evalExpr(e.left); const r = evalExpr(e.right); return difference(l, r); }
        case "word": {
          // index.word.tokens and index.word.stopwords (the tag-to-token and stop-word
          // rules a word SELECT's result depends on) are cited at their point of use in
          // src/loader/words.ts, imported into this module above for WORD_CODES/shardOf.
          const key = phraseKey(e.term); // uppercase, trailing pad stripped (same rule as a phrase term)
          const shard = shardOf(key);
          const ords = e.codes.flatMap(c => {
            const cached = this.shards.get(`${c}:${shard}`);
            if (!cached) throw new Error(`prepare() was not called for ${c}:${shard}`);
            return cached[key] ?? [];
          });
          const unique = [...new Set(ords)].sort((a, b) => a - b);
          const display = `${key}${e.codes[0]}${e.codes.slice(1).map(c => `,${c.slice(1)}`).join("")}`;
          perTerm.push({ display, postings: unique.length });
          return unique;
        }
        case "refs": {
          // e.ordinals is already resolved (DialogSession.resolveRefs, before prepare()/
          // search() run) -- this case reads it, never an E-number itself.
          perTerm.push({ display: e.echo, postings: e.ordinals.length });
          return e.ordinals;
        }
      }
    };
    const ordinals = evalExpr(expr).slice().sort((a, b) => a - b); // ascending file order (render.record.order)
    return { perTerm, ordinals };
  }

  async record(ordinal: number): Promise<LogicalRecord> {
    const rec = this.offsets.records[ordinal];
    if (!rec) {
      throw new Error(`no record at ordinal ${ordinal} in ${this.offsets.file} (${this.offsets.records.length} records)`);
    }
    const [an, firstLine, lastLine] = rec;
    const offset = lineToOffset(firstLine);
    const length = (lastLine - firstLine + 1) * LINE_BYTES;
    const bytes = await this.reader.read(offset, length);
    return parseRecord(bytes, { firstLine, lastLine, offset, length, an }, this.offsets.file, this.profile);
  }
}
