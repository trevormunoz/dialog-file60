//// Runnable entrypoint: point it at one whole CRIS Format B corpus file and
//// print one NDJSON row per record on stdout — the `scan -> outcome_of ->
//// row_of` path, driven over the entire file (no line cap, unlike
//// `cris_formatb.gleam`/`tally.gleam`'s interactive readers). Abort messages
//// (bad path, unparseable provenance, misaligned file) go to stderr so stdout
//// stays pure NDJSON, safe to pipe straight into a JSON-lines consumer.
////
////   gleam run -m emit_rows -- <path-to-format-b-file>
////
//// The continuation marker is fixed at 0xAC, matching `tally`/`report`.

import argv
import gleam/io
import gleam/json
import gleam/list
import gleam/option
import project_row
import scan
import simplifile
import tally

pub fn main() {
  case argv.load().arguments {
    [path] -> run(path)
    _ -> io.println_error("usage: gleam run -m emit_rows -- <path>")
  }
}

fn run(path: String) -> Nil {
  case project_row.provenance_of(path) {
    Error(Nil) ->
      io.println_error("abort: no fiscal year in file name: " <> path)
    Ok(provenance) ->
      case simplifile.read_bits(path) {
        Error(reason) ->
          io.println_error(
            "abort: could not read "
            <> path
            <> ": "
            <> simplifile.describe_error(reason),
          )
        Ok(bytes) ->
          case scan.scan(bytes, path, 1) {
            Error(_) -> io.println_error("abort: not 82-byte aligned: " <> path)
            Ok(scanned) -> {
              let corpus_fy = option.Some(provenance.fiscal_year)
              list.each(scanned.records, fn(record) {
                let row = case tally.outcome_of(record, corpus_fy) {
                  tally.UnreadableRecord(error) ->
                    project_row.unreadable_row_of(record, provenance, error)
                  tally.Constructed(supplied, tier, result) ->
                    project_row.row_of(supplied, provenance, tier, result)
                }
                io.println(json.to_string(row))
              })
            }
          }
      }
  }
}
