//// segment: structural byte-splitting for the classification-heading values
//// (SC/PH/GH), shared by the validator (`construct`) and the facade. This module
//// is structure only — it splits bytes and never judges shape (that stays in
//// `construct`). See rules/field-rule-inventory.md batch 3.

import gleam/bit_array
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

// Split on every 0x02 byte, returning all segments in order (n separators ->
// n+1 segments; no 0x02 -> one segment). The segment count is how parse_heading
// and parse_subcommodity tell the two-part and three-part shapes apart.
pub fn segments_on_0x02(bytes: BitArray) -> List(BitArray) {
  segments_on_0x02_loop(bytes, <<>>, [])
}

fn segments_on_0x02_loop(
  bytes: BitArray,
  current: BitArray,
  done_reversed: List(BitArray),
) -> List(BitArray) {
  case bytes {
    <<0x02, rest:bytes>> ->
      segments_on_0x02_loop(rest, <<>>, [current, ..done_reversed])
    <<b, more:bytes>> ->
      segments_on_0x02_loop(more, <<current:bits, b>>, done_reversed)
    _ -> list.reverse([current, ..done_reversed])
  }
}

// Drop the trailing 0xA0 separator byte from a code/literal segment, or Error
// when the segment does not end with it (a structural divergence).
pub fn drop_trailing_0xa0(bytes: BitArray) -> Result(BitArray, Nil) {
  case ends_with_0xa0(bytes) {
    False -> Error(Nil)
    True -> bit_array.slice(bytes, 0, bit_array.byte_size(bytes) - 1)
  }
}

fn ends_with_0xa0(bytes: BitArray) -> Bool {
  let size = bit_array.byte_size(bytes)
  case size {
    0 -> False
    _ ->
      case bit_array.slice(bytes, size - 1, 1) {
        Ok(<<0xA0>>) -> True
        _ -> False
      }
  }
}

const sep = "\u{00A0}\u{0002}"

pub type HeadingParts {
  HeadingParts(
    code: Option(String),
    label: Option(String),
    percent: Option(String),
  )
}

// Facade-parity port of src-ts/record.ts:19-30's splitSegments: split an
// already-decoded value at the FIRST occurrence of the 0xA0 0x02 separator
// into code/label; when percent_in_block (FY1988), split the tail again at
// the next separator to pull percent. Returns UNTRIMMED pieces (pure
// structure, no js_string dependency) — the caller trims per field.
pub fn split_heading_segments(
  raw: String,
  percent_in_block: Bool,
) -> HeadingParts {
  case string.split_once(raw, sep) {
    Error(Nil) -> HeadingParts(None, None, None)
    Ok(#(code, rest)) ->
      case percent_in_block {
        False -> HeadingParts(Some(code), Some(rest), None)
        True ->
          case string.split_once(rest, sep) {
            Error(Nil) -> HeadingParts(Some(code), Some(rest), None)
            Ok(#(label, percent)) ->
              HeadingParts(Some(code), Some(label), Some(percent))
          }
      }
  }
}
