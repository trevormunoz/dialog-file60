# RPA facade-wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the vintage-scoped RPA-code check live in `tally` and `report` by inferring the corpus fiscal year from the file name and threading it into `project_with_vintage`, while surfacing the attestation mode, counting an RPA-miss-only record as certified-class, and killing the sub-4-byte double-report.

**Architecture:** Two new pure functions in `rpa_attestation.gleam` (fiscal-year-from-basename, attestation-mode note). `construct.merge_rpa_attestations` gains a length gate. `tally` and `report` each derive the corpus FY from the path they already hold and pass it to `project_with_vintage`, add the note to their output, and (tally only) route an RPA-miss-only record into the certified family.

**Tech Stack:** Gleam (JS target, gleeunit); pure `gleam/string`/`gleam/int`/`gleam/option` (no regex in core Gleam).

**Design spec:** `docs/superpowers/specs/2026-09-16-rpa-facade-wiring-design.md` (read it — decisions 1, 2, 2a, 3, and Known weaknesses).

## Global Constraints

- **Gate:** baseline and final check run **root `pnpm test` + `pnpm typecheck`**, not only package `gleam test`. Never import `node:child_process` in any `*.test.ts`/test file (`test/regression/no-subprocess.test.ts` invariant). `test/archival/*` fail only for the absent gitignored corpus — environmental, ignore if untouched (this plan touches nothing in loader/search/data). (Memory `dialog-file60-test-baseline`.)
- **`canonical_code` is unchanged** — decision 3 narrows the *caller's input set*, never the approved "strip one leading R if present, accept iff 3 digits" contract.
- **`corpus_fy_from_path` contract:** read the **basename** only; the leftmost `FY` occurrence whose next two characters are digits **and** whose following character is not a digit wins; `FY1988` → `None`; no token → `None`.
- **Output stays additive:** no existing output line is removed or reordered; new lines are added. (No machine consumer was found, but this is cheap insurance — spec Testing.)
- **RPA miss is a statement of absence, never a verdict of invalidity** (predecessor governing principle) — hence decision 2a.
- Baseline: package `gleam test` = **201 passed** at branch start.

---

### Task 1: Pure fiscal-year-from-path and attestation-mode note

**Files:**
- Modify: `packages/cris-formatb/src/rpa_attestation.gleam`
- Test: `packages/cris-formatb/test/rpa_attestation_test.gleam`

**Interfaces:**
- Produces: `pub fn corpus_fy_from_path(path: String) -> Option(Int)` and `pub fn attestation_note(corpus_fy: Option(Int)) -> String`. Consumed by Tasks 3 and 4.
- Consumes: existing `warrant_for/1`, `set_label/1`, `NoWarrant`, `RevIv`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/cris-formatb/test/rpa_attestation_test.gleam`. Add `import gleam/option.{None, Some}` at the top (next to the existing imports).

```gleam
pub fn corpus_fy_from_path_reads_the_real_names_test() {
  rpa_attestation.corpus_fy_from_path("data/RG310.CRIS.FY88.txt")
  |> should.equal(Some(88))
  rpa_attestation.corpus_fy_from_path("data/RG164.CRIS.FY89.txt")
  |> should.equal(Some(89))
  rpa_attestation.corpus_fy_from_path("data/RG164.CRIS.FY94.txt")
  |> should.equal(Some(94))
}

