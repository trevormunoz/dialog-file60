//// record_model: tests for `render`, the shared lossy Latin-1 display render
//// for the byte-preserving narrative/participant fields (OB/AP/DE/PR/PB/IN;
//// see the payload-provenance note near `Supported` in record_model.gleam).
//// Run with `gleam test`.

import gleam/list
import gleeunit/should
import record_model
import source_record

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

// --- classification_rows: the derived, non-certified alignment view ----------
// classification_rows is a PROJECTION over ClassificationColumns, not a stored
// or enforced structure: the source documents only "columnar display", so the
// one-to-one alignment is a census-observed regularity (100% of FY88/FY89/FY94),
// never a documented rule (rules/field-rule-inventory.md). The view offers rows
// when the columns line up and fails (Error) when they do not — it makes no
// claim the alignment always holds.

// A minimal Supported(String) with a throwaway location, for building columns.
fn sup(value: String) -> record_model.Supported(String) {
  record_model.Supported(
    value,
    source_record.NonEmpty(source_record.Location("fixture", 1, 0, 0), []),
  )
}

// Equal-length columns zip position-for-position: value i of every column forms
// row i, with CT as the row's percent (field order RP, AC, CM, FS, CT, PA, JC).
pub fn classification_rows_zips_equal_columns_into_aligned_rows_test() {
  let columns =
    record_model.ClassificationColumns(
      activity: [sup("A4900"), sup("A5000")],
      commodity: [sup("C1000"), sup("C1000")],
      science: [sup("F0513"), sup("F0312")],
      problem: [sup("R304"), sup("R305")],
      product_percent: [sup("042%"), sup("058%")],
      program_area: [sup("P3.13"), sup("P3.06")],
      joint_council: [sup("J2A"), sup("J2B")],
    )
  let assert Ok(rows) = record_model.classification_rows(columns)
  list.length(rows) |> should.equal(2)
  let assert [first, second] = rows
  first.problem.value |> should.equal("R304")
  first.activity.value |> should.equal("A4900")
  first.commodity.value |> should.equal("C1000")
  first.science.value |> should.equal("F0513")
  first.percent.value |> should.equal("042%")
  first.program_area.value |> should.equal("P3.13")
  first.joint_council.value |> should.equal("J2A")
  second.problem.value |> should.equal("R305")
  second.percent.value |> should.equal("058%")
  second.joint_council.value |> should.equal("J2B")
}

// Columns of unequal length do NOT line up: the projection fails rather than
// silently truncating or padding. The stored ClassificationColumns is unchanged;
// only this derived view reports that the undocumented alignment does not hold.
pub fn classification_rows_unequal_columns_is_error_test() {
  let columns =
    record_model.ClassificationColumns(
      activity: [sup("A4900"), sup("A5000")],
      commodity: [sup("C1000")],
      science: [sup("F0513"), sup("F0312")],
      problem: [sup("R304"), sup("R305")],
      product_percent: [sup("042%"), sup("058%")],
      program_area: [sup("P3.13"), sup("P3.06")],
      joint_council: [sup("J2A"), sup("J2B")],
    )
  record_model.classification_rows(columns) |> should.equal(Error(Nil))
}

// All columns empty (a record with no classification lines, e.g. the header):
// zero rows, not an error.
pub fn classification_rows_empty_columns_is_ok_empty_test() {
  let columns = record_model.ClassificationColumns([], [], [], [], [], [], [])
  record_model.classification_rows(columns) |> should.equal(Ok([]))
}
