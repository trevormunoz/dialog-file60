# Design: a typed category-D reconstruction-failure arm

Date: 2026-09-12
Status: revised after two rounds of parallel adversarial review (PAR); pending maintainer sign-off

Revision note. Round 1 found the first draft left the phrase path uncovered,
over-relied on `verify-remote.ts`, under-scoped the startup boundary, mis-placed
the negative-invariant test, and worded the `runSubmit` `finally` unsafely.
Round 2, against the revised draft, found more: (a) the query-time cross-check
cannot run inside the synchronous `search()`; (b) the "served phrase index ⇒
non-empty" premise was false — the loader writes every phrase code
unconditionally, so a legitimately-empty field would be misflagged; (c) the tests
still targeted seams that cannot observe the failures; (d) a precise correction to
the `verify-remote` characterization. All are addressed below. The phrase-path
closure was changed (maintainer decision) from an unsound non-empty guard to a
per-code term-count manifest piggybacked on `report.json`.

## Problem

An external review of the reconstruction's unhappy paths (memo of 2026-09-12)
confirmed one stated-requirement **violation** and two **resilience gaps**, all in
the same layer: runtime reconstruction/infrastructure failure. The project already
handles three of the four failure categories well:

- **A — historical DIALOG error** (`? TOKEN` in the simulated stream): typed
  classes `UnknownSet`, `UnknownSuffix`, `UnknownRef`, `UnknownField`, routed to
  the stream in the command handlers.
- **B — capability gap**: the out-of-stream capability notice (registry key
  `capability.notice`), rendered in the notice region wired in `src/app/main.ts`.
- **C — archival irregularity**: Format B diagnostics (`badLines`,
  `orphanContinuations`, the `*Mismatches`) accumulated into
  `public/corpus/report.json` rather than thrown.

The missing arm is **D — reconstruction/infrastructure failure**. It has no typed
representation, no render channel, and no test. Concretely:

1. **CRITICAL — silent zero-hit masquerade.** Two paths, both ending in a
   `?? []` that cannot tell a broken artifact from a real absence:
   - **Word path.** `src/retrieval/words.ts:23–54` loads word/positional shards
     and term lists with a bare `(await res.json()) as …` — no `res.ok`, no parse
     guard, no shape check. `src/retrieval/engine.ts:240` reads `cached[key] ?? []`.
   - **Phrase path.** `CY=`, `IN=`, etc. read `this.indexes[field].terms[key] ?? []`
     (`engine.ts:222`), where `this.indexes` is loaded at startup in `main.ts:29–30`
     via a `fetchJson` that checks only `res.ok`.

   In either path a missing shard, a 404 error page, unparseable JSON, a
   wrong-shaped artifact, **or a structurally-valid-but-empty artifact** resolves
   to `[]` and renders as a **legitimate-looking historical zero-hit set line** —
   a category-D failure wearing category-A's clothes. This breaks the project's
   own stated invariant (`registry/evidence.json:1798`: proximity with no built
   index is "never silently accepted as a zero-item set").

2. **IMPORTANT — no top-level D boundary; failures freeze the terminal.**
   `DialogSession.submit()` (`session.ts:85–89`), the `main.ts` onSubmit callback
   (`main.ts:81–92`), and `DomSink.runSubmit` (`sink.ts:118–128`) have no
   try/catch. An uncaught throw rejects the `onSubmit` promise; `submitting`
   (sink.ts:123) never resets; the terminal silently wedges. A startup-artifact
   failure (`main.ts:28–30`, top-level `await`) rejects module init → blank page.

3. **IMPORTANT — no typed D representation.** Every runtime D is a raw
   `new Error(...)`. Only A/B are typed (plus build-time `FixityMismatchError`).

Plus three MINOR items and a documentation gap (see §Minors, §Documentation).

## Non-goals

- **Not** a four-arm `Failure` union or class hierarchy. A/B/C already work; only
  D is added.