pub fn corpus_fy_from_path_requires_exactly_two_digits_test() {
  rpa_attestation.corpus_fy_from_path("data/FY1988.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("data/FY888.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("data/FY8.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("T") |> should.equal(None)
}

pub fn corpus_fy_from_path_takes_leftmost_valid_test() {
  // a rejected 4-digit FY, then a valid 2-digit FY: the valid one wins
  rpa_attestation.corpus_fy_from_path("FY1988.CRIS.FY94.txt")
  |> should.equal(Some(94))
}

pub fn corpus_fy_from_path_reads_basename_not_directory_test() {
  // a vintage-named directory must NOT pre-empt a differently-named file
  rpa_attestation.corpus_fy_from_path("archive/FY88/latest.txt")
  |> should.equal(None)
}

pub fn attestation_note_off_test() {
  rpa_attestation.attestation_note(None)
  |> should.equal("RPA attestation off: no fiscal year in the file name")
}

pub fn attestation_note_active_test() {
  rpa_attestation.attestation_note(Some(88))
  |> should.equal(
    "RPA attestation active: FY88 (from file name) — "
    <> rpa_attestation.set_label(RevIv),
  )
}

pub fn attestation_note_not_run_test() {
  rpa_attestation.attestation_note(Some(90))
  |> should.equal(
    "RPA attestation not run: no warrant set for FY90 (from file name)",
  )
}
```

The test import line already reads `import rpa_attestation.{Fy94Table, NoWarrant, RevIv, RpaMiss}` — `RevIv` is in scope.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `corpus_fy_from_path`/`attestation_note` are unknown functions (compile error).

- [ ] **Step 3: Implement the two functions**

In `packages/cris-formatb/src/rpa_attestation.gleam`, add `import gleam/int` and `import gleam/option.{type Option, None, Some}` to the imports (the module already imports `gleam/list`, `gleam/string`, `vocab_rpa`). Add:

```gleam
/// The corpus vintage inferred from a file path: in the path's basename, the
/// leftmost `FY` whose next two characters are digits AND whose following
/// character is not a digit. `FY1988` therefore yields `None` (not `19`), and a
/// vintage-named directory cannot pre-empt the file's own name. No token → None.
pub fn corpus_fy_from_path(path: String) -> Option(Int) {
  scan_fy(basename(path))
}

fn basename(path: String) -> String {
  case string.split(path, "/") |> list.last {
    Ok(name) -> name
    Error(_) -> path
  }
}

fn scan_fy(s: String) -> Option(Int) {
  case string.split_once(s, "FY") {
    Error(_) -> None
    Ok(#(_before, after)) ->
      case two_digit_vintage(after) {
        Ok(n) -> Some(n)
        Error(_) -> scan_fy(after)
      }
  }
}

// The first two graphemes of `after` are digits AND the third (if present) is
// not a digit; parse those two digits. Anything else is a rejected match.
fn two_digit_vintage(after: String) -> Result(Int, Nil) {
  case string.to_graphemes(after) {
    [d1, d2, d3, ..] ->
      case is_digit(d1) && is_digit(d2) && !is_digit(d3) {
        True -> int.parse(d1 <> d2)
        False -> Error(Nil)
      }
    [d1, d2] ->
      case is_digit(d1) && is_digit(d2) {
        True -> int.parse(d1 <> d2)
        False -> Error(Nil)
      }
    _ -> Error(Nil)
  }
}

fn is_digit(g: String) -> Bool {
  case g {
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" -> True
    _ -> False
  }
}

/// A one-line factual statement of a run's attestation mode, from the corpus
/// fiscal year inferred from the file name. Three states: off (no FY inferred),
/// active (FY has a warrant set — named), not run (FY has no warrant set).
pub fn attestation_note(corpus_fy: Option(Int)) -> String {
  case corpus_fy {
    None -> "RPA attestation off: no fiscal year in the file name"
    Some(fy) ->
      case warrant_for(fy) {
        NoWarrant ->
          "RPA attestation not run: no warrant set for FY"
          <> int.to_string(fy)
          <> " (from file name)"
        set ->
          "RPA attestation active: FY"
          <> int.to_string(fy)
          <> " (from file name) — "
          <> set_label(set)
      }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (all prior tests plus the 7 new ones). Then `gleam format` and confirm clean: `gleam format --check src test`.

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/rpa_attestation.gleam packages/cris-formatb/test/rpa_attestation_test.gleam
git commit -m "feat(cris-formatb): corpus_fy_from_path + attestation_note (pure)"
```

---

### Task 2: Length gate — kill the sub-4-byte double-report

**Files:**
- Modify: `packages/cris-formatb/src/construct.gleam` (`merge_rpa_attestations`, ~line 2038)
- Test: `packages/cris-formatb/test/construct_test.gleam`

**Interfaces:**
- Consumes: existing `full_record_with_rp/1`, `has_rpa_not_attested/2` (construct_test helpers).
- Produces: no signature change; behavior narrows.

- [ ] **Step 1: Write the failing tests**

In `packages/cris-formatb/test/construct_test.gleam`, add a helper next to `has_rpa_not_attested` (it already imports `Disagreement`, `FormatDisagreement`, `RpaCodeNotAttested`; add `InvalidFieldValue` to the `record_model` import list if not present):

```gleam
fn has_invalid_field(
  problems: source_record.NonEmpty(record_model.ConstructionProblem),
  tag: String,
) -> Bool {
  let NonEmpty(first, rest) = problems
  list.any([first, ..rest], fn(problem) {
    case problem {
      Disagreement(FormatDisagreement(InvalidFieldValue(t, _), _, _, _)) ->
        t == tag
      _ -> False
    }
  })
}
```

Then add two tests:

```gleam
// A bare 3-byte "999" is shorter than the RP length floor (between(4,74)), so
// project_core already reports it as InvalidFieldValue. Attestation must NOT
// also report it — no RpaCodeNotAttested for a value the base gate rejects.
pub fn rpa_short_value_is_not_double_reported_test() {
  let supplied = full_record_with_rp("999")
  let assert Error(problems) =
    construct.project_with_vintage(supplied, Some(88))
  has_invalid_field(problems, "RP") |> should.equal(True)
  has_rpa_not_attested(problems, "999") |> should.equal(False)
}

// A real 4-byte R### miss is single-reported: RpaCodeNotAttested, and NOT an
// InvalidFieldValue (R999 is a valid RP length).
pub fn rpa_valid_length_miss_is_single_reported_test() {
  let supplied = full_record_with_rp("R999")
  let assert Error(problems) =
    construct.project_with_vintage(supplied, Some(88))
  has_rpa_not_attested(problems, "999") |> should.equal(True)
  has_invalid_field(problems, "RP") |> should.equal(False)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cris-formatb && gleam test`
Expected: `rpa_short_value_is_not_double_reported_test` FAILS on `has_rpa_not_attested(problems, "999") |> should.equal(False)` — today `canonical_code("999")` succeeds and attestation emits `RpaCodeNotAttested("999", …)` on top of the base `InvalidFieldValue`. (`rpa_valid_length_miss_is_single_reported_test` should already pass.)

- [ ] **Step 3: Implement the length gate**

In `packages/cris-formatb/src/construct.gleam`, in `merge_rpa_attestations`, replace the `filter_map` body so each value is gated on raw byte length before decoding. The block currently reads:

```gleam
  let misses =
    list.filter_map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      case bit_array.to_string(bytes) {
        Error(_) -> Error(Nil)
        Ok(text) ->
          case rpa_attestation.attest(text, set) {
            Ok(Nil) -> Error(Nil)
            Error(miss) -> Ok(rpa_problem(miss, occurrence))
          }
      }
    })
```

Replace with:

```gleam
  let misses =
    list.filter_map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      // Attest only values the base RP length rule (between(4, 74)) accepts.
      // A value shorter than 4 bytes is already reported as InvalidFieldValue,
      // so attesting it too would double-report; a real `R###` code is 4 bytes
      // and still attests. Gate on the raw byte length the base rule measures,
      // before decoding.
      case bit_array.byte_size(bytes) >= 4 {
        False -> Error(Nil)
        True ->
          case bit_array.to_string(bytes) {
            Error(_) -> Error(Nil)
            Ok(text) ->
              case rpa_attestation.attest(text, set) {
                Ok(Nil) -> Error(Nil)
                Error(miss) -> Ok(rpa_problem(miss, occurrence))
              }
          }
      }
    })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (both new tests, all prior tests including the existing `rpa_unattested_reports_for_fy88_test`). Then `gleam format --check src test`.

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/construct.gleam packages/cris-formatb/test/construct_test.gleam
git commit -m "fix(cris-formatb): gate RP attestation on the base length floor (no double-report)"
```

---

### Task 3: Wire tally live — certified-class RPA absence + note

**Files:**
- Modify: `packages/cris-formatb/src/tally.gleam`
- Test (create): `packages/cris-formatb/test/tally_test.gleam`

**Interfaces:**
- Consumes: `rpa_attestation.corpus_fy_from_path/1`, `rpa_attestation.attestation_note/1` (Task 1); `construct.project_with_vintage/2`.
- Produces: `tally` and `render` gain a `corpus_fy: Option(Int)` parameter and are exposed `@internal pub` for testing; `Acc` gains `certified_rpa_absence: Int`.

- [ ] **Step 1: Write the failing test (new file)**

Create `packages/cris-formatb/test/tally_test.gleam`:

```gleam
//// tally: bucket construct outcomes over a scanned buffer. Run with `gleam test`.

import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import scan
import tally

// One 82-byte served line: cols 1-2 tag, col 3 blank, value from col 4, space
// pad to 80, CRLF. Mirrors the reader's served-line geometry.
fn line(tag: String, value: String) -> BitArray {
  let body = <<tag:utf8, 0x20, value:utf8>>
  bit_array.concat([body, spaces(80 - bit_array.byte_size(body)), <<0x0d, 0x0a>>])
}

fn spaces(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, spaces(n - 1))
  }
}

