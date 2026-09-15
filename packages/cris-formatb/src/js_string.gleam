//// JS-whitespace trims matching JS `.trim()`/`.trimEnd()`, as reachable in
//// Latin-1 (codepoints <= U+00FF): space, tab, LF, CR, VT, FF, and U+00A0
//// (NBSP) — but NOT U+0085 (NEL), which JS does not treat as whitespace.
//// Ports src-ts/record.ts's js_trim/js_trim_end (see the js_trim/js_trim_end/
//// is_js_ws functions in docs/gleam-spike/gleam_scan/src/gleam_scan.gleam for a
//// reference port). Gleam's own `gleam/string.trim` uses a different (Unicode)
//// whitespace set, so it is not a substitute here.

import gleam/list
import gleam/string

fn is_js_ws(g: String) -> Bool {
  case g {
    " " | "\t" | "\n" | "\r" | "\u{000B}" | "\u{000C}" | "\u{00A0}" -> True
    _ -> False
  }
}

pub fn trim(s: String) -> String {
  s |> trim_start |> trim_end
}

pub fn trim_end(s: String) -> String {
  s
  |> string.to_graphemes
  |> list.reverse
  |> drop_leading_ws
  |> list.reverse
  |> string.join("")
}

fn trim_start(s: String) -> String {
  case string.pop_grapheme(s) {
    Ok(#(g, rest)) ->
      case is_js_ws(g) {
        True -> trim_start(rest)
        False -> s
      }
    Error(Nil) -> s
  }
}

fn drop_leading_ws(gs: List(String)) -> List(String) {
  case gs {
    [g, ..rest] ->
      case is_js_ws(g) {
        True -> drop_leading_ws(rest)
        False -> gs
      }
    [] -> []
  }
}
