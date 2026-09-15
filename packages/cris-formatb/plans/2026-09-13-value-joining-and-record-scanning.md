# Format B reading — value joining and record scanning Implementation Plan

## Execution status — implemented

**Post-review revision:** the current API is
`field_values(occurrence: FieldOccurrence) -> Result(List(BitArray), CardImageError)`.
The unused marker parameter in the historical sketches below is superseded:
assembly owns profile interpretation, and joining follows the fragment variants
directly rather than converting them to boolean flags. Two added tests cover
profile-dependent assembly→joining and the existing wrapped-first fallback.
Post-review gates: **68 tests passed**, check zero errors (two expected warnings),
format clean. README records the evidence for the retained Gleam patterns and
limits of attributing the design improvement to Gleam rather than TypeScript.

- [x] Task 1: exposed `raw_columns` and `trim_trailing_spaces`; observed unknown-function
  failures first, then 50 passing tests and clean check/format gates.
- [x] Task 2: implemented `field_values`; observed unknown-module failures first,
  then 58 passing tests and clean check/format gates.
- [x] Task 3: implemented `scan`; observed unknown-module failures first,
  then 66 passing tests and clean check/format gates. README updated.

### Completed review actions

- [x] Obtained a fresh independent Gleam maintainability review.
- [x] Removed the unused marker parameter from `field_values` and updated callers.
- [x] Replaced positional boolean flags with direct `Fragment` variant matching.
- [x] Retained direct recursive walkers and reverse-list accumulation.
- [x] Added profile-dependent assembly→joining and wrapped-first fallback tests.
- [x] Observed the changed API tests fail, then passed all 68 tests and both gates.
- [x] Updated README with idiom evidence and the Gleam/TS comparison's limits.

The step checklists below now record completed implementation work; code sketches
remain historical and are superseded by the execution adjustments where noted.
Checked gate steps do **not** claim commits: all Git operations were skipped.

Execution adjustments:

- Used direct execution: the referenced superpowers skills were unavailable.
  Git commands/commits were skipped under the project-level no-Git instruction.
- Synthetic field witnesses include all 82 bytes (the sketches omitted columns
  73-80); conspicuous supplier bytes test their exclusion from lexical values.
- Fixture AC and TI tests read actual byte slices instead of reconstructing them.
  Additional tests cover mixed wrapped/marked values, empty values, non-ASCII
  and trailing non-space bytes, short witnesses, empty/structure-only files,
  adjacent separators, EOF, ignored out-of-record lines, and absolute locations.
- Corrected a provenance bug in the proposed scan: a `<<` encountered inside
  an open record is retained in its contiguous bytes as well as captured in
  structure. The sketch dropped that line while continuing the same record,
  shifting subsequent assembled locations. This matches `offsets.ts`'s span
  behavior; a regression test fixes the expected bytes. Structure validation
  remains out of scope, and the README names this limitation.
- `record_model.gleam` received comment-only status updates; types are unchanged.
  The reference TypeScript parser was not edited.

Current final gates: `gleam test` **68 passed**, `gleam check` zero errors (the two
expected private-constructor warnings), `gleam format --check src test` clean.
Next open thread: transcribe the documentary rule inventory before planning
checked `Project` construction, as scoped at the end of this plan.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a field's fragments into its lexical value(s), and scan a whole file into per-record byte spans, so a complete file can be read record-by-record through the existing `assemble`.

**Architecture:** Two independent additions on top of the committed reading layer (`card_image` + `assembly`). Value joining reads a `FieldOccurrence`'s fragments back into ordered values (wrapped continuations extend the current value; marked continuations start a new one, marker byte dropped; trailing pad trimmed once at the end). Record scanning splits a file's bytes into 82-byte lines and groups them into record spans at `$$`, recognising the file's `<<` header and `>>` trailer.

**Tech Stack:** Gleam 1.18.1, JavaScript target, `gleam_stdlib` 1.0.5, `gleeunit` + `simplifile` (dev). Run everything with `gleam test`, `gleam check`, `gleam format --check src test` from `docs/formatb-reading/`.

## Global Constraints

