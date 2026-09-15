//// Tests for segment.split_heading_segments — the facade-parity port of
//// src-ts/record.ts:19-30's splitSegments (first-occurrence 0xA0 0x02 split;
//// percent only pulled when percent_in_block). Untrimmed pieces; the facade
//// owns per-field trimming (Task 9).

import gleam/option.{None, Some}
import gleeunit/should
import segment.{HeadingParts}

// FY1991+ (percent_in_block = False): everything after the first separator is the
// label; no percent is pulled even if a second separator exists.
pub fn split_fy91_two_part_keeps_tail_in_label_test() {
  // "\u{00A0}\u{0002}" is the decoded 0xA0 0x02 separator.
  segment.split_heading_segments("XFRS\u{00A0}\u{0002}Forestry Related", False)
  |> should.equal(HeadingParts(Some("XFRS"), Some("Forestry Related"), None))
}

// FY1988 (percent_in_block = True): a three-part value yields a percent.
pub fn split_fy88_three_part_pulls_percent_test() {
  segment.split_heading_segments(
    "C0600\u{00A0}\u{0002}Apples\u{00A0}\u{0002}100%",
    True,
  )
  |> should.equal(HeadingParts(Some("C0600"), Some("Apples"), Some("100%")))
}

// No separator: raw passes through as neither code/label/percent.
pub fn split_no_separator_is_all_none_test() {
  segment.split_heading_segments("A4300", True)
  |> should.equal(HeadingParts(None, None, None))
}
