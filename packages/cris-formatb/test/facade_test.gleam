//// Oracle-independent sanity check for the facade projection, grounded in
//// facts already established by scan_test.gleam / field_value_test.gleam for
//// the FY94 fixture (AN 9049442; the AC field's four values). The real gate
//// is test/parity.test.ts against src-ts/record.ts + offsets.ts.

import facade
import gleam/list
import gleam/option.{None}
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

// FY1988's percent_in_block wiring reaches split_heading_segments: an
// FY1988 SC-shaped value with two separators yields a percent, the same
// value read as FY1991plus keeps the tail whole in label (no percent).
pub fn profile_gates_the_percent_split_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let scanned = facade.scan_records(bytes, 1)
  let assert [span, ..] = scanned.spans

  let fy88 =
    facade.parse_record(bytes, span, "RG164.CRIS.FY94.txt", facade.Fy1988, 1)
  let fy91 =
    facade.parse_record(
      bytes,
      span,
      "RG164.CRIS.FY94.txt",
      facade.Fy1991plus,
      1,
    )

  // Both profiles read the same underlying bytes, so a value's raw text is
  // profile-independent even though its code/label/percent split is not.
  let assert Ok(fy88_ac) = find_field(fy88.fields, "AC")
  let assert Ok(fy91_ac) = find_field(fy91.fields, "AC")
  { fy88_ac.values |> list.map(fn(v) { v.raw }) }
  |> should.equal(fy91_ac.values |> list.map(fn(v) { v.raw }))
}
