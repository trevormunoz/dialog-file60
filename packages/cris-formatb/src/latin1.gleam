//// A lossy Latin-1 display render, shared by the validator (`record_model`)
//// and the facade. Each byte 0..255 maps to its Latin-1 code point (matching
//// the TS parser's `latin1` and the inspect panel), so this never fails on
//// non-UTF-8 bytes. This is display-only, deliberately not a faithful
//// decode — the bytes' actual code page is unknown (see
//// registry/evidence.json); `decode` just gives every byte a visible glyph
//// rather than asserting what it means.
////
//// On the JS target `decode` is `@external` to the oracle's own
//// String.fromCharCode loop (latin1_ffi.mjs, mirroring src-ts/bytes.ts): the
//// Gleam body below costs ~160 ns per byte on that target (a two-object
//// BitArray slice per byte, a Result per codepoint, a non-tail-recursive
//// list, then a join). The Gleam body remains as the fallback for other
//// targets.

import gleam/string

@external(javascript, "./latin1_ffi.mjs", "decode")
pub fn decode(bytes: BitArray) -> String {
  bytes
  |> to_codepoints
  |> string.from_utf_codepoints
}

fn to_codepoints(bytes: BitArray) -> List(UtfCodepoint) {
  case bytes {
    <<byte, rest:bytes>> -> {
      let assert Ok(codepoint) = string.utf_codepoint(byte)
        as "every byte 0..255 is a valid Latin-1/Unicode code point"
      [codepoint, ..to_codepoints(rest)]
    }
    _ -> []
  }
}
