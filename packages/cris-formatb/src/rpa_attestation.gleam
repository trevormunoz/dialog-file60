//// Pure logic for attesting an RP value against a fiscal-year warrant set:
//// map fiscal year to a warrant set, best-effort-normalize the raw value to
//// a 3-digit code, and look the code up via the generated `vocab_rpa`
//// module. No dependency on `construct.gleam`'s problem types — a later
//// task wires this into the validator.

import gleam/list
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
