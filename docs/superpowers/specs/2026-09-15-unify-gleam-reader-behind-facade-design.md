# Unify the mature Gleam reader behind the `@barcstory/cris-formatb` facade

**Date:** 2026-09-15
**Status:** design, approved section-by-section in brainstorming; ready for spec
review then implementation planning.
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
    scan.gleam                    reader: record scanning  (+AN, +geometry — new)
    assembly.gleam                reader: fragments → FieldOccurrence
    field_value.gleam             reader: fragment→value policy (parity seam, below)
    source_record.gleam           reader: shared structural types (NEW — see §4)
                                   Location, Witness, Fragment, RecordPart,
                                   FieldOccurrence, SuppliedRecord
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
| `LogicalRecord.file / firstLine / lastLine / offset / length` | the record's overall `Witness.location` |
| `LogicalRecord.an` | **structural** read of the AN-tagged line's bytes (`3..80`, per `offsets.ts`), decoded + JS-trimmed — *not* `construct`'s validated `Accession` |
| `LogicalRecord.orphanContinuations` | count of `RecordPart.Unassigned` parts |
| `SourceField.tag / lineStart / lineEnd / offset / length` | `FieldOccurrence.tag` + its fragments' `Location`s |
| `SourceField.values[]` | `field_value.field_values(occ)` (marker-splitting — the parity seam, below) |
| `SourceValue.raw` | value bytes → `latin1.decode` + `js_trim` |
| `SourceValue.code / label / percent` | `segment.gleam` split on `0xA0 0x02` (fills what is present) |
| `SourceValue.line / offset` | the value's leading fragment `Location` |
| `SourceValue.continuation` | fragment kind (`WrappedText` / continuation `MarkedValueStart`) → `true` |

New reader modules, each one job:
- **`segment.gleam`** — the `0xA0 0x02` split, moved verbatim (structure only) from
  `construct`'s `parse_heading`/`parse_subcommodity` (see §3).
- **`latin1.gleam`** — the single total ISO-8859-1 decode, tested over all 256
  bytes, plus a **separate** `js_trim` (strips U+00A0/NBSP, keeps U+0085/NEL —
  matching JS `.trim()`, not Gleam stdlib; the Phase-2 parity hazard (a)).
- **`facade.gleam`** — the projection; native Gleam types only.
- **`javascript.gleam`** — the JS boundary (`List`→`Array`, snake→camel via `$`-API,
  key order matched to `record.ts` so `JSON.stringify` is byte-identical).

**The parity seam needs no new function.** The `0xAC` correction already lives in
the `field_values` vs `joined_value` distinction: `field_values` splits on every
marker (the old TS behavior), while the correction ("line-start `0xAC` is data → one
value") lives only in `joined_value`, which *only the validator* calls for
single-value fields. So the facade uniformly uses `field_values` and gets strict TS
parity for free; the correction stays entirely validator-side. The seam is a choice
of existing function, not a fork in the reader.

**Decode is shared; representation stays split.** `render` (record_model.gleam) and
TS `latin1` (bytes.ts) are already the *same* total ISO-8859-1 mapping — `render`'s
docstring says so ("matching the TS parser's `latin1`"). So the decode unifies into
`latin1.decode`, and `render` becomes a caller of it (retiring a third duplicate).
But the **representation** decision stands where earlier work put it: the validator
keeps values as `BitArray` (unknown code page; high bytes are EBCDIC→ASCII
conversion residue), and only the facade emits `String` — because the frozen
contract demands it, not because the bytes are text.

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

**Trim ordering.** `segment.gleam` returns raw byte parts (split points are
identical on bytes or on the decoded string, the mapping being 1:1). The facade
does `js_trim(decode(part))` per part, mirroring `record.ts`'s string pipeline; the
validator keeps the byte parts and length-checks them. Trim is the only
parity-sensitive post-step, and it is confined to the facade. `render` never trims.

## The validator boundary move (§3)

Extract-module, not rewrite — this is what keeps the 162 tests green.

**Moves to `segment.gleam`** (currently private in `construct`): `segments_on_0x02`
(the `0x02` split) and `drop_trailing_0xa0` (strip the separator lead). Pure byte
operations, no judgment; become `pub`.

**Stays in `construct`** (unchanged behavior): the `case` arms that judge part count
(`[code, literal] → Heading`; `[c,l,p]`/`[c,l]` → `Subcommodity` `Some`/`None`; else
→ `invalid_value` divergence), the `Some`/`None` percent decision, and the wrapping
into `Heading`/`Subcommodity` with `Supported` + `locations`. `parse_heading` /
`parse_subcommodity` get thinner (they call `segment.*`) but every branch and
divergence is byte-for-byte the same.

Which tags get segmented (SC/PH/GH, matching `record.ts`; the classification columns
are plain single codes) is a **facade-projection** decision fixed by the parity
harness, not a `segment.gleam` concern.

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

**TS surface (frozen):** `index.ts` keeps its exact export set (the
`public-api.test.ts` list) but delegates through a thin wrapper (the spike's
`facade.ts` role) to `dist/engine.mjs`. `record.ts`/`offsets.ts`/`bytes.ts` are
retained **test-only** as the parity oracle and dropped from the runtime exports.
`cli.ts` keeps working via `index.ts`; output unchanged under strict parity.

**`package.json`:** `exports` → the built artifact; `main`/`types` updated; a
`build` script (gleam build → bundle → `tsc` the wrapper `.d.ts`); build ordering
wired so the app's `dev`/`test`/`build`/`typecheck` trigger the package build first;
`"private": true` + publish guard (§1). Consumer import strings unchanged.

**Keep the shipped bundle reader-only.** `facade.gleam` needs shared structural
types (`Location`/`Witness`/`Fragment`/`FieldOccurrence`/`SuppliedRecord`) that today
live in `record_model.gleam` (the validator's home). To stop the bundler dragging
the validator into the shipped engine (Gleam ESM output is not reliably
tree-shaken), those types move to a reader-owned `source_record.gleam`, leaving
`record_model.gleam` validator-only. Then `facade.gleam` never imports the
validator's home, and the bundle is provably reader-only.

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
5. **Bundle-boundary test** — `dist/engine.mjs` is reader-only (no `construct` /
   `Project` / `Classifications` symbols).
6. **Declarations** — `tsc --noEmit` strict against the generated `.d.mts`.

## Sequencing (coherent commits, each behind a gate)

1. **Move the project in** — `git mv docs/formatb-reading → packages/cris-formatb`
   (history preserved), leave a pointer; Gleam suite green in the new location.
2. **Boundary move (§3)** — extract `segment.gleam`; 162 tests green (behavior
   preserving).
3. **Reader emits the contract (§2/§4)** — add `source_record`, `latin1`, `facade`,
   `javascript`, `scan` AN/geometry; the strict byte-parity harness goes green vs
   the TS oracle over the corpus.
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

- **Move history.** `git mv` of a subtree with 15+ commits; verify history via
  `git log --follow` on a few files.
- **Strict-parity edges.** The trim set (NBSP), the AN slice (`3..80`), the
  FY88-3-part vs FY94-2-part percent, and orphan-continuation semantics must match
  `record.ts`/`offsets.ts` exactly; the parity harness is their executable spec, run
  over the full corpus, not a sample.
- **Bundle leakage.** Verify the reader-only property with the bundle-boundary test,
  not by inspection.
- **Build ordering.** The app currently consumes the package as raw TS with no
  build; the new build step must run before app dev/test/build or the app loads a
  stale/absent `dist`.
