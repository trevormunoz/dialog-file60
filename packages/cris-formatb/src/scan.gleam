//// Scan byte-aligned files into contiguous record spans and raw file structure.
//// Uses the $$ / << / >> boundary reading in offsets.ts:scanRecords, not its
//// accession extraction. This is a scanner, not a file-structure validator.
////
//// The walk is by byte offset, like offsets.ts: each line's tag is read with
//// a `<<_:bytes-size(at), "$$":utf8, _:bytes>>` pattern, which the JS target
//// compiles to two integer peeks and no allocation. Splitting the file into a
//// List of 82-byte lines first (the previous shape) allocated two objects per
//// line — a Uint8Array view and its BitArray wrapper — and then copied every
//// record back together with bit_array.concat; on the 3.15M-line FY88 file
//// that was ~2 s of the 4 s scan. A record's bytes are now one O(1) slice
//// view of the file buffer, taken when the record closes.

import assembly.{type SourceBase, SourceBase}
import card_image.{type CardImageError}
import gleam/bit_array
import gleam/list
import gleam/option.{type Option, None, Some}
import js_string
import latin1

/// The last observed header and trailer, each a complete untrimmed served line.
pub type FileStructure {
  FileStructure(header: Option(BitArray), trailer: Option(BitArray))
}

pub type ScannedRecord {
  ScannedRecord(base: SourceBase, bytes: BitArray)
}

pub type ScanResult {
  ScanResult(records: List(ScannedRecord), structure: FileStructure)
}

/// NARA's served line form: 80 columns plus CRLF (card_image.line_bytes).
const line_bytes: Int = card_image.line_bytes

/// Walk fixed 82-byte lines; $$ opens a record, >> closes it before the trailer,
/// and EOF closes it after its last line. `base_line` is the source line of the
/// first byte (1 for a whole file). Lines outside records are counted but only
/// headers/trailers are retained. CRLF and structure ordering are not validated.
/// A << inside an open record is captured AND kept in that contiguous span so
/// subsequent assembly locations remain file-absolute, as in offsets.ts.
pub fn scan(
  file_bytes: BitArray,
  file: String,
  base_line: Int,
) -> Result(ScanResult, CardImageError) {
  let size = bit_array.byte_size(file_bytes)
  case size % line_bytes {
    0 ->
      Ok(walk(
        file_bytes,
        size,
        0,
        base_line,
        file,
        None,
        [],
        FileStructure(None, None),
      ))
    _ -> Error(card_image.LengthNotLineAligned(size))
  }
}

// The AN slice's length: bytes 3..80 of the 82-byte served line (after the
// 2-byte tag + 1-byte blank), the full line minus the CRLF. Mirrors
// offsets.ts's `bytes.subarray(at + DATA_START, at + LINE_BYTES - 2)` — NOT
// the narrower 3..72 data region `card_image.data_value` extracts for ordinary
// field values (columns 73-80 are the supplier's own use, but offsets.ts's
// `an` read keeps them, so this matches that).
const an_slice_length: Int = 77

/// A record's accession number, read structurally from its AN-tagged line
/// (bytes 3..80, Latin-1 decoded and JS-trimEnd-trimmed) — no field/fragment
/// assembly, so it is available even for a record `assembly.assemble` cannot
/// read. Returns the FIRST AN-tagged line whose trimmed value is non-empty,
/// matching `offsets.ts`'s `!open.an` guard: a blank AN line ("" after trim) is
/// skipped and a later AN line may supply the value. `None` when no AN line
/// carries a non-empty value (the facade maps that to the contract's "" — the
/// same absence the oracle exposes), and `None` for a record whose byte count
/// is not a whole number of lines.
pub fn accession_of(record: ScannedRecord) -> Option(String) {
  case bit_array.byte_size(record.bytes) % line_bytes {
    0 -> find_an(record.bytes, 0)
    _ -> None
  }
}

fn find_an(bytes: BitArray, at: Int) -> Option(String) {
  case bytes {
    <<
      _:bytes-size(at),
      "AN":utf8,
      _,
      data:bytes-size(an_slice_length),
      _:bytes,
    >> ->
      case js_string.trim_end(latin1.decode(data)) {
        // Empty (blank AN) is skipped, as the oracle's `!open.an` guard does.
        "" -> find_an(bytes, at + line_bytes)
        value -> Some(value)
      }
    <<_:bytes-size(at), _:bytes-size(line_bytes), _:bytes>> ->
      find_an(bytes, at + line_bytes)
    _ -> None
  }
}

// An open record: its base and the byte offset of its "$$" line.
type Open {
  Open(base: SourceBase, start: Int)
}

// Close the open record (if any) at the exclusive byte offset `end`: its bytes
// are the one contiguous slice from its "$$" line up to `end`.
fn close(
  file_bytes: BitArray,
  open: Option(Open),
  end: Int,
  records: List(ScannedRecord),
) -> List(ScannedRecord) {
  case open {
    None -> records
    Some(Open(base, start)) -> {
      let assert Ok(bytes) = bit_array.slice(file_bytes, start, end - start)
        as "an open record lies within the file"
      [ScannedRecord(base, bytes), ..records]
    }
  }
}

fn line_at(file_bytes: BitArray, at: Int) -> BitArray {
  let assert Ok(line) = bit_array.slice(file_bytes, at, line_bytes)
    as "a walked offset is the start of a whole line"
  line
}

fn walk(
  file_bytes: BitArray,
  size: Int,
  at: Int,
  line: Int,
  file: String,
  open: Option(Open),
  records: List(ScannedRecord),
  structure: FileStructure,
) -> ScanResult {
  case at >= size {
    True ->
      ScanResult(
        close(file_bytes, open, at, records) |> list.reverse,
        structure,
      )
    False -> {
      let next = at + line_bytes
      case file_bytes {
        <<_:bytes-size(at), "<<":utf8, _:bytes>> ->
          walk(
            file_bytes,
            size,
            next,
            line + 1,
            file,
            open,
            records,
            FileStructure(Some(line_at(file_bytes, at)), structure.trailer),
          )
        <<_:bytes-size(at), ">>":utf8, _:bytes>> ->
          walk(
            file_bytes,
            size,
            next,
            line + 1,
            file,
            None,
            close(file_bytes, open, at, records),
            FileStructure(structure.header, Some(line_at(file_bytes, at))),
          )
        <<_:bytes-size(at), "$$":utf8, _:bytes>> ->
          walk(
            file_bytes,
            size,
            next,
            line + 1,
            file,
            Some(Open(SourceBase(file, line), at)),
            close(file_bytes, open, at, records),
            structure,
          )
        _ ->
          walk(file_bytes, size, next, line + 1, file, open, records, structure)
      }
    }
  }
}
