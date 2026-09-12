# Extract `@barcstory/cris-formatb`, and the path to a Gleam reimplementation

**Date:** 2026-09-12
**Status:** design, revised after a feasibility spike + parallel adversarial
review (PAR) + interop research. Awaiting review.

## Goal

Give the Format B reader its own repository with a sound, swap-ready interface,
so its engine can later be reimplemented in Gleam behind the unchanged
`@barcstory/cris-formatb` package surface. The work is phased and gated:

- **Phase 0 — feasibility spike.** Done. Proved Gleam can sit behind the facade.
- **Phase 1 — extraction.** Move the package to its own repo, consumed via a
  pnpm workspace `../` entry, imports unchanged.
- **Phase 2 — the Gleam rewrite.** Reimplement the engine idiomatically,
  verified against the TypeScript as an executable specification.

Each phase gates the next. Nothing in Phase 1 changes parsing behavior.

## Phase 0 — feasibility spike (complete)

Evidence lives in `docs/gleam-spike/` (`research-notes.md` for the interop
findings). Result: a Gleam engine (JS target) behind a thin TS facade produced
**byte-for-byte-identical** output to the current TS implementation for the two
functions every consumer depends on — `scanRecords` and `parseRecord` — across a
branch-covering synthetic record (separators, percent-in-block, `0xAC`
continuation, raw-concat continuation, orphan continuation), both profiles, both
real fixtures, and identical throw on a malformed-length buffer (11/11).

It used the idiomatic Gleam→JS mechanisms, which set Phase 2's architecture:

- `typescript_declarations = true` → generated `.d.mts`; **no `@ts-expect-error`**.
- Gleam's v1.13 **`$`-API** for all boundary access; Gleam marks the raw
  representation `@deprecated`, so `tsc` enforces it.