- Input is bytes (`BitArray`), never `String`. The source is a single-byte card image. [verbatim project rule]
- Trailing pad is ASCII space `0x20` only; no other byte is dropped, so a stray non-space trailing byte stays visible. [matches `card_image.data_value`]
- Column boundaries: a served line is 82 bytes (80 columns + CRLF). Columns 4-72 are the 69 bytes at 0-based offsets 3..71 (`data_start = 3`, `data_length = 69`, `line_bytes = 82` in `card_image.gleam`). Never read columns 73-80.
- The continuation marker is a profile fact passed in as an `Int`, not hardcoded. `0xAC` for the FY94 fixture, per `registry/evidence.json` `formatb.encoding.continuation_0xAC` (sourced to the FY94 data, not the printed dictionary).
- TDD: write the failing test, watch it fail, minimal code to pass, re-run, commit. No production code without a failing test first.
- Gate every task on `gleam test` (all green), `gleam check` (0 errors; the two `record_model.gleam` unused-constructor warnings are expected), and `gleam format --check src test`.
- Do not modify `packages/cris-formatb/src/**` (the reference TS parser) or `record_model.gleam`'s types. `record.ts:59` is the correct cols 4-72 boundary; `offsets.ts:63` has the cols 4-80 bug — do not replicate it.
- Any statement that something is *not* present must be marked as a scoped statement of absence (see project `CLAUDE.md`).

**Existing interfaces this plan builds on (already committed):**
- `card_image.gleam`: `data_value(BitArray) -> Result(BitArray, CardImageError)`, `classify(BitArray) -> Result(LineKind, CardImageError)`, `continuation_kind(BitArray, Int) -> Result(ContinuationKind, CardImageError)`, `split_lines(BitArray) -> Result(List(BitArray), CardImageError)`. Types: `LineKind { SeparatorLine, TaggedLine(tag: BitArray), ContinuationLine }`, `ContinuationKind { Wrapped, Marked }`, `CardImageError { LineTooShort(actual: Int), LengthNotLineAligned(actual: Int) }`. Constants `data_start`, `data_length`, `line_bytes`.
- `assembly.gleam`: `SourceBase(file: String, first_line: Int)`, `line_location(SourceBase, Int) -> Location`, `assemble(BitArray, SourceBase, Int) -> Result(record_model.SuppliedRecord, AssemblyError)`. Types `LineRole`, `AssemblyError { LineUnreadable(reason), TagNotAscii(bytes) }`.
- `record_model.gleam`: `Fragment { TaggedStart(witness), WrappedText(witness), MarkedValueStart(witness) }`, `Witness(location, bytes)`, `FieldOccurrence(tag: String, fragments: NonEmpty(Fragment))`, `NonEmpty(first, rest)`, `RecordPart { Field(FieldOccurrence), Unassigned(witness) }`, `SuppliedRecord(witness, parts)`.

---

## File Structure

- `src/card_image.gleam` (modify): expose the raw-columns and pad-trim primitives that `data_value` already uses internally, so value joining can concatenate raw columns and trim once at the end.
- `src/field_value.gleam` (create): join a `FieldOccurrence`'s fragments into its ordered lexical values.
- `src/scan.gleam` (create): scan a whole file's bytes into record spans plus the file header/trailer.
- Tests mirror each: `test/card_image_test.gleam` (modify), `test/field_value_test.gleam` (create), `test/scan_test.gleam` (create).

---

## Task 1: Expose raw-columns and pad-trim primitives in `card_image`

Value joining must concatenate *raw* (untrimmed) columns 4-72 across fragments and trim the pad once at the very end — trimming each fragment first would hide an interior nonconformance (see `record.ts:76`, which trims once after joining). `data_value` already computes raw columns then trims; this task exposes those two steps without changing `data_value`'s behaviour.

**Files:**
- Modify: `src/card_image.gleam`
- Test: `test/card_image_test.gleam`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `pub fn raw_columns(line: BitArray) -> Result(BitArray, CardImageError)` — columns 4-72 (69 bytes at offsets 3..71), no trimming; `LineTooShort` if the line stops before column 72.
  - `pub fn trim_trailing_spaces(bytes: BitArray) -> BitArray` — drop the trailing run of `0x20`, nothing else. (Rename of the existing private `drop_trailing_spaces`, made public.)
  - `data_value` unchanged in behaviour: now `raw_columns(line) |> result.map(trim_trailing_spaces)`.

- [x] **Step 1: Write the failing test for `raw_columns`**

Add to `test/card_image_test.gleam` (the `served_line` and `spaces` helpers already exist there):