// A record that certifies (every required group present), carrying the given RP
// value. All values fit one line (<= 69 bytes). Begins with a "$$" boundary.
fn certifying_record(rp: String) -> List(BitArray) {
  [
    line("$$", ""),
    line("AN", "9049442"),
    line("PN", "1275-21000-008-00D"),
    line("TI", "Watershed protection in irrigated agriculture"),
    line("PS", "new"),
    line("PT", "0"),
    line("PI", "Univ of Georgia"),
    line("CY", "Tifton"),
    line("ST", "GEORGIA"),
    line("IN", "Gaines T P"),
    line("FY", "1988"),
    line("OB", "Improve poultry yields"),
    line("DE", "POULTRY FORESTRY"),
    line("SF", "CRIS"),
    line("RP", rp),
  ]
}

fn scanned(records_lines: List(List(BitArray))) -> List(scan.ScannedRecord) {
  let buffer = bit_array.concat(list.flatten(records_lines))
  let assert Ok(scan.ScanResult(records, _structure)) = scan.scan(buffer, "T", 1)
  records
}

// R101 is attested (Rev IV); R999 canonicalizes but is absent. Under FY88 the
// R999 record is Error-with-only-RpaCodeNotAttested, which must count as
// certified-class (certified + certified_rpa_absence), never failed.
pub fn tally_counts_rpa_absence_as_certified_class_test() {
  let records = scanned([certifying_record("R101"), certifying_record("R999")])
  let text = tally.render(tally.tally(records, Some(88)), "data/RG310.CRIS.FY88.txt", 30, Some(88))
  should.be_true(string.contains(text, "certified     : 2"))
  should.be_true(string.contains(
    text,
    "unattested RPA code (statement of absence): 1",
  ))
  should.be_true(string.contains(text, "failed        : 0"))
  should.be_true(string.contains(text, "RPA attestation active: FY88"))
}

