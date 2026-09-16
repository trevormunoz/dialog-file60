//// Tally `construct.project` outcomes over a real Format B corpus prefix, so
//// the composed strict constructor can be measured against the data (not just
//// the per-group constructors). Reuses the same scan -> assemble -> construct
//// pipeline as `report`, but buckets outcomes instead of printing records.
////
////   gleam run -m tally -- <path-to-format-b-file> [max_lines]
////
//// Scoped analysis run (statement-of-absence discipline): the printed counts
//// describe EXACTLY the scanned prefix of the named file, nothing beyond it.
//// The continuation marker is fixed at 0xAC.

import argv
import assembly
import construct
import gleam/bit_array
import gleam/dict.{type Dict}
import gleam/int
import gleam/io
import gleam/list
import gleam/result
import gleam/string
import record_model.{
  type ConstructionProblem, Disagreement, FieldNotYetModeled, FormatDisagreement,
  InvalidAccession, InvalidFieldValue, NonRepeatingFieldRepeated,
  RelatedFieldsDisagree, RepetitionLimitExceeded, RequiredFieldNotLocated,
  RpaCodeNotAttested, RuleUnresolved, TagNotAscii,
}
import scan
import simplifile
import source_record.{NonEmpty}

const line_bytes: Int = 82

const default_max_lines: Int = 300_000

pub fn main() {
  case argv.load().arguments {
    [path] -> run(path, default_max_lines)
    [path, max_lines] -> run(path, parse_int(max_lines, default_max_lines))
    _ -> io.println("usage: gleam run -m tally -- <path> [max_lines]")
  }
}

