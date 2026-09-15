//// Tests for latin1.decode — the shared total ISO-8859-1 decode (byte
//// 0..255 -> codepoint 0..255, non-dropping), moved out of
//// record_model.render (Task 5).

import gleam/string
import gleeunit/should
import latin1

pub fn decode_ascii_test() {
  latin1.decode(<<"AB":utf8>>) |> should.equal("AB")
}

pub fn decode_high_byte_a3_is_pound_test() {
  latin1.decode(<<0xA3>>) |> should.equal("\u{00A3}")
}

pub fn decode_is_total_over_all_256_bytes_test() {
  // Every byte 0..255 decodes to exactly one codepoint; length 256, no drops.
  latin1.decode(all_256_bytes(0)) |> string.length |> should.equal(256)
}

fn all_256_bytes(from: Int) -> BitArray {
  case from {
    256 -> <<>>
    _ -> <<from, all_256_bytes(from + 1):bits>>
  }
}
