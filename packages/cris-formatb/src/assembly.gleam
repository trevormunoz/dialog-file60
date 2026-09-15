//// Assembly: turn a record's card lines into the model's SuppliedRecord —
//// ordered field occurrences whose fragments each carry a Witness / Location.
//// The source citation is machine-derived: the enclosing file scan knows the
//// file it opened and counts lines as it splits records, so a SourceBase (file
//// name + the record's first line number) is handed down, never entered by a
//// human per record. See source_record.gleam for the target types and
//// card_image.gleam for the per-line reading this builds on.

import card_image
import gleam/bit_array
import gleam/list
import gleam/option.{type Option, None, Some}
import source_record.{
  type Fragment, type Location, type RecordPart, type Witness, Field,
  FieldOccurrence, Location, MarkedValueStart, NonEmpty, TaggedStart, Unassigned,
  Witness, WrappedText,
}

/// Where a record begins in its source file. Machine-derived by the scan (or,
/// for an isolated fixture record, by the extraction metadata in SOURCES.md);
/// not typed in per record.
pub type SourceBase {
  SourceBase(file: String, first_line: Int)
}

/// NARA's served line form: 80 columns plus CRLF.
const line_bytes: Int = 82

/// The Location of the line at `line_index` (0-based) within a record. The line
/// number and byte offset are file-absolute, derived from the base: the offset
/// is (first_line - 1) * 82, matching the fixture's own extraction record.
pub fn line_location(base: SourceBase, line_index: Int) -> Location {
  let first_line = base.first_line + line_index
  Location(
    file: base.file,
    first_line: first_line,
    byte_offset: { first_line - 1 } * line_bytes,
    byte_length: line_bytes,
  )
}

/// One line's part in the assembly walk.
///   - Opens: a tagged line begins a field; carries the decoded two-letter tag
///     and its TaggedStart fragment.
///   - Continues: a continuation line extends the field above it; carries a
///     WrappedText or MarkedValueStart fragment.
///   - Boundary: the "$$" separator; not a fragment.
pub type LineRole {
  Opens(tag: String, fragment: Fragment)
  Continues(fragment: Fragment)
  Boundary
}

/// Why a line cannot be given a role.
pub type AssemblyError {
  /// The card-image reading of the line failed (too short, etc.).
  LineUnreadable(reason: card_image.CardImageError)
  /// A tag's two bytes are not decodable text; carries the raw bytes.
  TagNotAscii(bytes: BitArray)
}

/// Interpret one line for the assembly walk, building the model's Witness and
/// Fragment from the base. A "$$" line is a Boundary; a tagged line Opens a
/// field (its two tag bytes decoded to text); a continuation Continues one, as
/// WrappedText or MarkedValueStart per the profile marker.
pub fn line_role(
  base: SourceBase,
  line_index: Int,
  line: BitArray,
  marker: Int,
) -> Result(LineRole, AssemblyError) {
  let witness = Witness(location: line_location(base, line_index), bytes: line)
  case card_image.classify(line) {
    Ok(card_image.SeparatorLine) -> Ok(Boundary)
    Ok(card_image.TaggedLine(tag_bytes)) ->
      case bit_array.to_string(tag_bytes) {
        Ok(tag) -> Ok(Opens(tag, TaggedStart(witness)))
        Error(Nil) -> Error(TagNotAscii(tag_bytes))
      }
    Ok(card_image.ContinuationLine) ->
      case card_image.continuation_kind(line, marker) {
        Ok(card_image.Wrapped) -> Ok(Continues(WrappedText(witness)))
        Ok(card_image.Marked) -> Ok(Continues(MarkedValueStart(witness)))
        Error(reason) -> Error(LineUnreadable(reason))
      }
    Error(reason) -> Error(LineUnreadable(reason))
  }
}

/// Walk a record's ordered card lines into RecordParts: a tagged line opens a
/// field, following continuations attach as fragments in order, a continuation
/// with no field open is Unassigned, and the "$$" boundary yields no part. The
/// lines must be in record order; `base` and `marker` are as for `line_role`.
pub fn parts_of(
  lines: List(BitArray),
  base: SourceBase,
  marker: Int,
) -> Result(List(RecordPart), AssemblyError) {
  walk(lines, 0, base, marker, None, [])
}

// A field currently open: its tag, its opening TaggedStart fragment, and its
// continuation fragments so far in reverse order.
type Open {
  Open(tag: String, first: Fragment, rest_reversed: List(Fragment))
}

// Close the open field (if any) into a Field part at the front of `parts`.
fn close(open: Option(Open), parts: List(RecordPart)) -> List(RecordPart) {
  case open {
    None -> parts
    Some(Open(tag, first, rest_reversed)) -> {
      let occurrence =
        FieldOccurrence(
          tag: tag,
          fragments: NonEmpty(first, list.reverse(rest_reversed)),
        )
      [Field(occurrence), ..parts]
    }
  }
}

fn walk(
  lines: List(BitArray),
  index: Int,
  base: SourceBase,
  marker: Int,
  open: Option(Open),
  parts: List(RecordPart),
) -> Result(List(RecordPart), AssemblyError) {
  case lines {
    [] -> Ok(list.reverse(close(open, parts)))
    [line, ..rest] ->
      case line_role(base, index, line, marker) {
        Error(problem) -> Error(problem)
        Ok(Boundary) -> walk(rest, index + 1, base, marker, open, parts)
        Ok(Opens(tag, fragment)) ->
          walk(
            rest,
            index + 1,
            base,
            marker,
            Some(Open(tag, fragment, [])),
            close(open, parts),
          )
        Ok(Continues(fragment)) ->
          case open {
            Some(Open(tag, first, rest_reversed)) ->
              walk(
                rest,
                index + 1,
                base,
                marker,
                Some(Open(tag, first, [fragment, ..rest_reversed])),
                parts,
              )
            None ->
              walk(rest, index + 1, base, marker, None, [
                Unassigned(fragment_witness(fragment)),
                ..parts
              ])
          }
      }
  }
}

// Every Fragment wraps one Witness; recover it (for an orphan continuation that
// becomes an Unassigned part).
fn fragment_witness(fragment: Fragment) -> Witness {
  case fragment {
    TaggedStart(witness) -> witness
    WrappedText(witness) -> witness
    MarkedValueStart(witness) -> witness
  }
}

/// Assemble a whole record's bytes into a SuppliedRecord: split into 82-byte
/// lines, walk them into parts, and wrap them in a Witness spanning the whole
/// record from the base. A non-line-aligned record surfaces as LineUnreadable.
pub fn assemble(
  record: BitArray,
  base: SourceBase,
  marker: Int,
) -> Result(source_record.SuppliedRecord, AssemblyError) {
  case card_image.split_lines(record) {
    Error(reason) -> Error(LineUnreadable(reason))
    Ok(lines) ->
      case parts_of(lines, base, marker) {
        Error(problem) -> Error(problem)
        Ok(parts) -> {
          let location =
            Location(
              file: base.file,
              first_line: base.first_line,
              byte_offset: { base.first_line - 1 } * line_bytes,
              byte_length: bit_array.byte_size(record),
            )
          let witness = Witness(location: location, bytes: record)
          Ok(source_record.SuppliedRecord(witness: witness, parts: parts))
        }
      }
  }
}
