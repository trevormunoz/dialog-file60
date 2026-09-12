# Extract `@barcstory/cris-formatb` — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Format B reader out of `dialog-file60` into its own sibling git repository, consumed via a pnpm workspace `../` entry, with a sound named-export interface and a public-API lock test — all consumer import strings unchanged, both repos green.

**Architecture:** `git subtree split` seeds a sibling repo `~/Code/barcstory/cris-formatb` with preserved history. The new repo gets a standalone tsconfig, a cycle-free internal primitives module, an explicit named barrel (full current surface — conservative), a public-API lock test, and its own registry slice. `dialog-file60` duplicates the fixtures its own tests read, stops scanning the package source tree, and rewires its workspace to the sibling. Phase 2 (the Gleam rewrite) is **out of scope** and gated on a separate go/no-go after this lands.

**Tech Stack:** pnpm 11.25.0 workspaces, Node 24, TypeScript 5.6 (`moduleResolution: Bundler`, raw `.ts` consumption — no build step), Vitest 3, git subtree.

## Global Constraints

- **No change to Format B parsing behavior.** This is a move + interface tidy only.
- **Consumer imports are frozen.** No `import … from "@barcstory/cris-formatb"` string in `dialog-file60` may change. The dependency string stays `"workspace:*"`.
- **Conservative surface.** Every symbol public today stays public; `export *` becomes an explicit named list. No narrowing.
- **One-commit rewire.** The `dialog-file60` cutover (Task 8) lands as a single commit — the package removal and every repoint together — so the tree is never half-migrated.
- **Duplicated fixtures stay identical.** Each repo's copy of a `.bin` fixture is pinned to the same source; a checksum guards drift.
- **Run from the canonical checkout.** The `git subtree split` (Task 1) runs on the branch that holds the package's real history (`main`), not this worktree.

---

## File structure

New repo `~/Code/barcstory/cris-formatb/` (seeded from the subtree):
- `src/index.ts` — explicit named barrel (public contract)
- `src/bytes.ts` — **new** — shared primitives (`LINE_BYTES`, `DATA_START`, `DATA_END`, `latin1`)
- `src/offsets.ts`, `src/record.ts`, `src/profiles.ts`, `src/cli.ts` — unchanged logic, imports repointed to `./bytes`
- `test/public-api.test.ts` — **new** — surface + runtime-representation lock
- `test/registry.test.ts` + `registry/formatb.json` — **new** — moved Format B registry slice
- `fixtures/*.bin`, existing `test/*`, `package.json`, `tsconfig.json`, `vitest.config.ts`

`dialog-file60` (modified):
- `pnpm-workspace.yaml`, `package.json`, `vitest.config.ts`, `test/regression/package-scripts.test.ts`
- `fixtures/*.bin` — **new copies**; ~14 test files + `scripts/verify-remote.ts` repointed
- `test/regression/registry.test.ts`, `test/regression/dom-boundary.test.ts` — stop scanning the package
- `registry/evidence.json` — drop the two moved keys
- docs sweep: `docs/development.md`, `fixtures/ACCEPTANCE.md`, `scripts/extract-corpus.py`, `scripts/naive-split.py`

---

## Task 1: Seed the sibling repo with preserved history + standalone build

**Files:**
- Create: `~/Code/barcstory/cris-formatb/` (new git repo)
- Modify in new repo: `tsconfig.json`, `package.json`

**Interfaces:**
- Produces: a sibling repo whose working tree is the package at root, that installs and passes `tsc --noEmit` + `vitest run` standalone.

- [ ] **Step 1: Split the package history into a branch (run on `main`)**

```bash
cd ~/Code/barcstory/dialog-file60
git checkout main
git subtree split --prefix=packages/cris-formatb -b formatb-split
```
Expected: `Created branch 'formatb-split'` and a printed commit SHA.

- [ ] **Step 2: Seed the new repo from that branch**

```bash
cd ~/Code/barcstory
git init cris-formatb
cd cris-formatb
git fetch ~/Code/barcstory/dialog-file60 formatb-split
git checkout -b main FETCH_HEAD
```
Expected: working tree now contains `src/`, `test/`, `fixtures/`, `package.json`, `tsconfig.json`, `vitest.config.ts` at repo root.

