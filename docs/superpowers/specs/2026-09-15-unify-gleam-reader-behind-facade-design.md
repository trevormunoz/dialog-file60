# Unify the mature Gleam reader behind the `@barcstory/cris-formatb` facade

**Date:** 2026-09-15
**Status:** design, approved section-by-section in brainstorming, then revised after
a 3-reviewer pass (parallel adversarial pair + a Gleam-idiom review). The pass
confirmed the core value-boundary parity seam, the Latin-1 sourcing, and the type
split, and corrected six issues now folded in: (A1) the `0xA0 0x02` code/label/percent
split needs a profile-gated `splitSegments` port, not the validator's decomposition;
(A2) trim is per-field (`trim_end` vs `trim`), not one `js_trim`; (A3) the reader-only
type move must include `NonEmpty` (import-audited); (A4) the move is a multi-step reorg,
not one `git mv`; (A5) SC/PH/GH `0xA0` is a documented delimiter, not conversion
residue; (A6) `gleam.toml` needs `gleam_javascript`. Ready for spec review then
implementation planning.
**Supersedes/extends:** this is **Phase 2** of
`docs/superpowers/specs/2026-09-12-extract-cris-formatb-design.md` (Phase 0
feasibility spike + Phase 1 in-repo tidy are done). It replaces the earlier
Phase-2 sketch's assumption of a fresh idiomatic port with a *unification* of the
mature reader already built in `docs/formatb-reading`.

## Goal

Make the Format B **emulator** (the `dialog-file60` app — `src/dialog/`,
`src/retrieval/`, `src/loader/`, …) actually run on the mature Gleam reader
(`docs/formatb-reading`), behind the **unchanged** `@barcstory/cris-formatb`
public surface, with the emulator's rendered output byte-identical before and
after the swap. The **validator** (`construct` → checked `Project` + typed
`ConstructionProblem`s) remains a separate analytical tool over the same corpus;
it is never in the emulator's runtime path.

One engine, two consumers: the emulator via a strict-parity facade, the validator
via the same reading layer.

## Settled decisions (brainstorming)

1. **Scope — full unification end-to-end** (one spec): the reader emits the frozen
   `LogicalRecord`/`SourceField`/`SourceValue` contract, `@barcstory/cris-formatb`
   is rewired to delegate to the bundled Gleam engine, and the app suite is green
   over corpus + real data with zero import-string changes.
2. **Split boundary — reader segments, validator judges.** The mechanical
   `0xA0 0x02` code·label·percent segmentation moves into the reader (fills what is
   present, no judgment); `construct` consumes the segmented parts and keeps only
   the rule-checking. One segmentation, two consumers.
3. **Parity posture — strict-parity swap, corrections deferred.** The Gleam facade
   output must reproduce the current TS reader's bytes exactly, *including* its known
   quirks (e.g. the old `0xAC` single-value mis-split). The mature reader's
   corrections are **not** adopted on the facade path; each is a later, separately
   identified and tested behavior change (the deferred-corrections bucket).
4. **Engine home — `packages/cris-formatb` becomes the Gleam project's home.** The
   whole Gleam project moves in (history preserved). `docs/formatb-reading` is
   removed in favor of a one-line pointer. The package becomes the entire Format B
   module: shipped reader (TS facade) + validator + `rules/` evidence.

## Architecture & module topology (§1)

