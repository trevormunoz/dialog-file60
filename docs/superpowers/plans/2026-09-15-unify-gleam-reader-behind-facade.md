# Unify the Mature Gleam Reader Behind the cris-formatb Facade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the File 60 emulator (`dialog-file60`) run on the mature Gleam Format B reader behind the unchanged `@barcstory/cris-formatb` public surface, with byte-identical output, while the validator (`construct`) stays a separate analytical tool.

**Architecture:** One Gleam project becomes `packages/cris-formatb`'s home. A thin reader layer (`scan`/`assembly`/`field_value`/`segment`/`latin1`/`facade`/`javascript`, over shared `source_record` types) is bundled to a single JS artifact behind the frozen TypeScript surface; the validator (`construct`/`record_model`/…) sits on the same reader but is never bundled. Strict byte-parity against the current TS reader (kept as the oracle) is the gate at every step.

**Tech Stack:** Gleam 1.18+ (JavaScript target) + gleeunit; `gleam_javascript` (`array.from_list`); esbuild (bundling); TypeScript 5.6, vitest 3, pnpm 11 workspace, vite 6.

**Design spec:** `docs/superpowers/specs/2026-09-15-unify-gleam-reader-behind-facade-design.md` (read it first).

## Global Constraints

- **Frozen public surface — never changes.** `@barcstory/cris-formatb`'s exports stay exactly: values `scanRecords`, `parseRecord`, `field`, `fields`, `lineToOffset`, `offsetToLine`, `LINE_BYTES`, `DATA_START`, `DATA_END`, `latin1`, `PROFILES`, `PROFILE_NAMES`; types `LogicalRecord`, `SourceField`, `SourceValue`, `RecordSpan`, `ScanResult`, `FileStructure`, `Profile`. Zero changes to any import string in `dialog-file60` (19 import sites).
- **Strict byte-parity, corrections deferred.** The Gleam facade output must equal the current TS reader's output byte-for-byte over the full corpus + real data, INCLUDING its known quirks. Do NOT adopt the mature reader's corrections (the `0xAC` single-value fix etc.) on the facade path.
- **Validator behavior preserved.** The 162-test Gleam validator suite (`gleam test`) stays green throughout; the `segment` extraction is behavior-preserving, not a rewrite.
- **Reader-only bundle.** The shipped `dist/engine.mjs` must contain no validator symbols (`construct`/`Project`/`Classifications`) and no Node deps (`simplifile`/`argv`/`fs`).
- **Never published.** `packages/cris-formatb/package.json` gains `"private": true` + `"prepublishOnly": "exit 1"`; `rules/` is SOURCE RESTRICTED and must never be exported.
- **Commit discipline.** Commit at each step's end. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk`.
- **Gates:** `gleam test`, `gleam check`, `gleam format --check src test` (run from the package's Gleam root); `pnpm exec vitest run` (from repo root); `pnpm exec tsc --noEmit`.

## File Structure

The move lands the Gleam project at the package root; the TS reader/oracle relocates to `src-ts/`.

- `packages/cris-formatb/gleam.toml`, `manifest.toml` — Gleam project (renamed from `formatb_reading`).
- `packages/cris-formatb/src/*.gleam` — reader + validator (moved from `docs/formatb-reading/src/`), plus new: `source_record.gleam`, `segment.gleam`, `latin1.gleam`, `js_string.gleam`, `facade.gleam`, `javascript.gleam`.
- `packages/cris-formatb/src-ts/*.ts` — `index.ts` (frozen surface → delegates to bundle), `record.ts`/`offsets.ts`/`bytes.ts`/`profiles.ts` (parity oracle, test-only), `cli.ts`, plus a new `wrapper.ts` (marshals the bundle to the frozen interfaces).
- `packages/cris-formatb/test/*.gleam` — Gleam tests (moved) + new `facade_test.gleam`.
- `packages/cris-formatb/test/*.test.ts` — `public-api.test.ts` (moved), new `parity.test.ts`, new `bundle-boundary.test.ts`.
- `packages/cris-formatb/rules/`, `plans/` — evidence (moved; restricted).
- `packages/cris-formatb/dist/engine.mjs` + `.d.mts` — build output.
- `docs/formatb-reading/README.md` — replaced by a one-line pointer.

Reader dependency direction: `card_image` → `scan` → `assembly` → `field_value` → `segment`/`latin1`/`js_string`, all over `source_record` types; `facade` → those; `javascript` → `facade`. Validator (`construct`/`record_model`) → reader, never the reverse, never bundled.

---

## Phase 1 — Move the project in (reorg, then green)

### Task 1: Relocate the TS reader/oracle to `src-ts/`

**Files:**
- Move: `packages/cris-formatb/src/{index,record,offsets,bytes,profiles,cli}.ts` → `packages/cris-formatb/src-ts/`
- Modify: `packages/cris-formatb/package.json` (`main`/`types`/`bin` paths), `packages/cris-formatb/tsconfig.json` (include path), `packages/cris-formatb/vitest.config.ts`, and any `dialog-file60` test that reads these by path.

**Interfaces:**
- Produces: the TS reader at `src-ts/`, still the runtime path FOR NOW (bundle not built yet), imports within it unchanged (relative).

- [ ] **Step 1: Move the files with history preserved**

```bash
cd packages/cris-formatb
mkdir -p src-ts
git mv src/index.ts src/record.ts src/offsets.ts src/bytes.ts src/profiles.ts src/cli.ts src-ts/
```

- [ ] **Step 2: Repoint package.json**

Edit `packages/cris-formatb/package.json`: `"main": "src-ts/index.ts"`, `"types": "src-ts/index.ts"`, `"bin": { "cris-formatb": "src-ts/cli.ts" }`.

- [ ] **Step 3: Fix any path references**

Run: `rg -n "packages/cris-formatb/src/" .. --glob '!node_modules'`
For each hit (e.g. `dom-boundary.test.ts`, `registry.test.ts` `readdirSync`), update `src/` → `src-ts/`. Update `packages/cris-formatb/vitest.config.ts` and `tsconfig.json` include globs likewise.

- [ ] **Step 4: Verify the app still builds and tests**

Run: `cd .. && pnpm install && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: PASS (same test count as before the move; no import-string changes in app code).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(cris-formatb): relocate TS reader to src-ts/ ahead of Gleam move

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 2: Move the Gleam project into the package

**Files:**
- Move: `docs/formatb-reading/{gleam.toml,manifest.toml,src/,test/,rules/,plans/,.gitignore}` → `packages/cris-formatb/`
- Modify: `packages/cris-formatb/gleam.toml` (project `name`), `docs/formatb-reading/README.md` (→ pointer).

**Interfaces:**
- Produces: a runnable Gleam project rooted at `packages/cris-formatb/` (`gleam.toml` at package root, `src/*.gleam`, `test/*_test.gleam`).

- [ ] **Step 1: Move Gleam files with history**

```bash
cd packages/cris-formatb
git mv ../../docs/formatb-reading/gleam.toml ../../docs/formatb-reading/manifest.toml .
git mv ../../docs/formatb-reading/src/*.gleam src/          # merges alongside src-ts/
git mv ../../docs/formatb-reading/test/*.gleam test/
git mv ../../docs/formatb-reading/rules ../../docs/formatb-reading/plans .
```

- [ ] **Step 2: Rename the Gleam project**

Edit `packages/cris-formatb/gleam.toml`: change `name = "formatb_reading"` → `name = "cris_formatb"`. Then rename the gleeunit entrypoint to match the new project name so `gleam test` discovers it: `git mv test/formatb_reading_test.gleam test/cris_formatb_test.gleam` (its `pub fn main() { gleeunit.main() }` runs all `*_test.gleam` modules regardless; the filename must match `<project>_test`). Grep for any other reference to the old project name: `rg -n "formatb_reading" .` and update as needed.

- [ ] **Step 3: Fix the fixture path in Gleam tests**

The moved Gleam tests read `../../packages/cris-formatb/fixtures/fy94-9049442.bin` (relative to the OLD location). Now the fixtures are at the package root.
Run: `rg -n "packages/cris-formatb/fixtures|\\.\\./\\.\\." test/*.gleam`
Change those literals to `fixtures/fy94-9049442.bin` (relative to the package root where `gleam test` runs). Also fix any `registry/evidence.json` path in docstrings (now repo-root-relative from a deeper dir — note the repo-root path in a comment; not runtime-critical).

- [ ] **Step 4: Replace docs/formatb-reading with a pointer**

Overwrite `docs/formatb-reading/README.md` with:
```markdown
# Format B reading — moved

This Gleam project now lives at `packages/cris-formatb/` (the Format B module:
shipped reader behind the TS facade + the analytical validator + `rules/`).
See `docs/superpowers/specs/2026-09-15-unify-gleam-reader-behind-facade-design.md`.
```
Remove the now-empty `docs/formatb-reading/src`, `test`, etc. if `git mv` left empty dirs.

- [ ] **Step 5: Verify the Gleam suite green in its new home**

Run: `cd packages/cris-formatb && gleam test && gleam check && gleam format --check src test`
Expected: 162 passed; check clean (one expected `LoadedRecord` unused-constructor warning); format clean.

- [ ] **Step 6: Verify history survived**

Run: `git log --follow --oneline src/construct.gleam | head`
Expected: the prior formatb-reading commits appear.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(cris-formatb): move the Gleam Format B project into the package

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

---

## Phase 2 — The validator boundary move (§3)

### Task 3: Extract the structural split primitives into `segment.gleam`

**Files:**
- Create: `packages/cris-formatb/src/segment.gleam`
- Modify: `packages/cris-formatb/src/construct.gleam` (remove the two private fns; import from `segment`)

**Interfaces:**
- Produces: `pub fn segment.segments_on_0x02(bytes: BitArray) -> List(BitArray)` and `pub fn segment.drop_trailing_0xa0(segment: BitArray) -> Result(BitArray, Nil)` — moved verbatim from `construct.gleam:1865-1902`.
- Consumes: nothing new.

- [ ] **Step 1: Read the current private definitions**

Read `construct.gleam` around lines 1865–1902 (`segments_on_0x02`, `drop_trailing_0xa0`). Copy their bodies verbatim.

- [ ] **Step 2: Create `segment.gleam` with the moved functions**

```gleam
//// segment: structural byte-splitting for the classification-heading values
//// (SC/PH/GH), shared by the validator (`construct`) and the facade. This module
//// is structure only — it splits bytes and never judges shape (that stays in
//// `construct`). See rules/field-rule-inventory.md batch 3.

// (paste the exact bodies of segments_on_0x02 and drop_trailing_0xa0 here,
//  changing `fn` to `pub fn`; keep their helper imports.)
```

- [ ] **Step 3: Point `construct` at `segment`**

In `construct.gleam`: delete the two private fns; add `import segment`; replace call sites `segments_on_0x02(` → `segment.segments_on_0x02(` and `drop_trailing_0xa0(` → `segment.drop_trailing_0xa0(`.

- [ ] **Step 4: Verify the validator suite is unchanged (the regression gate)**

Run: `gleam test && gleam check && gleam format --check src test`
Expected: 162 passed (byte-for-byte the same behavior); check + format clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(cris-formatb): extract 0x02 split primitives into segment.gleam

Behavior-preserving; validator suite unchanged (162 passed).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 4: Add the facade-parity `split_heading_segments`

Port `record.ts`'s `splitSegments` (`src-ts/record.ts:19-30`): `indexOf` the two-byte `0xA0 0x02` at the FIRST occurrence; if absent, all of `code`/`label`/`percent` are absent; the piece before is `code`, after is `label`; when the profile's `percent_in_block` is set (FY88), split the tail again at the next `0xA0 0x02` to pull `percent`. It returns the **untrimmed** pieces (pure structure — no `js_string` dependency, so ordering is clean); the facade applies the per-field trim in Task 9 (`code`/`label` `trim_end`, `percent` `trim`), matching `record.ts`'s split-then-trim order. Operates on the already-decoded string.

**Files:**
- Modify: `packages/cris-formatb/src/segment.gleam`
- Test: `packages/cris-formatb/test/segment_test.gleam`

**Interfaces:**
- Consumes: nothing new (takes an already-decoded `String`; trimming is the caller's concern).
- Produces:
  ```gleam
  pub type HeadingParts { HeadingParts(code: Option(String), label: Option(String), percent: Option(String)) }
  pub fn split_heading_segments(raw: String, percent_in_block: Bool) -> HeadingParts
  ```

- [ ] **Step 1: Write the failing test (oracle-grounded, from real fixture values)**

Use the FY94 fixture value `XFRS  <sep>Forestry Related` shape and an FY88 3-part value. Expected values are what `record.ts` produces (compute once by reading `record.ts:19-30`).

```gleam
import gleeunit/should
import segment.{HeadingParts}
import gleam/option.{None, Some}

// FY1991+ (percent_in_block = False): everything after the first separator is the
// label; no percent is pulled even if a second separator exists.
pub fn split_fy91_two_part_keeps_tail_in_label_test() {
  // "\u{00A0}\u{0002}" is the decoded 0xA0 0x02 separator.
  segment.split_heading_segments("XFRS\u{00A0}\u{0002}Forestry Related", False)
  |> should.equal(HeadingParts(Some("XFRS"), Some("Forestry Related"), None))
}

// FY1988 (percent_in_block = True): a three-part value yields a percent.
pub fn split_fy88_three_part_pulls_percent_test() {
  segment.split_heading_segments(
    "C0600\u{00A0}\u{0002}Apples\u{00A0}\u{0002}100%",
    True,
  )
  |> should.equal(HeadingParts(Some("C0600"), Some("Apples"), Some("100%")))
}

// No separator: raw passes through as neither code/label/percent.
pub fn split_no_separator_is_all_none_test() {
  segment.split_heading_segments("A4300", True)
  |> should.equal(HeadingParts(None, None, None))
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `gleam test`
Expected: FAIL — `split_heading_segments` / `HeadingParts` unknown.

- [ ] **Step 3: Implement `split_heading_segments`**

```gleam
import gleam/string
import gleam/option.{type Option, None, Some}

const sep = "\u{00A0}\u{0002}"

pub type HeadingParts {
  HeadingParts(code: Option(String), label: Option(String), percent: Option(String))
}

// Untrimmed pieces; the facade trims per field (Task 9). No js_string dependency.
pub fn split_heading_segments(raw: String, percent_in_block: Bool) -> HeadingParts {
  case string.split_once(raw, sep) {
    Error(Nil) -> HeadingParts(None, None, None)
    Ok(#(code, rest)) ->
      case percent_in_block {
        False -> HeadingParts(Some(code), Some(rest), None)
        True ->
          case string.split_once(rest, sep) {
            Error(Nil) -> HeadingParts(Some(code), Some(rest), None)
            Ok(#(label, percent)) ->
              HeadingParts(Some(code), Some(label), Some(percent))
          }
      }
  }
}
```
NOTE: verify this matches `record.ts:19-30` exactly (first-occurrence split; the trim happens facade-side, in the same split-then-trim order). The `parity.test.ts` harness (Task 11) is the final arbiter over the full corpus; if it disagrees, `record.ts` wins — adjust here.

- [ ] **Step 4: Run to verify it passes**

Run: `gleam test`
Expected: PASS (segment tests green; 162 validator tests still green).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): add facade-parity split_heading_segments (splitSegments port)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

---

## Phase 3 — The reader emits the frozen contract (§2/§4)

### Task 5: `latin1.gleam` — the shared total decode; `render` becomes a caller

**Files:**
- Create: `packages/cris-formatb/src/latin1.gleam`
- Modify: `packages/cris-formatb/src/record_model.gleam` (`render` delegates to `latin1.decode`)
- Test: `packages/cris-formatb/test/latin1_test.gleam`

**Interfaces:**
- Produces: `pub fn latin1.decode(bytes: BitArray) -> String` — total ISO-8859-1 (byte 0..255 → codepoint 0..255), non-dropping.

- [ ] **Step 1: Write the failing test (all-256 totality + known bytes)**

```gleam
import gleeunit/should
import latin1

pub fn decode_ascii_test() {
  latin1.decode(<<"AB":utf8>>) |> should.equal("AB")
}

pub fn decode_high_byte_a3_is_pound_test() {
  latin1.decode(<<0xA3>>) |> should.equal("\u{00A3}")
}

pub fn decode_is_total_over_all_256_bytes_test() {
  // Every byte 0..255 decodes to exactly one codepoint; length 256, no drops.
  let all = list_range_bytes(0, 255)
  latin1.decode(all) |> string_length |> should.equal(256)
}
```
(Provide `list_range_bytes` and `string_length` as tiny local helpers, or inline with `gleam/string.length` and a recursive `BitArray` builder.)

- [ ] **Step 2: Run to verify it fails**

Run: `gleam test` → FAIL (`latin1` unknown).

- [ ] **Step 3: Implement `latin1.decode` (move the mapping out of `render`)**

Copy `bit_array_to_latin1_codepoints` from `record_model.gleam:93-101` into `latin1.gleam`:
```gleam
import gleam/string

pub fn decode(bytes: BitArray) -> String {
  bytes |> to_codepoints |> string.from_utf_codepoints
}

fn to_codepoints(bytes: BitArray) -> List(UtfCodepoint) {
  case bytes {
    <<>> -> []
    <<byte, rest:bits>> -> {
      let assert Ok(cp) = string.utf_codepoint(byte)
      [cp, ..to_codepoints(rest)]
    }
    _ -> []
  }
}
```

- [ ] **Step 4: Make `render` call `latin1.decode`**

In `record_model.gleam`: replace `render`'s body with `latin1.decode(bytes)`; delete the now-duplicate `bit_array_to_latin1_codepoints`; `import latin1`. Keep `render`'s docstring/disclaimer.

- [ ] **Step 5: Run to verify green**

Run: `gleam test && gleam format --check src test`
Expected: latin1 tests PASS; the existing `render_*` tests in `record_model_test.gleam` still PASS (behavior identical); 162+ green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(cris-formatb): unify Latin-1 decode in latin1.gleam; render delegates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 6: `js_string.gleam` — the JS-whitespace trims

Port JS `.trim()`/`.trimEnd()` over the JS-whitespace set reachable in Latin-1 (codepoints ≤ U+00FF): space, tab, LF, CR, VT, FF, and U+00A0 (NBSP) — but NOT U+0085 (NEL). Match `record.ts`'s `js_trim`/`js_trim_end` (spike `gleam_scan.gleam:131-156` is a reference port).

**Files:**
- Create: `packages/cris-formatb/src/js_string.gleam`
- Test: `packages/cris-formatb/test/js_string_test.gleam`

**Interfaces:**
- Produces: `pub fn js_string.trim(s: String) -> String`, `pub fn js_string.trim_end(s: String) -> String`.

- [ ] **Step 1: Write the failing test (the NBSP/NEL hazard + both/trailing distinction)**

```gleam
import gleeunit/should
import js_string

pub fn trim_end_strips_trailing_nbsp_not_leading_space_test() {
  js_string.trim_end(" A\u{00A0}") |> should.equal(" A")
}

pub fn trim_strips_both_ends_test() {
  js_string.trim("  100%  ") |> should.equal("100%")
}

pub fn trim_keeps_nel_u0085_test() {
  // JS .trim() does NOT strip U+0085 (NEL); we must match JS, not Gleam stdlib.
  js_string.trim("\u{0085}X\u{0085}") |> should.equal("\u{0085}X\u{0085}")
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `gleam test` → FAIL (`js_string` unknown).

- [ ] **Step 3: Implement `trim`/`trim_end`**

```gleam
import gleam/string

fn is_js_ws(cp: String) -> Bool {
  case cp {
    " " | "\t" | "\n" | "\r" | "\u{000B}" | "\u{000C}" | "\u{00A0}" -> True
    _ -> False
  }
}

pub fn trim_end(s: String) -> String {
  s |> string.to_graphemes |> drop_trailing |> string.join("")
}

pub fn trim(s: String) -> String {
  s |> trim_start |> trim_end
}

fn trim_start(s: String) -> String {
  case string.pop_grapheme(s) {
    Ok(#(g, rest)) -> case is_js_ws(g) { True -> trim_start(rest) False -> s }
    Error(Nil) -> s
  }
}

fn drop_trailing(gs: List(String)) -> List(String) {
  gs |> list.reverse |> drop_leading_ws |> list.reverse
}
fn drop_leading_ws(gs: List(String)) -> List(String) {
  case gs { [g, ..rest] -> case is_js_ws(g) { True -> drop_leading_ws(rest) False -> gs } [] -> [] }
}
```
(Add `import gleam/list`. This is a functional sketch; the `parity.test.ts` harness confirms exact match to `record.ts` over the corpus.)

- [ ] **Step 4: Run to verify green** — `gleam test` PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): js_string trims matching JS .trim()/.trimEnd() whitespace set

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 7: `source_record.gleam` — relocate shared structural types (incl. `NonEmpty`)

**Files:**
- Create: `packages/cris-formatb/src/source_record.gleam`
- Modify: `packages/cris-formatb/src/record_model.gleam` (remove moved types; re-import from `source_record`), and every reader/validator module importing them.

**Interfaces:**
- Produces (moved verbatim): `Location`, `Witness`, `Fragment`, `RecordPart`, `FieldOccurrence`, `SuppliedRecord`, `NonEmpty`, plus any other type the import audit finds.

- [ ] **Step 1: Import audit — enumerate what the reader pulls from record_model**

Run: `rg -n "import record_model" src/*.gleam`
For each reader module (`card_image`, `scan`, `assembly`, `field_value`, `segment`, `latin1`, `js_string`, and the coming `facade`/`javascript`), list the exact symbols imported from `record_model`. Confirm the set is: `Location`, `Witness`, `Fragment`, `RecordPart`, `FieldOccurrence`, `SuppliedRecord`, `NonEmpty` (from `record_model.gleam:14,19-62`). Add any extra found.

- [ ] **Step 2: Create `source_record.gleam` with the moved type definitions**

Move (cut) those `pub type` definitions from `record_model.gleam` into `source_record.gleam` verbatim.

- [ ] **Step 3: Re-wire imports**

`record_model.gleam` and every reader module now `import source_record.{...}` for the moved types. `record_model` re-exports nothing it no longer owns; validators reference `source_record.Location` etc.

- [ ] **Step 4: Verify green (behavior-preserving type move)**

Run: `gleam build && gleam test && gleam format --check src test`
Expected: compiles; 162+ tests PASS; format clean.

- [ ] **Step 5: Confirm the reader no longer imports `record_model`**

Run: `rg -n "import record_model" src/{card_image,scan,assembly,field_value,segment,latin1,js_string}.gleam`
Expected: NO matches (reader modules import only `source_record`, not the validator's home).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(cris-formatb): move shared structural types (incl. NonEmpty) to source_record

Reader modules no longer import record_model (the validator's home), so the
facade bundle can be reader-only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 8: `scan` — structural AN read

`offsets.ts` computes each record's `an` from the AN-tagged line (bytes `3..80`, trimmed). The Gleam `scan` currently emits `ScannedRecord{base, bytes}` without AN. Add a structural AN extraction (absence modeled as `None`; the facade maps `None` → `""`).

**Files:**
- Modify: `packages/cris-formatb/src/scan.gleam`
- Test: `packages/cris-formatb/test/scan_test.gleam` (existing; add a case)

**Interfaces:**
- Produces: `pub fn scan.accession_of(record: ScannedRecord) -> Option(String)` — the AN field's bytes `3..80`, `latin1.decode` + `js_string.trim_end`, or `None` if no AN line.

- [ ] **Step 1: Write the failing test (from a fixture with a known AN)**

The FY94 fixture record is accession `9049442`.
```gleam
pub fn accession_of_reads_the_an_line_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let assert Ok(result) = scan.scan(bytes, "RG164.CRIS.FY94.txt", 1)
  let assert [record, ..] = result.records
  scan.accession_of(record) |> should.equal(Some("9049442"))
}
```

- [ ] **Step 2: Run to verify it fails** — `gleam test` → FAIL (`accession_of` unknown).

- [ ] **Step 3: Implement `accession_of`**

Walk the record's 82-byte lines; find the line whose tag (bytes `0..2`) is `"AN"`; slice bytes `3..80`; `latin1.decode` + `js_string.trim_end`; return `Some`. No AN line → `None`. (Mirror `offsets.ts`'s AN slice exactly — `3..80`, NOT the `3..72` data region.)

- [ ] **Step 4: Run to verify green** — `gleam test` PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): structural AN read in scan (bytes 3..80), for the facade

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 9: `facade.gleam` — the `LogicalRecord`/`SourceField`/`SourceValue` projection

Native Gleam types mirroring the frozen contract, plus `parse_record` and `scan_records` building them from the reader. Field-by-field mapping is in the spec §2 table. `values[]` uses `field_value.field_values` (parity seam); `code/label/percent` uses `segment.split_heading_segments(latin1.decode(raw), percent_in_block)`; `raw` uses `latin1.decode` + `js_string.trim_end`; `continuation` = `MarkedValueStart`; per-record geometry from `Witness.location` (+ derived `last_line`); `an` from `scan.accession_of` (→ `""`); `orphan_continuations` = count of `Unassigned`.

**Files:**
- Create: `packages/cris-formatb/src/facade.gleam`
- Test: `packages/cris-formatb/test/facade_test.gleam`

**Interfaces:**
- Produces:
  ```gleam
  pub type Profile { Fy1988 Fy1991plus }
  pub type SourceValue { SourceValue(raw: String, code: Option(String), label: Option(String), percent: Option(String), line: Int, offset: Int, continuation: Bool) }
  pub type SourceField { SourceField(tag: String, values: List(SourceValue), line_start: Int, line_end: Int, offset: Int, length: Int) }
  pub type LogicalRecord { LogicalRecord(file: String, first_line: Int, last_line: Int, offset: Int, length: Int, an: String, fields: List(SourceField), orphan_continuations: Int) }
  pub type RecordSpan { RecordSpan(first_line: Int, last_line: Int, offset: Int, length: Int, an: String) }
  pub type FileStructure { FileStructure(header: Option(String), trailer: Option(String)) }
  pub type ScanResult { ScanResult(spans: List(RecordSpan), structure: FileStructure, bad_lines: Int) }
  pub fn scan_records(bytes: BitArray, base_line: Int) -> ScanResult
  pub fn parse_record(bytes: BitArray, span: RecordSpan, file: String, profile: Profile, buffer_base_line: Int) -> LogicalRecord
  ```
- Consumes: `scan`, `assembly`, `field_value`, `segment`, `latin1`, `js_string`, `source_record`.

- [ ] **Step 1: Write the failing test (oracle-independent, from the known fixture record)**

The FY94 fixture (`fy94-9049442.bin`) has AN `9049442`; the `AC` field has four values `A4900/A5000/A4900/A4900` (`field_value_test.gleam:140-161` confirms). Assert the projected `LogicalRecord`:
```gleam
pub fn parse_record_projects_the_fixture_record_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let scanned = facade.scan_records(bytes, 1)   // -> facade.ScanResult
  let assert [span, ..] = scanned.spans
  span.an |> should.equal("9049442")
  let rec = facade.parse_record(bytes, span, "RG164.CRIS.FY94.txt", facade.Fy1991plus, 1)
  rec.an |> should.equal("9049442")
  let assert Ok(ac) = find_field(rec.fields, "AC")
  ac.values |> list.map(fn(v) { v.raw }) |> should.equal(["A4900", "A5000", "A4900", "A4900"])
  // AC values are plain codes: no separator, so code/label/percent are None.
  let assert [first, ..] = ac.values
  first.code |> should.equal(None)
}
```

- [ ] **Step 2: Run to verify it fails** — `gleam test` → FAIL (facade unknown).

- [ ] **Step 3: Implement `facade.gleam`**

Build the projection per the §2 table. Key rules to honor:
- `values` = `field_value.field_values(occ)` decoded; each value's `raw` = `js_string.trim_end(latin1.decode(bytes))`; `code/label/percent` = `segment.split_heading_segments(latin1.decode(bytes), profile == Fy1988)`, then **trim each piece per field** — `code`/`label` via `js_string.trim_end`, `percent` via `js_string.trim` (segment returns untrimmed pieces; the facade owns the trim, using `js_string` from Task 6).
- `continuation` = the value's leading fragment is `MarkedValueStart`.
- `line`/`offset` = leading fragment's `Location.first_line`/`byte_offset`.
- record geometry from the record's overall `Witness.location`; `last_line = first_line + byte_length / 82 - 1`.
- `an` = `option.unwrap(scan.accession_of(record), "")`.
- `orphan_continuations` = count of `RecordPart.Unassigned`.

- [ ] **Step 4: Run to verify green** — `gleam test` PASS (facade + all prior).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): facade.gleam projects reader output to the frozen contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 10: `javascript.gleam` — the JS marshalling boundary + `gleam_javascript` dep

**Files:**
- Modify: `packages/cris-formatb/gleam.toml` (add `gleam_javascript`)
- Create: `packages/cris-formatb/src/javascript.gleam`

**Interfaces:**
- Produces: `pub fn scan_records(...)` / `pub fn parse_record(...)` returning types whose `List`s are converted to JS arrays via `gleam/javascript/array.from_list`, so the generated `.d.mts` exposes arrays. Field/record accessors reached from TS via the `$`-API.

- [ ] **Step 1: Add the dependency**

Edit `gleam.toml` `[dependencies]`: add `gleam_javascript = ">= 0.8.0 and < 2.0.0"`. Run `gleam deps download`.

- [ ] **Step 2: Enable TS declarations**

Edit `gleam.toml`: under `[javascript]`, set `typescript_declarations = true`.

- [ ] **Step 3: Implement `javascript.gleam`**

Wrap `facade.scan_records`/`parse_record`, converting nested `List(_)` to arrays with `array.from_list` (spans, fields, values). Keep it thin — no logic, only List→Array.

- [ ] **Step 4: Build to verify JS + declarations emit**

Run: `gleam build --target javascript`
Expected: compiles; `build/dev/javascript/cris_formatb/javascript.mjs` and `.d.mts` exist. `rg -c "from_list" src/javascript.gleam` > 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): javascript.gleam JS boundary + gleam_javascript, ts declarations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 11: The strict byte-parity harness (the central gate)

Compare the Gleam facade output against the TS oracle over the fixtures + full corpus, for `scanRecords` and `parseRecord`, both profiles. Expected = the oracle; assert deep equality.

**Files:**
- Create: `packages/cris-formatb/test/parity.test.ts`

**Interfaces:**
- Consumes: the built Gleam bundle (or the compiled `.mjs` via the wrapper) and the TS oracle in `src-ts/{record,offsets}.ts`.

- [ ] **Step 1: Write the failing parity test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// TS oracle (test-only):
import { scanRecords as tsScan } from "../src-ts/offsets";
import { parseRecord as tsParse } from "../src-ts/record";
// Gleam facade under test (compiled bundle via wrapper):
import { scanRecords as gScan, parseRecord as gParse } from "../src-ts/wrapper";

const fixtures = ["fixtures/fy88-9000001.bin", "fixtures/fy94-9049442.bin"];
// Full corpus (gitignored; skip when absent):
const corpus = ["../../data/RG310.CRIS.FY88.txt", "../../data/RG164.CRIS.FY94.txt"];

function profileFor(p: string) { return p.includes("FY88") ? "fy1988" : "fy1991plus"; }

describe("strict byte-parity: Gleam facade == TS oracle", () => {
  for (const f of fixtures) {
    it(`scanRecords parity: ${f}`, () => {
      const bytes = new Uint8Array(readFileSync(f));
      expect(JSON.stringify(gScan(bytes))).toBe(JSON.stringify(tsScan(bytes)));
    });
    it(`parseRecord parity (both profiles): ${f}`, () => {
      const bytes = new Uint8Array(readFileSync(f));
      const { spans } = tsScan(bytes);
      for (const p of ["fy1988", "fy1991plus"] as const) {
        for (const span of spans) {
          const ts = tsParse(bytes, span, f, p, 1);
          const g = gParse(bytes, span, f, p, 1);
          expect(JSON.stringify(g)).toBe(JSON.stringify(ts));
        }
      }
    });
  }
});
```
(Add a corpus loop that reads whole `.txt` files, scans, and compares every record; guard with `existsSync` so a clean checkout without `data/` still passes on fixtures.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/cris-formatb/test/parity.test.ts`
Expected: FAIL — `src-ts/wrapper` not present yet, or mismatches surfaced. Each mismatch names the exact record/field → fix in `facade`/`segment`/`js_string`/`latin1` until parity holds. `record.ts` always wins.

- [ ] **Step 3: Provide the thin `wrapper.ts` over the compiled Gleam**

Create `src-ts/wrapper.ts` marshalling the Gleam `$`-API to the frozen `scanRecords`/`parseRecord` interfaces (model on `docs/gleam-spike/facade.ts`). It imports the compiled `.mjs` (pre-bundle: from `build/dev/javascript/...`; post-bundle Task 13 repoints to `../dist/engine.mjs`).

- [ ] **Step 4: Iterate to green over fixtures + corpus**

Run: `pnpm exec vitest run packages/cris-formatb/test/parity.test.ts`
Expected: PASS on both fixtures and (when `data/` present) every corpus record. This is the strict-parity gate.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(cris-formatb): strict byte-parity harness (Gleam facade == TS oracle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

---

## Phase 4 — Bundle, wire exports, enforce private

### Task 12: Build pipeline + bundle to `dist/engine.mjs`

**Files:**
- Create: `packages/cris-formatb/scripts/build.sh` (or an npm script)
- Modify: `packages/cris-formatb/package.json` (`build` script, `exports`, `main`/`types`, `devDependencies` += esbuild), `src-ts/wrapper.ts` (import from `../dist/engine.mjs`)

**Interfaces:**
- Produces: `dist/engine.mjs` (bundled facade entry: `javascript.gleam` exports + reader + prelude/stdlib) and `dist/engine.d.mts`.

- [ ] **Step 1: Add esbuild + the build script**

`package.json`: `devDependencies += "esbuild": "^0.24.0"`; `scripts.build`:
```
gleam build --target javascript && esbuild build/dev/javascript/cris_formatb/javascript.mjs --bundle --format=esm --platform=neutral --outfile=dist/engine.mjs && cp build/dev/javascript/cris_formatb/javascript.d.mts dist/engine.d.mts
```
(Adjust the `.d.mts` copy/gen per what Gleam emits; the wrapper is typed against it.)

- [ ] **Step 2: Repoint the wrapper at the bundle**

`src-ts/wrapper.ts`: import from `../dist/engine.mjs`.

- [ ] **Step 3: Wire `exports`/`main`/`types`**

`package.json`: `"main": "src-ts/index.ts"`, `"types": "src-ts/index.ts"`, and `"exports": { ".": { "types": "./src-ts/index.ts", "import": "./src-ts/index.ts" } }` (index.ts → wrapper → dist). Add `"prepare": "pnpm build"`.

- [ ] **Step 4: Build and re-run parity against the bundle**

Run: `cd packages/cris-formatb && pnpm build && cd ../.. && pnpm exec vitest run packages/cris-formatb/test/parity.test.ts`
Expected: `dist/engine.mjs` exists; parity PASS against the bundled engine.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "build(cris-formatb): bundle the Gleam reader to dist/engine.mjs behind the facade

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 13: `index.ts` delegates; conformance + declarations green

**Files:**
- Modify: `packages/cris-formatb/src-ts/index.ts` (delegate to `wrapper.ts`)
- Test: `packages/cris-formatb/test/public-api.test.ts` (existing, moved)

- [ ] **Step 1: Point `index.ts` at the wrapper**

Only the two heavy functions become Gleam: `index.ts` re-exports `scanRecords`/`parseRecord` from `./wrapper`. The **pure helpers stay TS at runtime** and are re-exported from their existing modules: `field`, `fields` (from `record.ts` — accessors over the `LogicalRecord` shape the Gleam facade produces), `lineToOffset`, `offsetToLine` (`offsets.ts`), `latin1`, `LINE_BYTES`, `DATA_START`, `DATA_END` (`bytes.ts`), `PROFILES`, `PROFILE_NAMES` (`profiles.ts`). Keep the full frozen export set (Global Constraints). (So `record.ts`/`offsets.ts` are *not* purely test-only — only their `parseRecord`/`scanRecords` implementations are superseded and now serve solely as the parity oracle imported by `parity.test.ts`; the spec's "dropped from runtime exports" means those two functions, not the whole files.)

- [ ] **Step 2: Run the frozen conformance + declarations gate**

Run: `pnpm exec vitest run packages/cris-formatb/test/public-api.test.ts && pnpm exec tsc --noEmit -p packages/cris-formatb/tsconfig.json`
Expected: PASS — runtime shapes (arrays, `undefined` not null, `code: string|undefined`) hold against the bundled Gleam; declarations typecheck (no `@ts-expect-error`).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): index.ts delegates to the bundled Gleam engine (frozen surface)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

### Task 14: Enforce private + reader-only bundle boundary

**Files:**
- Modify: `packages/cris-formatb/package.json` (`private`, `files`, `prepublishOnly`)
- Create: `packages/cris-formatb/test/bundle-boundary.test.ts`

- [ ] **Step 1: Write the failing bundle-boundary test**

```ts
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
it("dist bundle is reader-only", () => {
  const src = readFileSync("packages/cris-formatb/dist/engine.mjs", "utf8");
  for (const forbidden of ["construct", "Project", "Classifications", "simplifile", "argv"]) {
    expect(src.includes(forbidden), `bundle must not reference ${forbidden}`).toBe(false);
  }
});
```

- [ ] **Step 2: Run to verify** — `pnpm exec vitest run packages/cris-formatb/test/bundle-boundary.test.ts`. If it FAILS, the bundle dragged in a validator/Node module → tighten the `javascript.gleam` entry's imports (it must reach only `facade` + reader) and re-audit `source_record`.

- [ ] **Step 3: Add the publish guard**

`package.json`: `"private": true`, `"files": ["dist", "src-ts"]`, `"scripts": { ..., "prepublishOnly": "exit 1" }`.

- [ ] **Step 4: Verify green** — re-run the bundle-boundary test → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore(cris-formatb): enforce private package + reader-only bundle boundary test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

---

## Phase 5 — The emulator swap

### Task 15: The app runs on the Gleam-backed package; full suite green

**Files:**
- Modify: root `package.json` (build ordering), `pnpm-workspace.yaml` if needed.

- [ ] **Step 1: Wire build ordering so the app sees `dist`**

Root `package.json` scripts: prefix `dev`/`build`/`test`/`typecheck` with `pnpm --filter @barcstory/cris-formatb build &&` (or rely on the package's `prepare` on install). Ensure `pnpm install` runs `prepare`.

- [ ] **Step 2: Run the FULL app suite over corpus + real data**

Run: `pnpm install && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: the entire `dialog-file60` suite PASSES — the emulator now resolves `@barcstory/cris-formatb` to the Gleam-backed surface, with **zero import-string changes**. Any diff in emulator output is a strict-parity failure (Task 11 should have caught it; if not, fix the facade, do not change the app).

- [ ] **Step 3: Confirm zero import-string drift**

Run: `git diff --stat -- '*.ts' | rg -v 'packages/cris-formatb'` and inspect: no `@barcstory/cris-formatb` import specifier changed anywhere in the app.

- [ ] **Step 4: Full gate sweep**

Run, all green:
```bash
cd packages/cris-formatb && gleam test && gleam check && gleam format --check src test && cd ../.. \
  && pnpm exec vitest run && pnpm exec tsc --noEmit
```
Expected: 162 Gleam tests; parity + public-api + bundle-boundary + full app suite all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cris-formatb): emulator runs on the bundled Gleam reader behind the frozen facade

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk"
```

---

## Notes for the implementer

- **The oracle wins.** Wherever the Gleam facade disagrees with `src-ts/record.ts`/`offsets.ts`, the TS reader is correct (strict parity). Fix the Gleam side (`facade`/`segment`/`js_string`/`latin1`), never the oracle, and never the app.
- **`data/` may be absent.** The corpus `.txt` files are gitignored; guard corpus loops with `existsSync` so fixture parity still runs on a clean checkout. If `data/` is present, corpus parity is the real gate.
- **Deferred, do NOT do here:** adopting the reader's corrections (`0xAC` single-value fix, field-aware reading, correct EBCDIC rendering) — each is a separate later change with its own tests.
- **Restricted material:** `rules/` must never be exported; the `"private": true` + `prepublishOnly` guard (Task 14) enforces "never published."