```gleam
pub fn raw_columns_returns_untrimmed_69_bytes_test() {
  let line = served_line(<<"AN":utf8>>, <<"9049442":utf8>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(columns) = card_image.raw_columns(line)
  // Untrimmed: exactly the 69 bytes of columns 4-72, pad included.
  bit_array.byte_size(columns) |> should.equal(69)
  // Columns 73-80 never leak in: the first 7 bytes are the value.
  let assert <<"9049442":utf8, _:bytes>> = columns
}

pub fn raw_columns_line_too_short_test() {
  let assert Error(card_image.LineTooShort(3)) =
    card_image.raw_columns(<<"AN ":utf8>>)
}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `gleam test`
Expected: FAIL — `raw_columns` is an unknown function on `card_image`.

- [x] **Step 3: Refactor `card_image` to expose the two primitives**

In `src/card_image.gleam`, replace the body of `data_value` and rename the private helper. `data_value` currently is:

```gleam
pub fn data_value(line: BitArray) -> Result(BitArray, CardImageError) {
  case bit_array.slice(line, data_start, data_length) {
    Ok(region) -> Ok(drop_trailing_spaces(region))
    Error(Nil) -> Error(LineTooShort(bit_array.byte_size(line)))
  }
}
```

Replace it and the `drop_trailing_spaces` definition with:

```gleam
/// Columns 4-72 (the 69 bytes at offsets 3..71), untrimmed. Columns 73-80 are
/// never read. `LineTooShort` if the line stops before column 72.
pub fn raw_columns(line: BitArray) -> Result(BitArray, CardImageError) {
  case bit_array.slice(line, data_start, data_length) {
    Ok(region) -> Ok(region)
    Error(Nil) -> Error(LineTooShort(bit_array.byte_size(line)))
  }
}

/// Extract the field value from one card line: columns 4-72 with the trailing
/// ASCII-space pad dropped. Only 0x20 is dropped; any other trailing byte stays.
pub fn data_value(line: BitArray) -> Result(BitArray, CardImageError) {
  case raw_columns(line) {
    Ok(columns) -> Ok(trim_trailing_spaces(columns))
    Error(reason) -> Error(reason)
  }
}

/// Drop the trailing run of ASCII-space bytes; bytes before the last non-space
/// are kept verbatim.
pub fn trim_trailing_spaces(region: BitArray) -> BitArray {
  let keep = kept_length(region, 0, 0)
  let assert Ok(trimmed) = bit_array.slice(region, 0, keep)
    as "keep is within region by construction"
  trimmed
}
```

Leave `kept_length` and the constants as they are.

- [x] **Step 4: Run tests to verify they pass**

Run: `gleam test`
Expected: PASS — all prior `data_value` tests still green (behaviour unchanged) plus the two new ones.

- [x] **Step 5: Gate completed; commit skipped per project instruction**

```bash
gleam format src test
gleam format --check src test
gleam check
git add docs/formatb-reading/src/card_image.gleam docs/formatb-reading/test/card_image_test.gleam
git commit -m "refactor(formatb-reading): expose raw_columns and trim_trailing_spaces"
```

Expected: format clean, `gleam check` 0 errors (2 expected warnings).

---

## Task 2: Join a field's fragments into ordered values

A `FieldOccurrence` keeps its fragments separate. Joining reproduces the reference parser's value reconstruction (`record.ts:61-76`): the `TaggedStart` opens the first value; a `WrappedText` appends its raw columns to the current value; a `MarkedValueStart` opens a new value whose bytes are its raw columns **with the first byte (the marker) dropped**. Each finished value is trailing-space-trimmed once. So the AC field's four fragments yield `["A4900", "A5000", "A4900", "A4900"]`.

**Files:**
- Create: `src/field_value.gleam`
- Test: `test/field_value_test.gleam`

**Interfaces:**
- Consumes: `card_image.raw_columns`, `card_image.trim_trailing_spaces`, `card_image.CardImageError`; `record_model.{FieldOccurrence, Fragment, TaggedStart, WrappedText, MarkedValueStart, NonEmpty, Witness}`.
- Produces: `pub fn field_values(occurrence: FieldOccurrence, marker: Int) -> Result(List(BitArray), CardImageError)` — the field's lexical values in order, each trimmed. `marker` is unused in the fold (the classification is already recorded in the fragment variants) but is accepted for symmetry with `assemble` and to document that marked-value handling is profile-derived; a `_marker` parameter name is fine.

- [x] **Step 1: Write the failing tests**

Create `test/field_value_test.gleam`:

```gleam
//// field_value: joining a FieldOccurrence's fragments into ordered lexical
//// values. Run with `gleam test`.

