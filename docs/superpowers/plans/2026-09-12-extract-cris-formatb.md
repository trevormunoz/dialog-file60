# cris-formatb: in-repo swap-ready boundary (Phase 1)

> **Revised 2026-09-12.** The original plan extracted the package to a sibling repo in 8 tasks. That is **deferred to Phase 2** — see the Decision below. Phase 1 is now an in-place interface tidy.

**Goal:** Make `packages/cris-formatb` a clean, swap-ready module *in place*: a cycle-free primitives module, an explicit named barrel (conservative — the full current surface, nothing narrowed), and a public-API lock test covering both the runtime value surface and the compile-time type surface. No parsing-behavior change; consumer imports unchanged.

## Decision (2026-09-12): stay in-repo; defer the separate repo to Phase 2

Standing up the sibling repo and running PAR over it surfaced that the package and `dialog-file60` share an **evidence base**, not just code:

- The two `.bin` fixtures are woven through ~14 `dialog-file60` test files **and** pinned to the original NARA corpus by byte offset (`test/archival/fixture-bytes.test.ts` checks `fixture == corpus[offset:len]`, reading a positionally-parsed `sha256:` line from `SOURCES.md`).
- The registry vocabulary overlaps: `formatb.encoding.continuation_0xAC` is cited by the package **and** by `dialog-file60`'s own `src/inspect/panel.ts:218` and `scripts/naive-split.py:5`.

The **code** separates cleanly (PAR-confirmed: parsing byte-for-byte unchanged, cycle broken, barrel exact). The **evidence** does not. A separate repo therefore forces *duplicating the shared evidence* — two fixture copies kept in sync by SHA drift-guards, a duplicated registry key, a cross-repo `SOURCES.md` parser. For a 2-person project, before the Gleam rewrite is greenlit, that recurring overhead buys nothing the in-repo boundary doesn't already provide. So: do the interface tidy in place now; revisit the separate repo at the Phase-2 go/no-go, when independent hosting is actually wanted and the duplication cost is paid on purpose.

## Phase-2 seed

A standalone sibling repo already exists at `~/Code/barcstory/cris-formatb`: preserved package history, green standalone build, `bytes.ts` + explicit barrel + type-surface lock, and a self-contained **4-key** registry slice with a bidirectional consistency test (the PAR-corrected scope — 3 package-only keys + the shared `continuation_0xAC` duplicated). It is **not wired into anything**. Keep it as the seed for Phase 2 (Gleam rewrite + separate repo), or discard it if Phase 2 is declined.

## Phase 1 tasks (in-repo, on branch `worktree-cris-formatb`)

All three files were ported verbatim from the PAR-reviewed sibling versions.

- [ ] **Task A — `bytes.ts` + cycle break.** Move `LINE_BYTES` (82), `DATA_START` (3), `DATA_END` (72), and `latin1` out of `src/index.ts` into a new `src/bytes.ts`; repoint `src/offsets.ts:1` and `src/record.ts:1` from `./index` to `./bytes`. Breaks the index↔offsets/record cycle.

- [ ] **Task B — explicit named barrel + public-API lock test.** Replace `export *` in `src/index.ts` with the explicit named list (12 value exports + 7 `export type` names). Add `test/public-api.test.ts`: the runtime value-surface lock (`Object.keys` equals the frozen set) **and** a compile-time type-surface lock (an `export type _PublicTypeSurface` that references all 7 public types, so dropping any `export type` from the barrel fails `tsc --noEmit`).

- [ ] **Task C — verify.** `pnpm typecheck` (root + `packages/cris-formatb`) exits 0; `pnpm test` all pass (existing package tests + the new value-surface lock).

## Out of scope — dropped from the separate-repo plan

These existed only to make a separate repo self-contained; they return only if Phase 2 proceeds:
- Duplicating the `.bin` fixtures into `dialog-file60/fixtures/` + SHA drift-guards + the ~16-file path repoint.
- The `registry/formatb.json` slice and its consistency test (in-repo, `dialog-file60`'s existing `test/regression/registry.test.ts` already covers these keys).
- The `pnpm-workspace.yaml` rewire to `../cris-formatb`, the package removal, and the one-commit cutover.

## Global constraints

- **No change to Format B parsing behavior** — only the import *source* lines in `offsets.ts`/`record.ts` move.
- **Conservative surface** — every symbol public today stays public; `export *` becomes an explicit named list, nothing narrowed or added.
- **Consumer imports frozen** — `@barcstory/cris-formatb` with `workspace:*`, unchanged; `pnpm-workspace.yaml` stays `packages/*`.