```
packages/cris-formatb/            (= the Format B module)
  gleam.toml, manifest.toml
  src/                            ← Gleam engine (moved from docs/formatb-reading)
    card_image.gleam              reader: line splitting
    scan.gleam                    reader: record scanning  (+AN — new; per-record byte
                                   offset/length already exist in assembly.line_location)
    assembly.gleam                reader: fragments → FieldOccurrence
    field_value.gleam             reader: fragment→value policy (parity seam, below)
    source_record.gleam           reader: shared structural types (NEW — see §4)
                                   Location, Witness, Fragment, RecordPart,
                                   FieldOccurrence, SuppliedRecord, NonEmpty
                                   (+ every other type the reader imports from
                                    record_model — gated by an import audit, §4)
    segment.gleam                 reader: 0xA0/0x02 code·label·percent split
                                   (NEW — moved out of construct, structure only)
    latin1.gleam                  reader: byte→string decode + JS-trim (NEW)
    facade.gleam                  reader: SuppliedRecord → LogicalRecord (NEW)
    javascript.gleam              reader: JS-array / $-API marshalling (NEW)
    record_model.gleam            validator: analytical types (Project, …) ONLY
    construct.gleam               validator: checked construction + rules
    report.gleam, tally.gleam     validator: analysis
  rules/, plans/                  evidence (moved; SOURCE RESTRICTED)
  src-ts/ (or src/*.ts)           TS facade + parity oracle
    index.ts                      frozen public surface → delegates to dist bundle
    record.ts, offsets.ts, bytes.ts   the current TS reader, RETAINED as the
                                   PARITY ORACLE (tests only; dropped from runtime)
    profiles.ts, cli.ts
  test/                           public-api.test.ts (conformance) + parity harness
  fixtures/                       .bin fixtures (already here)
  dist/                           bundled Gleam JS (build output)

docs/formatb-reading/  →  removed; replaced by a one-line pointer to the new home.
```

Three layers, one dependency direction:
- **Reader** (`card_image`→`scan`→`assembly`→`field_value`→`segment`/`latin1`, over
  `source_record` types) knows nothing of TypeScript or of the validator.
- **Facade** (`facade` + `javascript`) sits on the reader only; it is what gets
  bundled to JS.
- **Validator** (`construct`/`record_model`/…) sits on the same reader (now
  consuming `segment`); **never bundled for the emulator**.

**Private-package enforcement.** The engine-home decision (4) co-locates
SOURCE-RESTRICTED `rules/` with shippable code in a package that is currently publishable by default (no
`"private"` flag). "Never published" is today only practice + intent (consumed via
`workspace:*`; the consuming app is `"private": true`; no publish script anywhere;
the Phase-1 spec scopes publishing out) — not a config invariant. So the move
**adds** `"private": true`, a `files`/`.npmignore` allowlist, and
`"prepublishOnly": "exit 1"` to `packages/cris-formatb/package.json`, turning
"never published" into an enforced invariant precisely because restricted evidence
now lives inside the package.

## The facade contract projection (§2)

`facade.gleam` maps reader output to the frozen contract; nothing above it
re-derives structure.

| Frozen contract field | Source in the reader |
|---|---|
| `LogicalRecord.file / firstLine / offset / length` | the record's overall `Witness.location` (`lastLine` is *derived*: `firstLine + byte_length/82 - 1` — `Location` has no `last_line` field) |
| `LogicalRecord.an` | **structural** read of the AN-tagged line's bytes (`3..80`, per `offsets.ts`), decoded + `trim_end` — *not* `construct`'s validated `Accession`; the reader models AN-absence as absence, and only the facade maps it to the contract's `""` sentinel |
| `LogicalRecord.orphanContinuations` | count of `RecordPart.Unassigned` parts (== TS per-orphan-line count) |
| `SourceField.tag / lineStart / lineEnd / offset / length` | `FieldOccurrence.tag` + its fragments' `Location`s |
| `SourceField.values[]` | `field_value.field_values(occ)` (the `0xAC` value-boundary parity seam — see below) |
| `SourceValue.raw` | value bytes → `latin1.decode` + `js_string.trim_end` (trailing-only, per `record.ts:76`) |
| `SourceValue.code / label / percent` | facade `segment.split_heading_segments(raw, profile)` — a **port of `record.ts`'s `splitSegments`** (first-occurrence `0xA0 0x02`; `code`/`label` `trim_end`; `percent` `trim` and **only** when the profile's `percent_in_block` is set), *not* the validator's byte decomposition |
| `SourceValue.line / offset` | the value's leading fragment `Location` |
| `SourceValue.continuation` | `MarkedValueStart` fragment → `true` (only marked-continuation values carry it, per `record.ts:67`; `WrappedText` appends to a value and never creates one) |

