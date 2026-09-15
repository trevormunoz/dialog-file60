//// Scan byte-aligned files into contiguous record spans and raw file structure.
//// Uses the $$ / << / >> boundary reading in offsets.ts:scanRecords, not its
//// accession extraction. This is a scanner, not a file-structure validator.

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

/// Split fixed 82-byte lines; $$ opens a record, >> closes it before the trailer,
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
  case card_image.split_lines(file_bytes) {
    Error(reason) -> Error(reason)
    Ok(lines) ->
      Ok(walk(lines, base_line, file, None, [], FileStructure(None, None)))
  }
}

// The AN slice's start (0-based column 4, after the 2-byte tag + 1-byte blank)
// and exclusive end. Mirrors offsets.ts's `bytes.subarray(at + DATA_START, at
// + LINE_BYTES - 2)`: bytes 3..80 of the 82-byte served line — the full line
// minus the CRLF, NOT the 3..72 data region `card_image.data_value` extracts
// for ordinary field values (columns 73-80 are the supplier's own use, but
// offsets.ts's `an` read keeps them, so this matches that, not the narrower
// data region).
const an_slice_start: Int = 3

const an_slice_length: Int = 77

/// A record's accession number, read structurally from its AN-tagged line
/// (bytes 3..80, Latin-1 decoded and JS-trimEnd-trimmed) — no field/fragment
/// assembly, so it is available even for a record `assembly.assemble` cannot
/// read. `None` when the record carries no AN line.
pub fn accession_of(record: ScannedRecord) -> Option(String) {
  case card_image.split_lines(record.bytes) {
    Error(_) -> None
    Ok(lines) -> find_an(lines)
  }
}

fn find_an(lines: List(BitArray)) -> Option(String) {
  case lines {
    [] -> None
    [line, ..rest] ->
      case line {
        <<"AN":utf8, _:bytes>> ->
          case bit_array.slice(line, an_slice_start, an_slice_length) {
            Ok(data) -> Some(js_string.trim_end(latin1.decode(data)))
            Error(Nil) -> None
          }
        _ -> find_an(rest)
      }
  }
}

type Open {
  Open(base: SourceBase, lines_reversed: List(BitArray))
}

fn close(
  open: Option(Open),
  records: List(ScannedRecord),
) -> List(ScannedRecord) {
  case open {
    None -> records
    Some(Open(base, lines_reversed)) -> {
      let bytes = lines_reversed |> list.reverse |> bit_array.concat
      [ScannedRecord(base, bytes), ..records]
    }
  }
}

fn extend(open: Option(Open), line: BitArray) -> Option(Open) {
  case open {
    None -> None
    Some(Open(base, lines)) -> Some(Open(base, [line, ..lines]))
  }
}

fn walk(
  lines: List(BitArray),
  first_line: Int,
  file: String,
  open: Option(Open),
  records: List(ScannedRecord),
  structure: FileStructure,
) -> ScanResult {
  case lines {
    [] -> ScanResult(close(open, records) |> list.reverse, structure)
    [line, ..rest] ->
      case line {
        <<"<<":utf8, _:bytes>> ->
          walk(
            rest,
            first_line + 1,
            file,
            extend(open, line),
            records,
            FileStructure(Some(line), structure.trailer),
          )
        <<">>":utf8, _:bytes>> ->
          walk(
            rest,
            first_line + 1,
            file,
            None,
            close(open, records),
            FileStructure(structure.header, Some(line)),
          )
        <<"$$":utf8, _:bytes>> ->
          walk(
            rest,
            first_line + 1,
            file,
            Some(Open(SourceBase(file, first_line), [line])),
            close(open, records),
            structure,
          )
        _ ->
          walk(
            rest,
            first_line + 1,
            file,
            extend(open, line),
            records,
            structure,
          )
      }
  }
}
