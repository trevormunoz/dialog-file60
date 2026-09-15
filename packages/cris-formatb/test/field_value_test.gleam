//// Joining fragments as bytes, preserving interior pad and value order.

import assembly
import card_image
import field_value
import gleam/bit_array
import gleam/list
import gleeunit/should
import record_model.{
  type Witness, Field, FieldOccurrence, Location, MarkedValueStart, NonEmpty,
  SuppliedRecord, TaggedStart, Witness, WrappedText,
}
import simplifile

fn pad(n: Int) -> BitArray {
  list.repeat(<<0x20>>, times: n) |> bit_array.concat
}

// Synthetic 82-byte witness, with conspicuous supplier columns to catch leaks.
fn line_witness(content: BitArray) -> Witness {
  let line =
    bit_array.concat([
      <<"XX ":utf8>>,
      content,
      pad(69 - bit_array.byte_size(content)),
      <<"XXXXXXXX\r\n":utf8>>,
    ])
  Witness(Location("F", 1, 0, 82), line)
}

pub fn single_value_from_tagged_start_test() {
  let occ =
    FieldOccurrence(
      "AN",
      NonEmpty(TaggedStart(line_witness(<<"9049442":utf8>>)), []),
    )
  field_value.field_values(occ) |> should.equal(Ok([<<"9049442":utf8>>]))
}

pub fn wrapped_continuation_extends_the_value_test() {
  let occ =
    FieldOccurrence(
      "TI",
      NonEmpty(TaggedStart(line_witness(<<"PEAC":utf8>>)), [
        WrappedText(line_witness(<<"H":utf8>>)),
      ]),
    )
  let expected = bit_array.concat([<<"PEAC":utf8>>, pad(65), <<"H":utf8>>])
  field_value.field_values(occ) |> should.equal(Ok([expected]))
}

pub fn marked_continuation_opens_a_new_value_test() {
  let occ =
    FieldOccurrence(
      "AC",
      NonEmpty(TaggedStart(line_witness(<<"A4900":utf8>>)), [
        MarkedValueStart(line_witness(<<0xAC, "A5000":utf8>>)),
      ]),
    )
  field_value.field_values(occ)
  |> should.equal(Ok([<<"A4900":utf8>>, <<"A5000":utf8>>]))
}

pub fn mixed_fragments_preserve_chunks_and_values_in_order_test() {
  let occ =
    FieldOccurrence(
      "XX",
      NonEmpty(TaggedStart(line_witness(<<"one":utf8>>)), [
        WrappedText(line_witness(<<"two":utf8>>)),
        MarkedValueStart(line_witness(<<0x5B, "three":utf8>>)),
        WrappedText(line_witness(<<0xFF, 9, 13>>)),
        MarkedValueStart(line_witness(<<0x5B>>)),
      ]),
    )
  field_value.field_values(occ)
  |> should.equal(
    Ok([
      bit_array.concat([<<"one":utf8>>, pad(66), <<"two":utf8>>]),
      bit_array.concat([<<"three":utf8>>, pad(63), <<0xFF, 9, 13>>]),
      <<>>,
    ]),
  )
}

pub fn empty_tagged_value_is_retained_test() {
  let occ = FieldOccurrence("XX", NonEmpty(TaggedStart(line_witness(<<>>)), []))
  field_value.field_values(occ) |> should.equal(Ok([<<>>]))
}

pub fn unreadable_fragment_propagates_its_byte_length_test() {
  let short = Witness(Location("F", 1, 0, 3), <<"XX ":utf8>>)
  let opener = TaggedStart(line_witness(<<"ok":utf8>>))
  list.each(
    [TaggedStart(short), WrappedText(short), MarkedValueStart(short)],
    fn(fragment) {
      field_value.field_values(FieldOccurrence(
        "XX",
        NonEmpty(opener, [fragment]),
      ))
      |> should.equal(Error(card_image.LineTooShort(3)))
    },
  )
  field_value.field_values(FieldOccurrence(
    "XX",
    NonEmpty(TaggedStart(short), []),
  ))
  |> should.equal(Error(card_image.LineTooShort(3)))
}

pub fn wrapped_first_fragment_opens_a_value_test() {
  let occ =
    FieldOccurrence(
      "XX",
      NonEmpty(WrappedText(line_witness(<<"first":utf8>>)), []),
    )
  field_value.field_values(occ) |> should.equal(Ok([<<"first":utf8>>]))
}

pub fn assembly_owns_profile_marker_classification_test() {
  let opener = line_witness(<<"one":utf8>>).bytes
  let continuation = line_witness(<<0x5B, "two":utf8>>).bytes
  let assert <<_:bytes-size(2), body:bytes>> = continuation
  let bytes = bit_array.concat([opener, <<"  ":utf8>>, body])
  let base = assembly.SourceBase("F", 1)
  let assert Ok(SuppliedRecord(_, [Field(marked)])) =
    assembly.assemble(bytes, base, 0x5B)
  let assert Ok(SuppliedRecord(_, [Field(wrapped)])) =
    assembly.assemble(bytes, base, 0xAC)
  field_value.field_values(marked)
  |> should.equal(Ok([<<"one":utf8>>, <<"two":utf8>>]))
  field_value.field_values(wrapped)
  |> should.equal(
    Ok([
      bit_array.concat([<<"one":utf8>>, pad(66), <<0x5B, "two":utf8>>]),
    ]),
  )
}

// Actual fixture slices, not reconstructed lines: source lines 83083-83086.
pub fn ac_field_joins_to_its_four_values_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let assert Ok(ac_bytes) = bit_array.slice(bytes, 31 * 82, 4 * 82)
  let assert Ok(SuppliedRecord(_, [Field(occ)])) =
    assembly.assemble(
      ac_bytes,
      assembly.SourceBase("RG164.CRIS.FY94.txt", 83_083),
      0xAC,
    )
  occ.tag |> should.equal("AC")
  field_value.field_values(occ)
  |> should.equal(
    Ok([
      <<"A4900":utf8>>,
      <<"A5000":utf8>>,
      <<"A4900":utf8>>,
      <<"A4900":utf8>>,
    ]),
  )
}

pub fn fixture_title_wrap_joins_without_an_inserted_space_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let assert Ok(ti_bytes) = bit_array.slice(bytes, 18 * 82, 2 * 82)
  let assert Ok(SuppliedRecord(_, [Field(occ)])) =
    assembly.assemble(
      ti_bytes,
      assembly.SourceBase("RG164.CRIS.FY94.txt", 83_070),
      0xAC,
    )
  occ.tag |> should.equal("TI")
  field_value.field_values(occ)
  |> should.equal(
    Ok([
      <<
        "GENE TRANSFER AND TISSUE CULTURE TECHNOLOGIES FOR IMPROVEMENT OF PEACH, SOYBEAN, AND TOBACCO":utf8,
      >>,
    ]),
  )
}
