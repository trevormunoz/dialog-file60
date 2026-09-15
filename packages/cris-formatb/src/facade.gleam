//// The native-Gleam projection of the reader's output onto the frozen
//// `@barcstory/cris-formatb` contract (`LogicalRecord`/`SourceField`/
//// `SourceValue`/`RecordSpan`/`FileStructure`/`ScanResult`). Nothing above
//// this module re-derives structure: `scan_records`/`parse_record` are the
//// whole of the projection. See docs/superpowers/specs/
//// 2026-09-15-unify-gleam-reader-behind-facade-design.md §2 for the
//// field-by-field mapping and Task 9 of the matching plan.
////
//// Strict byte-parity with src-ts/record.ts + src-ts/offsets.ts (the oracle)
//// is the gate (test/parity.test.ts, run over the compiled bundle), so this
//// module deliberately reproduces the oracle's own quirks: `splitSegments`
//// runs on the value's already-`trimEnd`'d raw text, a value's `line`/
//// `offset` come from whichever fragment opened it (not every fragment that
//// contributed bytes to it), and a field's `lineEnd`/`length` grow with its
//// last continuation line. The mature reader's corrections (the `0xAC`
//// single-value fix, etc.) are NOT adopted here — see the design spec's
//// "Out of scope / deferred".

import assembly
import field_value
import gleam/bit_array
import gleam/list
import gleam/option.{type Option}
import js_string
import latin1
import scan
import segment
import source_record.{
  type Fragment, type Location, MarkedValueStart, TaggedStart, WrappedText,
}

/// The two Format B eras `parse_record` reads. FY1988 carries a value's
/// percent inside the same 0xA0 0x02-delimited block as its code/label
/// (`segment.split_heading_segments`'s `percent_in_block`); FY1991 onward
/// carries it in a separate `SN` tag, so the block never has a third part.
pub type Profile {
  Fy1988
  Fy1991plus
}

pub type SourceValue {
  SourceValue(
    raw: String,
    code: Option(String),
    label: Option(String),
    percent: Option(String),
    line: Int,
    offset: Int,
    continuation: Bool,
  )
}

pub type SourceField {
  SourceField(
    tag: String,
    values: List(SourceValue),
    line_start: Int,
    line_end: Int,
    offset: Int,
    length: Int,
  )
}

pub type LogicalRecord {
  LogicalRecord(
    file: String,
    first_line: Int,
    last_line: Int,
    offset: Int,
    length: Int,
    an: String,
    fields: List(SourceField),
    orphan_continuations: Int,
  )
}

pub type RecordSpan {
  RecordSpan(
    first_line: Int,
    last_line: Int,
    offset: Int,
    length: Int,
    an: String,
  )
}

pub type FileStructure {
  FileStructure(header: Option(String), trailer: Option(String))
}

pub type ScanResult {
  ScanResult(spans: List(RecordSpan), structure: FileStructure, bad_lines: Int)
}

/// NARA's served line form: 80 columns plus CRLF (card_image.line_bytes /
/// index.ts LINE_BYTES).
const line_bytes: Int = 82

/// The profile marker byte that opens a MarkedValueStart continuation.
/// Registry: formatb.encoding.continuation_0xAC — 0xAC for both profiles
/// (src-ts/profiles.ts PROFILES.*.continuationByte).
const marker_byte: Int = 0xAC

/// Scan a whole byte-aligned buffer into contiguous record spans plus the
/// observed file header/trailer, mirroring offsets.ts:scanRecords. `file` is
/// not part of the frozen `RecordSpan`/`ScanResult` shape (record.ts's own
/// `scanRecords` takes none either — the caller supplies `file` again to
/// `parse_record`), so scanning does not need one.
pub fn scan_records(bytes: BitArray, base_line: Int) -> ScanResult {
  let assert Ok(scanned) = scan.scan(bytes, "", base_line)
    as "scan_records requires a Format B buffer whose length is a whole multiple of 82 bytes"
  ScanResult(
    spans: list.map(scanned.records, record_span_of),
    structure: file_structure_of(scanned.structure),
    bad_lines: count_bad_lines(bytes, 0, 0),
  )
}

