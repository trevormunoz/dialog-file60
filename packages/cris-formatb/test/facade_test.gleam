//// Oracle-independent sanity check for the facade projection, grounded in
//// facts already established by scan_test.gleam / field_value_test.gleam for
//// the FY94 fixture (AN 9049442; the AC field's four values). The real gate
//// is test/parity.test.ts against src-ts/record.ts + offsets.ts.

import facade
import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import simplifile

fn find_field(
  fields: List(facade.SourceField),
  tag: String,
) -> Result(facade.SourceField, Nil) {
  list.find(fields, fn(f) { f.tag == tag })
}

pub fn parse_record_projects_the_fixture_record_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let scanned = facade.scan_records(bytes, 1)
  let assert [span, ..] = scanned.spans
  span.an |> should.equal("9049442")

  let rec =
    facade.parse_record(
      bytes,
      span,
      "RG164.CRIS.FY94.txt",
      facade.Fy1991plus,
      1,
    )
  rec.an |> should.equal("9049442")
  rec.file |> should.equal("RG164.CRIS.FY94.txt")

  let assert Ok(ac) = find_field(rec.fields, "AC")
  ac.values
  |> list.map(fn(v) { v.raw })
  |> should.equal(["A4900", "A5000", "A4900", "A4900"])

  // AC values are plain codes: no 0xA0 0x02 separator, so code/label/percent
  // are all absent.
  let assert [first, second, ..] = ac.values
  first.code |> should.equal(None)
  first.continuation |> should.equal(False)
  // The second AC value opens on a MarkedValueStart continuation line.
  second.continuation |> should.equal(True)
}

// The profile's percent_in_block wiring must reach split_heading_segments
// through the full facade parse. A value carrying TWO 0xA0 0x02 separators
// ("code<sep>label<sep>100%") splits differently by profile: FY1988
// (percent_in_block) pulls the trailing "100%" into `percent`; FY1991plus
// keeps the whole tail in `label` and leaves `percent` absent. Asserting that
// differential — Some vs None on the SAME bytes — is what proves the gate is
// live end-to-end: a gate collapsed to a constant fails one of the two
// branches. (The fixture's own AC values are bare codes with no separator, so
// they cannot exercise this; a synthetic two-separator value is used instead,
// as segment_test does at the unit level.)
pub fn profile_gates_the_percent_split_test() {
  let crlf = <<13, 10>>
  let sep = <<0xA0, 0x02>>
  let value =
    bit_array.concat([
      <<"SC ":utf8, "C0600":utf8>>,
      sep,
      <<"Apples":utf8>>,
      sep,
      <<"100%":utf8>>,
    ])
  let bytes =
    bit_array.concat([
      served_line(<<"<< H":utf8>>, crlf),
      served_line(<<"$$":utf8>>, crlf),
      served_line(<<"AN 9000001":utf8>>, crlf),
      served_line(value, crlf),
      served_line(<<">> T":utf8>>, crlf),
    ])
  let scanned = facade.scan_records(bytes, 1)
  let assert [span, ..] = scanned.spans

  let fy88 = facade.parse_record(bytes, span, "synthetic", facade.Fy1988, 1)
  let fy91 = facade.parse_record(bytes, span, "synthetic", facade.Fy1991plus, 1)
  let assert Ok(fy88_sc) = find_field(fy88.fields, "SC")
  let assert Ok(fy91_sc) = find_field(fy91.fields, "SC")
  let assert [fy88_v] = fy88_sc.values
  let assert [fy91_v] = fy91_sc.values

  // Same underlying value: identical raw text and identical leading code under
  // both profiles...
  fy88_v.raw |> should.equal(fy91_v.raw)
  fy88_v.code |> should.equal(Some("C0600"))
  fy91_v.code |> should.equal(Some("C0600"))
  // ...but ONLY FY1988 pulls the trailing percent; FY1991plus leaves it absent.
  fy88_v.percent |> should.equal(Some("100%"))
  fy91_v.percent |> should.equal(None)
}

fn served_line(prefix: BitArray, ending: BitArray) -> BitArray {
  let pad =
    list.repeat(<<32>>, times: 80 - bit_array.byte_size(prefix))
    |> bit_array.concat
  bit_array.concat([prefix, pad, ending])
}

// bad_lines counts every line whose bytes 80-81 are not CR LF (offsets.ts:48),
// header/trailer/separator lines included, and is 0 for a clean file.
pub fn scan_records_counts_lines_not_ending_in_crlf_test() {
  let crlf = <<13, 10>>
  let clean =
    bit_array.concat([
      served_line(<<"<< H":utf8>>, crlf),
      served_line(<<"$$":utf8>>, crlf),
      served_line(<<"AN 1":utf8>>, crlf),
      served_line(<<">> T":utf8>>, crlf),
    ])
  facade.scan_records(clean, 1).bad_lines |> should.equal(0)

  let dirty =
    bit_array.concat([
      served_line(<<"<< H":utf8>>, <<10, 13>>),
      served_line(<<"$$":utf8>>, crlf),
      served_line(<<"AN 1":utf8>>, <<32, 10>>),
      served_line(<<">> T":utf8>>, <<13, 13>>),
    ])
  let scanned = facade.scan_records(dirty, 1)
  scanned.bad_lines |> should.equal(3)
  // The count is a side tally: the span itself is unaffected.
  let assert [span] = scanned.spans
  span.an |> should.equal("1")
}

// A single-value field (OB) whose wrapped continuation begins with 0xAC. The old
// uniform reading split it into two values and dropped the 0xAC; the corrected
// field-aware reading yields ONE value with the 0xAC recovered as data, opened by
// the field's own tagged start (continuation: false). Design spec gate 3.
pub fn single_value_field_keeps_line_start_0xac_as_data_test() {
  let crlf = <<13, 10>>
  let bytes =
    bit_array.concat([
      served_line(<<"<< H":utf8>>, crlf),
      served_line(<<"$$":utf8>>, crlf),
      served_line(<<"AN 9000001":utf8>>, crlf),
      served_line(<<"OB ":utf8, "First part":utf8>>, crlf),
      // blank tag (cols 1-2), col-3 pad, then 0xAC as the first DATA byte ->
      // assembly marks this a MarkedValueStart continuation.
      served_line(<<"  ":utf8, 32, 0xAC, "quoted tail":utf8>>, crlf),
      served_line(<<">> T":utf8>>, crlf),
    ])
  let scanned = facade.scan_records(bytes, 1)
  let assert [span, ..] = scanned.spans
  let rec = facade.parse_record(bytes, span, "synthetic", facade.Fy1991plus, 1)
  let assert Ok(ob) = find_field(rec.fields, "OB")

  ob.values |> list.length |> should.equal(1)
  let assert [only] = ob.values
  only.continuation |> should.equal(False)
  only.line |> should.equal(4)
  // latin1 decodes 0xAC to U+00AC; the byte survives as data, not a boundary.
  string.contains(only.raw, "\u{00AC}") |> should.be_true
}
