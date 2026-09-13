//// Card-image line extraction: turning one 80-column card line's bytes into a
//// field's lexical value. See `record_model.gleam`'s Fragment doc comment and
//// PDF 367_1DP.pdf p. 2 for the column layout. Synthetic lines, not corpus
//// tests; run with `gleam test`.

import card_image
import gleam/bit_array
import gleam/list
import gleeunit/should

// Call `f` on each integer in [from, to] inclusive. gleam_stdlib 1.0.5 (pinned
// here) has no list.range, so this drives the property-style loops.
fn for_range(from: Int, to: Int, f: fn(Int) -> Nil) -> Nil {
  case from > to {
    True -> Nil
    False -> {
      f(from)
      for_range(from + 1, to, f)
    }
  }
}

// Build one 82-byte served card line (80 columns + CRLF): a two-letter `tag`
// in columns 1-2, a blank in column 3, `value` left-justified in columns 4-72
// and right-padded with spaces, then `col73_80` in columns 73-80, then CRLF.
// `value` and `col73_80` must fit their fields; the helper pads columns 4-72.
fn served_line(tag: BitArray, value: BitArray, col73_80: BitArray) -> BitArray {
  let padding = spaces(69 - bit_array.byte_size(value))
  bit_array.concat([
    tag,
    <<0x20>>,
    value,
    padding,
    col73_80,
    <<0x0d, 0x0a>>,
  ])
}

fn spaces(n: Int) -> BitArray {
  list.repeat(<<0x20>>, times: n) |> bit_array.concat
}