fn record_span_of(record: scan.ScannedRecord) -> RecordSpan {
  let byte_length = bit_array.byte_size(record.bytes)
  let first_line = record.base.first_line
  RecordSpan(
    first_line: first_line,
    last_line: first_line + byte_length / line_bytes - 1,
    offset: { first_line - 1 } * line_bytes,
    length: byte_length,
    an: option.unwrap(scan.accession_of(record), ""),
  )
}

fn file_structure_of(structure: scan.FileStructure) -> FileStructure {
  FileStructure(
    header: option.map(structure.header, structure_text),
    trailer: option.map(structure.trailer, structure_text),
  )
}

// The observed header/trailer line, decoded and trailing-trimmed over its
// 80 data columns only (excludes the 2-byte CRLF) — matches offsets.ts:
// `latin1(bytes.subarray(at, at + 80)).trimEnd()`.
fn structure_text(line: BitArray) -> String {
  let assert Ok(first_80) = bit_array.slice(line, 0, 80)
    as "a structure line is a full served line, at least 80 bytes"
  js_string.trim_end(latin1.decode(first_80))
}

// Lines whose last two bytes are not CRLF (full-corpus check), matching
// offsets.ts:48. Not tracked by scan.scan, so computed here directly: a walk
// by byte offset over the (line-aligned) buffer, peeking bytes 80-81 of each
// line with no per-line allocation. The catch-all is the end of the buffer.
fn count_bad_lines(bytes: BitArray, at: Int, acc: Int) -> Int {
  case bytes {
    <<_:bytes-size(at), _:bytes-size(80), 0x0D, 0x0A, _:bytes>> ->
      count_bad_lines(bytes, at + line_bytes, acc)
    <<_:bytes-size(at), _:bytes-size(line_bytes), _:bytes>> ->
      count_bad_lines(bytes, at + line_bytes, acc + 1)
    _ -> acc
  }
}

/// Parse one record's fields from `bytes` (which may be a larger buffer than
/// the record itself — a whole-corpus read), locating it via `span` and
/// `buffer_base_line`, the line `bytes[0]` sits on. Mirrors record.ts:32-78:
/// field/value geometry and grouping come from `assembly`/`field_value`;
/// `an` and the record's own geometry are carried straight through from
/// `span`, never re-derived from `bytes` here.
pub fn parse_record(
  bytes: BitArray,
  span: RecordSpan,
  file: String,
  profile: Profile,
  buffer_base_line: Int,
) -> LogicalRecord {
  let start = { span.first_line - buffer_base_line } * line_bytes
  let assert Ok(record_bytes) = bit_array.slice(bytes, start, span.length)
    as "span falls outside the supplied buffer"
  let base = assembly.SourceBase(file, span.first_line)
  // KNOWN, DEFERRED divergence from the oracle (record.ts:58): `assembly` decodes
  // a line's two tag bytes as UTF-8 and returns `TagNotAscii` for a byte >= 0x80,
  // whereas the oracle decodes the tag with total `latin1` and never rejects. So a
  // record whose tag columns carry a non-ASCII byte panics here while the oracle
  // reads it as a field with an odd tag. This is UNREACHABLE on the served corpus
  // (FY88/FY89/FY94 tags are ASCII in all ~100k records — full-corpus parity is
  // green), so it is outside the migration's contract (byte-identical output over
  // the File 60 data). The faithful fix — read tags with latin1 in the reader and
  // make tag-ASCII-ness a *validator* rule — is a reader/validator boundary change
  // deferred with the other corrections. See the design spec's deferred list.
  let assert Ok(supplied) = assembly.assemble(record_bytes, base, marker_byte)
    as "a scanned record's own bytes assemble cleanly (tags ASCII across the corpus)"
  let percent_in_block = case profile {
    Fy1988 -> True
    Fy1991plus -> False
  }
  let fields =
    list.filter_map(supplied.parts, fn(part) {
      case part {
        source_record.Field(occurrence) ->
          Ok(source_field_of(occurrence, percent_in_block))
        source_record.Unassigned(_) -> Error(Nil)
      }
    })
  let orphan_continuations =
    list.fold(supplied.parts, 0, fn(acc, part) {
      case part {
        source_record.Unassigned(_) -> acc + 1
        source_record.Field(_) -> acc
      }
    })
  LogicalRecord(
    file: file,
    first_line: span.first_line,
    last_line: span.last_line,
    offset: span.offset,
    length: span.length,
    an: span.an,
    fields: fields,
    orphan_continuations: orphan_continuations,
  )
}

