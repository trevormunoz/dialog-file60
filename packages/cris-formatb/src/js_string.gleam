//// JS-whitespace trims matching JS `.trim()`/`.trimEnd()`, as reachable in
//// Latin-1 (codepoints <= U+00FF): space, tab, LF, CR, VT, FF, and U+00A0
//// (NBSP) — but NOT U+0085 (NEL), which JS does not treat as whitespace.
//// Ports src-ts/record.ts's js_trim/js_trim_end. Gleam's own
//// `gleam/string.trim` uses a different whitespace set (on the JS target it
//// strips U+0085 and keeps U+00A0 — the reverse), so it is not a substitute.
////
//// On the JS target `trim`/`trim_end` are `@external` to `.trim()`/
//// `.trimEnd()` themselves (js_string_ffi.mjs): that is the oracle's exact
//// function, and the grapheme walk below costs ~8 µs per short string
//// (`string.to_graphemes` runs Intl.Segmenter) against ~50 ns for the
//// native call. The Gleam bodies remain as the fallback for other targets.
//// One known difference between the two: the grapheme walk sees "\r\n" as a
//// single grapheme cluster and would leave a trailing CR LF pair in place,
//// while JS strips it character by character (test/js_string_test.gleam).

import gleam/list
import gleam/string

fn is_js_ws(g: String) -> Bool {
  case g {
    " " | "\t" | "\n" | "\r" | "\u{000B}" | "\u{000C}" | "\u{00A0}" -> True
    _ -> False
  }
}

@external(javascript, "./js_string_ffi.mjs", "trim")
pub fn trim(s: String) -> String {
  s |> trim_start |> trim_end
}

@external(javascript, "./js_string_ffi.mjs", "trim_end")
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
