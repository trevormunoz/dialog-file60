//// Accession: the AN field of a CRIS Format B record.
//// PDF 367_1DP.pdf p. 13 (printed p. 1) specifies AN as numeric, exact
//// length 7. The source is a single-byte card image, so that means exactly
//// seven ASCII-digit bytes; `parse` takes the extracted field bytes directly,
//// rather than text in some encoding.

import gleam/bit_array

/// An accession number that has passed lexical validation: exactly seven
/// ASCII-digit bytes, retained verbatim as those bytes. Construct only via
/// `parse`; the constructor is opaque, so unchecked bytes cannot be labelled
/// an Accession. This certifies lexical shape only, NOT uniqueness across
/// records or AN cardinality within a record.
pub opaque type Accession {
  Accession(BitArray)
}

/// Why some bytes are not a valid Accession.
pub type AccessionError {
  /// The input was not exactly seven bytes; carries the actual byte count.
  WrongByteLength(actual: Int)
  /// The input was seven bytes but at least one was not an ASCII digit.
  NonAsciiDigit
}

const ascii_zero: Int = 48

const ascii_nine: Int = 57

/// Validate the extracted AN field bytes. `input` is the field value already
/// taken from the card image (columns 4-72, trailing blanks dropped), not a
/// padded card line: `parse` neither trims nor repairs. Exactly seven
/// ASCII-digit bytes are required; anything else is a typed error.
pub fn parse(input: BitArray) -> Result(Accession, AccessionError) {
  let #(length, digits_only) = inspect_bytes(input, 0, True)
  case length, digits_only {
    7, True -> Ok(Accession(input))
    7, False -> Error(NonAsciiDigit)
    _, _ -> Error(WrongByteLength(length))
  }
}

/// The accession as text, leading zeroes intact. The retained bytes were
/// validated as seven ASCII digits, so decoding always succeeds.
pub fn to_string(accession: Accession) -> String {
  let Accession(bytes) = accession
  let assert Ok(text) = bit_array.to_string(bytes)
  text
}

fn is_ascii_digit(byte: Int) -> Bool {
  byte >= ascii_zero && byte <= ascii_nine
}

// Count bytes and whether every byte is an ASCII digit, in a single pass.
// A BitArray admits non-byte-aligned values, so matching a leading byte plus
// the rest and the empty array is not exhaustive; a non-byte-aligned remainder
// is rejected explicitly so the match stays total.
fn inspect_bytes(
  bytes: BitArray,
  count: Int,
  digits_only: Bool,
) -> #(Int, Bool) {
  case bytes {
    <<byte, rest:bytes>> ->
      inspect_bytes(rest, count + 1, digits_only && is_ascii_digit(byte))
    <<>> -> #(count, digits_only)
    _ -> #(count, False)
  }
}
