//// Runnable entrypoint: point it at a CRIS Format B data file and see each
//// record parsed through the model's checked groups (identity, participants,
//// chronology, classifications, narratives, and the top-level project). This
//// is the interpretive slice on real data, not a raw dump: valid records
//// print their typed results, others print accumulated, source-graded
//// problems.
////
////   gleam run -- <path-to-format-b-file> [max_records] [max_lines]
////
//// A whole NARA year file is hundreds of MB; `max_lines` caps how much of the
//// file's prefix is scanned so a run stays quick, and `max_records` caps how
//// many records are printed. The continuation marker is fixed at 0xAC.

import argv
import gleam/bit_array
import gleam/int
import gleam/io
import gleam/result
import report
import simplifile

const default_max_records: Int = 12

const default_max_lines: Int = 20_000

const line_bytes: Int = 82

pub fn main() {
  case argv.load().arguments {
    [path] -> run(path, default_max_records, default_max_lines)
    [path, max_records] ->
      run(path, parse_int(max_records, default_max_records), default_max_lines)
    [path, max_records, max_lines] ->
      run(
        path,
        parse_int(max_records, default_max_records),
        parse_int(max_lines, default_max_lines),
      )
    _ ->
      io.println(
        "usage: gleam run -- <path-to-format-b-file> [max_records] [max_lines]",
      )
  }
}

fn run(path: String, max_records: Int, max_lines: Int) -> Nil {
  case simplifile.read_bits(path) {
    Error(reason) ->
      io.println(
        "could not read " <> path <> ": " <> simplifile.describe_error(reason),
      )
    Ok(bytes) -> {
      let prefix = prefix_lines(bytes, max_lines)
      case report.report(prefix, path, 1, 0xAC, max_records) {
        Error(_) ->
          io.println("scan failed: " <> path <> " is not 82-byte line aligned")
        Ok(text) -> io.println(banner(path, bytes, prefix, max_records) <> text)
      }
    }
  }
}

// The first `max_lines` served lines of the file, so a huge year file is bounded
// without loading logic downstream needing to change. Fewer lines: use them all.
fn prefix_lines(bytes: BitArray, max_lines: Int) -> BitArray {
  case bit_array.slice(bytes, 0, max_lines * line_bytes) {
    Ok(prefix) -> prefix
    Error(Nil) -> bytes
  }
}

fn banner(
  path: String,
  bytes: BitArray,
  prefix: BitArray,
  max_records: Int,
) -> String {
  "Format B checked-Identity reading of "
  <> path
  <> "\nfile is "
  <> int.to_string(bit_array.byte_size(bytes))
  <> " bytes ("
  <> int.to_string(bit_array.byte_size(bytes) / line_bytes)
  <> " lines); scanning the first "
  <> int.to_string(bit_array.byte_size(prefix) / line_bytes)
  <> " lines, printing up to "
  <> int.to_string(max_records)
  <> " records.\nChecks identity, participants, chronology, classifications, narratives, and"
  <> " the top-level project (TI/PS/PT/SF) — every group the model currently checks."
  <> " SN and HP are known but modeled only as flags (reported FieldNotYetModeled, never"
  <> " built); any other tag or unassigned material outside the modeled set is likewise"
  <> " flagged as FieldNotYetModeled, never silently dropped.\n\n"
}

fn parse_int(text: String, fallback: Int) -> Int {
  text |> int.parse |> result.unwrap(fallback)
}
