//// Card-image extraction: turning the bytes of one 80-column CRIS Format B
//// card line into a field's lexical value. PDF 367_1DP.pdf p. 2 and the
//// `record_model.gleam` Fragment doc comment: a two-letter tag in columns 1-2,
//// a blank in column 3, the field value in columns 4-72, and columns 73-80
//// ignored (supplier's own use). A field value is columns 4-72 with trailing
//// pad dropped; the pad is the card blank, ASCII space (0x20), and only that
//// byte is dropped, so any other trailing byte stays visible for later checks.

import gleam/bit_array
import gleam/list

/// What kind of card line this is, by its tag columns (1-2). Value extraction
/// is a separate concern (see `data_value`); this reads only columns 1-2.
///   - SeparatorLine: "$$", the record boundary.
///   - TaggedLine: a two-letter tag opening a field; carries the tag bytes.
///   - ContinuationLine: blank tag "  ", continuing the field above it. A
///     marked-value continuation (a profile-specific marker byte in column 4)
///     is distinguished from wrapped text separately by `continuation_kind`.
/// File-structure lines ("<<" header, ">>" trailer) are handled by `scan.scan`,
/// not this per-record classifier.
pub type LineKind {
  SeparatorLine
  TaggedLine(tag: BitArray)
  ContinuationLine
}

/// Why a card line yields no field value.
pub type CardImageError {
  /// The line's bytes stop before column 72, so columns 4-72 cannot be read;
  /// carries the line's actual byte count.
  LineTooShort(actual: Int)
  /// A record's byte count is not a whole number of 82-byte served lines;
  /// carries the actual byte count.
  LengthNotLineAligned(actual: Int)
}

const ascii_space: Int = 0x20

const data_start: Int = 3

// Columns 4-72 inclusive are the 69 bytes at 0-based offsets 3..71.
const data_length: Int = 69

/// Extract the field value from one card line: columns 4-72 (the 69 bytes at
/// offsets 3..71), with trailing ASCII spaces dropped. Columns 73-80 are never
/// read. Only the space pad (0x20) is dropped: any other trailing byte is kept
/// so a later field check can see it rather than have it silently repaired. A
/// line too short to reach column 72 yields `LineTooShort`.
pub fn data_value(line: BitArray) -> Result(BitArray, CardImageError) {
  case raw_columns(line) {
    Ok(columns) -> Ok(trim_trailing_spaces(columns))
    Error(reason) -> Error(reason)
  }
}

/// Columns 4-72, untrimmed: 69 bytes at offsets 3..71. Columns 73-80 are
/// excluded. A line stopping before column 72 yields `LineTooShort`.
pub fn raw_columns(line: BitArray) -> Result(BitArray, CardImageError) {
  case bit_array.slice(line, data_start, data_length) {
    Ok(region) -> Ok(region)
    Error(Nil) -> Error(LineTooShort(bit_array.byte_size(line)))
  }
}

/// NARA's served line form: 80 columns plus CRLF (index.ts LINE_BYTES).
pub const line_bytes: Int = 82

/// Split a record's bytes into fixed 82-byte served lines, in order. The width
/// is structural, so a byte count that is not a whole number of lines is a
/// typed `LengthNotLineAligned` rather than a silently dropped tail. Per-line
/// CRLF is a separate data-quality check, not enforced here.
pub fn split_lines(record: BitArray) -> Result(List(BitArray), CardImageError) {
  let size = bit_array.byte_size(record)
  case size % line_bytes {
    0 -> Ok(take_lines(record, []))
    _ -> Error(LengthNotLineAligned(size))
  }
}

// Peel 82-byte lines off the front. Only called on line-aligned input, so the
// catch-all matches the empty remainder, never a short leftover.
fn take_lines(record: BitArray, acc: List(BitArray)) -> List(BitArray) {
  case record {
    <<line:bytes-size(line_bytes), rest:bytes>> ->
      take_lines(rest, [line, ..acc])
    _ -> list.reverse(acc)
  }
}

/// For a continuation line, which of the model's continuation Fragments it is.
///   - Wrapped: corresponds to Fragment.WrappedText — the line's columns append
///     to the value opened above it (the "PEAC"+"H" title wrap).
///   - Marked: corresponds to Fragment.MarkedValueStart — the line's column-4
///     byte is the profile marker, opening a new value in the same field (the
///     0xAC-led AC/CM/... classification values).
pub type ContinuationKind {
  Wrapped
  Marked
}

/// Read whether a continuation line is wrapped text or a marked value: it is
/// Marked exactly when its column-4 byte equals `marker`. The marker is a
/// profile fact (0xAC for the FY94 record, observed in the data and recorded in
/// registry/evidence.json `formatb.encoding.continuation_0xAC`), passed in
/// rather than hardcoded. A line too short to have a column 4 is `LineTooShort`.
pub fn continuation_kind(
  line: BitArray,
  marker: Int,
) -> Result(ContinuationKind, CardImageError) {
  case line {
    <<_:bytes-size(data_start), byte, _:bytes>> if byte == marker -> Ok(Marked)
    <<_:bytes-size(data_start), _, _:bytes>> -> Ok(Wrapped)
    _ -> Error(LineTooShort(bit_array.byte_size(line)))
  }
}

/// Classify one card line by its tag columns (1-2): "$$" is a separator, a
/// blank "  " is a continuation, and any other two bytes are a tag opening a
/// field. A line too short to hold two bytes is `LineTooShort`.
pub fn classify(line: BitArray) -> Result(LineKind, CardImageError) {
  case line {
    <<"$$":utf8, _:bytes>> -> Ok(SeparatorLine)
    <<"  ":utf8, _:bytes>> -> Ok(ContinuationLine)
    <<tag:bytes-size(2), _:bytes>> -> Ok(TaggedLine(tag))
    _ -> Error(LineTooShort(bit_array.byte_size(line)))
  }
}

/// Drop the trailing run of ASCII-space bytes (0x20) from byte-aligned input.
/// Bytes before the last non-space are kept verbatim.
pub fn trim_trailing_spaces(region: BitArray) -> BitArray {
  let keep = kept_length(region, 0, 0)
  // `keep` is within `region` by construction; assert rather than silently
  // return untrimmed bytes if that invariant ever breaks.
  let assert Ok(trimmed) = bit_array.slice(region, 0, keep)
    as "keep is within region by construction"
  trimmed
}

// The length up to and including the last non-space byte: `index` is the
// current position, `keep` the length after the last non-space seen so far.
// A BitArray admits non-byte-aligned values, so matching a leading byte plus
// the rest and the empty array is not exhaustive; a non-byte-aligned remainder
// falls through to the catch-all, keeping the match total (see accession.gleam).
fn kept_length(bytes: BitArray, index: Int, keep: Int) -> Int {
  case bytes {
    <<byte, rest:bytes>> -> {
      let keep = case byte == ascii_space {
        True -> keep
        False -> index + 1
      }
      kept_length(rest, index + 1, keep)
    }
    _ -> keep
  }
}
