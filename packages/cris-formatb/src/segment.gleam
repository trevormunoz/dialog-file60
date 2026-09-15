//// segment: structural byte-splitting for the classification-heading values
//// (SC/PH/GH), shared by the validator (`construct`) and the facade. This module
//// is structure only — it splits bytes and never judges shape (that stays in
//// `construct`). See rules/field-rule-inventory.md batch 3.

import gleam/bit_array
import gleam/list

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