import card_image
import field_value
import gleam/bit_array
import gleeunit/should
import record_model.{
  FieldOccurrence, Location, MarkedValueStart, NonEmpty, TaggedStart, Witness,
  WrappedText,
}

// A witness whose bytes are one 82-byte served line: `content` in columns 4-72
// (left-justified, space-padded), else the location is a placeholder.
fn line_witness(content: BitArray) -> Witness {
  let padding = pad(69 - bit_array.byte_size(content))
  let line =
    bit_array.concat([<<"XX":utf8>>, <<0x20>>, content, padding, <<0x0d, 0x0a>>])
  Witness(Location("F", 1, 0, 82), line)
}

fn pad(n: Int) -> BitArray {
  list_repeat_concat(n)
}

fn list_repeat_concat(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, list_repeat_concat(n - 1))
  }
}

// One tagged line, no continuations: a single trimmed value.
pub fn single_value_from_tagged_start_test() {
  let occ =
    FieldOccurrence("AN", NonEmpty(TaggedStart(line_witness(<<"9049442":utf8>>)), []))
  field_value.field_values(occ, 0xAC)
  |> should.equal(Ok([<<"9049442":utf8>>]))
}

// A wrapped continuation extends the current value (no character inserted).
pub fn wrapped_continuation_extends_the_value_test() {
  let occ =
    FieldOccurrence(
      "TI",
      NonEmpty(TaggedStart(line_witness(<<"PEAC":utf8>>)), [
        WrappedText(line_witness(<<"H":utf8>>)),
      ]),
    )
  // "PEAC" padded to 69 bytes then "H..." appended, trimmed once at the end:
  // the pad between them is NOT interior (PEAC fills only 4 of 69 cols here),
  // so this synthetic case shows the join keeps everything up to the last
  // non-space. Expect "PEAC" + 65 spaces + "H" trimmed -> ends at "H".
  let assert Ok([value]) = field_value.field_values(occ, 0xAC)
  let assert <<"PEAC":utf8, _:bytes>> = value
  // The final non-space is the H from the continuation.
  let assert Ok(text) = bit_array.to_string(value)
  should.be_true(string_ends_with(text, "H"))
}

// A marked continuation opens a NEW value; its marker byte (column 4) is dropped.
pub fn marked_continuation_opens_a_new_value_test() {
  let marked = marked_witness(<<"A5000":utf8>>)
  let occ =
    FieldOccurrence(
      "AC",
      NonEmpty(TaggedStart(line_witness(<<"A4900":utf8>>)), [marked]),
    )
  field_value.field_values(occ, 0xAC)
  |> should.equal(Ok([<<"A4900":utf8>>, <<"A5000":utf8>>]))
}

// A witness whose column 4 is the 0xAC marker, then `content`.
fn marked_witness(content: BitArray) -> Witness {
  let body = bit_array.append(<<0xAC>>, content)
  let padding = pad(69 - bit_array.byte_size(body))
  let line =
    bit_array.concat([<<"  ":utf8>>, <<0x20>>, body, padding, <<0x0d, 0x0a>>])
  Witness(Location("F", 1, 0, 82), MarkedValueStart(line).0)
}

fn string_ends_with(s: String, suffix: String) -> Bool {
  case s == suffix {
    True -> True
    False ->
      case s {
        "" -> False
        _ -> string_ends_with(drop_first_grapheme(s), suffix)
      }
  }
}
```

> Implementer note: the two string helpers above are avoidable — prefer asserting on the trimmed `BitArray` directly (e.g. `value |> should.equal(<<"...":utf8>>)`) once you know the exact expected bytes for your synthetic line. They are shown only to make the "ends at H" intent explicit; replace them with a direct byte assertion when you write the real test, and delete `marked_witness`'s `.0` mistake — build the `Witness` directly as in `line_witness`.

- [x] **Step 2: Correct the test to assert on bytes directly**

Replace the wrapped and marked tests above with exact-byte assertions (cleaner, no string helpers):

```gleam
pub fn wrapped_continuation_extends_the_value_test() {
  // Opener columns "PEAC" + 65 pad; continuation columns "H" + 68 pad.
  // Joined raw = "PEAC"+65sp+"H"+68sp; trimmed once -> "PEAC"+65sp+"H".
  let expected =
    bit_array.concat([<<"PEAC":utf8>>, pad(65), <<"H":utf8>>])
  let occ =
    FieldOccurrence(
      "TI",
      NonEmpty(TaggedStart(line_witness(<<"PEAC":utf8>>)), [
        WrappedText(line_witness(<<"H":utf8>>)),
      ]),
    )
  field_value.field_values(occ, 0xAC)
  |> should.equal(Ok([expected]))
}

