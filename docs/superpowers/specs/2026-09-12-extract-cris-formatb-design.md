# Extract `@barcstory/cris-formatb` into its own repo

**Date:** 2026-09-12
**Status:** design, awaiting review

## Goal

Move the Format B reader (`packages/cris-formatb/`) out of `dialog-file60`
into its own sibling directory and git repository, and tighten its import
interface so a future reimplementation in Gleam can slot in behind the same
package name without touching consumers.

The Gleam rewrite itself is **not** in scope. This work prepares a clean,
swap-ready boundary and leaves the current TypeScript implementation in place.

## Context (verified facts, 2026-09-12)

- `dialog-file60` is a pnpm workspace (`pnpm-workspace.yaml: packages: ["packages/*"]`),
  pnpm 11.25.0, Node 24.
- The package is consumed as **TypeScript source directly**: its `package.json`
  sets `main`/`types` to `src/index.ts` and `bin` to `src/cli.ts`. There is no
  build step.
- The main repo depends on it via `"@barcstory/cris-formatb": "workspace:*"`.
- ~20 consumers across `src/` and `test/` import named symbols/types. The
  symbols actually imported by consumers are:
  - values: `scanRecords`, `parseRecord`, `field`, `fields`, `lineToOffset`, `LINE_BYTES`
  - types: `LogicalRecord`, `SourceField`, `Profile`
- The package has **no runtime dependency back on the app** (see the note at
  `src/registry/index.ts:3`): the dependency arrow points one way only, so the
  cut is clean.
- Empirically verified: pnpm 11.25.0 accepts a sibling workspace package via a
  `../`-prefixed entry in `pnpm-workspace.yaml`. A scratch test installed
  `@barcstory/cris-formatb` from `../lib` and symlinked it correctly, with the
  dependency string left as `workspace:*`.

### Two leaks that make the current boundary a poor reimplementation target

1. **`index.ts` uses `export *`** from `offsets`, `record`, and `profiles`, so
   the public API is "whatever those modules happen to export" — including
   internals (`latin1`) and unused symbols (`PROFILES`, `offsetToLine`,
   `PROFILE_NAMES`, `DATA_START`, `DATA_END`). A reimplementation cannot tell
   which of these it is obligated to provide.
2. **Circular import:** `index.ts` re-exports `offsets`/`record`, while
   `offsets.ts:1` and `record.ts:1` import `LINE_BYTES`/`DATA_START`/`latin1`
   *back from* `index.ts`. It works today via const hoisting, but it means the
   public barrel and the shared byte primitives live in the same file — there
   is no standalone "this is the contract" artifact.

## Decisions

- **Location:** new repo at `~/Code/barcstory/cris-formatb`, sibling of
  `dialog-file60`, under the (non-git) `barcstory/` parent.
- **Consumption:** pnpm workspace entry `"../cris-formatb"` in `dialog-file60`;
  dependency string stays `workspace:*`; all consumer import strings unchanged.
- **History:** preserved via `git subtree split`.
- **Interface cleanup:** all three changes below (explicit barrel, break the
  cycle, public-API lock test).
- **Remote:** local git only; no GitHub remote in this work.
- **Root coverage:** `dialog-file60` stops typechecking and test-running the
  package; the new repo owns its own `typecheck` and `test`.

## Plan of record

### A. Seed the new repo (history preserved)

1. In `dialog-file60`: `git subtree split --prefix=packages/cris-formatb -b formatb-split`.
2. Create `~/Code/barcstory/cris-formatb` seeded from `formatb-split`
   (clone-and-reset, or `git init` + pull the split branch), ending on a clean
   `main` whose working tree is the package contents at repo root
   (`src/`, `test/`, `fixtures/`, `package.json`, `tsconfig.json`,
   `vitest.config.ts`).
3. Delete the temporary `formatb-split` branch from `dialog-file60`.

### B. Interface soundness (in the new repo)

1. **Internal primitives module** `src/bytes.ts`: move `LINE_BYTES`,
   `DATA_START`, `DATA_END`, and `latin1` here. Update `offsets.ts` and
   `record.ts` to import from `./bytes` instead of `./index`. This removes the
   circular import.
2. **Explicit public barrel** `src/index.ts`: replace `export *` with a
   deliberate named export list. Public surface:
   - values: `scanRecords`, `parseRecord`, `field`, `fields`, `lineToOffset`, `LINE_BYTES`
   - types: `LogicalRecord`, `SourceField`, `SourceValue`, `RecordSpan`,
     `ScanResult`, `FileStructure`, `Profile`
   - `latin1`, `DATA_START`, `DATA_END`, `offsetToLine`, `PROFILES`,
     `PROFILE_NAMES` become **internal** (not re-exported). If a consumer turns
     out to need one, promoting it is a one-line, deliberate change.
3. **Public-API lock test** `test/public-api.test.ts`: import the barrel and
   assert the exact set of exported runtime names, plus a couple of type-level
   shape checks (e.g. `parseRecord` signature, `LogicalRecord.fields` shape).
   This fails loudly if the surface drifts — and is the check a future Gleam
   build is verified against.

### C. Rewire `dialog-file60` (all five touch points together)

1. `pnpm-workspace.yaml`: `packages: ["packages/*"]` → `packages: ["../cris-formatb"]`.
2. `package.json` `typecheck`: drop the package half →
   `"tsc -p tsconfig.json --noEmit"`.
3. `vitest.config.ts`: `projects: ["packages/*", "."]` → `projects: ["."]`
   (and update the surrounding comment, which currently describes the package
   as a second project).
4. `test/regression/package-scripts.test.ts:9`: update the asserted `typecheck`
   string to match the new single-part script.
5. `git rm -r packages/cris-formatb`; commit the removal together with 1–4.
6. `pnpm install` to relink against the sibling.

### D. Verification gate

- New repo: `pnpm install && pnpm test && pnpm exec tsc --noEmit` — green.
- `dialog-file60`: `pnpm install && pnpm test && pnpm typecheck` — green, with
  **zero changes to any `import … from "@barcstory/cris-formatb"` string**.

## Out of scope (YAGNI)

- A `package.json` `exports` map and a JS build step. These belong with the
  actual Gleam build (Gleam→JS emits `.js`; a hand-written `.d.ts` matches the
  locked surface). While the package is still consumed as raw TS source through
  the workspace, adding them buys nothing and risks breaking resolution.
- Any change to the Format B parsing behavior itself.
- A GitHub remote / publish step.

## Risks

- **Subtree split recipe.** The exact command sequence to land a clean `main`
  in the new repo (not a detached split branch) is fiddly; the implementation
  plan pins it and verifies `git log` shows the preserved history.
- **Missed touch point.** The five edits in section C must land together; a
  partial rewire leaves a broken typecheck or a phantom `packages/*` glob.
  Section D's gate catches this.