New reader modules, each one job:
- **`segment.gleam`** — **one module, two split policies** (they are *not* the same
  algorithm, see below): (1) the validator's structural `segments_on_0x02` +
  `drop_trailing_0xa0`, moved verbatim from `construct` (§3); (2) a facade-parity
  `split_heading_segments(raw, profile)` porting `record.ts`'s `splitSegments`.
- **`latin1.gleam`** — the single total ISO-8859-1 decode, tested over all 256 bytes.
  **Decode only.** The JS-whitespace trims (`trim` / `trim_end` over the set that
  strips U+00A0/NBSP but keeps U+0085/NEL — matching JS, not Gleam stdlib; the
  Phase-2 parity hazard (a)) live in a separate `js_string.gleam` — they are string
  policy, tested separately, and `render` must never reach them.
- **`facade.gleam`** — the projection; native Gleam types only.
- **`javascript.gleam`** — the JS boundary (`List`→`Array` via `gleam/javascript/array`,
  snake→camel via `$`-API, key order matched to `record.ts` so `JSON.stringify` is
  byte-identical). Requires the `gleam_javascript` dependency (see §4).

**Two distinct seams — one solved, one needs a port.**
- The **`0xAC` value-boundary seam needs no new function.** The correction already
  lives in the `field_values` vs `joined_value` distinction: `field_values` splits on
  every marker (the old TS behaviour, verified byte-for-byte against `record.ts:67`),
  while the correction ("line-start `0xAC` is data → one value") lives only in
  `joined_value`, which *only the validator* calls. So the facade uniformly uses
  `field_values` and gets strict per-value parity for free.
- The **`0xA0 0x02` code/label/percent seam DOES need a new function.** The validator's
  `segments_on_0x02` splits on *every* `0x02` and interprets by *segment count*,
  profile-blind — a genuinely different algorithm from `record.ts`'s `splitSegments`,
  which does `indexOf` on the *two-byte* `0xA0 0x02` at the *first* occurrence, trims
  each piece, and extracts `percent` *only* when the profile's `percent_in_block` is
  set (FY88; FY91+ keeps the tail in `label`). They coincide on a clean FY88 3-part
  value but diverge for FY91+ and for a label carrying a stray `0x02`. So the facade
  needs `split_heading_segments(raw, profile)` (above), and the profile must reach the
  facade — it already does, via the frozen `parseRecord(bytes, span, file, profile,
  bufferBaseLine)` signature.

**Decode is shared; representation stays split.** `render` (record_model.gleam) and
TS `latin1` (bytes.ts) are already the *same* total ISO-8859-1 mapping — `render`'s
docstring says so ("matching the TS parser's `latin1`"). So the decode unifies into
`latin1.decode`, and `render` becomes a caller of it (retiring a third duplicate).
But the **representation** decision stands where earlier work put it: the validator
keeps values as `BitArray`, and only the facade emits `String` — because the frozen
contract demands it, not because the bytes are text. Two *distinct* reasons drive the
`BitArray` choice, and they must not be conflated (the corrected `evidence.json`
`nara.conversion.control_bytes`, 2026-09-14, exists precisely to keep them apart):
the **prose fields** (OB/AP/DE/PR/PB) carry scattered high bytes that *are*
EBCDIC→ASCII conversion residue; the **SC/PH/GH** parts are kept `BitArray` because
their bytes are carved from a non-UTF-8 structure whose `0xA0` is a **documented
structural delimiter — explicitly *not* conversion residue**. Both stay bytes; only
the first is "residue."

