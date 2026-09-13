//// Assembly: grouping a record's classified card lines into the model's
//// FieldOccurrences and a SuppliedRecord, each fragment carrying a Witness /
//// Location built from a machine-derived SourceBase. Run with `gleam test`.

import assembly
import card_image
import gleam/bit_array
import gleam/list
import gleeunit/should
import record_model
import simplifile

// The byte offset is file-absolute, computed from the base's first line:
// (first_line - 1) * 82. This reproduces the fixture's own extraction record
// (fixtures/SOURCES.md: record at line 83052 begins at byte 6810182).
pub fn line_location_is_file_absolute_from_the_base_test() {
  let base =
    assembly.SourceBase(file: "RG164.CRIS.FY94.txt", first_line: 83_052)

  // The record's first line (index 0): the "$$" separator at file line 83052.
  let assert record_model.Location(
    file: "RG164.CRIS.FY94.txt",
    first_line: 83_052,
    byte_offset: 6_810_182,
    byte_length: 82,
  ) = assembly.line_location(base, 0)

  // The AN line (index 1, file line 83053): one 82-byte line further in.
  let assert record_model.Location(
    file: "RG164.CRIS.FY94.txt",
    first_line: 83_053,
    byte_offset: 6_810_264,
    byte_length: 82,
  ) = assembly.line_location(base, 1)
}

// --- line_role: interpret one line for the assembly walk — opens a field,
// continues one (wrapped or marked), or is the record boundary. Builds the
// model's Witness/Fragment from the base. ---

pub fn line_role_boundary_on_a_separator_line_test() {
  let base = assembly.SourceBase("F", 100)
  let assert Ok(assembly.Boundary) =
    assembly.line_role(base, 0, <<"$$":utf8>>, 0xAC)
}

pub fn line_role_opens_a_field_on_a_tagged_line_test() {
  let base = assembly.SourceBase("F", 100)
  let line = <<"AN 9049442":utf8>>
  let assert Ok(assembly.Opens("AN", record_model.TaggedStart(witness))) =
    assembly.line_role(base, 1, line, 0xAC)
  // The witness carries the whole line's bytes and its file-absolute location.
  let record_model.Witness(location: loc, bytes: bytes) = witness
  let assert True = bytes == line
  let assert record_model.Location(
    file: "F",
    first_line: 101,
    byte_offset: 8200,
    byte_length: 82,
  ) = loc
}

pub fn line_role_continues_wrapped_when_col4_is_not_the_marker_test() {
  let base = assembly.SourceBase("F", 100)
  let line = <<"   H, SOYBEAN":utf8>>
  let assert Ok(assembly.Continues(record_model.WrappedText(_))) =
    assembly.line_role(base, 5, line, 0xAC)
}

pub fn line_role_continues_marked_when_col4_is_the_marker_test() {
  let base = assembly.SourceBase("F", 100)
  let line = <<"   ":utf8, 0xAC, "A5000":utf8>>
  let assert Ok(assembly.Continues(record_model.MarkedValueStart(_))) =
    assembly.line_role(base, 5, line, 0xAC)
}

pub fn line_role_reports_an_unreadable_line_test() {
  let base = assembly.SourceBase("F", 100)
  let assert Error(assembly.LineUnreadable(card_image.LineTooShort(1))) =
    assembly.line_role(base, 0, <<"A":utf8>>, 0xAC)
}

// --- parts_of: walk a record's lines into ordered RecordParts. A tagged line
// opens a field; following continuations attach as fragments; a continuation
// with no open field is Unassigned; the "$$" boundary yields no part. ---

pub fn parts_of_groups_tagged_lines_into_fields_test() {
  let base = assembly.SourceBase("F", 100)
  let lines = [<<"$$":utf8>>, <<"AN 9049442":utf8>>, <<"PD 860516":utf8>>]
  let assert Ok([
    record_model.Field(record_model.FieldOccurrence(
      "AN",
      record_model.NonEmpty(record_model.TaggedStart(_), []),
    )),
    record_model.Field(record_model.FieldOccurrence(
      "PD",
      record_model.NonEmpty(record_model.TaggedStart(_), []),
    )),
  ]) = assembly.parts_of(lines, base, 0xAC)
}

