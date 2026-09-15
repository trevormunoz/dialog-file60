//// Synthetic lexical checks for `accession.parse` — not corpus or
//// historical-conformance tests. Run with `gleam test`.

import accession

pub fn valid_seven_ascii_digits_test() {
  let assert Ok(value) = accession.parse(<<"0040349":utf8>>)
  // Leading zeroes are retained verbatim, never trimmed or normalised.
  let assert "0040349" = accession.to_string(value)
  let assert Ok(_) = accession.parse(<<"9049442":utf8>>)
}

pub fn wrong_byte_length_test() {
  let assert Error(accession.WrongByteLength(0)) = accession.parse(<<>>)
  let assert Error(accession.WrongByteLength(6)) =
    accession.parse(<<"123456":utf8>>)
  let assert Error(accession.WrongByteLength(8)) =
    accession.parse(<<"12345678":utf8>>)
}

pub fn seven_bytes_but_not_all_digits_test() {
  let assert Error(accession.NonAsciiDigit) =
    accession.parse(<<"123a567":utf8>>)
  let assert Error(accession.NonAsciiDigit) =
    accession.parse(<<"123456 ":utf8>>)
  let assert Error(accession.NonAsciiDigit) =
    accession.parse(<<"123456\n":utf8>>)
}

// These two multibyte inputs are contract probes, not data the single-byte
// card image can produce: they show length is measured in bytes, and that the
// constructor rejects anything that is not seven ASCII-digit bytes.
pub fn multibyte_input_is_rejected_test() {
  // U+00E9 as an escape, not the glyph "é", so the fixture cannot be silently
  // renormalised (NFC = 2 bytes, NFD = 3). These bytes are seven long but not
  // all digits, so parse rejects on the digit check.
  let assert Error(accession.NonAsciiDigit) =
    accession.parse(<<"\u{00E9}12345":utf8>>)
  // Seven fullwidth digits encode to 21 bytes, so parse rejects on length.
  let assert Error(accession.WrongByteLength(21)) =
    accession.parse(<<"１２３４５６７":utf8>>)
}