pub fn extracts_columns_4_to_72_dropping_trailing_spaces_test() {
  // Columns 73-80 hold non-space junk: a correct reading stops at column 72
  // and never reaches them (guards against reading cols 4-80, the offsets.ts
  // latent bug). Trailing pad in cols 4-72 is ASCII space and is dropped.
  let line = served_line(<<"AN":utf8>>, <<"9049442":utf8>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(<<"9049442":utf8>>) = card_image.data_value(line)
}

// Consequence of dropping only ASCII space: a trailing byte that is NOT a
// space (here a tab, 0x09) stays in the extracted value rather than being
// silently repaired, so a later field check can see and reject it. The space
// pad after it is still dropped.
pub fn trailing_non_space_byte_is_kept_not_repaired_test() {
  let value = <<"ABC":utf8, 0x09>>
  let line = served_line(<<"DE":utf8>>, value, <<"XXXXXXXX":utf8>>)
  let assert Ok(<<"ABC":utf8, 0x09>>) = card_image.data_value(line)
}

// A value that is entirely blanks in columns 4-72 extracts to no bytes; the
// caller, not this step, decides whether an empty value is permitted.
pub fn all_blank_columns_extract_to_empty_test() {
  let line = served_line(<<"PB":utf8>>, <<>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(<<>>) = card_image.data_value(line)
}

// Consequence for malformed input: a line whose bytes stop before column 72
// cannot yield columns 4-72, so it is a typed error, never a panic or a
// truncated guess.
pub fn line_too_short_to_reach_column_72_is_a_typed_error_test() {
  // Ten bytes: shorter than the 3 + 69 needed to read through column 72.
  let assert Error(card_image.LineTooShort(10)) =
    card_image.data_value(<<"AN 123456\r":utf8>>)
  let assert Error(card_image.LineTooShort(0)) = card_image.data_value(<<>>)
}

// --- Property-style coverage over the input space (deterministic generators,
// not example cases). ---

// A deterministic "arbitrary" byte. `must_be_non_space` forces a value's final
// byte away from the space pad, so the generated value has no trailing space of
// its own and equals its own extraction; interior positions may still be space,
// exercising that only the trailing run is dropped.
fn pick_byte(seed: Int, must_be_non_space: Bool) -> Int {
  let r = { seed * 37 + 11 } % 95
  let r = case r < 0 {
    True -> r + 95
    False -> r
  }
  case must_be_non_space {
    True -> 33 + r % 93
    False ->
      case r % 7 {
        0 -> 0x20
        _ -> 33 + r % 93
      }
  }
}

fn gen_value(length: Int, seed: Int) -> BitArray {
  gen_bytes(0, length, seed, <<>>)
}

fn gen_bytes(i: Int, length: Int, seed: Int, acc: BitArray) -> BitArray {
  case i >= length {
    True -> acc
    False -> {
      let byte = pick_byte(seed + i, i == length - 1)
      gen_bytes(i + 1, length, seed, bit_array.append(acc, <<byte>>))
    }
  }
}

// For every value length 0..69, with varying interior bytes and varying
// columns 73-80 junk, extraction returns exactly the value: the space pad is
// dropped and columns 73-80 never leak in, regardless of how much pad there is.
pub fn padding_and_columns_73_80_never_affect_extraction_test() {
  for_range(0, 69, fn(length) {
    let value = gen_value(length, length * 3 + 1)
    let junk = gen_value(8, length * 5 + 2)
    let line = served_line(<<"XX":utf8>>, value, junk)
    card_image.data_value(line)
    |> should.equal(Ok(value))
  })
}

// Any line whose bytes stop before column 72 is a typed LineTooShort carrying
// the true byte count, never a panic or a truncated guess.
pub fn any_line_shorter_than_column_72_is_line_too_short_test() {
  for_range(0, 71, fn(n) {
    card_image.data_value(gen_value(n, n + 5))
    |> should.equal(Error(card_image.LineTooShort(n)))
  })
}

// The 72-byte boundary: columns 1-72 present, no columns 73-80 and no CRLF,
// still extracts (only column 72 need be reached).
pub fn line_of_exactly_72_bytes_extracts_test() {
  let assert Ok(_) = card_image.data_value(gen_value(72, 9))
}

// --- Corpus-grounded: exact bytes copied from fixture
// packages/cris-formatb/fixtures/fy94-9049442.bin (AN 9049442). These are the
// real served lines, byte for byte, not reconstructions. ---

// File line 83053 (AN): the identity the whole record hangs on.
pub fn fixture_an_line_extracts_the_accession_test() {
  let line = <<
    65, 78, 32, 57, 48, 52, 57, 52, 52, 50, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(value) = card_image.data_value(line)
  let assert Ok("9049442") = bit_array.to_string(value)
}

// --- continuation_kind: for a continuation line, is it wrapped text (appends
// to the value above) or a marked value (its column-4 byte is the profile
// marker, opening a new value)? Profile-aware: the marker is passed in. ---

pub fn continuation_wrapped_when_col4_is_not_the_marker_test() {
  let line = served_line(<<"  ":utf8>>, <<"H, SOYBEAN":utf8>>, <<"XX":utf8>>)
  let assert Ok(card_image.Wrapped) = card_image.continuation_kind(line, 0xAC)
}

pub fn continuation_marked_when_col4_is_the_marker_test() {
  let line = served_line(<<"  ":utf8>>, <<0xAC, "A5000":utf8>>, <<"XX":utf8>>)
  let assert Ok(card_image.Marked) = card_image.continuation_kind(line, 0xAC)
}

// The marker is a parameter, not a constant: a different profile marker changes
// the reading of the same bytes.
pub fn continuation_marker_is_the_passed_profile_byte_test() {
  let line = served_line(<<"  ":utf8>>, <<0xAC, "A5000":utf8>>, <<"XX":utf8>>)
  let assert Ok(card_image.Wrapped) = card_image.continuation_kind(line, 0x5B)
}

pub fn continuation_kind_line_too_short_for_column_4_test() {
  let assert Error(card_image.LineTooShort(3)) =
    card_image.continuation_kind(<<"   ":utf8>>, 0xAC)
}

// Property: for any column-4 byte b and any marker m, the line reads as Marked
// exactly when b == m.
pub fn continuation_kind_marked_iff_col4_equals_marker_test() {
  for_range(0, 255, fn(b) {
    let line = served_line(<<"  ":utf8>>, <<b, "rest":utf8>>, <<"XX":utf8>>)
    let expected = case b == 0xAC {
      True -> card_image.Marked
      False -> card_image.Wrapped
    }
    card_image.continuation_kind(line, 0xAC)
    |> should.equal(Ok(expected))
  })
}

// Corpus-grounded: the fixture's own wrapped (TI, col4 'H') and marked (AC,
// col4 0xAC) continuation lines read as Wrapped and Marked under marker 0xAC.
pub fn continuation_kind_fixture_wrapped_line_test() {
  let line = <<
    32, 32, 32, 72, 44, 32, 83, 79, 89, 66, 69, 65, 78, 44, 32, 65, 78, 68, 32,
    84, 79, 66, 65, 67, 67, 79, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(card_image.Wrapped) = card_image.continuation_kind(line, 0xAC)
}

pub fn continuation_kind_fixture_marked_line_test() {
  let line = <<
    32, 32, 32, 172, 65, 53, 48, 48, 48, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(card_image.Marked) = card_image.continuation_kind(line, 0xAC)
}

// --- split_lines: chop a record's bytes into fixed 82-byte served lines. ---

pub fn split_lines_of_a_two_line_record_test() {
  let a = served_line(<<"AN":utf8>>, <<"9049442":utf8>>, <<"XXXXXXXX":utf8>>)
  let b = served_line(<<"PD":utf8>>, <<"860516":utf8>>, <<"YYYYYYYY":utf8>>)
  let assert Ok([first, second]) =
    card_image.split_lines(bit_array.append(a, b))
  first |> should.equal(a)
  second |> should.equal(b)
}

pub fn split_lines_of_empty_record_is_empty_test() {
  let assert Ok([]) = card_image.split_lines(<<>>)
}

// A record whose byte count is not a whole number of 82-byte lines is a typed
// error carrying the actual length, never a silently dropped tail.
pub fn split_lines_rejects_a_ragged_record_test() {
  let assert Error(card_image.LengthNotLineAligned(100)) =
    card_image.split_lines(gen_value(100, 1))
}

// Property: for 0..40 lines, split_lines returns exactly that many 82-byte
// chunks and concatenating them reproduces the input.
pub fn split_lines_round_trips_and_preserves_width_test() {
  for_range(0, 40, fn(count) {
    let record = repeat_line(count, <<>>)
    let assert Ok(lines) = card_image.split_lines(record)
    list.length(lines) |> should.equal(count)
    lines
    |> list.all(fn(line) { bit_array.byte_size(line) == 82 })
    |> should.be_true
    bit_array.concat(lines) |> should.equal(record)
  })
}

fn repeat_line(count: Int, acc: BitArray) -> BitArray {
  case count <= 0 {
    True -> acc
    False -> {
      let line =
        served_line(<<"XX":utf8>>, gen_value(3, count), <<"ZZZZZZZZ":utf8>>)
      repeat_line(count - 1, bit_array.append(acc, line))
    }
  }
}

// --- classify: what kind of line this is (separator / tagged / continuation)
// and, for a tagged line, its two-byte tag. Value extraction stays in
// data_value; this only reads columns 1-2. ---

pub fn classify_separator_line_test() {
  let line = served_line(<<"$$":utf8>>, <<>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(card_image.SeparatorLine) = card_image.classify(line)
}

pub fn classify_tagged_line_reads_its_tag_test() {
  let line = served_line(<<"AN":utf8>>, <<"9049442":utf8>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(card_image.TaggedLine(<<"AN":utf8>>)) =
    card_image.classify(line)
}

pub fn classify_continuation_line_test() {
  // Tag columns 1-2 are blank: a continuation of the field above it.
  let line =
    served_line(<<"  ":utf8>>, <<"more text":utf8>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(card_image.ContinuationLine) = card_image.classify(line)
}

// A marked-value continuation (first data byte 0xAC in this record) still
// classifies as a continuation here: distinguishing a marked value from
// wrapped text needs a profile (which marker byte, per FY year) transcribed
// from the source, which is deferred, so this layer does not yet split them.
pub fn classify_marked_value_continuation_is_still_a_continuation_test() {
  let line =
    served_line(<<"  ":utf8>>, <<0xAC, "A5000":utf8>>, <<"XXXXXXXX":utf8>>)
  let assert Ok(card_image.ContinuationLine) = card_image.classify(line)
}

// A line too short to hold a two-byte tag is a typed error, not a guess.
pub fn classify_line_too_short_for_a_tag_test() {
  let assert Error(card_image.LineTooShort(0)) = card_image.classify(<<>>)
  let assert Error(card_image.LineTooShort(1)) =
    card_image.classify(<<"A":utf8>>)
}

// Property: any two-letter tag that is neither "$$" nor "  " is a tagged line
// carrying exactly those two bytes.
pub fn classify_any_two_letter_tag_is_tagged_test() {
  for_range(65, 90, fn(a) {
    for_range(65, 90, fn(b) {
      let tag = <<a, b>>
      let line = served_line(tag, <<"v":utf8>>, <<"XXXXXXXX":utf8>>)
      card_image.classify(line)
      |> should.equal(Ok(card_image.TaggedLine(tag)))
    })
  })
}

// Corpus-grounded: the fixture's own separator and continuation lines.
pub fn classify_fixture_separator_line_test() {
  let line = <<
    36, 36, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(card_image.SeparatorLine) = card_image.classify(line)
}

// File line 83071: the TI title wrapped onto a second line ("...PEAC" then
// "H, SOYBEAN, AND TOBACCO"). Tag columns are blank -> a continuation.
pub fn classify_fixture_wrapped_continuation_line_test() {
  let line = <<
    32, 32, 32, 72, 44, 32, 83, 79, 89, 66, 69, 65, 78, 44, 32, 65, 78, 68, 32,
    84, 79, 66, 65, 67, 67, 79, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(card_image.ContinuationLine) = card_image.classify(line)
}

// File line 83058 (PN): a value with interior hyphens, so trimming only the
// trailing pad must leave the hyphens and every interior byte in place.
pub fn fixture_pn_line_keeps_interior_bytes_test() {
  let line = <<
    80, 78, 32, 49, 50, 55, 53, 45, 50, 49, 48, 48, 48, 45, 48, 48, 56, 45, 48,
    48, 68, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    32, 32, 32, 32, 13, 10,
  >>
  let assert Ok(value) = card_image.data_value(line)
  let assert Ok("1275-21000-008-00D") = bit_array.to_string(value)
}
