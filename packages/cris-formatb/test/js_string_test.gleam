//// Tests for js_string.trim/trim_end — matching JS .trim()/.trimEnd()'s
//// whitespace set as reachable in Latin-1 (codepoints <= U+00FF): space,
//// tab, LF, CR, VT, FF, and U+00A0 (NBSP) -- but NOT U+0085 (NEL). Ports
//// src-ts/record.ts's js_trim/js_trim_end (see gleam-spike/gleam_scan.gleam
//// :131-156 for a reference port).

import gleeunit/should
import js_string

pub fn trim_end_strips_trailing_nbsp_not_leading_space_test() {
  js_string.trim_end(" A\u{00A0}") |> should.equal(" A")
}

pub fn trim_strips_both_ends_test() {
  js_string.trim("  100%  ") |> should.equal("100%")
}

pub fn trim_keeps_nel_u0085_test() {
  // JS .trim() does NOT strip U+0085 (NEL); we must match JS, not Gleam stdlib.
  js_string.trim("\u{0085}X\u{0085}") |> should.equal("\u{0085}X\u{0085}")
}