- [ ] **Step 3: Verify history came across**

Run: `git log --oneline -- src/record.ts | head`
Expected: multiple commits (the package's real history), not a single "Initial commit".

- [ ] **Step 4: Carry the base tsconfig inline (it lived outside the subtree)**

Replace the new repo's `tsconfig.json` (which currently `extends: "../../tsconfig.base.json"`, a path that no longer resolves) with a self-contained config. Copy the options from `dialog-file60/tsconfig.base.json` and **drop `"vite/client"`** (the standalone library has no vite dep), keep `"vitest/globals"`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Add a standalone typecheck script**

In the new repo's `package.json`, add to `scripts`:

```json
"typecheck": "tsc -p tsconfig.json --noEmit"
```

- [ ] **Step 6: Install, typecheck, test the new repo standalone**

Run:
```bash
pnpm install
pnpm exec tsc -p tsconfig.json --noEmit
pnpm test
```
Expected: install succeeds; `tsc` exits 0 (no `vite/client` / missing-base errors); all existing package tests pass.

- [ ] **Step 7: Commit the new repo baseline**

```bash
git add -A
git commit -m "chore: standalone tsconfig + typecheck script after extraction"
```

- [ ] **Step 8: Delete the temporary split branch**

```bash
cd ~/Code/barcstory/dialog-file60
git branch -D formatb-split
```

---

## Task 2: Break the circular import (`src/bytes.ts`)

**Files:**
- Create: `~/Code/barcstory/cris-formatb/src/bytes.ts`
- Modify: `src/index.ts`, `src/offsets.ts:1`, `src/record.ts:1`

**Interfaces:**
- Produces: `src/bytes.ts` exporting `LINE_BYTES`, `DATA_START`, `DATA_END`, `latin1` — imported by `offsets.ts`, `record.ts`, and re-exported by `index.ts`.

- [ ] **Step 1: Create `src/bytes.ts` with the primitives moved out of `index.ts`**

```ts
/** NARA's served form: 80 columns + CRLF. Registry: nara.conversion.line_form */
export const LINE_BYTES = 82;
export const DATA_START = 3;  // 0-based column of first data byte (column 4)
export const DATA_END = 72;   // exclusive, 0-based; columns 4..72 inclusive are bytes 3..71

/** Latin-1 as a reversible byte map; loop form avoids the stack-limited spread of
 * String.fromCharCode(...b) on a large array. Shared by offsets.ts and record.ts. */
export const latin1 = (b: Uint8Array): string => { let s = ""; for (const c of b) s += String.fromCharCode(c); return s; };
```

- [ ] **Step 2: Repoint `offsets.ts` and `record.ts` imports**

In `src/offsets.ts:1` change `from "./index"` → `from "./bytes"`.
In `src/record.ts:1` change `from "./index"` → `from "./bytes"`.

- [ ] **Step 3: Verify the cycle is gone**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`
Expected: exits 0. (Neither `offsets` nor `record` now imports from `index`.)

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: all pass (behavior unchanged; only import sources moved).

- [ ] **Step 5: Commit**

```bash
git add src/bytes.ts src/offsets.ts src/record.ts src/index.ts
git commit -m "refactor: move byte primitives to bytes.ts, break index cycle"
```
(`index.ts` is finalized in Task 3; if it still `export *`s here, that's fine — Task 3 replaces it.)

---

## Task 3: Explicit named barrel + public-API lock test

**Files:**
- Modify: `src/index.ts`
- Create: `test/public-api.test.ts`

**Interfaces:**
- Consumes: `./bytes` (Task 2), `./offsets`, `./record`, `./profiles`.
- Produces: `index.ts` re-exporting exactly the current public surface by name; a test asserting that surface + runtime shapes.

- [ ] **Step 1: Write the failing lock test**

```ts
// test/public-api.test.ts
import { test, expect } from "vitest";
import * as api from "../src/index";
import { scanRecords, parseRecord, field, fields } from "../src/index";

const EXPECTED_VALUE_EXPORTS = [
  "scanRecords", "parseRecord", "field", "fields",
  "lineToOffset", "offsetToLine", "LINE_BYTES", "DATA_START", "DATA_END",
  "latin1", "PROFILES", "PROFILE_NAMES",
].sort();

test("public value-export names are exactly the frozen set", () => {
  const actual = Object.keys(api).filter((k) => typeof (api as any)[k] !== "undefined").sort();
  expect(actual).toEqual(EXPECTED_VALUE_EXPORTS);
});

test("scanRecords returns arrays + plain structure (runtime representation)", () => {
  const bytes = new Uint8Array(82 * 0); // empty corpus
  const r = scanRecords(bytes, 1);
  expect(Array.isArray(r.spans)).toBe(true);
  expect(typeof r.badLines).toBe("number");
  expect(typeof r.structure).toBe("object");
});

test("parseRecord yields arrays and undefined (not null/wrapper) for absent fields", () => {
  // 82-byte record: "$$" separator then an "AN" line.
  const line = (s: string) => {
    const b = new Uint8Array(82).fill(0x20);
    for (let i = 0; i < s.length && i < 80; i++) b[i] = s.charCodeAt(i);
    b[80] = 0x0d; b[81] = 0x0a; return b;
  };
  const bytes = new Uint8Array([...line("$$"), ...line("AN 900")]);
  const { spans } = scanRecords(bytes, 1);
  const rec = parseRecord(bytes, spans[0]!, "t", "fy1991plus", 1);
  expect(Array.isArray(rec.fields)).toBe(true);
  expect(field(rec, "ZZ")).toBeUndefined();           // absent tag -> undefined, not null
  expect(Array.isArray(fields(rec, "AN"))).toBe(true);
  const v = rec.fields[0]!.values[0]!;
  expect(["string", "undefined"]).toContain(typeof v.code); // optional -> string|undefined
});
```

- [ ] **Step 2: Run it — it fails on the name set (still `export *`)**

Run: `pnpm exec vitest run test/public-api.test.ts`
Expected: FAIL — the first test reports extra/mismatched names from `export *` (or missing ones).

- [ ] **Step 3: Replace `export *` in `src/index.ts` with the explicit named barrel**

```ts
export { LINE_BYTES, DATA_START, DATA_END, latin1 } from "./bytes";
export { scanRecords, lineToOffset, offsetToLine } from "./offsets";
export type { RecordSpan, FileStructure, ScanResult } from "./offsets";
export { parseRecord, field, fields } from "./record";
export type { LogicalRecord, SourceField, SourceValue } from "./record";
export { PROFILES, PROFILE_NAMES } from "./profiles";
export type { Profile } from "./profiles";
```

- [ ] **Step 4: Run the lock test + full suite + typecheck**

Run:
```bash
pnpm exec vitest run test/public-api.test.ts
pnpm test
pnpm exec tsc -p tsconfig.json --noEmit
```
Expected: all PASS. (`cli.ts` still imports `PROFILE_NAMES` from the barrel — kept public, so it compiles.)

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/public-api.test.ts
git commit -m "feat: explicit named barrel + public-API lock test"
```

---

## Task 4: Move the Format B registry slice into the new repo

**Files:**
- Create: `~/Code/barcstory/cris-formatb/registry/formatb.json`, `test/registry.test.ts`

**Interfaces:**
- Produces: the two Format B registry keys (`formatb.record.separator`, `formatb.encoding.fy1988_sc_percent`) plus a consistency test, self-contained in the new repo. `dialog-file60` drops these in Task 7.

- [ ] **Step 1: Copy the two key entries out of `dialog-file60/registry/evidence.json`**

From `dialog-file60`, read the entries for `formatb.record.separator` (evidence.json:101) and `formatb.encoding.fy1988_sc_percent` (evidence.json:1542) and write them into `registry/formatb.json` as an object keyed by id. (Copy the exact fields verbatim — do not paraphrase the descriptions.)

- [ ] **Step 2: Write the consistency test**

```ts
// test/registry.test.ts
import { test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const reg = JSON.parse(readFileSync(new URL("../registry/formatb.json", import.meta.url), "utf8"));

test("every Format B registry key is cited in src/", () => {
  const srcBlob = readdirSync(new URL("../src", import.meta.url))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"))
    .join("\n");
  for (const key of Object.keys(reg)) {
    expect(srcBlob, `registry key ${key} must be cited in src/`).toContain(key);
  }
});
```

- [ ] **Step 3: Run it**

Run: `pnpm exec vitest run test/registry.test.ts`
Expected: PASS — both keys are cited in the package's source comments (`offsets.ts`, `profiles.ts`).

- [ ] **Step 4: Commit**

```bash
git add registry/formatb.json test/registry.test.ts
git commit -m "feat: self-contained Format B registry slice + consistency test"
```

---

## Task 5: Duplicate the fixtures `dialog-file60` reads, repoint paths

**Files:**
- Create in `dialog-file60`: `fixtures/fy88-9000001.bin`, `fixtures/fy94-9049442.bin` (copies)
- Modify in `dialog-file60`: the ~14 consumers listed below

**Interfaces:**
- Produces: `dialog-file60` tests read fixtures from its own `fixtures/` dir, so the package can later be removed without breaking them.

- [ ] **Step 1: Copy the fixtures into `dialog-file60`'s own dir**

```bash
cd ~/Code/barcstory/dialog-file60
cp packages/cris-formatb/fixtures/fy88-9000001.bin fixtures/fy88-9000001.bin
cp packages/cris-formatb/fixtures/fy94-9049442.bin fixtures/fy94-9049442.bin
```

- [ ] **Step 2: Record the checksum pin (drift guard)**

```bash
shasum -a 256 fixtures/fy88-9000001.bin fixtures/fy94-9049442.bin >> fixtures/SOURCES.md
```
Add a line in `fixtures/SOURCES.md`: "These `.bin` are duplicates of the cris-formatb repo's fixtures; the SHA-256s above must match that repo's copies."

- [ ] **Step 3: Find every hardcoded package-fixture path**

Run: `grep -rn "packages/cris-formatb/fixtures" test scripts`
Expected: the ~14 sites (tests under `test/evidence`, `test/archival`, `test/regression`, and `scripts/verify-remote.ts:28`).

- [ ] **Step 4: Repoint each path `packages/cris-formatb/fixtures/` → `fixtures/`**

For each file from Step 3, change the string literal prefix from `packages/cris-formatb/fixtures/` to `fixtures/`. (Same filenames; only the directory prefix changes.)

- [ ] **Step 5: Run the affected suites (package still present — proves the repoint, not the removal)**

Run: `pnpm test`
Expected: all pass reading the new `fixtures/` location.

- [ ] **Step 6: Commit**

```bash
git add fixtures/fy88-9000001.bin fixtures/fy94-9049442.bin fixtures/SOURCES.md test scripts/verify-remote.ts
git commit -m "refactor: read Format B fixtures from dialog-file60's own fixtures dir"
```

---

## Task 6: Stop scanning the package source tree; drop moved registry keys

**Files:**
- Modify in `dialog-file60`: `test/regression/registry.test.ts`, `test/regression/dom-boundary.test.ts`, `registry/evidence.json`

**Interfaces:**
- Produces: `dialog-file60`'s tests no longer require `packages/cris-formatb/src` to exist, and its registry no longer references the moved keys.

- [ ] **Step 1: Remove the package from `dom-boundary.test.ts`'s ROOTS**

In `test/regression/dom-boundary.test.ts:8`, remove `"packages/cris-formatb/src"` from the `ROOTS` array.

- [ ] **Step 2: Stop `registry.test.ts` scanning the package**

In `test/regression/registry.test.ts`, remove the `packages/cris-formatb/src` scan (lines ~114, ~154) and the `packages/` read in `packageSrcDirs()` (lines ~20-21). The forward + reverse checks now cover only `src/`.

- [ ] **Step 3: Drop the two moved keys from `registry/evidence.json`**

Remove the `formatb.record.separator` and `formatb.encoding.fy1988_sc_percent` entries (they now live in the new repo, Task 4).

- [ ] **Step 4: Run the registry + dom-boundary suites**

Run: `pnpm exec vitest run test/regression/registry.test.ts test/regression/dom-boundary.test.ts`
Expected: PASS — no orphan-key failure, no `ENOENT` on the package dir (package still present but no longer scanned).

- [ ] **Step 5: Commit**

```bash
git add test/regression/registry.test.ts test/regression/dom-boundary.test.ts registry/evidence.json
git commit -m "refactor: decouple dialog-file60 registry/src scans from the cris-formatb package"
```

---

## Task 7: Rewire the workspace and remove the package (single commit)

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json`, `vitest.config.ts`, `test/regression/package-scripts.test.ts`
- Docs: `docs/development.md`, `fixtures/ACCEPTANCE.md`, `scripts/extract-corpus.py`, `scripts/naive-split.py`
- Remove: `packages/cris-formatb/`

**Interfaces:**
- Consumes: the sibling repo from Task 1 (must exist + be installable).
- Produces: `dialog-file60` consuming `@barcstory/cris-formatb` from `../cris-formatb`, imports unchanged.

- [ ] **Step 1: Point the workspace at the sibling (preserve `allowBuilds`)**

In `pnpm-workspace.yaml`, change only the packages line — `packages: ["packages/*"]` → `packages: ["../cris-formatb"]`. Leave the `allowBuilds:` block intact.

- [ ] **Step 2: Drop the package half of the `typecheck` script**

In `package.json`, `scripts.typecheck`: `"tsc -p tsconfig.json --noEmit && tsc -p packages/cris-formatb/tsconfig.json --noEmit"` → `"tsc -p tsconfig.json --noEmit"`.

- [ ] **Step 3: Update `vitest.config.ts`**

`projects: ["packages/*", "."]` → `projects: ["."]`; delete the now-dead `exclude: ["packages/**"]` entry and update the comment that describes the package as a second project.

- [ ] **Step 4: Update the package-scripts regression test**

In `test/regression/package-scripts.test.ts`: change the asserted `typecheck` string (lines 9-11) to `"tsc -p tsconfig.json --noEmit"`, and fix the stale test title (line 7) to drop "and packages/cris-formatb".

- [ ] **Step 5: Sweep the docs**

Update the stale references: `docs/development.md:152,159,164-165`, `fixtures/ACCEPTANCE.md:104`, `scripts/extract-corpus.py:11`, `scripts/naive-split.py:5` — each describes the package as living under `packages/`; reword to point at the sibling repo.

- [ ] **Step 6: Remove the package and relink**

```bash
git rm -r packages/cris-formatb
pnpm install
```
Expected: install relinks `@barcstory/cris-formatb` from `../cris-formatb` (symlink into `node_modules/@barcstory/`).

- [ ] **Step 7: Verify imports are untouched**

Run: `grep -rn "@barcstory/cris-formatb" src test | wc -l`
Expected: the same count as before extraction (~19) — no import string changed.

- [ ] **Step 8: Commit the whole cutover as one commit**

```bash
git add -A
git commit -m "refactor: consume cris-formatb from sibling repo via workspace; remove in-tree package"
```

---

## Task 8: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: New repo green**

```bash
cd ~/Code/barcstory/cris-formatb
pnpm install && pnpm test && pnpm exec tsc -p tsconfig.json --noEmit
```
Expected: all pass.

- [ ] **Step 2: `dialog-file60` green with imports frozen**

```bash
cd ~/Code/barcstory/dialog-file60
pnpm install && pnpm test && pnpm typecheck
```
Expected: all pass; no `@barcstory/cris-formatb` import string changed (confirmed Task 7 Step 7).

- [ ] **Step 3: Confirm history preserved in the new repo**

Run: `cd ~/Code/barcstory/cris-formatb && git log --oneline | wc -l`
Expected: more than one commit (the carried package history, plus the Task 2-4 commits).

---

## Self-review notes

- **Spec coverage:** Phase 1 sections A-D map to Tasks 1 (A) / 2-4 (B) / 5-7 (C) / 8 (D). The four decisions (conservative surface → Task 3; duplicate fixtures → Task 5; registry slice moves → Tasks 4+6; spike-gated → Phase 2 excluded) are each realized. PAR's non-obvious couplings (base tsconfig → Task 1 Step 4; `vite/client` → Task 1 Step 4; `verify-remote.ts:28` → Task 5; src-tree scans → Task 6; `cli.ts`/`PROFILE_NAMES` → kept public in Task 3) are covered.
- **Phase 2 excluded by design** — the Gleam rewrite is gated on a post-Phase-1 go/no-go.
- **Type consistency:** the barrel names in Task 3 match the consumer list in the spec and `cli.ts`'s `PROFILE_NAMES` import.