pub fn marked_continuation_opens_a_new_value_test() {
  let occ =
    FieldOccurrence(
      "AC",
      NonEmpty(TaggedStart(line_witness(<<"A4900":utf8>>)), [
        MarkedValueStart(marked_line_witness(<<"A5000":utf8>>)),
      ]),
    )
  field_value.field_values(occ, 0xAC)
  |> should.equal(Ok([<<"A4900":utf8>>, <<"A5000":utf8>>]))
}

// Build a Witness whose line has 0xAC in column 4 then `content`.
fn marked_line_witness(content: BitArray) -> Witness {
  let body = bit_array.append(<<0xAC>>, content)
  let padding = pad(69 - bit_array.byte_size(body))
  let line =
    bit_array.concat([<<"  ":utf8>>, <<0x20>>, body, padding, <<0x0d, 0x0a>>])
  Witness(Location("F", 1, 0, 82), line)
}
```

Remove `marked_witness`, `string_ends_with`, `drop_first_grapheme`, and the `single_value` test's dependence on any string helper. Keep `line_witness`, `pad`, `list_repeat_concat`.

- [x] **Step 3: Run tests to verify they fail**

Run: `gleam test`
Expected: FAIL — `field_value` is an unknown module.

- [x] **Step 4: Implement `field_value.field_values`**

Create `src/field_value.gleam`:

```gleam
//// Joining a FieldOccurrence's fragments into ordered lexical values. A
//// TaggedStart opens the first value; a WrappedText appends its raw columns
//// 4-72 to the current value (no character inserted); a MarkedValueStart opens
//// a new value whose bytes are its raw columns with the marker byte (column 4)
//// dropped. Each finished value is trailing-space-trimmed once at the end, so
//// an interior nonconformance is not silently repaired. Mirrors record.ts.

import card_image.{type CardImageError}
import gleam/bit_array
import gleam/list
import record_model.{
  type FieldOccurrence, type Fragment, type Witness, FieldOccurrence,
  MarkedValueStart, NonEmpty, TaggedStart, Witness, WrappedText,
}

/// The field's lexical values in order, each trimmed. `_marker` documents that
/// marked-value handling is profile-derived; the fragment variants already
/// carry the classification, so it is not re-read here.
pub fn field_values(
  occurrence: FieldOccurrence,
  _marker: Int,
) -> Result(List(BitArray), CardImageError) {
  let FieldOccurrence(_tag, NonEmpty(first, rest)) = occurrence
  // Values accumulate newest-first; each value is a reversed list of byte
  // chunks. Start with the opener's raw columns as the first value.
  case fold_fragments([first, ..rest], []) {
    Error(reason) -> Error(reason)
    Ok(values_reversed) ->
      Ok(
        values_reversed
        |> list.reverse
        |> list.map(fn(chunks_reversed) {
          chunks_reversed
          |> list.reverse
          |> bit_array.concat
          |> card_image.trim_trailing_spaces
        }),
      )
  }
}