pub fn parts_of_attaches_a_wrapped_continuation_to_its_field_test() {
  let base = assembly.SourceBase("F", 100)
  let lines = [<<"TI THE PEAC":utf8>>, <<"   H, SOYBEAN":utf8>>]
  let assert Ok([
    record_model.Field(record_model.FieldOccurrence(
      "TI",
      record_model.NonEmpty(
        record_model.TaggedStart(_),
        [record_model.WrappedText(_)],
      ),
    )),
  ]) = assembly.parts_of(lines, base, 0xAC)
}

pub fn parts_of_attaches_a_marked_continuation_to_its_field_test() {
  let base = assembly.SourceBase("F", 100)
  let lines = [<<"AC A4900":utf8>>, <<"   ":utf8, 0xAC, "A5000":utf8>>]
  let assert Ok([
    record_model.Field(record_model.FieldOccurrence(
      "AC",
      record_model.NonEmpty(
        record_model.TaggedStart(_),
        [record_model.MarkedValueStart(_)],
      ),
    )),
  ]) = assembly.parts_of(lines, base, 0xAC)
}

pub fn parts_of_reports_an_orphan_continuation_as_unassigned_test() {
  let base = assembly.SourceBase("F", 100)
  let assert Ok([record_model.Unassigned(_)]) =
    assembly.parts_of([<<"   orphan text":utf8>>], base, 0xAC)
}

pub fn parts_of_a_lone_boundary_yields_no_parts_test() {
  let base = assembly.SourceBase("F", 100)
  let assert Ok([]) = assembly.parts_of([<<"$$":utf8>>], base, 0xAC)
}

// --- assemble: record bytes -> SuppliedRecord (split into lines, walked into
// parts, wrapped in a whole-record Witness). Grounded in real fixture bytes. ---

// Fixture file line 83052: the "$$" record separator (82 bytes).
fn fixture_separator_line() -> BitArray {
  <<
    36, 36, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
}

// Fixture file line 83053: the AN line, AN 9049442 (82 bytes).
fn fixture_an_line() -> BitArray {
  <<
    65, 78, 32, 57, 48, 52, 57, 52, 52, 50, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
}

pub fn assemble_builds_a_supplied_record_from_fixture_lines_test() {
  let base = assembly.SourceBase("RG164.CRIS.FY94.txt", 83_052)
  let record = bit_array.append(fixture_separator_line(), fixture_an_line())
  let assert Ok(record_model.SuppliedRecord(witness: witness, parts: parts)) =
    assembly.assemble(record, base, 0xAC)

  // The separator yields no part; the AN line is one field.
  let assert [
    record_model.Field(record_model.FieldOccurrence(
      "AN",
      record_model.NonEmpty(record_model.TaggedStart(_), []),
    )),
  ] = parts

  // The whole-record witness spans both lines (164 bytes) from the base's line.
  let record_model.Witness(location: loc, bytes: bytes) = witness
  let assert True = bytes == record
  let assert record_model.Location(
    file: "RG164.CRIS.FY94.txt",
    first_line: 83_052,
    byte_offset: 6_810_182,
    byte_length: 164,
  ) = loc
}

pub fn assemble_reports_a_ragged_record_test() {
  let base = assembly.SourceBase("RG164.CRIS.FY94.txt", 83_052)
  // 100 bytes is not a whole number of 82-byte lines.
  let ragged =
    bit_array.append(fixture_separator_line(), <<
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
    >>)
  let assert Error(assembly.LineUnreadable(card_image.LengthNotLineAligned(100))) =
    assembly.assemble(ragged, base, 0xAC)
}