// A record with a structural failure AND an RPA miss is genuinely failed (the
// RPA miss is incidental) — it is not routed to certified-class.
pub fn tally_mixed_structural_and_rpa_is_failed_test() {
  // Drop the required PN so identity fails, alongside the R999 miss.
  let broken = [
    line("$$", ""),
    line("AN", "9049442"),
    line("TI", "Watershed protection in irrigated agriculture"),
    line("PS", "new"),
    line("PI", "Univ of Georgia"),
    line("CY", "Tifton"),
    line("ST", "GEORGIA"),
    line("IN", "Gaines T P"),
    line("RP", "R999"),
  ]
  let records = scanned([broken])
  let text = tally.render(tally.tally(records, Some(88)), "data/RG310.CRIS.FY88.txt", 20, Some(88))
  should.be_true(string.contains(text, "certified     : 0"))
  should.be_true(string.contains(text, "failed        : 1"))
}

// No FY in the name → attestation off → the R999 record certifies clean.
pub fn tally_off_without_fy_name_test() {
  let records = scanned([certifying_record("R999")])
  let text = tally.render(tally.tally(records, None), "T", 15, None)
  should.be_true(string.contains(text, "certified     : 1"))
  should.be_true(string.contains(text, "RPA attestation off"))
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL to compile — `tally.tally`/`tally.render` are private and take the wrong arity (no `corpus_fy`), and `certified_rpa_absence` is not rendered.

- [ ] **Step 3: Implement the wiring in `tally.gleam`**

1. Add imports: `import gleam/option.{type Option, None, Some}` and `import rpa_attestation`.

2. Add the field to `Acc` (after `certified_undocumented`):

```gleam
    certified_undocumented: Int,
    // Subset of `certified`: records that would certify but for an RPA code
    // absent from the contemporary vocabulary set — a statement of absence,
    // never a verdict of invalidity, so it stays in the certified family.
    certified_rpa_absence: Int,
```

3. Initialize it in the fold's seed `Acc` (add `certified_rpa_absence: 0,` next to `certified_undocumented: 0,`).

4. Change `fn tally(records)` to `@internal pub fn tally(records: List(scan.ScannedRecord), corpus_fy: Option(Int)) -> Acc`, and in the fold call `construct.project_with_vintage(supplied, corpus_fy)` instead of `construct.project(supplied)`.

5. Replace the whole `Error(NonEmpty(first, rest))` arm with the classify branch:

```gleam
            Error(NonEmpty(first, rest)) -> {
              let problems = [first, ..rest]
              let problems_bumped =
                list.fold(problems, acc.problems, fn(d, p) { bump(d, bucket(p)) })
              case classify_problems(problems) {
                RpaAbsenceOnly ->
                  Acc(
                    ..acc,
                    certified: acc.certified + 1,
                    certified_rpa_absence: acc.certified_rpa_absence + 1,
                    problems: problems_bumped,
                  )
                UnmodeledOnly ->
                  Acc(
                    ..acc,
                    failed: acc.failed + 1,
                    unmodeled_only: acc.unmodeled_only + 1,
                    problems: problems_bumped,
                  )
                StructuralFailure ->
                  Acc(..acc, failed: acc.failed + 1, problems: problems_bumped)
              }
            }
```

6. Add the classifier and its type (near `is_not_yet_modeled`), and an `is_rpa_absence` predicate:

```gleam
type ProblemClass {
  RpaAbsenceOnly
  UnmodeledOnly
  StructuralFailure
}

// A record's non-Ok outcome: RPA-absence-only (certified-class), unmodeled-only
// (a documented backlog, no divergence), or a structural failure. A record
// mixing an RPA miss with anything structural is a StructuralFailure — the miss
// is incidental. (Mixed RPA-absence + unmodeled also falls here; negligible in
// the ~100%-certified corpora — see the design spec's Known weaknesses.)
fn classify_problems(problems: List(ConstructionProblem)) -> ProblemClass {
  case list.all(problems, is_rpa_absence) {
    True -> RpaAbsenceOnly
    False ->
      case list.all(problems, is_not_yet_modeled) {
        True -> UnmodeledOnly
        False -> StructuralFailure
      }
  }
}

fn is_rpa_absence(problem: ConstructionProblem) -> Bool {
  case problem {
    Disagreement(FormatDisagreement(RpaCodeNotAttested(_, _), _, _, _)) -> True
    _ -> False
  }
}
```

(`Disagreement`, `FormatDisagreement`, `RpaCodeNotAttested` are already in the `record_model` import list at the top of `tally.gleam`.)

7. Change `fn render(acc, path, line_count)` to `@internal pub fn render(acc: Acc, path: String, line_count: Int, corpus_fy: Option(Int)) -> String`. Insert the note after the `"scanned prefix: …"` line, add the sub-count after the `certified_undocumented` line, and reword the bucket header. The string list becomes:

```gleam
      "construct.project tally over " <> path,
      "scanned prefix: " <> int.to_string(line_count) <> " lines (0xAC marker)",
      rpa_attestation.attestation_note(corpus_fy),
      "",
      "records scanned : " <> int.to_string(acc.total),
      "  certified     : " <> int.to_string(acc.certified),
      "    of which carrying a source-undocumented field (SN), preserved: "
        <> int.to_string(acc.certified_undocumented),
      "    of which certified but for an unattested RPA code (statement of absence): "
        <> int.to_string(acc.certified_rpa_absence),
      "  failed        : " <> int.to_string(acc.failed),
      "    of which unmodeled-material only (no documentary divergence): "
        <> int.to_string(acc.unmodeled_only),
      "  unreadable    : " <> int.to_string(acc.unreadable),
      "",
      "problem buckets (occurrences across all records carrying problems, desc):",
      rows,
```

8. Update `run` to derive and thread `corpus_fy`:

```gleam
        Ok(scan.ScanResult(records, _structure)) -> {
          let corpus_fy = rpa_attestation.corpus_fy_from_path(path)
          io.println(render(tally(records, corpus_fy), path, line_count, corpus_fy))
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (all prior tests plus the 3 tally tests). Then `gleam format --check src test`.

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/tally.gleam packages/cris-formatb/test/tally_test.gleam
git commit -m "feat(cris-formatb): wire tally live — certified-class RPA absence + attestation note"
```

---

### Task 4: Wire report live — attestation note + per-record miss

**Files:**
- Modify: `packages/cris-formatb/src/report.gleam`
- Test: `packages/cris-formatb/test/report_test.gleam`

**Interfaces:**
- Consumes: `rpa_attestation.corpus_fy_from_path/1`, `rpa_attestation.attestation_note/1` (Task 1); `construct.project_with_vintage/2`.
- Produces: `report`'s public signature is unchanged (fiscal year derived internally from `file`); `evaluate` and `project_line` gain a `corpus_fy` parameter.

- [ ] **Step 1: Write the failing tests**

Append to `packages/cris-formatb/test/report_test.gleam` (it imports `bit_array`, `list`, `string`, `should`, `report`). The existing `line/1` helper builds a served line from one string like `"RP R999"`:

```gleam
// Under a FY88-named file, an unattested RP code shows the active note and the
// per-record miss. (The record need not certify — report lists problems.)
pub fn report_attests_rp_under_fy88_name_test() {
  let bytes =
    bit_array.concat(list.map(
      ["$$", "AN 9049442", "PN 1275-21000-008-00D", "RP R999"],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "data/RG310.CRIS.FY88.txt", 1, 0xAC, 100)
  should.be_true(string.contains(text, "RPA attestation active: FY88"))
  should.be_true(string.contains(text, "RPA 999 not attested"))
}

// A file name without an FY token → attestation off → no per-record miss.
pub fn report_off_without_fy_name_test() {
  let bytes =
    bit_array.concat(list.map(
      ["$$", "AN 9049442", "PN 1275-21000-008-00D", "RP R999"],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "RPA attestation off"))
  should.be_false(string.contains(text, "not attested"))
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/cris-formatb && gleam test`
Expected: `report_attests_rp_under_fy88_name_test` FAILS — today `project_line` calls `construct.project(supplied)` (no vintage), so no `RpaCodeNotAttested` and no note appear.

- [ ] **Step 3: Implement the wiring in `report.gleam`**

1. Add `import rpa_attestation` (the module already imports `gleam/option`).

2. In `report`, derive the fiscal year and thread it; append the note to the output. Change the `Ok(scan.ScanResult(...))` block so:

```gleam
    Ok(scan.ScanResult(records, _structure)) -> {
      let corpus_fy = rpa_attestation.corpus_fy_from_path(file)
      let outcomes = list.map(records, evaluate(_, marker, corpus_fy))
      let total = list.length(records)
      let valid = list.count(outcomes, fn(outcome) { outcome.1 })
      let shown =
        outcomes
        |> list.take(max_records)
        |> list.map(fn(outcome) { outcome.0 })
      let summary =
        int.to_string(total)
        <> " records scanned; "
        <> int.to_string(valid)
        <> " with a checked Identity; "
        <> int.to_string(total - valid)
        <> " with problems."
      let note = rpa_attestation.attestation_note(corpus_fy)
      Ok(string.join(list.append(shown, [summary, note]), "\n\n"))
    }
```

3. Change `fn evaluate(record, marker)` to `fn evaluate(record: scan.ScannedRecord, marker: Int, corpus_fy: option.Option(Int)) -> #(String, Bool)` and, in its `Ok(supplied)` arm, replace `project_line(supplied)` with `project_line(supplied, corpus_fy)`.

4. Change `fn project_line(supplied)` to `fn project_line(supplied: SuppliedRecord, corpus_fy: option.Option(Int)) -> String` and replace `construct.project(supplied)` with `construct.project_with_vintage(supplied, corpus_fy)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS — the 2 new tests plus every existing `report_test` (all substring assertions, unaffected by the appended note). Then `gleam format --check src test`.

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/report.gleam packages/cris-formatb/test/report_test.gleam
git commit -m "feat(cris-formatb): wire report live — attestation note + per-record RPA miss"
```

---

## Final gate (after all tasks)

- [ ] From the repo root: `pnpm test` and `pnpm typecheck` both green (except the known-environmental `test/archival/*` if `data/*.txt` is absent — unrelated to this branch). This is the real gate, not package `gleam test` alone (memory `dialog-file60-test-baseline`).
- [ ] `cd packages/cris-formatb && gleam format --check src test` clean.
- [ ] Whole-branch review (subagent-driven-development's final review), then finishing-a-development-branch.

## Self-review notes

- **Spec coverage:** Task 1 = decisions 1 + 2 (pure fns). Task 2 = decision 3. Task 3 = decisions 2 + 2a for tally. Task 4 = decisions 1 + 2 wiring for report. Known-weakness edge (mixed RPA+unmodeled → failed) is realized by `classify_problems` and documented in its comment.
- **Type consistency:** `corpus_fy: Option(Int)` flows identically through `tally`/`render` and `report`/`evaluate`/`project_line`; `project_with_vintage/2` is the single sink.
- **No placeholders:** every step carries real code, exact commands, and expected results.
- **Additive output:** the only reworded existing line is tally's bucket header (`across all failed records` → `across all records carrying problems`), an honesty correction now that certified-class records also contribute buckets; no consumer parses it (spec Testing).
