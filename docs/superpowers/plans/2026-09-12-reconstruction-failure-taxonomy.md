# Reconstruction-Failure Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed category-D reconstruction-failure arm so a corrupt/missing/empty search artifact can never render as a legitimate historical zero-hit, and an internal failure shows a modern error instead of freezing the terminal.

**Architecture:** A `ReconstructionFailure` error class + a `fetchJsonArtifact` validator wrap every JSON artifact load (transport + shape). Word-shard drift is caught by a term-list membership set preloaded in `prepare()` and consulted in the synchronous `search()`. Phrase-index drift/emptiness is caught by a per-code term-count manifest (`report.phraseTerms`, loaded at startup and compared). A top-level boundary (extracted from `main.ts` into an importable `onSubmit` factory, plus a guarded `async main()`) renders D failures as modern chrome and prevents the terminal freeze.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom (for DOM tests). Package manager: `pnpm`. Test runner invocation: `npx vitest run <path> -t "<name>"`.

## Global Constraints

- **Canonical D user message (verbatim, one sentence, used everywhere a per-command D failure renders):** `This reconstruction could not load part of its data. This is a fault in the reconstruction, not a DIALOG response.`
- **No change to the simulated historical stream.** No task may alter any `? …` output or any `proto.error.*` behavior. D failures render only in the out-of-stream notice region / startup panel.
- **Registry additions are status `chosen`.** New keys: `capability.reconstruction_error`, `proto.print.item_range`. Absence notes use the exact form: "not found in the repository documentation (`docs/*.md`, checked 2026-09-12); not verified against the primary source archive." Never assert a bare historical absence.
- **Empty artifacts are not automatically failures.** An empty word first-character shard (`{}`, e.g. `public/corpus/word/TI/_.json`) is a valid convention (`cli.ts:34`). Emptiness is judged only by the word cross-check (term in list but absent) and the phrase manifest (count ≠ recorded).
- **Branch off `main` before the first commit** (`git checkout -b feat/reconstruction-failure-taxonomy`). Current branch is `main`.
- **Corpus-dependent tests:** archival tests read the 277 MB corpus; run new unit/DOM tests in isolation by path. Set `CRIS_CORPUS_OPTIONAL=1` if a full `pnpm test` is run.

---

### Task 1: `ReconstructionFailure` typed error

**Files:**
- Create: `src/retrieval/failures.ts`
- Test: `test/regression/failures.test.ts`

**Interfaces:**
- Produces: `class ReconstructionFailure extends Error` with `readonly code: ReconstructionFailureCode`, `readonly url?: string`, `readonly detail?: string`; `type ReconstructionFailureCode = "ArtifactUnavailable" | "ArtifactInvalid" | "IndexInconsistent" | "RangeReadFailed" | "CorpusRangeInvalid"`; `const RECONSTRUCTION_FAILURE_MESSAGE: string`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/failures.test.ts
import { describe, it, expect } from "vitest";
import { ReconstructionFailure, RECONSTRUCTION_FAILURE_MESSAGE } from "../../src/retrieval/failures";

