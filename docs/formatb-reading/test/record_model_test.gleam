//// record_model: tests for `render`, the shared lossy Latin-1 display render
//// for the byte-preserving narrative/participant fields (OB/AP/DE/PR/PB/IN;
//// see the payload-provenance note near `Supported` in record_model.gleam).
//// Run with `gleam test`.

import gleeunit/should
import record_model

// Plain ASCII bytes render as the equivalent string.
pub fn render_ascii_bytes_test() {
  record_model.render(<<"AB":utf8>>) |> should.equal("AB")
}

// A single high byte (0xA3) renders as its Latin-1 code point (£), not as an
// error and not dropped — this is a display-only lossy render, not a claim
// that the bytes ARE Latin-1 text (the code page is unknown; see
// registry/evidence.json).
pub fn render_high_byte_as_latin1_pound_sign_test() {
  record_model.render(<<0xA3>>) |> should.equal("\u{00A3}")
}