**Why Latin-1 at all — sourcing.** No source says the data is Latin-1; the true
code page is documented **unknown** (`render` docstring; `registry/evidence.json`
`nara.conversion.control_bytes`: "Code page still unknown"). The provenance that
*is* sourced: the bytes are post-EBCDIC→ASCII (PDF p.30 media facts; the undated
1995–2018 conversion), and prose high bytes are the conversion's own artifacts.
Latin-1 is chosen for three engineering reasons — (1) it is a **total, reversible**
byte→codepoint map (nothing drops, roundtrips; the "non-dropping decode" the Phase-2
spec prefers), (2) it is **display/compat only**, never a semantic claim, and (3)
**parity** with the existing TS `latin1` + inspect panel. There is positive
counter-evidence that Latin-1 is the wrong *semantic* decode (the speculative
context map reads `0xA3` as superscript ¹, not Latin-1's £), which is exactly why
"transport + parity, not truth" is the honest framing. `latin1.decode` carries this
disclaimer, and the facade re-states it; the fiction is contained at the
compatibility boundary and never re-enters the validator's `BitArray`
representation. Rendering these bytes *correctly* (e.g. via the speculative map) is
a deferred, separately-tested change, never smuggled into `latin1.gleam`.

**Trim is per-field, not one function.** `record.ts` does *not* trim uniformly:
`raw`, `code`, `label`, `an`, and header/trailer use `.trimEnd()` (trailing only —
leading whitespace is preserved, and a `code` can legitimately start with a space
once the marker byte is dropped), while `percent` uses `.trim()` (both ends). No
single trim satisfies both, so the facade applies the matching one per field
(`js_string.trim_end` vs `js_string.trim`). Note also that `field_values` trims only
ASCII `0x20` (`card_image.trim_trailing_spaces`), so trailing NBSP/CR/tab parity —
which JS `.trimEnd()` removes — rides entirely on the facade's `js_string` trim, over
the full JS-whitespace set. `render` never trims. Trim is the most parity-sensitive
post-step; the harness (§5.1) is its guard.

## The validator boundary move (§3)

Extract-module, not rewrite — this is what keeps the 162 tests green.

**Moves to `segment.gleam`** (currently private in `construct`): the **validator's**
structural primitives `segments_on_0x02` (the `0x02` split) and `drop_trailing_0xa0`
(strip the separator lead) — pure byte operations, no judgment; become `pub`. This
module *also* gains the facade-parity `split_heading_segments(raw, profile)` (§2) —
these are **two split policies, not one shared function**: the validator's is a
profile-blind `0x02`-count decomposition; the facade's is a first-occurrence
`0xA0 0x02` `indexOf` with profile-gated percent, ported from `record.ts`.

**Stays in `construct`** (unchanged behavior): the `case` arms that judge part count
(`[code, literal] → Heading`; `[c,l,p]`/`[c,l]` → `Subcommodity` `Some`/`None`; else
→ `invalid_value` divergence), the `Some`/`None` percent decision, and the wrapping
into `Heading`/`Subcommodity` with `Supported` + `locations`. `parse_heading` /
`parse_subcommodity` get thinner (they call `segment.segments_on_0x02` /
`drop_trailing_0xa0`) but every branch and divergence is byte-for-byte the same.

The facade applies `split_heading_segments` to *every* value and self-skips when the
`0xA0 0x02` separator is absent (matching `record.ts:76`, which runs `splitSegments`
per value, not gated by tag) — so the plain classification columns (single codes,
no separator) simply pass through as `raw` with no `code`/`label`/`percent`. Which
values *carry* a separator is data, not a tag allow-list.

**Regression:** the 162-test validator suite is the guard. The extraction is
behavior-preserving; if any test moves off green, the extraction was wrong and we
stop.

## Build & distribution (§4)

**Pipeline** (the package gains a build step it lacks today):
```
gleam build --target javascript      # src/*.gleam → build/.../*.mjs (+ .d.mts)
  └─ bundle facade entry (esbuild)   # javascript.gleam exports + reader + prelude/stdlib
     └─ dist/engine.mjs + dist/engine.d.mts   # one self-contained ESM artifact
```
Per Phase 0: `typescript_declarations = true` (`.d.mts`, no `@ts-expect-error`),
`$`-API for all boundary access, `List`→`Array` done Gleam-side. Bundling is
community practice, not official Gleam policy (Phase-0 research-notes, flagged).
**`gleam.toml` gains `gleam_javascript`** (`array.from_list`, used by
`javascript.gleam`) — it is not currently a dependency and the first `gleam build`
fails without it.

**TS surface (frozen):** `index.ts` keeps its exact export set (the
`public-api.test.ts` list) but delegates through a thin wrapper (the spike's
`facade.ts` role) to `dist/engine.mjs`. `record.ts`/`offsets.ts`/`bytes.ts` are
retained **test-only** as the parity oracle and dropped from the runtime exports.
`cli.ts` keeps working via `index.ts`; output unchanged under strict parity.

**`package.json`:** `exports` → the built artifact; `main`/`types` updated; a
`build` script (gleam build → bundle → `tsc` the wrapper `.d.ts`); `"private": true`
+ publish guard (§1). Consumer import strings unchanged. **Build ordering** is wired
concretely, not just asserted: a `prepare` script builds the bundle on `pnpm install`,
and the app's `dev`/`test`/`build`/`typecheck` depend on `pnpm --filter
@barcstory/cris-formatb build` running first (the app currently consumes the package
as raw TS via `tsx`/`vite`/`vitest` with no build step, so this ordering is new and
its absence would load a stale/absent `dist`).

**Keep the shipped bundle reader-only.** `facade.gleam` needs shared structural
types that today live in `record_model.gleam` (the validator's home) — and the move
list must be *complete*, or the property fails. `Location`/`Witness`/`Fragment`/
`RecordPart`/`FieldOccurrence`/`SuppliedRecord` move to a reader-owned
`source_record.gleam` — **and so must `NonEmpty`**, which `FieldOccurrence` and
`SuppliedRecord` depend on (`record_model.gleam:14`) and which `assembly.gleam` /
`field_value.gleam` import directly; if it stays behind, the reader keeps importing
`record_model` and drags the validator into the bundle. The move is therefore gated
by an **import audit**: enumerate every symbol the reader modules (`card_image`,
`scan`, `assembly`, `field_value`, `segment`, `latin1`, `facade`, `javascript`)
import from `record_model`, and relocate all of them to `source_record`, until
`facade.gleam` transitively imports no validator module. The bundle-boundary test
(§5.5) is the executable proof.

## Verification strategy (§5)

The swap is gated on the union of these; each catches a different partial state:

1. **Strict byte-parity harness** — for every record in FY88/FY89/FY94 + real File
   60 data, `JSON.stringify(Gleam facade output) === JSON.stringify(TS reader
   output)` for `scanRecords` and `parseRecord`, both profiles. Any diff fails.
2. **`public-api.test.ts`** — the frozen runtime-shape conformance stays green
   against the *bundled* Gleam.
3. **Validator regression** — the 162-test Gleam suite stays green (§3 is
   behavior-preserving).
4. **App suite** — `dialog-file60`'s full vitest run green over corpus + real data,
   with **zero changes to any `@barcstory/cris-formatb` import string**.
5. **Bundle-boundary test** — `dist/engine.mjs` is reader-only: no `construct` /
   `Project` / `Classifications` symbols, **and** no `simplifile` / `argv` / Node
   `fs` imports (those belong only to the validator's runnable entrypoint; given
   Gleam ESM is not reliably tree-shaken, the shipped artifact must not silently gain
   a Node dependency).
6. **Declarations** — `tsc --noEmit` strict against the generated `.d.mts`.

## Sequencing (coherent commits, each behind a gate)

1. **Move the project in — a multi-step reorg, not one `git mv`.** `packages/cris-formatb`
   already exists and is populated (`src/*.ts`, `package.json`, `tsconfig.json`,
   `vitest.config.ts`, `test/`), so `git mv docs/formatb-reading packages/cris-formatb`
   would nest/collide. Instead: (1a) `git mv packages/cris-formatb/src/*.ts →
   packages/cris-formatb/src-ts/` (relocate the TS reader/oracle); (1b) per-path
   `git mv` the Gleam project's `src/`, `test/`, `rules/`, `plans/`, `gleam.toml`,
   `manifest.toml` into `packages/cris-formatb/` (merging `src/`/`test/`); (1c) rename
   the `gleam.toml` project name; reconcile `build/`/`.gitignore`; leave a pointer at
   `docs/formatb-reading`. History is preserved per file via `git mv`; verify with
   `git log --follow`. Gleam suite green in the new location.
2. **Boundary move (§3)** — extract `segment.gleam` (validator primitives) + add
   `split_heading_segments`; 162 tests green (behavior preserving).
3. **Reader emits the contract (§2/§4)** — add `source_record` (incl. `NonEmpty`, per
   the import audit), `latin1`, `js_string`, `facade`, `javascript`, and `scan`'s AN
   read; add `gleam_javascript`; the strict byte-parity harness goes green vs the TS
   oracle over the corpus, **both profiles**.
4. **Bundle + wire exports (§4)** — build pipeline, `dist`, `index.ts` delegates,
   `public-api.test.ts` + declarations green against the bundle; `"private": true`.
5. **Emulator swap** — the app resolves the package to the Gleam-backed surface;
   full app suite green over corpus + real data, zero import-string changes.

Each step is independently green; a partial rewire is caught by the corresponding
gate. Rollback at any step is reverting that commit — the frozen surface means the
app never sees an intermediate shape.

## Out of scope / deferred

- **Adopting the reader's corrections** on the facade path (the `0xAC` single-value
  fix, field-aware reading, correct EBCDIC rendering) — each is its own later,
  separately-tested behavior change.
- **Publishing** `@barcstory/cris-formatb` to any registry (now enforced off).
- **Idiomatic rewrite** of the reader internals beyond what unification needs
  (the Phase-2 sketch's binary-pattern / state-machine refactors) — not required
  for the swap; can follow behind the frozen surface and the parity harness.

## Risks

- **Move reorg.** The move is the multi-step reorg in Sequencing 1 (the target dir
  already exists), not a single `git mv`; verify per-file history via `git log
  --follow`.
- **Strict-parity edges** (the sharpest cluster — PAR-found). Each must match
  `record.ts`/`offsets.ts` *exactly*, and the parity harness is their executable spec
  over the full corpus (not a sample): (a) **per-field trim** — `trim_end` for
  `raw`/`code`/`label`/`an`/header/trailer, `trim` for `percent`, over the full
  JS-whitespace set (not `field_values`' `0x20`-only); (b) the **profile-gated
  percent split** — `split_heading_segments` must reproduce `splitSegments`'
  first-occurrence `0xA0 0x02` and `percent_in_block` behaviour (FY91+ keeps the tail
  in `label`); (c) the AN slice (`3..80`); (d) orphan-continuation semantics. (b) is
  masked on clean corpora because FY91+ carries the percent in a separate `SN` tag —
  the harness must still assert it, not assume it.
- **Bundle leakage.** The reader-only property depends on a *complete* type move
  (incl. `NonEmpty`) driven by the import audit; verify with the bundle-boundary test
  (no validator symbols, no `simplifile`/`argv`/Node `fs`), not by inspection.
- **Build ordering.** The app currently consumes the package as raw TS with no
  build; the new build step (`prepare` + `pnpm --filter … build` before app
  dev/test/build) must run first or the app loads a stale/absent `dist`.
- **Cross-package documentary references.** `registry/evidence.json` lives at the
  `dialog-file60` repo root; after the move, the reader's docstrings and the moved
  `rules/` cite `registry/evidence.json` as if local. Fix those references (or note
  the repo-root path) so they still resolve from inside the package.