- **Not** a per-shard hash manifest or full corpus/index reconciliation. The
  phrase path gets a light per-code term-count check piggybacked on the existing
  `report.json` (Component 2); the word path gets a query-time term-list
  cross-check. (Observation, not scoped now: a unified per-shard count manifest
  could later replace the word cross-check for symmetry — `simplicity-first`
  flag, deferred to keep this change to the maintainer's chosen mechanisms.)
- **Not** any change to the simulated historical stream. Every change here is
  reconstruction-side chrome. (The `TYPE`-before-`BEGIN` edge case is deliberately
  left as-is; see §Minors item 3.)
- **Rationale correction (after PAR):** `scripts/verify-remote.ts` guards content
  only partially — it parses each sampled word `terms.json` and throws on empty/
  zero terms (`verify-remote.ts:100,103`), but samples only one shard per code and
  checks the **phrase** indexes with `res.ok` + byte-length only
  (`verify-remote.ts:84–87`). So empty/drifted phrase indexes and un-sampled word
  shards pass deploy-time. The runtime checks below do real work the deploy check
  does not, and content integrity is **not** simply deferred to `verify-remote`.

## Design

### Component 1 — `ReconstructionFailure` (typed D)

New module `src/retrieval/failures.ts` (standalone so both the retrieval layer
that throws and the app layer that catches import it without a cycle).

```
export type ReconstructionFailureCode =
  | "ArtifactUnavailable"   // fetch not ok / network / missing
  | "ArtifactInvalid"       // unparseable JSON, or valid JSON of the wrong shape
  | "IndexInconsistent"     // artifact disagrees with the manifest, or a word shard
                            //   drifted from its term list
  | "RangeReadFailed"       // byte-range read failed or was truncated
  | "CorpusRangeInvalid";   // an offset pair that cannot describe a record

export class ReconstructionFailure extends Error {
  readonly code: ReconstructionFailureCode;
  readonly url?: string;      // or path, for diagnostics
  readonly detail?: string;   // developer/console detail
  // message: a single, consistent USER-facing sentence (see Component 3)
}
```

Distinct from the historical-error classes and from build-time
`FixityMismatchError`. The codes exist for **logging, tests, and diagnostics** —
not user-facing vocabulary (see Component 3).

Programmer-invariant throws (`"prepare() was not called…"`, `engine.ts:239,256`)
stay raw `Error`: they signal a code bug, not an environmental failure. The
top-level boundary (Component 3) still catches them so they never freeze the
terminal, but logs them loudly (see "Expected vs unexpected D").

### Component 2 — artifact validation + integrity (closes CRITICAL)

Three layered checks. **Transport/structural** for every fetched artifact;
**word-path cross-check** for word-shard drift; **phrase-path manifest** for
phrase-index drift/emptiness.

**(a) Transport/structural — `src/retrieval/artifact.ts`:**

```
fetchJsonArtifact<T>(url: string, validate: (v: unknown) => v is T): Promise<T>
```

1. `if (!res.ok) throw ArtifactUnavailable(url, status)`.
2. `try { json = await res.json() } catch { throw ArtifactInvalid(url, "not JSON") }`.
3. `if (!validate(json)) throw ArtifactInvalid(url, "unexpected shape")`.

Shallow, cheap guards (container type + values-are-arrays; no per-posting walk)
for: a word shard (`Record<string, number[]>`), a term list (`[string, number][]`),
the merged term list, a `PositionalShard`, the phrase `Index`
(`{code, terms: Record<string, number[]>}`), and `Offsets`. Wired into
`FetchWordIndex.{shard,terms,mergedTerms}`, `FetchPositional.positions`
(`words.ts`), and the `main.ts` startup loads of offsets and every phrase index
(replacing the transport-only `fetchJson`). The byte-range reader is **not**
routed through this (it reads `arrayBuffer`, not JSON) — see Component 2(d).

Note this layer does **not** treat an empty artifact as a failure: an empty word
first-character shard (`public/corpus/word/*/_.json` is `{}`) is a legitimate,
deliberately-written convention (`cli.ts:34`). Emptiness is judged only by (b)/(c).

**(b) Word-path cross-check — relocated into `prepare()` (PAR-critical fix).**
`search()` is synchronous and cache-only by contract (`engine.ts:114–117`), so the
cross-check cannot fetch there. Instead, `prepare()` (already async, already walks
the expression at `engine.ts:118`) preloads, per word code it will touch, that
code's term list (`wordSource.terms(code)`, validated) into a **cached membership
`Set` of `phraseKey`-normalized terms** (a new `termSet` cache beside `shards`;
built once per code per session — there is currently no engine-side cache for
`terms()`, `engine.ts:170`, so one is added). Term-list and shard keys share the
`tokenize`/`phraseKey` normalization (`index-builder.ts:143–166`), so membership
is valid. Then in synchronous `search()` (`engine.ts:236–241`), on a miss
(`key` absent from the loaded shard): if `key` **is** in the code's cached
`termSet`, the shard omitting it is drift → `IndexInconsistent`; if `key` is
**not** in the set, the miss is a *genuine* historical zero (category A). The
merged Basic Index (`*`) and truncation paths already resolve through
`termList`/`prefixPostings` over the same term lists, so they inherit the same
validation without a separate cross-check.

**(c) Phrase-path manifest — per-code term counts on `report.json`.** The loader
already emits per-*word*-code counts (`report.wordTerms`, `index-builder.ts:167`)
but no per-*phrase*-code counts, and phrase indexes are written unconditionally
for every `PHRASE_FIELDS` code regardless of count (`index-builder.ts:108`,
`cli.ts:24`) — so "served ⇒ non-empty" is false and a bare non-empty guard would
misflag a legitimately-empty field. Fix: add `report.phraseTerms: Record<code,
number>` (mirroring `wordTerms`), written into `report.json`. At startup, load
`report.json` (small; via `fetchJsonArtifact` with a counts guard — it is not
loaded at runtime today) and, for each loaded phrase `Index`, assert
`Object.keys(idx.terms).length === report.phraseTerms[code]`. A mismatch (empty
where the build had N, or any drift) → `IndexInconsistent`. A field the build
recorded as 0 stays a legitimate zero, never a failure.

**(d) Byte-range + record bounds.** `src/retrieval/reader.ts` (browser) and
`reader-node.ts` convert their raw-`Error` throws (non-206, short-range) to
`ReconstructionFailure` `RangeReadFailed`. `words-node.ts` wraps its
`JSON.parse(readFile)` for test symmetry (node is test/cast-only). `engine.record()`
(`engine.ts:288–298`) gains a `lastLine >= firstLine` guard (Minors item 1)
throwing `CorpusRangeInvalid`; its existing "no record at ordinal" throw becomes
the same typed failure.

### Component 3 — top-level boundary + render (closes both IMPORTANT items)

The freeze and the missing-modern-error share one root cause and one fix.

**Extract the boundary into a testable unit (PAR fix).** `main.ts`'s onSubmit
closure and notice-render are module-private in a non-importable top-level-await
module, so a test cannot observe them. Extract the render-and-recover logic into a
small importable function (proposed `src/app/onSubmit.ts` exporting a factory that
takes `session`, `sink`, and a notice-render callback and returns the `onSubmit`
handler). `main.ts` wires it; tests import it directly.

**Per-command boundary.** The extracted handler wraps its body (around
`await session.submit(l)` and `await sink.print(out)`) in try/catch. On catch:
render the failure through the notice channel with a distinct CSS class and
wording, then **return normally**. Returning-instead-of-rejecting is what
un-wedges the terminal: `sink.runSubmit` then reaches `submitting = false`
(sink.ts:123) and drains `pendingLines`. (`sink.print` returns a promise that only
resolves, so both awaits are covered.)

**Defensive reset.** `sink.runSubmit` gets a `try/finally` scoped to **only the
`await this.onSubmit(l)` line** — not the method body. A body-scoped `finally`
would clear the `submitting` flag that the synchronous recursive handoff
(`void this.runSubmit(next)`, `sink.ts:124–125`) just set, allowing overlapping
submissions (`sink.ts:87–102`). Scoped to the await, it resets on reject without
touching the handoff.

**Startup boundary (module restructure, not a one-line wrap — PAR fix).**
`offsets`/`indexes` are module-top-level `const`s consumed unconditionally by
essentially the whole module body (`main.ts:34` engine, the onSubmit closure and
`refresh` `:81–93`, `mountInspect` `:191`, and the helper declarations/document
listeners that close over `session`/`sink`, with `session` a `let` reassigned by
`restart()` `:133`). Move the whole post-load sequence into a guarded
`async main()` (or IIFE): on a load/validate/manifest failure, render a
**dedicated modern error panel** into the index.html root and `return` — never
constructing the engine, session, sink, listeners, or inspect panel. The root
element exists before any `DomSink`, so the panel can render. A partial mount is
not acceptable — the app cannot run without offsets and phrase indexes.

**User-facing message.** One consistent sentence for all per-command D failures:

> This reconstruction could not load part of its data. This is a fault in the
> reconstruction, not a DIALOG response.

The `code`, `url`, `detail` go to `console`/diagnostics only.

**Expected vs unexpected D.** The boundary catches *everything* (nothing freezes)
but distinguishes a typed `ReconstructionFailure` (curated message) from any other
thrown value (a programmer-invariant bug): both render the same user notice, but an
unexpected error is additionally `console.error`-ed with its full stack, so bugs
still surface loudly for a developer.

**Visibility across display modes (PAR minor).** The D notice must stay visible in
**paper** mode, which currently hides the shared `#notice` region
(`sink.dom.test.ts:420`). The distinct D CSS class must override that hiding — a D
failure that is silently invisible would be its own masquerade.

### Component 4 — the three minors

1. **Inverted-offset guard** — folded into Component 2(d).

2. **PRINT reversed/invalid range** — behavior **unchanged** (`PRINT S1/5/35-1`
   still normalizes to zero items and acknowledges). Add a `chosen` registry entry
   (proposed `proto.print.item_range`). **Do not assert a historical absence** —
   state only "not found in the repository documentation (`docs/*.md`, checked
   2026-09-12); not verified against the primary source archive," pending the
   maintainer's check against held sources. Add a matching line to
   `docs/not-implemented.md`.