fn run(path: String, max_lines: Int) -> Nil {
  case read_prefix(path, max_lines) {
    Error(message) -> io.println(message)
    Ok(#(prefix, line_count)) ->
      case scan.scan(prefix, path, 1) {
        Error(_) ->
          io.println("scan failed: " <> path <> " is not 82-byte line aligned")
        Ok(scan.ScanResult(records, _structure)) ->
          io.println(render(tally(records), path, line_count))
      }
  }
}

// Read the whole file once, then slice to the requested prefix (fewer lines than
// that: use them all).
fn read_prefix(
  path: String,
  max_lines: Int,
) -> Result(#(BitArray, Int), String) {
  case read_bits(path) {
    Error(message) -> Error(message)
    Ok(bytes) -> {
      let prefix = case bit_array.slice(bytes, 0, max_lines * line_bytes) {
        Ok(p) -> p
        Error(Nil) -> bytes
      }
      Ok(#(prefix, bit_array.byte_size(prefix) / line_bytes))
    }
  }
}

type Acc {
  Acc(
    total: Int,
    certified: Int,
    // Subset of `certified`: records that certify while carrying a SOURCE-
    // undocumented field (SN) — preserved, unvalidatable, never hidden. Reported
    // apart from fully-clean certification so 100% never conflates the two.
    certified_undocumented: Int,
    failed: Int,
    unreadable: Int,
    // Records whose ONLY problems are FieldNotYetModeled (unmodeled material),
    // i.e. no documentary divergence — a different failure than a real conflict.
    unmodeled_only: Int,
    problems: Dict(String, Int),
  )
}

fn tally(records: List(scan.ScannedRecord)) -> Acc {
  list.fold(
    records,
    Acc(
      total: 0,
      certified: 0,
      certified_undocumented: 0,
      failed: 0,
      unreadable: 0,
      unmodeled_only: 0,
      problems: dict.new(),
    ),
    fn(acc, record) {
      let scan.ScannedRecord(base, bytes) = record
      let acc = Acc(..acc, total: acc.total + 1)
      case assembly.assemble(bytes, base, 0xAC) {
        Error(_) -> Acc(..acc, unreadable: acc.unreadable + 1)
        Ok(supplied) ->
          case construct.project(supplied) {
            Ok(project) -> {
              let acc = Acc(..acc, certified: acc.certified + 1)
              case record_model.project_undocumented_fields(project) {
                [] -> acc
                _ ->
                  Acc(
                    ..acc,
                    certified_undocumented: acc.certified_undocumented + 1,
                  )
              }
            }
            Error(NonEmpty(first, rest)) -> {
              let problems = [first, ..rest]
              let unmodeled_only = case list.all(problems, is_not_yet_modeled) {
                True -> acc.unmodeled_only + 1
                False -> acc.unmodeled_only
              }
              Acc(
                ..acc,
                failed: acc.failed + 1,
                unmodeled_only: unmodeled_only,
                problems: list.fold(problems, acc.problems, fn(d, p) {
                  bump(d, bucket(p))
                }),
              )
            }
          }
      }
    },
  )
}

fn is_not_yet_modeled(problem: ConstructionProblem) -> Bool {
  case problem {
    FieldNotYetModeled(_, _) -> True
    _ -> False
  }
}

// A frequency-bucketing key: the KIND of divergence plus the field tag, with the
// free-text reason dropped so like divergences aggregate.
fn bucket(problem: ConstructionProblem) -> String {
  case problem {
    Disagreement(FormatDisagreement(kind, _, _, _)) -> kind_bucket(kind)
    RuleUnresolved(tag, _, _) -> tag <> " rule-unresolved"
    FieldNotYetModeled(tag, _) -> tag <> " not-yet-modeled"
    TagNotAscii(tag, _) -> tag <> " tag-not-ascii"
  }
}

fn kind_bucket(kind: record_model.DisagreementKind) -> String {
  case kind {
    RequiredFieldNotLocated(tag) -> tag <> " required-not-located"
    NonRepeatingFieldRepeated(tag, _) -> tag <> " non-repeating-repeated"
    InvalidAccession(_) -> "AN invalid-accession"
    InvalidFieldValue(tag, reason) -> tag <> " invalid-" <> reason_class(reason)
    RepetitionLimitExceeded(tag, _, _) -> tag <> " repetition-limit"
    RelatedFieldsDisagree(_, _) -> "related-fields-disagree"
    RpaCodeNotAttested(_, _) -> "RP rpa-not-attested"
  }
}

// Split an InvalidFieldValue reason into a coarse class so length divergences,
// non-UTF-8 text, over-long DE keywords, and SC/PH/GH structure faults tally
// separately rather than collapsing into one "invalid-value" bucket.
fn reason_class(reason: String) -> String {
  case string.contains(reason, "not valid text") {
    True -> "nonUTF8"
    False ->
      case string.contains(reason, "per-keyword") {
        True -> "keyword>60"
        False ->
          case
            string.contains(reason, "separator")
            || string.contains(reason, "parts")
          {
            True -> "structure"
            False -> "length"
          }
      }
  }
}

fn bump(counts: Dict(String, Int), key: String) -> Dict(String, Int) {
  let next = case dict.get(counts, key) {
    Ok(n) -> n + 1
    Error(Nil) -> 1
  }
  dict.insert(counts, key, next)
}

fn render(acc: Acc, path: String, line_count: Int) -> String {
  let rows =
    acc.problems
    |> dict.to_list
    |> list.sort(fn(a, b) {
      let #(_, a_count) = a
      let #(_, b_count) = b
      int.compare(b_count, a_count)
    })
    |> list.map(fn(row) {
      let #(key, count) = row
      "    "
      <> string.pad_end(key, to: 30, with: " ")
      <> " "
      <> int.to_string(count)
    })
    |> string.join("\n")
  string.join(
    [
      "construct.project tally over " <> path,
      "scanned prefix: " <> int.to_string(line_count) <> " lines (0xAC marker)",
      "",
      "records scanned : " <> int.to_string(acc.total),
      "  certified     : " <> int.to_string(acc.certified),
      "    of which carrying a source-undocumented field (SN), preserved: "
        <> int.to_string(acc.certified_undocumented),
      "  failed        : " <> int.to_string(acc.failed),
      "    of which unmodeled-material only (no documentary divergence): "
        <> int.to_string(acc.unmodeled_only),
      "  unreadable    : " <> int.to_string(acc.unreadable),
      "",
      "problem buckets (occurrences across all failed records, desc):",
      rows,
    ],
    "\n",
  )
}

fn read_bits(path: String) -> Result(BitArray, String) {
  simplifile.read_bits(path)
  |> result.map_error(fn(reason) {
    "could not read " <> path <> ": " <> simplifile.describe_error(reason)
  })
}

fn parse_int(text: String, fallback: Int) -> Int {
  text |> int.parse |> result.unwrap(fallback)
}