fn source_field_of(
  occurrence: source_record.FieldOccurrence,
  percent_in_block: Bool,
) -> SourceField {
  let source_record.FieldOccurrence(tag, fragments_ne) = occurrence
  let source_record.NonEmpty(first, rest) = fragments_ne
  let fragments = [first, ..rest]
  let assert Ok(last_fragment) = list.last(fragments)
    as "NonEmpty guarantees at least one fragment"
  let first_location = location_of(first)
  let line_start = first_location.first_line
  let line_end = location_of(last_fragment).first_line
  let assert Ok(byte_values) = field_value.field_values(occurrence)
    as "an assembled occurrence's own fragments always yield readable columns"
  let leaders = leader_fragments(fragments)
  // `field_values` (byte values) and `leader_fragments` (per-value line/offset/
  // continuation) are two independent folds over the same fragments, paired by
  // position. `list.zip` truncates silently on a length mismatch, so assert they
  // agree — if the two folds ever drift, fail loudly here rather than dropping
  // per-value metadata unnoticed.
  let assert True = list.length(byte_values) == list.length(leaders)
    as "field_values and leader_fragments must produce one entry per value"
  let values =
    list.zip(byte_values, leaders)
    |> list.map(fn(pair) { source_value_of(pair.0, pair.1, percent_in_block) })
  SourceField(
    tag: tag,
    values: values,
    line_start: line_start,
    line_end: line_end,
    offset: first_location.byte_offset,
    length: { line_end - line_start + 1 } * line_bytes,
  )
}

fn source_value_of(
  bytes: BitArray,
  leader: Fragment,
  percent_in_block: Bool,
) -> SourceValue {
  // record.ts:76 trims the whole raw value once before splitSegments runs on
  // it, and splitSegments's own code/label/percent trims (record.ts:23,27,29)
  // are relative to that already-trimmed text — so `raw` is computed first
  // and split_heading_segments reads it, not a fresh decode of `bytes`.
  let raw = js_string.trim_end(latin1.decode(bytes))
  let parts = segment.split_heading_segments(raw, percent_in_block)
  let location = location_of(leader)
  SourceValue(
    raw: raw,
    code: option.map(parts.code, js_string.trim_end),
    label: option.map(parts.label, js_string.trim_end),
    percent: option.map(parts.percent, js_string.trim),
    line: location.first_line,
    offset: location.byte_offset,
    continuation: case leader {
      MarkedValueStart(_) -> True
      TaggedStart(_) | WrappedText(_) -> False
    },
  )
}

fn location_of(fragment: Fragment) -> Location {
  case fragment {
    TaggedStart(witness) -> witness.location
    WrappedText(witness) -> witness.location
    MarkedValueStart(witness) -> witness.location
  }
}

// The leading fragment of each value `field_value.field_values` groups
// fragments into, in the same order — mirrors field_value's own private
// `fold_fragments` grouping (a WrappedText fragment extends the value
// already open; TaggedStart/MarkedValueStart always opens a new one) so a
// value's line/offset/continuation can be read off its leader without
// field_value exposing per-fragment metadata itself.
fn leader_fragments(fragments: List(Fragment)) -> List(Fragment) {
  fold_leaders(fragments, [])
  |> list.reverse
}

fn fold_leaders(
  fragments: List(Fragment),
  leaders_reversed: List(Fragment),
) -> List(Fragment) {
  case fragments {
    [] -> leaders_reversed
    [fragment, ..rest] ->
      case fragment, leaders_reversed {
        WrappedText(_), [_current, ..] -> fold_leaders(rest, leaders_reversed)
        TaggedStart(_), _ | MarkedValueStart(_), _ ->
          fold_leaders(rest, [fragment, ..leaders_reversed])
        WrappedText(_), [] -> fold_leaders(rest, [fragment, ..leaders_reversed])
      }
  }
}