3. **TYPE before BEGIN** — **left as-is** (prints `? S1`). No historical-looking
   output changes. Add a short registry/README note that `TYPE` and `SELECT`
   disagree here and both are `chosen`; record only "not found in the repository
   documentation (`docs/*.md`, checked 2026-09-12); not verified against the
   primary source archive."

### Component 5 — documentation (light touch)

- New `chosen` registry key(s) for the D render channel (proposed
  `capability.reconstruction_error`), recording the out-of-stream D notice the way
  `capability.notice` records the B notice.
- A short README/registry note making the **Format B throw-vs-diagnostic policy**
  findable (structural impossibility throws → D; malformed archival data becomes an
  inspectable diagnostic → C). The policy stays in code
  (`packages/cris-formatb/src/record.ts`, `offsets.ts`) unchanged.

## Data flow

```
artifact fetch ─▶ fetchJsonArtifact(validate)      [transport + shape]
                    │ ok            │ fail
                    ▼               ▼
                  data      throw ReconstructionFailure
   prepare(): preload word termSet; startup: manifest check (phrase counts)
                    │
             search() miss?
   word: in termSet? ─yes─▶ drift (IndexInconsistent) ─┐
        │ no                                            │
   phrase: count ≠ manifest? ─yes─▶ IndexInconsistent ─┤
        │ no                                            │
        ▼                                               ▼
   genuine zero (?? []) ─▶ category-A result    session.submit ─▶ onSubmit try/catch
                                                        │
                                                        ▼
                                                 modern D notice (out of stream,
                                                 visible in all modes) + no freeze
```