// Corpus-grounded: the AC classification field, file lines 83083-83086 (opener
// AC A4900 + three 0xAC-marked continuations), assembled end to end. One field
// "AC" whose fragments are the TaggedStart opener then three MarkedValueStarts.
pub fn assemble_a_real_marked_field_end_to_end_test() {
  let ac_opener = <<
    65, 67, 32, 65, 52, 57, 48, 48, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let ac_a5000 = <<
    32, 32, 32, 172, 65, 53, 48, 48, 48, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let ac_a4900 = <<
    32, 32, 32, 172, 65, 52, 57, 48, 48, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let record = bit_array.concat([ac_opener, ac_a5000, ac_a4900, ac_a4900])
  let base = assembly.SourceBase("RG164.CRIS.FY94.txt", 83_083)
  let assert Ok(record_model.SuppliedRecord(parts: parts, ..)) =
    assembly.assemble(record, base, 0xAC)
  let assert [
    record_model.Field(record_model.FieldOccurrence(
      "AC",
      record_model.NonEmpty(
        record_model.TaggedStart(_),
        [
          record_model.MarkedValueStart(_),
          record_model.MarkedValueStart(_),
          record_model.MarkedValueStart(_),
        ],
      ),
    )),
  ] = parts
}

// --- Full-fixture integration: assemble the complete 122-line record from the
// real file on disk and check the whole field sequence against ground truth
// derived from the fixture. This is the one test that reads the actual bytes
// end to end (via simplifile), not embedded literals. ---

const fixture_path = "../../packages/cris-formatb/fixtures/fy94-9049442.bin"

// The 56 field tags in order, and each field's fragment count (opener plus its
// attached continuations), computed by walking fixtures/fy94-9049442.bin.
const expected_tags = [
  "AN", "PD", "PS", "AS", "DS", "PN", "IC", "PI", "CY", "ST", "ZP", "RE", "OC",
  "PF", "PT", "IN", "IN", "TI", "SD", "SX", "TD", "TX", "FY", "UP", "PP", "PX",
  "BT", "AT", "DT", "AC", "CM", "FS", "RP", "CT", "PA", "JC", "SC", "SN", "SF",
  "OB", "AP", "DE", "PR", "PH", "PH", "PH", "PH", "PH", "PH", "PH", "PH", "PH",
  "GH", "GH", "GH", "GH",
]

const expected_fragment_counts = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 2, 2, 1, 4, 15, 4, 22, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1,
]

// A Field's tag and fragment count; an Unassigned part is flagged so a stray
// one would break the tag comparison rather than pass silently.
fn part_summary(part: record_model.RecordPart) -> #(String, Int) {
  case part {
    record_model.Field(record_model.FieldOccurrence(
      tag,
      record_model.NonEmpty(_, rest),
    )) -> #(tag, 1 + list.length(rest))
    record_model.Unassigned(_) -> #("<<unassigned>>", 0)
  }
}

pub fn assemble_the_whole_fixture_record_test() {
  let assert Ok(record) = simplifile.read_bits(fixture_path)
  let base = assembly.SourceBase("RG164.CRIS.FY94.txt", 83_052)
  let assert Ok(record_model.SuppliedRecord(witness: witness, parts: parts)) =
    assembly.assemble(record, base, 0xAC)

  // Every part is a field in the expected order, with the expected fragment
  // counts; no orphan continuations.
  let summaries = list.map(parts, part_summary)
  list.map(summaries, fn(s) { s.0 })
  |> should.equal(expected_tags)
  list.map(summaries, fn(s) { s.1 })
  |> should.equal(expected_fragment_counts)

  // The whole-record witness holds the file's bytes and its file-absolute span.
  let record_model.Witness(location: loc, bytes: bytes) = witness
  bytes |> should.equal(record)
  loc
  |> should.equal(record_model.Location(
    file: "RG164.CRIS.FY94.txt",
    first_line: 83_052,
    byte_offset: 6_810_182,
    byte_length: 10_004,
  ))
}