- `List`→`Array` conversion done **on the Gleam side** (`gleam/javascript/array`).
- Distribution by **bundling** the JS output (relative prelude/stdlib imports
  can't be shipped file-by-file); `package.json` `exports` then points at the
  bundle.

## Context (verified facts, 2026-09-12)

- `dialog-file60` is a pnpm workspace (`packages: ["packages/*"]`), pnpm 11.25.0,
  Node 24. Gleam 1.18.1 / gleam_stdlib 1.0.5 are installed.
- The package is consumed as **TypeScript source directly**: `package.json` sets
  `main`/`types` to `src/index.ts`, `bin` to `src/cli.ts`. No build step.
- Depended on via `"@barcstory/cris-formatb": "workspace:*"`.
- External consumers (verified across all 19 import sites) import exactly:
  - values: `scanRecords`, `parseRecord`, `field`, `fields`, `lineToOffset`, `LINE_BYTES`
  - types: `LogicalRecord`, `SourceField`, `Profile`
- pnpm 11.25.0 accepts a sibling workspace package via a `../`-prefixed entry
  (scratch-tested: installs + symlinks, dependency string stays `workspace:*`).

### The cut is NOT one-way — PAR correction

An earlier draft claimed "the dependency arrow points one way only, so the cut is
clean." **That was wrong** (a statement of absence from import-grep alone). PAR
found `dialog-file60` couples to the package through paths and source-tree scans,
not just imports:

1. **Fixtures by path.** `fixtures/*.bin` are read by hard-coded path in ~13
   `dialog-file60` tests **and** `scripts/verify-remote.ts:28` — and by the
   package's own tests. `git rm -r packages/cris-formatb` breaks all of them.
   (`verify-remote.ts:28` is a string literal, so it survives typecheck and fails
   only at runtime.)
2. **Source-tree scans.** `test/regression/dom-boundary.test.ts:8` and
   `registry.test.ts:114,154` `readdirSync` `packages/cris-formatb/src`;
   `packageSrcDirs()` reads `packages/` itself.
3. **Registry keys.** `formatb.record.separator` and
   `formatb.encoding.fy1988_sc_percent` are cited **only** in the package's source
   comments, so after extraction `dialog-file60`'s reverse-orphan check fails.
4. **Base tsconfig.** `packages/cris-formatb/tsconfig.json:1` extends
   `../../tsconfig.base.json`, which is **outside** the subtree and won't travel;
   that base also lists `"vite/client"` types the standalone package can't resolve.
5. **`cli.ts` internal consumer.** `src/cli.ts:3` imports `PROFILE_NAMES` from the
   barrel (so does `record.ts:3` use `PROFILES`) — neither is "unused."

### Two interface leaks (real, confirmed)

1. `index.ts` uses `export *` from `offsets`/`record`/`profiles` — the public API
   is "whatever those happen to export."
2. Circular import: `index.ts` re-exports `offsets`/`record`, while `offsets.ts:1`
   and `record.ts:1` import `LINE_BYTES`/`DATA_START`/`latin1` back from it.

## Decisions

- **Spike-gated phasing** — extraction and rewrite proceed only on the spike's
  green result (met).
- **Location:** new repo at `~/Code/barcstory/cris-formatb`, sibling of
  `dialog-file60`. **Remote:** local git only.
- **Consumption:** pnpm workspace entry `"../cris-formatb"`; dependency string
  stays `workspace:*`; consumer imports unchanged. **History:** `git subtree split`.
- **Fixtures: duplicate in both repos.** Each repo keeps the copies its tests
  read. They are fixed historical NARA bytes (low drift risk); both copies are
  pinned to the same source and a checksum check keeps them identical.
- **Registry slice moves too.** The Format B registry keys and their consistency
  check move into the new repo; `dialog-file60`'s registry test stops scanning the
  package and drops those keys.
- **Conservative public surface.** Make `index.ts` an explicit named barrel but
  keep **every** currently-public symbol public (no trim). This respects that "no
  consumer found" is a statement of absence, and it moots the `cli.ts`
  `PROFILE_NAMES` breakage (PAR S1). Narrowing the surface is a later, deliberate
  step with its own evidence.
- **Root coverage:** `dialog-file60` stops typechecking/test-running the package;
  the new repo owns its own `typecheck`/`test`.

## Phase 1 — extraction plan of record

### A. Seed the new repo (history preserved)

1. `git subtree split --prefix=packages/cris-formatb -b formatb-split`.
2. Seed `~/Code/barcstory/cris-formatb` from `formatb-split`, ending on a clean
   `main` whose working tree is the package at repo root.
3. **Carry the base tsconfig:** inline `tsconfig.base.json`'s needed options into
   the new repo's `tsconfig.json` and **drop `"vite/client"`** from `types`
   (the library has no vite dependency); keep `"vitest/globals"`.
4. Delete the temporary `formatb-split` branch.

### B. Interface soundness (new repo)

1. **Internal primitives module** `src/bytes.ts`: move `LINE_BYTES`, `DATA_START`,
   `DATA_END`, `latin1` there; `offsets.ts`/`record.ts` import from `./bytes`.
   Breaks the cycle.
2. **Explicit named barrel** `src/index.ts`: replace `export *` with a named
   re-export list covering the full current surface (conservative decision) —
   values `scanRecords`, `parseRecord`, `field`, `fields`, `lineToOffset`,
   `offsetToLine`, `LINE_BYTES`, `DATA_START`, `DATA_END`, `latin1`,
   `PROFILES`, `PROFILE_NAMES`; types `LogicalRecord`, `SourceField`,
   `SourceValue`, `RecordSpan`, `ScanResult`, `FileStructure`, `Profile`. (`cli.ts`
   keeps working unchanged.)
3. **Public-API lock test** `test/public-api.test.ts`: assert the exact exported
   runtime-name set **and runtime representation** — `Array.isArray(rec.fields)`,
   `field(rec,'ZZ') === undefined` for an absent tag, `v.code` is string-or-absent,
   etc. This is the conformance check a Phase-2 Gleam build is verified against.
4. **Registry slice**: add the moved Format B keys + a consistency test in the new
   repo.
5. **Fixtures**: keep the copies the package's tests read; record their source +
   checksum.

### C. Rewire `dialog-file60` (one commit — all touch points)

1. `pnpm-workspace.yaml`: `["packages/*"]` → `["../cris-formatb"]` (preserve the
   `allowBuilds` block — edit the line, don't rewrite the file).
2. `package.json` `typecheck`: drop the package half → `"tsc -p tsconfig.json --noEmit"`.
3. `vitest.config.ts`: `projects: ["packages/*", "."]` → `["."]`; update the
   comment; the `exclude: ["packages/**"]` glob becomes dead — remove it.
4. `test/regression/package-scripts.test.ts`: update the asserted `typecheck`
   string (assertion spans lines 9–11) **and** the stale test title (line 7).
5. **Fixtures (duplicate):** copy the `.bin` files the `dialog-file60` tests +
   `scripts/verify-remote.ts:28` read into a `dialog-file60`-owned fixtures
   location; leave those ~14 paths working.
6. **Registry / src scans:** `registry.test.ts` and `dom-boundary.test.ts` stop
   scanning `packages/cris-formatb/src`; drop the two moved registry keys from
   `dialog-file60`'s registry.
7. **Docs sweep:** `docs/development.md:152,159,164-165`, `fixtures/ACCEPTANCE.md:104`,
   `scripts/extract-corpus.py:11`, `scripts/naive-split.py:5`.
8. `git rm -r packages/cris-formatb`; commit 1–7 together; `pnpm install` to relink.

### D. Verification gate

- New repo: `pnpm install && pnpm test && pnpm exec tsc --noEmit` — green.
- `dialog-file60`: `pnpm install && pnpm test && pnpm typecheck` — green, **zero
  changes to any `@barcstory/cris-formatb` import string**.

## Phase 2 — the Gleam reimplementation (design)

The engine is reimplemented in Gleam as code an experienced Gleam developer would
write, not a statement-by-statement port. The literal port from the spike is kept
as the **parity oracle**; observable behavior is preserved unless a difference is
intentionally identified and tested.

### Target architecture

- **Model physical lines first.** A Format B physical line is 82 bytes (80 payload
  + CRLF); make a `PhysicalLine` the first abstraction instead of rediscovering the
  82-byte structure by offset. Establish 82-byte validity **once** (§12: don't
  classify something a `PhysicalLine` until all 82 bytes exist), so downstream code
  operates on a validated type and needs no per-byte `Result`.
- **Bit-array pattern matching**, not `byte_at` indexing. Byte-aligned patterns
  (`<<payload:bytes-size(80), 0x0d, 0x0a>>`) are valid on the JS target; they make
  the physical grammar visible. **Remove the `-1` sentinel** from `byte_at` and the
  empty-string "AN not seen" sentinel.
- **Classify before scanning.** A context-free `classify_line(payload) -> LineKind`
  (`Header`/`Trailer`/`RecordStart`/`AccessionNumber`/`Data`) separates "what a line
  *is*" from "what it *does to scanner state*." Preserve the exact slice rules
  (AN uses bytes 3..80, not the 3..72 data region).
- **Types express the state machine.** Replace `open: Option(RecordSpan)` (a
  semantically incomplete span, later repaired) with `ScannerMode` =
  `BetweenRecords | InRecord(OpenRecord)`, where `OpenRecord` lacks `last_line`/
  `length` until close, and AN is `Option(String)`. Construct a complete
  `RecordSpan` only at close. `scan_line(scanner, line)` reads as the transition
  table (current state × line kind → next state).
- **Keep reverse-list accumulation** (prepend + one `list.reverse`); do not switch
  to repeated append.
- **Isolate Latin-1 decoding** as its own tested concern (`latin1_decode(BitArray)
  -> String`), tested over all 256 byte values; prefer a non-dropping decode over
  `filter_map` (which only ever masks an invariant violation, since 0–255 are all
  valid codepoints). Pure Gleam unless it becomes unreasonable.
- **Thin, explicit JS boundary.** Native Gleam types stay inside the parser; JS
  arrays appear only at the facade (`gleam/javascript/array`). The core scanner
  does not know TypeScript exists.
- **Module split:** `line.gleam` (physical line + classification), `scanner.gleam`
  (state machine), `format_b.gleam` (public domain types), `latin1.gleam`,
  `javascript.gleam` (facade). Qualified imports for functions/constants.
- **Deliberate edge handling.** Name the partial-final-line and malformed-ending
  behavior rather than letting `byte_size / line_bytes` silently truncate. For
  parity the boundary throws on a non-82-multiple buffer (matching `offsets.ts:36`);
  the idiomatic version may model it as a `Diagnostic`. Internally, consider
  diagnostics richer than `bad_lines: Int` — valuable for DIALOG as inspectable
  evidence — but expose `bad_lines` at the compatibility facade only if it
  preserves semantics. (Not for the spike; a domain-implementation consideration.)

### Do NOT over-functionalize

Format B is a small concrete grammar — write it directly. No parser-combinator
machinery, no state monads, no hiding five clear `case` branches behind
higher-order abstractions. The code should read as boring once Format B is
understood; domain names carry the explanatory burden, not comments on mechanics.

### Rewrite sequence

1. **Characterize** — freeze the parity port; strong parity tests vs. `offsets.ts`
   over real fixtures, edge cases, and generated pathological inputs.
2. **Model** — introduce `PhysicalLine`, `LineKind`, `OpenRecord`, `ScannerMode`
   without changing behavior.
3. **Binary patterns** — replace `byte_at` classification with bit-array patterns.
4. **State machine** — replace `open: Option(RecordSpan)` with `ScannerMode`/`OpenRecord`.
5. **Encoding** — isolate and harden Latin-1.
6. **Boundary** — move marshalling into `javascript.gleam`; enable
   `typescript_declarations`; bundle for `exports`.
7. **Compare** — run TypeScript, literal port, and idiomatic implementation over
   the corpus + real File 60 data. Every disagreement is a research question.

Granular tests: physical-line parsing (80+CRLF, 81/83 bytes, all byte values),
classification (prefixes + near-misses), state transitions (table-tested), and the
corpus parity comparison — which matters more than any stylistic argument.

### "Idiomatic enough" criteria

No `-1` sentinel; no empty-string AN sentinel; an unfinished record is not a
completed `RecordSpan`; physical-line validity established once; Format B prefixes
recognized via pattern matching; classification and transitions independently
testable; reverse-list accumulation retained; JS arrays only at the boundary; the
core scanner doesn't know TypeScript exists; partial-input behavior is deliberate;
parity vs. `offsets.ts` remains mechanically testable; domain names over comments;
no abstraction that exists only to demonstrate FP.

## Out of scope

- Any change to Format B parsing behavior in Phase 1.
- A GitHub remote / publish step.
- Narrowing the public surface below today's (deferred; needs its own evidence).

## Risks

- **Subtree split recipe.** Landing a clean `main` (not a detached split branch)
  is fiddly; the implementation plan pins the sequence and verifies preserved
  history via `git log`.
- **Fixture drift.** Two copies can diverge; mitigated by a checksum check and
  their immutability.
- **Missed touch point.** Phase 1 Section C must land as one commit; the Section D
  gate catches a partial rewire. PAR already found the non-obvious ones (fixtures,
  src scans, registry keys, base tsconfig, `verify-remote.ts:28`).