## Testing

Layered so each assertion sits where the failure is observable (PAR fix — the
evidence harness has no DOM/notice and `submit()` *rejects* on a D failure):

- **`fetchJsonArtifact` / `FetchWordIndex` unit** (stubbed `fetch`, not source
  injection — `MemoryWordIndex`/harness never run the fetch helper):
  non-ok → `ArtifactUnavailable`; HTML/invalid JSON → `ArtifactInvalid`;
  wrong shape → `ArtifactInvalid`.
- **Word-path drift** (engine + `prepare()`): a shard missing a key that its
  (stubbed) term list contains → `IndexInconsistent`; a key absent from both shard
  and term list → ordinary zero-hit set line preserved (genuine zero not broken).
- **Phrase-path manifest** (startup/load unit): a loaded `Index` whose
  `terms` count ≠ `report.phraseTerms[code]` → `IndexInconsistent`; a code the
  manifest records as 0 and serves empty → ordinary zero, no failure.
- **Negative invariant** (DOM layer, against the **extracted** onSubmit unit —
  `sink.dom.test.ts:177,188` already stub a `RangeReader` and a real session):
  drive `BEGIN 60` + a `SELECT` that builds a set + `TYPE Sn/5/1` with a reader
  whose `read()` rejects; assert output is **not** a `? …` line in `printout` and
  **is** the modern D notice (visible even in paper mode). Bare `TYPE` before
  `BEGIN` prints `? S1` and never reaches the reader, so it cannot exercise this.
- **No-freeze**: after a D failure, a subsequent well-formed command still runs.
- **Startup failure**: a 404 or manifest mismatch renders the modern panel, not a
  blank page or half-mounted terminal.
- **Minors**: inverted-offset guard → `CorpusRangeInvalid`; PRINT reversed-range
  still acknowledges and the registry entry is present; TYPE-before-BEGIN output
  unchanged and the note present.

## Files touched

New: `src/retrieval/failures.ts`, `src/retrieval/artifact.ts`, `src/app/onSubmit.ts`.
Edited: `src/retrieval/words.ts`, `src/retrieval/reader.ts`, `reader-node.ts`,
`words-node.ts`, `src/retrieval/engine.ts` (prepare preload + termSet cache +
record guard + typed throws), `src/app/main.ts` (async-main restructure, wire
extracted onSubmit, load manifest), `src/terminal/sink.ts` (scoped finally),
`src/loader/index-builder.ts` + `src/loader/corpus-format.ts` (`report.phraseTerms`),
`src/loader/cli.ts` (emit it), `registry/evidence.json`, `docs/not-implemented.md`,
`README.md`, plus the D-notice CSS (paper-mode visibility) in `index.html`.
Tests: `fetchJsonArtifact`/`FetchWordIndex` unit; word-drift + genuine-zero;
phrase-manifest; DOM negative-invariant + no-freeze (against `onSubmit.ts`);
startup-failure; inverted-offset; PRINT/registry regression updates.
(`test/evidence/harness.ts` is **not** the venue for the negative-invariant test.)

## Landing (Ship / Show / Ask)

Proposed **Ask** — changes runtime error behavior, adds a build-artifact field
(`report.phraseTerms`) and a new UI surface (startup panel, D notice). A PR with
review is warranted; final call at implementation time.
