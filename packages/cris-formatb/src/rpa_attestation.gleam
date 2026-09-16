//// Pure logic for attesting an RP value against a fiscal-year warrant set:
//// map fiscal year to a warrant set, best-effort-normalize the raw value to
//// a 3-digit code, and look the code up via the generated `vocab_rpa`
//// module. No dependency on `construct.gleam`'s problem types — a later
//// task wires this into the validator.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import vocab_rpa

pub type WarrantSet {
  RevIv
  Fy94Table
  NoWarrant
}

pub type RpaMiss {
  RpaMiss(code: String, set_label: String)
}

pub fn warrant_for(fy: Int) -> WarrantSet {
  case fy {
    88 | 89 -> RevIv
    94 -> Fy94Table
    _ -> NoWarrant
  }
}

pub fn set_label(set: WarrantSet) -> String {
  case set {
    RevIv -> vocab_rpa.rev_iv_set_label
    Fy94Table -> vocab_rpa.fy94_table_set_label
    NoWarrant -> "no warrant set"
  }
}

/// Strip one leading "R" if present, then accept iff exactly 3 digits remain.
pub fn canonical_code(value: String) -> Result(String, Nil) {
  let digits = case string.starts_with(value, "R") {
    True -> string.drop_start(value, 1)
    False -> value
  }
  case string.length(digits) == 3 && is_all_digits(digits) {
    True -> Ok(digits)
    False -> Error(Nil)
  }
}

fn is_all_digits(s: String) -> Bool {
  string.to_graphemes(s)
  |> list.all(fn(g) {
    case g {
      "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" -> True
      _ -> False
    }
  })
}

pub fn attest(value: String, set: WarrantSet) -> Result(Nil, RpaMiss) {
  case set {
    NoWarrant -> Ok(Nil)
    _ ->
      case canonical_code(value) {
        Error(_) -> Ok(Nil)
        Ok(code) ->
          case lookup(code, set) {
            Ok(_) -> Ok(Nil)
            Error(_) -> Error(RpaMiss(code, set_label(set)))
          }
      }
  }
}

fn lookup(code: String, set: WarrantSet) -> Result(String, Nil) {
  case set {
    RevIv -> vocab_rpa.rev_iv_label(code)
    Fy94Table -> vocab_rpa.fy94_table_label(code)
    NoWarrant -> Error(Nil)
  }
}

/// The corpus vintage inferred from a file path: in the path's basename, the
/// leftmost `FY` whose next two characters are digits AND whose following
/// character is not a digit. `FY1988` therefore yields `None` (not `19`), and a
/// vintage-named directory cannot pre-empt the file's own name. No token → None.
pub fn corpus_fy_from_path(path: String) -> Option(Int) {
  scan_fy(basename(path))
}

fn basename(path: String) -> String {
  case string.split(path, "/") |> list.last {
    Ok(name) -> name
    Error(_) -> path
  }
}

fn scan_fy(s: String) -> Option(Int) {
  case string.split_once(s, "FY") {
    Error(_) -> None
    Ok(#(_before, after)) ->
      case two_digit_vintage(after) {
        Ok(n) -> Some(n)
        Error(_) -> scan_fy(after)
      }
  }
}

// The first two graphemes of `after` are digits AND the third (if present) is
// not a digit; parse those two digits. Anything else is a rejected match.
fn two_digit_vintage(after: String) -> Result(Int, Nil) {
  case string.to_graphemes(after) {
    [d1, d2, d3, ..] ->
      case is_digit(d1) && is_digit(d2) && !is_digit(d3) {
        True -> int.parse(d1 <> d2)
        False -> Error(Nil)
      }
    [d1, d2] ->
      case is_digit(d1) && is_digit(d2) {
        True -> int.parse(d1 <> d2)
        False -> Error(Nil)
      }
    _ -> Error(Nil)
  }
}

fn is_digit(g: String) -> Bool {
  case g {
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" -> True
    _ -> False
  }
}

/// A one-line factual statement of a run's attestation mode, from the corpus
/// fiscal year inferred from the file name. Three states: off (no FY inferred),
/// active (FY has a warrant set — named), not run (FY has no warrant set).
pub fn attestation_note(corpus_fy: Option(Int)) -> String {
  case corpus_fy {
    None -> "RPA attestation off: no fiscal year in the file name"
    Some(fy) ->
      case warrant_for(fy) {
        NoWarrant ->
          "RPA attestation not run: no warrant set for FY"
          <> int.to_string(fy)
          <> " (from file name)"
        set ->
          "RPA attestation active: FY"
          <> int.to_string(fy)
          <> " (from file name) — "
          <> set_label(set)
      }
  }
}