// Each accumulated value is a reversed list of raw-column chunks; `values` is
// the reversed list of those.
fn fold_fragments(
  fragments: List(Fragment),
  values: List(List(BitArray)),
) -> Result(List(List(BitArray)), CardImageError) {
  case fragments {
    [] -> Ok(values)
    [fragment, ..rest] ->
      case chunk_for(fragment) {
        Error(reason) -> Error(reason)
        Ok(#(opens_new_value, chunk)) ->
          case opens_new_value, values {
            True, _ -> fold_fragments(rest, [[chunk], ..values])
            False, [current, ..older] ->
              fold_fragments(rest, [[chunk, ..current], ..older])
            // A wrapped continuation with no open value cannot occur: assembly
            // only attaches continuations after a TaggedStart. Treat as a new
            // value to stay total rather than crash.
            False, [] -> fold_fragments(rest, [[chunk]])
          }
      }
  }
}

// The raw-column chunk a fragment contributes, and whether it opens a new
// value. TaggedStart and MarkedValueStart open a new value; WrappedText
// extends the current one. A marked value drops its column-4 marker byte.
fn chunk_for(fragment: Fragment) -> Result(#(Bool, BitArray), CardImageError) {
  case fragment {
    TaggedStart(witness) -> new_value(witness, drop_marker: False)
    WrappedText(witness) ->
      case card_image.raw_columns(witness_bytes(witness)) {
        Ok(columns) -> Ok(#(False, columns))
        Error(reason) -> Error(reason)
      }
    MarkedValueStart(witness) -> new_value(witness, drop_marker: True)
  }
}

fn new_value(
  witness: Witness,
  drop_marker drop_marker: Bool,
) -> Result(#(Bool, BitArray), CardImageError) {
  case card_image.raw_columns(witness_bytes(witness)) {
    Error(reason) -> Error(reason)
    Ok(columns) ->
      case drop_marker {
        False -> Ok(#(True, columns))
        True ->
          case columns {
            <<_marker, rest:bytes>> -> Ok(#(True, rest))
            _ -> Ok(#(True, columns))
          }
      }
  }
}

fn witness_bytes(witness: Witness) -> BitArray {
  let Witness(_location, bytes) = witness
  bytes
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `gleam test`
Expected: PASS — three `field_value` tests green, everything else still green.

- [x] **Step 6: Add a corpus-grounded test for the AC field**

Add to `test/field_value_test.gleam` a test that assembles the real AC field bytes (reuse the four `ac_*` literals from `test/assembly_test.gleam` — copy them in, or extract the field from a full-fixture assemble) and asserts:

```gleam
// The AC field's four fragments join to four values in order.
pub fn ac_field_joins_to_its_four_values_test() {
  // Build the FieldOccurrence from the four real AC lines (opener + 3 marked),
  // then join. Expected values: A4900, A5000, A4900, A4900.
  // (Construct the occurrence via assembly.parts_of on the four lines, or build
  // the fragments directly with marked_line_witness/line_witness.)
  let occ = ac_occurrence()
  field_value.field_values(occ, 0xAC)
  |> should.equal(
    Ok([<<"A4900":utf8>>, <<"A5000":utf8>>, <<"A4900":utf8>>, <<"A4900":utf8>>]),
  )
}
```

Implement `ac_occurrence()` by building the four fragments with `line_witness`/`marked_line_witness` from the real column contents (`A4900`, then marked `A5000`, `A4900`, `A4900`).

- [x] **Step 7: Run and gate completed; commit skipped per project instruction**

```bash
gleam test
gleam format src test
gleam format --check src test
gleam check
git add docs/formatb-reading/src/field_value.gleam docs/formatb-reading/test/field_value_test.gleam
git commit -m "feat(formatb-reading): join a field's fragments into ordered values"
```

Expected: all green, format clean, 0 check errors (2 expected warnings).

---

## Task 3: Scan a whole file into record spans

Mirror `offsets.ts:scanRecords`. Split the file into 82-byte lines; a line beginning `<<` is the file header, `>>` is the trailer (and closes any open record before it), `$$` starts a new record. Each record's bytes are the concatenation of its lines, with a `SourceBase` giving its file-absolute first line. Then `assembly.assemble` runs on each.

**Files:**
- Create: `src/scan.gleam`
- Test: `test/scan_test.gleam`

**Interfaces:**
- Consumes: `card_image.{split_lines, line_bytes, CardImageError}`; `assembly.SourceBase`.
- Produces:
  - `pub type FileStructure { FileStructure(header: Option(BitArray), trailer: Option(BitArray)) }`
  - `pub type ScannedRecord { ScannedRecord(base: SourceBase, bytes: BitArray) }`
  - `pub type ScanResult { ScanResult(records: List(ScannedRecord), structure: FileStructure) }`
  - `pub fn scan(file_bytes: BitArray, file: String, base_line: Int) -> Result(ScanResult, CardImageError)` — `base_line` is the file line number of the first byte (1 for a whole file). A non-line-aligned file surfaces `LengthNotLineAligned`.

- [x] **Step 1: Write the failing tests**

Create `test/scan_test.gleam`. Build synthetic 82-byte lines with a helper (copy `served_line`/`spaces` shape from `card_image_test.gleam`), then:

```gleam
//// scan: split a whole file's bytes into record spans plus header/trailer.

import assembly
import card_image
import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import scan

fn line(first_two: BitArray) -> BitArray {
  let padding = pad(80 - bit_array.byte_size(first_two))
  bit_array.concat([first_two, padding, <<0x0d, 0x0a>>])
}

fn pad(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, pad(n - 1))
  }
}

// Two records, each opened by "$$", between a header and trailer.
pub fn scan_splits_records_between_header_and_trailer_test() {
  let file =
    bit_array.concat([
      line(<<"<<":utf8>>),
      line(<<"$$":utf8>>),
      line(<<"AN":utf8>>),
      line(<<"$$":utf8>>),
      line(<<"AN":utf8>>),
      line(<<">>":utf8>>),
    ])
  let assert Ok(scan.ScanResult(records, structure)) = scan.scan(file, "F", 1)
  // Two records.
  list.length(records) |> should.equal(2)
  // Header and trailer captured.
  let scan.FileStructure(header, trailer) = structure
  should.be_true(header != None)
  should.be_true(trailer != None)
  // First record starts at file line 2 (after the header on line 1) and is two
  // lines long (the "$$" and its "AN").
  let assert [scan.ScannedRecord(base, bytes), _] = records
  base |> should.equal(assembly.SourceBase("F", 2))
  bit_array.byte_size(bytes) |> should.equal(164)
}

pub fn scan_rejects_a_ragged_file_test() {
  let assert Error(card_image.LengthNotLineAligned(3)) =
    scan.scan(<<0, 1, 2>>, "F", 1)
}

// Each scanned record assembles (integration with assembly.assemble).
pub fn scanned_records_assemble_test() {
  let file =
    bit_array.concat([line(<<"$$":utf8>>), line(<<"AN":utf8>>)])
  let assert Ok(scan.ScanResult([record], _)) = scan.scan(file, "F", 1)
  let scan.ScannedRecord(base, bytes) = record
  let assert Ok(_) = assembly.assemble(bytes, base, 0xAC)
}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `gleam test`
Expected: FAIL — `scan` is an unknown module.

- [x] **Step 3: Implement `scan.scan`**

Create `src/scan.gleam`:

```gleam
//// Scan a whole file's bytes into record spans plus the file header/trailer.
//// Fixed 82-byte lines (card_image.split_lines); "<<" is the file header,
//// ">>" the trailer (which closes any open record before it), "$$" starts a
//// record. Mirrors offsets.ts scanRecords. Line/byte provenance is file-
//// absolute via base_line.

import assembly.{type SourceBase, SourceBase}
import card_image.{type CardImageError}
import gleam/bit_array
import gleam/list
import gleam/option.{type Option, None, Some}

pub type FileStructure {
  FileStructure(header: Option(BitArray), trailer: Option(BitArray))
}

pub type ScannedRecord {
  ScannedRecord(base: SourceBase, bytes: BitArray)
}

pub type ScanResult {
  ScanResult(records: List(ScannedRecord), structure: FileStructure)
}

pub fn scan(
  file_bytes: BitArray,
  file: String,
  base_line: Int,
) -> Result(ScanResult, CardImageError) {
  case card_image.split_lines(file_bytes) {
    Error(reason) -> Error(reason)
    Ok(lines) -> {
      let state =
        walk(lines, 0, file, base_line, None, [], FileStructure(None, None))
      Ok(state)
    }
  }
}

// An open record: its base and its lines so far in reverse.
type Open {
  Open(base: SourceBase, lines_reversed: List(BitArray))
}

fn first_two(line: BitArray) -> BitArray {
  case bit_array.slice(line, 0, 2) {
    Ok(two) -> two
    Error(Nil) -> <<>>
  }
}

fn close(open: Option(Open), records: List(ScannedRecord)) -> List(ScannedRecord) {
  case open {
    None -> records
    Some(Open(base, lines_reversed)) -> {
      let bytes = lines_reversed |> list.reverse |> bit_array.concat
      [ScannedRecord(base, bytes), ..records]
    }
  }
}

fn walk(
  lines: List(BitArray),
  index: Int,
  file: String,
  base_line: Int,
  open: Option(Open),
  records: List(ScannedRecord),
  structure: FileStructure,
) -> ScanResult {
  case lines {
    [] ->
      ScanResult(records: close(open, records) |> list.reverse, structure: structure)
    [line, ..rest] ->
      case first_two(line) {
        <<"<<":utf8>> ->
          walk(rest, index + 1, file, base_line, open, records,
            FileStructure(Some(line), structure.trailer))
        <<">>":utf8>> ->
          walk(rest, index + 1, file, base_line, None,
            close(open, records),
            FileStructure(structure.header, Some(line)))
        <<"$$":utf8>> -> {
          let base = SourceBase(file, base_line + index)
          walk(rest, index + 1, file, base_line,
            Some(Open(base, [line])), close(open, records), structure)
        }
        _ ->
          case open {
            Some(Open(base, lines_reversed)) ->
              walk(rest, index + 1, file, base_line,
                Some(Open(base, [line, ..lines_reversed])), records, structure)
            // A line before any "$$" and not header/trailer: ignore it here;
            // a later step may record it. Scoped to this reader.
            None -> walk(rest, index + 1, file, base_line, None, records, structure)
          }
      }
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `gleam test`
Expected: PASS — three `scan` tests green.

- [x] **Step 5: Full-file integration — scan then assemble every record**

Add a test that reads the whole `fy94-9049442.bin` (which is one record with no header/trailer), scans it, and assembles the single record. Note the fixture has no `<<`/`>>` and opens with `$$`, so `scan` yields one `ScannedRecord`:

```gleam
pub fn scan_the_fixture_yields_one_assemblable_record_test() {
  let assert Ok(bytes) =
    simplifile.read_bits("../../packages/cris-formatb/fixtures/fy94-9049442.bin")
  let assert Ok(scan.ScanResult([record], _)) = scan.scan(bytes, "RG164.CRIS.FY94.txt", 83_052)
  let scan.ScannedRecord(base, record_bytes) = record
  base |> should.equal(assembly.SourceBase("RG164.CRIS.FY94.txt", 83_052))
  let assert Ok(_) = assembly.assemble(record_bytes, base, 0xAC)
}
```

Add `import simplifile` to the test.

- [x] **Step 6: Run and gate completed; commit skipped per project instruction**

```bash
gleam test
gleam format src test
gleam format --check src test
gleam check
git add docs/formatb-reading/src/scan.gleam docs/formatb-reading/test/scan_test.gleam
git commit -m "feat(formatb-reading): scan a file into record spans and header/trailer"
```

Expected: all green, format clean, 0 check errors (2 expected warnings).

- [x] **Step 7: Update the README to reflect value joining and scanning**

In `docs/formatb-reading/README.md`, add short paragraphs under "Implementation status" for `field_value.field_values` and `scan.scan` (mirroring the existing per-function paragraphs), move both out of the "does not yet do" list, and bump the `gleam test` count. Keep the code and README in lockstep (a hard project rule). Commit:

```bash
git add docs/formatb-reading/README.md
git commit -m "docs(formatb-reading): document value joining and record scanning"
```

---

## Out of scope: construction toward `Project`

The third remaining piece — building a checked `Project` from a `SuppliedRecord`, accumulating `ConstructionProblem`s — is **not planned here on purpose**. It cannot be written as no-placeholder tasks yet because it depends on transcribing the per-field documentary rules (requiredness, repetition, lengths, character classes, value constraints, evidence grade) from the NARA PDF `367_1DP.pdf`, which the README's "Remaining source-based specification work" section flags as unfinished. That transcription is a spec/brainstorm task (use `superpowers:brainstorming` + the source pages), producing a rule inventory. Only then can a plan for the field smart constructors and `ConstructionProblem` accumulation be written without inventing rules. Do not start construction from code-shape guesses.

---

## Self-Review

**Spec coverage:** Value joining → Tasks 1-2. Multi-record scanning → Task 3. Construction toward `Project` → explicitly gated with its prerequisite named. The three "next steps" from the README are all accounted for.

**Placeholder scan:** Task 2 Step 1 deliberately shows a first-draft test then Step 2 corrects it to byte assertions — the final code is complete and the throwaway helpers are called out for deletion. Task 2 Step 6 and Task 3 Step 5 describe building an occurrence/reading a file with the exact expected values; the implementer has the byte contents (`A4900`, `A5000`, etc.) and the existing `ac_*` literals in `assembly_test.gleam` to copy. No "TODO"/"handle edge cases"/"similar to" placeholders remain in production code.

**Type consistency:** `raw_columns`/`trim_trailing_spaces` (Task 1) are consumed by `field_values` (Task 2) with matching signatures. `SourceBase` and `assembly.assemble` (existing) are consumed by `scan` (Task 3) with matching signatures. `field_values` returns `Result(List(BitArray), CardImageError)` consistently. `scan` returns `Result(ScanResult, CardImageError)` consistently.