describe("ReconstructionFailure", () => {
  it("carries a code, an optional url and detail, and the canonical user message", () => {
    const e = new ReconstructionFailure("ArtifactUnavailable", { url: "/corpus/index/CY.json", detail: "HTTP 404" });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("ArtifactUnavailable");
    expect(e.url).toBe("/corpus/index/CY.json");
    expect(e.detail).toBe("HTTP 404");
    expect(e.message).toBe(RECONSTRUCTION_FAILURE_MESSAGE);
  });
  it("is distinguishable with instanceof", () => {
    expect(new ReconstructionFailure("IndexInconsistent") instanceof ReconstructionFailure).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/failures.test.ts`
Expected: FAIL — cannot find module `../../src/retrieval/failures`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/retrieval/failures.ts
/** Category-D failures: the reconstruction itself could not load or trust its own data.
 * Distinct from the historical-error classes (UnknownSet, …) and from build-time
 * FixityMismatchError. Rendered as modern chrome, never as a `? …` stream line. */
export type ReconstructionFailureCode =
  | "ArtifactUnavailable"   // fetch not ok / network / missing
  | "ArtifactInvalid"       // unparseable JSON, or valid JSON of the wrong shape
  | "IndexInconsistent"     // artifact disagrees with the manifest, or a word shard drifted from its term list
  | "RangeReadFailed"       // byte-range read failed or was truncated
  | "CorpusRangeInvalid";   // an offset pair that cannot describe a record

/** One sentence, shown for every per-command D failure. The specific code/url/detail
 * go to the console, never into this user-facing string. */
export const RECONSTRUCTION_FAILURE_MESSAGE =
  "This reconstruction could not load part of its data. This is a fault in the reconstruction, not a DIALOG response.";

export class ReconstructionFailure extends Error {
  readonly code: ReconstructionFailureCode;
  readonly url?: string;
  readonly detail?: string;
  constructor(code: ReconstructionFailureCode, opts: { url?: string; detail?: string } = {}) {
    super(RECONSTRUCTION_FAILURE_MESSAGE);
    this.name = "ReconstructionFailure";
    this.code = code;
    this.url = opts.url;
    this.detail = opts.detail;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/failures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/reconstruction-failure-taxonomy
git add src/retrieval/failures.ts test/regression/failures.test.ts
git commit -m "feat(retrieval): typed ReconstructionFailure for category-D failures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 2: `fetchJsonArtifact` + shape guards

**Files:**
- Create: `src/retrieval/artifact.ts`
- Test: `test/regression/artifact.test.ts`

**Interfaces:**
- Consumes: `ReconstructionFailure` (Task 1).
- Produces: `fetchJsonArtifact<T>(url: string, validate: (v: unknown) => v is T): Promise<T>`; type guards `isWordShard`, `isTermList`, `isPositionalShard`, `isIndex`, `isOffsets`, `isPhraseCounts` (each `(v: unknown) => v is …`). `isIndex` guards `{ code: string; terms: Record<string, number[]> }`; `isPhraseCounts` guards `{ phraseTerms: Record<string, number> }`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/artifact.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJsonArtifact, isWordShard, isIndex } from "../../src/retrieval/artifact";
import { ReconstructionFailure } from "../../src/retrieval/failures";

const stubFetch = (init: { ok?: boolean; status?: number; body?: unknown; json?: () => Promise<unknown> }) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "",
    json: init.json ?? (async () => init.body),
  })));
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchJsonArtifact", () => {
  it("returns parsed data when ok and shape-valid", async () => {
    stubFetch({ body: { A: [1, 2] } });
    expect(await fetchJsonArtifact("/x", isWordShard)).toEqual({ A: [1, 2] });
  });
  it("throws ArtifactUnavailable on non-ok", async () => {
    stubFetch({ ok: false, status: 404 });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toMatchObject({ code: "ArtifactUnavailable" });
  });
  it("throws ArtifactInvalid on unparseable JSON", async () => {
    stubFetch({ json: async () => { throw new SyntaxError("bad"); } });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toMatchObject({ code: "ArtifactInvalid", detail: expect.stringContaining("JSON") });
  });
  it("throws ArtifactInvalid on wrong shape (HTML string / array where object expected)", async () => {
    stubFetch({ body: "<!doctype html>" });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toBeInstanceOf(ReconstructionFailure);
  });
  it("isIndex accepts a well-formed phrase index and rejects an empty-shape one", () => {
    expect(isIndex({ code: "CY", terms: { BELTSVILLE: [0] } })).toBe(true);
    expect(isIndex({ code: "CY" })).toBe(false);
    expect(isIndex({ terms: {} })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/artifact.test.ts`
Expected: FAIL — cannot find module `../../src/retrieval/artifact`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/retrieval/artifact.ts
import { ReconstructionFailure } from "./failures";
import type { Index, Offsets } from "../loader/corpus-format";

/** Fetch one JSON artifact and turn every transport/parse/shape failure into a typed
 * ReconstructionFailure. A shard/index that loads and validates but lacks a queried key is
 * NOT a failure here -- absence is judged by the caller (term-list cross-check / manifest). */
export async function fetchJsonArtifact<T>(url: string, validate: (v: unknown) => v is T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ReconstructionFailure("ArtifactUnavailable", { url, detail: String(e) });
  }
  if (!res.ok) throw new ReconstructionFailure("ArtifactUnavailable", { url, detail: `HTTP ${res.status} ${res.statusText}` });
  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    throw new ReconstructionFailure("ArtifactInvalid", { url, detail: `not JSON: ${String(e)}` });
  }
  if (!validate(json)) throw new ReconstructionFailure("ArtifactInvalid", { url, detail: "unexpected shape" });
  return json;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => typeof n === "number");

/** A word shard or a phrase index's terms map: term -> postings[]. Shallow: checks the
 * container and that values are number arrays; does not walk every posting. */
export const isWordShard = (v: unknown): v is Record<string, number[]> =>
  isObject(v) && Object.values(v).every(isNumberArray);

export const isPositionalShard = (v: unknown): v is Record<string, unknown> => isObject(v);

export const isTermList = (v: unknown): v is [string, number][] =>
  Array.isArray(v) && v.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && typeof p[1] === "number");

export const isIndex = (v: unknown): v is Index =>
  isObject(v) && typeof v.code === "string" && isObject(v.terms) && Object.values(v.terms).every(isNumberArray);

export const isOffsets = (v: unknown): v is Offsets =>
  isObject(v) && typeof v.file === "string" && typeof v.sha256 === "string" && Array.isArray(v.records);

export const isPhraseCounts = (v: unknown): v is { phraseTerms: Record<string, number> } =>
  isObject(v) && isObject(v.phraseTerms) && Object.values(v.phraseTerms).every(n => typeof n === "number");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/artifact.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/artifact.ts test/regression/artifact.test.ts
git commit -m "feat(retrieval): fetchJsonArtifact validator and shape guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 3: Route `FetchWordIndex` / `FetchPositional` through the validator

**Files:**
- Modify: `src/retrieval/words.ts:23-34,51-54`
- Test: `test/regression/words-fetch.test.ts`

**Interfaces:**
- Consumes: `fetchJsonArtifact`, `isWordShard`, `isTermList`, `isPositionalShard` (Task 2).
- Produces: unchanged method signatures on `FetchWordIndex`/`FetchPositional`; they now throw `ReconstructionFailure` instead of returning malformed casts.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/words-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { FetchWordIndex } from "../../src/retrieval/words";

afterEach(() => vi.unstubAllGlobals());

describe("FetchWordIndex validates artifacts", () => {
  it("throws ArtifactUnavailable when a shard 404s", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) })));
    await expect(new FetchWordIndex({}).shard("/TI", "A")).rejects.toMatchObject({ code: "ArtifactUnavailable" });
  });
  it("throws ArtifactInvalid when a shard returns HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "", json: async () => "<html>" })));
    await expect(new FetchWordIndex({}).shard("/TI", "A")).rejects.toMatchObject({ code: "ArtifactInvalid" });
  });
  it("returns the shard when valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "", json: async () => ({ APPLE: [3] }) })));
    expect(await new FetchWordIndex({}).shard("/TI", "A")).toEqual({ APPLE: [3] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/words-fetch.test.ts`
Expected: FAIL — current `shard()` blind-casts `res.json()`; the 404 case resolves instead of rejecting.

- [ ] **Step 3: Write minimal implementation**

Replace the bodies at `src/retrieval/words.ts` (add the import at the top, then the method bodies):

```typescript
// add near the top imports of src/retrieval/words.ts:
import { fetchJsonArtifact, isWordShard, isTermList, isPositionalShard } from "./artifact";
```

```typescript
// FetchWordIndex methods (replace lines 23-34):
  async shard(code: string, shard: string): Promise<Record<string, number[]>> {
    return fetchJsonArtifact(wordShardUrl(code, shard, this.env), isWordShard);
  }
  async terms(code: string): Promise<[string, number][]> {
    return fetchJsonArtifact(wordTermsUrl(code, this.env), isTermList);
  }
  async mergedTerms(): Promise<[string, number][]> {
    return fetchJsonArtifact(mergedWordTermsUrl(this.env), isTermList);
  }
```

```typescript
// FetchPositional.positions (replace lines 51-54):
  async positions(code: string, shard: string): Promise<PositionalShard> {
    return fetchJsonArtifact(posShardUrl(code, shard, this.env), isPositionalShard) as Promise<PositionalShard>;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/words-fetch.test.ts && npx vitest run test/regression/words.test.ts`
Expected: PASS (both — the second is the existing words test, must stay green).

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/words.ts test/regression/words-fetch.test.ts
git commit -m "fix(retrieval): validate word/positional artifacts on load

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 4: Typed byte-range reader failures

**Files:**
- Modify: `src/retrieval/reader.ts:10,12-14`, `src/retrieval/reader-node.ts:16-18`, `src/retrieval/words-node.ts` (its `JSON.parse` reads)
- Test: `test/regression/reader.test.ts` (update existing assertions)

**Interfaces:**
- Consumes: `ReconstructionFailure` (Task 1).
- Produces: `FetchRangeReader.read` / `FsRangeReader.read` throw `ReconstructionFailure` code `RangeReadFailed` (message text preserved in `detail`).

- [ ] **Step 1: Update the failing test**

In `test/regression/reader.test.ts`, change the three existing `rejects.toThrow(/…/)` assertions to also assert the type/code. Example (adapt each of the three):

```typescript
import { ReconstructionFailure } from "../../src/retrieval/failures";
// non-206:
await expect(reader.read(0, 10)).rejects.toMatchObject({ code: "RangeReadFailed" });
// short 206 and read-past-EOF likewise assert code: "RangeReadFailed".
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/reader.test.ts`
Expected: FAIL — current throws are plain `Error`, no `code`.

- [ ] **Step 3: Write minimal implementation**

`src/retrieval/reader.ts` — add `import { ReconstructionFailure } from "./failures";` and replace the two throws:

```typescript
    if (res.status !== 206) throw new ReconstructionFailure("RangeReadFailed", { url: this.url, detail: `range request not honored: HTTP ${res.status}` });
```
```typescript
      throw new ReconstructionFailure("RangeReadFailed", { url: this.url, detail: `short range response: ${bytes.length} of ${length} bytes at offset ${offset}` });
```

`src/retrieval/reader-node.ts` — add the import and replace the short-read throw:

```typescript
        throw new ReconstructionFailure("RangeReadFailed", { url: this.path, detail: `short read: ${bytesRead} of ${length} bytes at offset ${offset}` });
```

`src/retrieval/words-node.ts` — wrap each `JSON.parse(await readFile(...))` in try/catch throwing `ReconstructionFailure("ArtifactInvalid", { url: path, detail: … })`, and treat a thrown `ENOENT` from `readFile` as `ArtifactUnavailable`. (One helper `readJson(path)` inside the file, reused by both methods.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/reader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/reader.ts src/retrieval/reader-node.ts src/retrieval/words-node.ts test/regression/reader.test.ts
git commit -m "fix(retrieval): byte-range and node artifact failures are typed RangeReadFailed/ArtifactInvalid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 5: `record()` bounds guard (inverted offset)

**Files:**
- Modify: `src/retrieval/engine.ts:288-298`
- Test: `test/regression/engine.test.ts` (add a case)

**Interfaces:**
- Consumes: `ReconstructionFailure` (Task 1).
- Produces: `record()` throws `ReconstructionFailure` (`CorpusRangeInvalid` for a missing record or `lastLine < firstLine`).

- [ ] **Step 1: Write the failing test**

```typescript
// add to test/regression/engine.test.ts
import { ReconstructionFailure } from "../../src/retrieval/failures";
it("record() rejects an inverted offset pair as CorpusRangeInvalid", async () => {
  const offsets = { file: "f", sha256: "x", records: [["A", 10, 5] as [string, number, number]] };
  const eng = new RetrievalEngine(offsets, {}, { async read() { return new Uint8Array(0); } }, "fy1991plus");
  await expect(eng.record(0)).rejects.toMatchObject({ code: "CorpusRangeInvalid" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/engine.test.ts -t "inverted offset"`
Expected: FAIL — currently computes a negative length and calls the reader.

- [ ] **Step 3: Write minimal implementation**

In `src/retrieval/engine.ts` add `import { ReconstructionFailure } from "./failures";` and edit `record()`:

```typescript
  async record(ordinal: number): Promise<LogicalRecord> {
    const rec = this.offsets.records[ordinal];
    if (!rec) {
      throw new ReconstructionFailure("CorpusRangeInvalid", { url: this.offsets.file, detail: `no record at ordinal ${ordinal} (${this.offsets.records.length} records)` });
    }
    const [an, firstLine, lastLine] = rec;
    if (lastLine < firstLine) {
      throw new ReconstructionFailure("CorpusRangeInvalid", { url: this.offsets.file, detail: `inverted offsets for ${an}: firstLine ${firstLine} > lastLine ${lastLine}` });
    }
    const offset = lineToOffset(firstLine);
    const length = (lastLine - firstLine + 1) * LINE_BYTES;
    const bytes = await this.reader.read(offset, length);
    return parseRecord(bytes, { firstLine, lastLine, offset, length, an }, this.offsets.file, this.profile);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/engine.test.ts`
Expected: PASS (new case + existing engine cases stay green).

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/engine.ts test/regression/engine.test.ts
git commit -m "fix(retrieval): record() guards missing and inverted offsets as CorpusRangeInvalid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 6: Word-path term-list cross-check (preload in `prepare()`, check in `search()`)

**Files:**
- Modify: `src/retrieval/engine.ts` — add a `wordTermSets` cache field (~line 91), preload in `prepare()`'s `word` case (~126-131), check in `search()`'s `word` case (236-241)
- Test: `test/regression/engine.test.ts`

**Interfaces:**
- Consumes: `ReconstructionFailure`, `WordIndexSource.terms` (returns `[string, number][]`).
- Produces: after `prepare()`, `search()` distinguishes a genuine word zero (key not in the code's term set → `[]`, category A) from drift (key in the term set but absent from its shard → throws `ReconstructionFailure("IndexInconsistent")`).

- [ ] **Step 1: Write the failing tests**

```typescript
// add to test/regression/engine.test.ts
import { MemoryWordIndex } from "../../src/retrieval/words";
// A WordIndexSource whose shard omits a term its term list claims exists = drift.
function driftedSource(): any {
  return {
    async shard() { return {}; },                       // shard is empty
    async terms() { return [["APPLE", 1]] as [string, number][]; }, // but term list says APPLE exists
    async mergedTerms() { return []; },
  };
}
it("word search: term in the term list but missing from its shard throws IndexInconsistent", async () => {
  const eng = new RetrievalEngine({ file: "f", sha256: "x", records: [] }, {}, { async read() { return new Uint8Array(0); } }, "fy1991plus", driftedSource());
  const expr = { kind: "word", term: "APPLE", codes: ["/TI"], echo: "APPLE/TI" } as any;
  await eng.prepare(expr);
  expect(() => eng.search(expr, new Map())).toThrowError(/reconstruction could not load/i);
});
it("word search: term absent from both shard and term list is a genuine zero", async () => {
  const genuine = { async shard() { return {}; }, async terms() { return [] as [string, number][]; }, async mergedTerms() { return []; } } as any;
  const eng = new RetrievalEngine({ file: "f", sha256: "x", records: [] }, {}, { async read() { return new Uint8Array(0); } }, "fy1991plus", genuine);
  const expr = { kind: "word", term: "ZZZZ", codes: ["/TI"], echo: "ZZZZ/TI" } as any;
  await eng.prepare(expr);
  const r = eng.search(expr, new Map());
  expect(r.ordinals).toEqual([]);
  expect(r.perTerm[0]?.postings).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/engine.test.ts -t "IndexInconsistent"`
Expected: FAIL — drift currently returns `[]` (a false zero), no throw.

- [ ] **Step 3: Write minimal implementation**

Add the cache field near the other caches in `RetrievalEngine`:

```typescript
  /** Per word code: the set of phraseKey-normalized terms the code's term list vouches for.
   * Preloaded by prepare() so the synchronous search() can tell a genuine zero (key not in
   * the set) from shard drift (key in the set but absent from its shard). */
  private wordTermSets = new Map<string, Set<string>>();
```

In `prepare()`'s `word` case, after the shard is ensured, also ensure the term set (per resolved code):

```typescript
      case "word": {
        const shard = shardOf(phraseKey(expr.term));
        for (const code of expr.codes) {
          const resolved = resolveWordCode(code);
          if (!WORD_CODES.includes(resolved)) throw new UnknownSuffix(code);
          const key = `${resolved}:${shard}`;
          if (!this.shards.has(key)) {
            if (!this.wordSource) throw new Error(`no word index source configured for ${resolved}`);
            this.shards.set(key, await this.wordSource.shard(resolved, shard));
          }
          if (!this.wordTermSets.has(resolved)) {
            if (!this.wordSource) throw new Error(`no word index source configured for ${resolved}`);
            this.wordTermSets.set(resolved, new Set((await this.wordSource.terms(resolved)).map(([t]) => t)));
          }
        }
        return;
      }
```

In `search()`'s `word` case, replace the `cached[key] ?? []` flatMap with a drift-aware version:

```typescript
        case "word": {
          const key = phraseKey(e.term);
          const shard = shardOf(key);
          const ords = e.codes.flatMap(c => {
            const resolved = resolveWordCode(c);
            const cached = this.shards.get(`${resolved}:${shard}`);
            if (!cached) throw new Error(`prepare() was not called for ${resolved}:${shard}`);
            const hit = cached[key];
            if (hit) return hit;
            // Miss: genuine zero (key not vouched for) vs drift (vouched for but absent from shard).
            if (this.wordTermSets.get(resolved)?.has(key)) {
              throw new ReconstructionFailure("IndexInconsistent", { detail: `${resolved} term ${key} in term list but missing from shard ${shard}` });
            }
            return [];
          });
          const unique = [...new Set(ords)].sort((a, b) => a - b);
          const display = `${key}${e.codes[0]}${e.codes.slice(1).map(c => `,${c.slice(1)}`).join("")}`;
          perTerm.push({ display, postings: unique.length });
          return unique;
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/engine.test.ts && npx vitest run test/evidence/`
Expected: PASS (new cases + existing engine/evidence suites green — genuine zeros unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/engine.ts test/regression/engine.test.ts
git commit -m "fix(retrieval): word-shard drift raises IndexInconsistent, genuine zeros preserved

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 7: Build-time phrase-count manifest (`report.phraseTerms`)

**Files:**
- Modify: `src/loader/corpus-format.ts:16-32` (Report), `src/loader/index-builder.ts:111-114` and after `:172`, `src/loader/cli.ts` after `:60`
- Test: `test/regression/index-builder-phraseterms.test.ts` (or extend an existing loader unit test that doesn't need the full corpus)

**Interfaces:**
- Produces: `Report.phraseTerms: Record<string, number>`; `buildIndexes(...)` returns a `report` whose `phraseTerms[code] === Object.keys(indexes[code].terms).length` for every `PHRASE_FIELDS` code.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/index-builder-phraseterms.test.ts
import { describe, it, expect } from "vitest";
import { buildIndexes } from "../../src/loader/index-builder";
import { PHRASE_FIELDS } from "../../src/loader/corpus-format";
import { readFileSync } from "node:fs";

// Reuse the small committed fixture the formatb tests use.
const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));

describe("buildIndexes emits per-phrase-code term counts", () => {
  it("phraseTerms has an entry for every PHRASE_FIELDS code equal to its distinct-term count", () => {
    const { indexes, report } = buildIndexes(bytes, "fixture", []);
    for (const code of PHRASE_FIELDS) {
      expect(report.phraseTerms[code]).toBe(Object.keys(indexes[code]!.terms).length);
    }
  });
});
```

Note: if `buildIndexes` requires a full-record buffer the single-record fixture cannot satisfy, place this assertion instead inside the existing `test/archival/loader.test.ts` (which reads the real corpus) next to the current `wordTerms` checks, guarded by `CRIS_CORPUS_OPTIONAL`. Choose the fixture path only if the fixture parses; otherwise use the archival location.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/index-builder-phraseterms.test.ts`
Expected: FAIL — `report.phraseTerms` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

`src/loader/corpus-format.ts` — add to the `Report` interface:

```typescript
  /** Per-phrase-code distinct-term count, the load-time manifest the app checks each served
   * phrase index against (an empty served index is drift unless this count is 0). */
  phraseTerms: Record<string, number>;
```

`src/loader/index-builder.ts` — initialize it in the report literal:

```typescript
    wordTerms: {}, wordPostings: {}, posPostings: {}, posBytes: {}, phraseTerms: {},
```

and populate it after the word-code loop (after line 172):

```typescript
  for (const code of PHRASE_FIELDS) report.phraseTerms[code] = Object.keys(indexes[code]!.terms).length;
```

`src/loader/cli.ts` — after the `word terms:` console.log (line 60), add:

```typescript
console.log(
  "phrase terms: " + Object.entries(report.phraseTerms).map(([c, n]) => `${c} ${n}`).join(", ")
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/index-builder-phraseterms.test.ts && npx vitest run test/regression/formatb-fy1988.test.ts`
Expected: PASS. (Second is a cheap loader-adjacent test to confirm no build regression.)

- [ ] **Step 5: Commit**

```bash
git add src/loader/corpus-format.ts src/loader/index-builder.ts src/loader/cli.ts test/regression/index-builder-phraseterms.test.ts
git commit -m "feat(loader): record per-phrase-code term counts in report.json

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

> **After merge, before deploy:** re-run `pnpm load` so `public/corpus/report.json` gains `phraseTerms`. The runtime check (Task 8) depends on it.

---

### Task 8: Runtime phrase-manifest check + `reportUrl`

**Files:**
- Modify: `src/loader/corpus-urls.ts` (add `reportUrl`)
- Create: `src/retrieval/manifest.ts` (pure `checkPhraseManifest`)
- Test: `test/regression/manifest.test.ts`

**Interfaces:**
- Consumes: `ReconstructionFailure`, `Index`, `Report` (its `phraseTerms`).
- Produces: `reportUrl(env: UrlEnv): string`; `checkPhraseManifest(indexes: Record<string, Index>, phraseTerms: Record<string, number>): void` — throws `ReconstructionFailure("IndexInconsistent")` when a loaded index's term count ≠ its recorded count; a recorded 0 with an empty index passes.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/manifest.test.ts
import { describe, it, expect } from "vitest";
import { checkPhraseManifest } from "../../src/retrieval/manifest";

describe("checkPhraseManifest", () => {
  it("passes when every loaded index count matches the manifest", () => {
    const indexes = { CY: { code: "CY", terms: { A: [0], B: [1] } } };
    expect(() => checkPhraseManifest(indexes, { CY: 2 })).not.toThrow();
  });
  it("passes when a code is recorded 0 and served empty", () => {
    const indexes = { GY: { code: "GY", terms: {} } };
    expect(() => checkPhraseManifest(indexes, { GY: 0 })).not.toThrow();
  });
  it("throws IndexInconsistent when a served index is empty but the manifest says N", () => {
    const indexes = { CY: { code: "CY", terms: {} } };
    expect(() => checkPhraseManifest(indexes, { CY: 4127 })).toThrowError(/reconstruction could not load/i);
  });
  it("throws IndexInconsistent on any count drift", () => {
    const indexes = { CY: { code: "CY", terms: { A: [0] } } };
    try { checkPhraseManifest(indexes, { CY: 2 }); throw new Error("did not throw"); }
    catch (e: any) { expect(e.code).toBe("IndexInconsistent"); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/manifest.test.ts`
Expected: FAIL — cannot find module `../../src/retrieval/manifest`.

- [ ] **Step 3: Write minimal implementation**

`src/loader/corpus-urls.ts` — add beside `offsetsUrl`:

```typescript
export const reportUrl = (env: UrlEnv): string => `${corpusBase(env)}report.json`;
```

`src/retrieval/manifest.ts`:

```typescript
import type { Index } from "../loader/corpus-format";
import { ReconstructionFailure } from "./failures";

/** Compare each loaded phrase index against the build-time manifest (report.phraseTerms).
 * A mismatch -- empty where the build had N, or any count drift -- is category-D drift, not a
 * historical zero. A code the manifest records as 0 and serves empty is a legitimate zero. */
export function checkPhraseManifest(indexes: Record<string, Index>, phraseTerms: Record<string, number>): void {
  for (const [code, idx] of Object.entries(indexes)) {
    const expected = phraseTerms[code];
    if (expected === undefined) continue; // manifest silent on this code: nothing to check
    const actual = Object.keys(idx.terms).length;
    if (actual !== expected) {
      throw new ReconstructionFailure("IndexInconsistent", { url: `index/${code}.json`, detail: `phrase index ${code}: ${actual} terms loaded, manifest expected ${expected}` });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/manifest.test.ts && npx vitest run test/regression/corpus-urls.test.ts`
Expected: PASS. (`corpus-urls.test.ts` exists; confirm `reportUrl` doesn't break it — add an assertion there if that suite pins the URL set.)

- [ ] **Step 5: Commit**

```bash
git add src/loader/corpus-urls.ts src/retrieval/manifest.ts test/regression/manifest.test.ts
git commit -m "feat(retrieval): runtime phrase-manifest check distinguishes drift from a real zero

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 9: Extract the `onSubmit` boundary (D notice + no freeze)

**Files:**
- Create: `src/app/onSubmit.ts`
- Test: `test/regression/on-submit.test.ts`

**Interfaces:**
- Consumes: `DialogSession`, `DomSink`, `ReconstructionFailure`.
- Produces: `type NoticeState = { kind: "capability"; command: string } | { kind: "reconstruction" } | null`; `makeOnSubmit(getSession: () => DialogSession, sink: Pick<DomSink, "print">, showNotice: (n: NoticeState) => void): (line: string) => Promise<void>`. On success shows the capability notice (or clears it); on any thrown value shows `{ kind: "reconstruction" }` and returns normally; a non-`ReconstructionFailure` throw is additionally `console.error`-ed.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/on-submit.test.ts
import { describe, it, expect, vi } from "vitest";
import { makeOnSubmit, type NoticeState } from "../../src/app/onSubmit";
import { ReconstructionFailure } from "../../src/retrieval/failures";

const sinkStub = { print: vi.fn(async () => {}) };

describe("makeOnSubmit", () => {
  it("prints output and clears the notice on a clean command", async () => {
    const session = { submit: vi.fn(async () => [{ text: "S1" }]), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await makeOnSubmit(() => session, sinkStub, n => notices.push(n))("s cy=x");
    expect(sinkStub.print).toHaveBeenCalledWith([{ text: "S1" }]);
    expect(notices).toEqual([null]);
  });
  it("shows a reconstruction notice and does NOT rethrow when submit throws a ReconstructionFailure", async () => {
    const session = { submit: vi.fn(async () => { throw new ReconstructionFailure("IndexInconsistent"); }), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await expect(makeOnSubmit(() => session, sinkStub, n => notices.push(n))("t s1/5/1")).resolves.toBeUndefined();
    expect(notices).toEqual([{ kind: "reconstruction" }]);
  });
  it("console.errors an unexpected (non-ReconstructionFailure) throw but still recovers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = { submit: vi.fn(async () => { throw new Error("prepare() was not called"); }), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await makeOnSubmit(() => session, sinkStub, n => notices.push(n))("x");
    expect(notices).toEqual([{ kind: "reconstruction" }]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/on-submit.test.ts`
Expected: FAIL — cannot find module `../../src/app/onSubmit`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/onSubmit.ts
import type { DialogSession } from "../dialog/session";
import type { DomSink } from "../terminal/sink";
import { ReconstructionFailure } from "../retrieval/failures";

export type NoticeState = { kind: "capability"; command: string } | { kind: "reconstruction" } | null;

/** The one place a per-command failure is caught. Returning normally (never rejecting) is what
 * lets DomSink.runSubmit reach `submitting = false` and drain queued input -- an uncaught
 * throw here is what froze the terminal. A ReconstructionFailure renders the modern D notice;
 * anything else is a code bug, rendered the same to the user but logged loudly for a developer. */
export function makeOnSubmit(
  getSession: () => DialogSession,
  sink: Pick<DomSink, "print">,
  showNotice: (n: NoticeState) => void,
): (line: string) => Promise<void> {
  return async (line) => {
    try {
      const session = getSession();
      const out = await session.submit(line);
      await sink.print(out);
      showNotice(session.lastNotice ? { kind: "capability", command: session.lastNotice.command } : null);
    } catch (e) {
      if (!(e instanceof ReconstructionFailure)) console.error(e);
      showNotice({ kind: "reconstruction" });
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/on-submit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/onSubmit.ts test/regression/on-submit.test.ts
git commit -m "feat(app): extract onSubmit boundary that renders D failures and prevents the freeze

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 10: Sink `finally` reset + DOM negative-invariant

**Files:**
- Modify: `src/terminal/sink.ts:118-128` (scope a `try/finally` to the `onSubmit` await)
- Test: `test/regression/sink.dom.test.ts` (add negative-invariant + no-freeze)

**Interfaces:**
- Consumes: `makeOnSubmit` (Task 9), the existing `pacedSink`/`printAll`/`chromeFixture` helpers, a failing `RangeReader`.
- Produces: after a D failure, `submitting` is reset and a queued line still runs; the D notice appears in the notice element, never a `? …` line in `printout`.

- [ ] **Step 1: Write the failing tests**

```typescript
// add to test/regression/sink.dom.test.ts
import { makeOnSubmit } from "../../src/app/onSubmit";
import { ReconstructionFailure } from "../../src/retrieval/failures";

test("a category-D failure renders the modern notice, not a ? line, and does not freeze", async () => {
  const failingReader: RangeReader = { async read() { throw new ReconstructionFailure("RangeReadFailed", { detail: "x" }); } };
  const session = new DialogSession(new RetrievalEngine(stubOffsets, stubIndexes, failingReader, "fy1991plus"), render);
  let notice: string | null = "";
  const showNotice = (n: any) => { notice = n?.kind === "reconstruction" ? "recon" : n?.kind === "capability" ? "cap" : null; };
  const { clock, sink } = pacedSink();
  const onSubmit = makeOnSubmit(() => session, sink, showNotice);
  // reach the reader: open, build a set, then TYPE it.
  for (const l of ["b 60", "s cy=beltsville"]) { const p = onSubmit(l); clock.runAll(); await p; }
  const typed = onSubmit("t s1/5/1"); clock.runAll(); await typed;
  expect(notice).toBe("recon");
  expect(sink.printout.textContent ?? "").not.toMatch(/\?/);
  // no freeze: a subsequent command still produces output.
  const after = onSubmit("ds"); clock.runAll(); await after;
  expect(sink.printout.textContent ?? "").toMatch(/S1|SET/i);
});
```

(If `stubIndexes`/`stubOffsets`/`render` are file-local at lines 175-178, reuse them; `stubReader` there returns 0 bytes — this test defines its own `failingReader`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/sink.dom.test.ts -t "category-D failure"`
Expected: FAIL — currently a thrown reader error escapes `runSubmit`, wedging `submitting`; the "after" command never runs.

- [ ] **Step 3: Write minimal implementation**

In `src/terminal/sink.ts`, scope a `try/finally` to only the `onSubmit` await inside `runSubmit`:

```typescript
  private async runSubmit(l: string): Promise<void> {
    this.submitting = true;
    this.echo(this.prompt, l);
    this.moveCursor();
    try {
      await this.onSubmit(l);
    } finally {
      this.submitting = false;
    }
    const next = this.pendingLines.shift();
    if (next !== undefined) { void this.runSubmit(next); return; }
    this.input.focus();
    this.moveCursor();
  }
```

(With Task 9's `makeOnSubmit`, `onSubmit` never rejects, so the `finally` is belt-and-suspenders — but it guarantees no future caller can wedge the flag. The handoff stays outside the `finally`, so the recursive call's `submitting = true` is not cleared.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/sink.dom.test.ts`
Expected: PASS (new test + all existing sink DOM tests green).

- [ ] **Step 5: Commit**

```bash
git add src/terminal/sink.ts test/regression/sink.dom.test.ts
git commit -m "fix(terminal): scope runSubmit reset so a D failure cannot wedge the prompt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 11: Startup restructure + error panel

**Files:**
- Create: `src/app/startup-error.ts` (pure `renderStartupError`)
- Modify: `src/app/main.ts` (wrap the post-load body in `async function main()`; use `fetchJsonArtifact` + `checkPhraseManifest`; wire `makeOnSubmit`)
- Test: `test/regression/startup-error.test.ts`

**Interfaces:**
- Consumes: `renderStartupError`, `fetchJsonArtifact`, `isOffsets`, `isIndex`, `isPhraseCounts`, `checkPhraseManifest`, `makeOnSubmit`, `reportUrl`.
- Produces: `renderStartupError(root: HTMLElement): void` — replaces the root's content with the modern panel (no DIALOG chrome). `main.ts` renders it and returns without mounting the terminal if any startup load/validate/manifest step throws.

- [ ] **Step 1: Write the failing test**

```typescript
// test/regression/startup-error.test.ts
import { describe, it, expect } from "vitest";
import { renderStartupError } from "../../src/app/startup-error";

describe("renderStartupError", () => {
  it("renders a modern panel and no DIALOG-looking content", () => {
    const root = document.createElement("div");
    renderStartupError(root);
    expect(root.textContent).toMatch(/could not load/i);
    expect(root.textContent).not.toMatch(/\?/);
    expect(root.querySelector(".reconstruction-error")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/startup-error.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/startup-error.ts
import { RECONSTRUCTION_FAILURE_MESSAGE } from "../retrieval/failures";

/** The whole-app failure surface: shown when offsets/indexes/manifest cannot load, in place of
 * the terminal. Modern chrome only -- never a DIALOG banner or `?` line. */
export function renderStartupError(root: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "reconstruction-error";
  const p = document.createElement("p");
  p.textContent = RECONSTRUCTION_FAILURE_MESSAGE;
  panel.appendChild(p);
  root.replaceChildren(panel);
}
```

Then restructure `src/app/main.ts`:
- Add imports: `fetchJsonArtifact`, `isOffsets`, `isIndex`, `isPhraseCounts` from `../retrieval/artifact`; `checkPhraseManifest` from `../retrieval/manifest`; `makeOnSubmit`, `type NoticeState` from `./onSubmit`; `renderStartupError` from `./startup-error`; `reportUrl`, `type Report` from `../loader/corpus-format` (add `reportUrl` to that module's re-export list) / `../loader/corpus-urls`.
- Wrap everything from the current line 28 to the end (191) in `async function main() { try { … } catch (e) { if (!(e instanceof ReconstructionFailure)) console.error(e); renderStartupError(document.getElementById("app") ?? document.body); } }` and call `void main();` at the end. The `const`/`let`/function declarations and event listeners move inside `main()`, in the same order.
- Replace the loads:

```typescript
    const offsets = await fetchJsonArtifact(offsetsUrl(import.meta.env), isOffsets);
    const indexes: Record<string, Index> = {};
    for (const [c, url] of indexUrls(PHRASE_FIELDS, import.meta.env)) indexes[c] = await fetchJsonArtifact(url, isIndex);
    const report = await fetchJsonArtifact(reportUrl(import.meta.env), isPhraseCounts);
    checkPhraseManifest(indexes, report.phraseTerms);
```

- Replace the inline `onSubmit` (81-92) with:

```typescript
    const showNotice = (n: NoticeState) => {
      noticeEl.classList.toggle("reconstruction", n?.kind === "reconstruction");
      noticeEl.textContent =
        n?.kind === "capability"
          ? `DIALOG documented \`${n.command}\` for File 60; this reconstruction does not implement it yet.`
          : n?.kind === "reconstruction"
            ? RECONSTRUCTION_FAILURE_MESSAGE
            : "";
    };
    const sink = new DomSink(document.getElementById("terminal")!, makeOnSubmit(() => session, /* placeholder */ null as any, showNotice), prompt);
```

  Wiring note: `makeOnSubmit` needs the `sink` it prints to, but `sink` is constructed with the handler — resolve the cycle by constructing `sink` first with a thin wrapper that calls a `let handler`, then assign `handler = makeOnSubmit(() => session, sink, showNotice)` immediately after. Concretely:

```typescript
    let handler: (line: string) => Promise<void> = async () => {};
    const sink = new DomSink(document.getElementById("terminal")!, (l) => handler(l), prompt);
    handler = makeOnSubmit(() => session, sink, showNotice);
```

- [ ] **Step 4: Verify build + tests**

Run: `pnpm typecheck && npx vitest run test/regression/startup-error.test.ts`
Expected: typecheck clean; startup-error test PASS. (The `main.ts` module itself has no automated test — it is verified by running the app in Task 13's manual check.)

- [ ] **Step 5: Commit**

```bash
git add src/app/startup-error.ts src/app/main.ts src/loader/corpus-format.ts
git commit -m "feat(app): guarded async startup renders a modern panel and wires the onSubmit boundary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 12: D-notice visibility in paper mode (CSS)

**Files:**
- Modify: `index.html` (the notice CSS: keep `.reconstruction` visible when paper mode hides `#notice`)
- Test: `test/regression/sink.dom.test.ts` (extend the paper-mode test)

**Interfaces:**
- Consumes: the `.reconstruction` class `showNotice` toggles (Task 11).
- Produces: `#notice.reconstruction` stays displayed in paper mode.

- [ ] **Step 1: Write the failing test**

```typescript
// add to test/regression/sink.dom.test.ts, near the paper-mode block
test("a reconstruction notice stays visible in paper mode", () => {
  const f = chromeFixture();
  f.notice.classList.add("reconstruction");
  f.notice.textContent = "This reconstruction could not load part of its data.";
  f.sink.setDisplayMode("paper", { restored: true });
  expect(getComputedStyle(f.notice).display).not.toBe("none");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/sink.dom.test.ts -t "visible in paper mode"`
Expected: FAIL — the paper rule hides `#notice` regardless of class.

- [ ] **Step 3: Write minimal implementation**

In `index.html`, find the paper-mode rule that sets `#notice { display: none }` (the selector the existing test at line 420 exercises) and add an override:

```css
/* A reconstruction (category-D) failure must remain visible in every display mode: it is a
   fault in the reconstruction, not period chrome that paper mode may hide. */
.paper #notice.reconstruction { display: block; }
```

(Match the exact paper-mode class/selector already in `index.html`; if paper mode toggles a `paper` class on a wrapper, scope accordingly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/sink.dom.test.ts`
Expected: PASS (new test + existing paper-mode test green — the plain `#notice` still hides).

- [ ] **Step 5: Commit**

```bash
git add index.html test/regression/sink.dom.test.ts
git commit -m "fix(terminal): keep a reconstruction-failure notice visible in paper mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 13: Registry + docs (D channel, PRINT range, TYPE-before-BEGIN, Format B policy)

**Files:**
- Modify: `registry/evidence.json` (add `capability.reconstruction_error`, `proto.print.item_range`; note on TYPE/SELECT disagreement), `src/registry/words.ts` (citation/gloss if the registry test requires a mapping), `docs/not-implemented.md` (PRINT range note), `README.md` (Format B policy pointer + D arm)
- Test: `test/regression/registry.test.ts`, `test/regression/docs-registry.test.ts`, `test/regression/docs-not-implemented.test.ts` (whichever pin the registry/docs — extend, don't fight them)

**Interfaces:**
- Produces: two new `chosen` registry entries and the doc notes; all existing registry/doc regression tests stay green.

- [ ] **Step 1: Inspect what the registry tests assert, then write the failing test**

Read `test/regression/registry.test.ts` and `test/regression/docs-registry.test.ts` first to match the exact entry shape (status field name, required citation fields). Then add an assertion:

```typescript
// in test/regression/registry.test.ts (adapt to the real accessor)
it("registers the category-D reconstruction-error channel and the PRINT item-range choice as chosen", () => {
  expect(registry.get("capability.reconstruction_error").value).toBeDefined();
  expect(registry.get("proto.print.item_range").value).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/regression/registry.test.ts -t "reconstruction-error"`
Expected: FAIL — keys absent (the registry lookup throws "unknown registry key").

- [ ] **Step 3: Write minimal implementation**

Add to `registry/evidence.json` two entries with `status: "chosen"` (match the exact schema of neighbours like `capability.notice`):
- `capability.reconstruction_error`: prose — the reconstruction renders category-D failures (missing/invalid/empty artifacts, byte-range failures, index/manifest drift) as a modern notice outside the character stream, never as a `?` line; visible in every display mode.
- `proto.print.item_range`: prose — a reversed/invalid PRINT item range normalizes to zero items and still acknowledges; "not found in the repository documentation (`docs/*.md`, checked 2026-09-12); not verified against the primary source archive."

In `docs/not-implemented.md` PRINT section, add one sentence recording the reversed-range behavior with the same absence wording.

In `README.md`, add a short note: the Format B parser throws on structural impossibility (category D) and records malformed archival data as an inspectable diagnostic (category C) — pointer to `packages/cris-formatb/src/record.ts` / `offsets.ts`; and the runtime category-D notice channel.

If `src/registry/words.ts` maps keys → citations and a test enforces completeness, add the two keys there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/regression/registry.test.ts test/regression/docs-registry.test.ts test/regression/docs-not-implemented.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add registry/evidence.json src/registry/words.ts docs/not-implemented.md README.md test/regression/registry.test.ts
git commit -m "docs(registry): record the category-D notice channel, PRINT range choice, and Format B policy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu"
```

---

### Task 14: Full-suite green + manual startup check

**Files:** none (verification task).

- [ ] **Step 1:** Run `pnpm typecheck`. Expected: clean.
- [ ] **Step 2:** Run `CRIS_CORPUS_OPTIONAL=1 pnpm test`. Expected: all non-archival suites green. (Archival suites need the 277 MB corpus; run `pnpm load` then `pnpm test` if the corpus is present.)
- [ ] **Step 3:** Manual: `pnpm load` (regenerates `report.json` with `phraseTerms`), then `pnpm dev`; confirm (a) a normal search still works, (b) temporarily point `VITE_CORPUS_BASE_URL` at a missing/broken path and confirm the startup panel renders instead of a blank page, (c) no `?` line ever appears for a load failure. Use the `visual-verification` skill for screenshots if desired.
- [ ] **Step 4: Commit** any snapshot/notes, then open the PR (Landing = **Ask**):

```bash
git push -u origin feat/reconstruction-failure-taxonomy
gh pr create --title "Typed category-D reconstruction-failure arm" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-09-12-reconstruction-failure-taxonomy-design.md.

Closes the silent zero-hit masquerade (word cross-check + phrase manifest), adds a
top-level D boundary (no more terminal freeze / blank page), and records the new
behavior in the registry. No change to the simulated historical stream.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BKJdXSGpkrgNThyQ78mZUu
EOF
)"
```

---

## Self-Review

**Spec coverage:** CRITICAL word path → Tasks 3, 6; CRITICAL phrase path → Tasks 7, 8; typed D → Task 1; validator → Task 2; reader/record → Tasks 4, 5; boundary + freeze → Tasks 9, 10; startup panel → Task 11; paper-mode visibility → Task 12; minors (PRINT range, TYPE-before-BEGIN note, Format B doc, D registry) → Task 13; inverted-offset guard → Task 5. All spec sections map to a task.

**Placeholder scan:** the one intentional "wiring note" in Task 11 (the sink/handler cycle) is resolved with concrete code in the same step; no other TBD/TODO. Task 7's test has a documented fallback location; Task 13 requires reading the real registry test shape before writing (its exact schema is enforced by existing tests, not inventable here) — flagged explicitly rather than fabricated.

**Type consistency:** `ReconstructionFailureCode` values are identical across Tasks 1/3/4/5/6/8. `NoticeState` (Task 9) is consumed unchanged in Task 11. `checkPhraseManifest(indexes, phraseTerms)` signature matches between Tasks 8 and 11. `report.phraseTerms` typed in Task 7, read in Tasks 8/11. `makeOnSubmit` signature identical in Tasks 9/10/11.
