//// report: read a whole file's bytes into records and print each record's
//// checked Identity (or its problems) plus a summary. Run with `gleam test`.

import gleam/bit_array
import gleam/list
import gleam/string
import gleeunit/should
import record_model
import report

fn line(first: String) -> BitArray {
  let body = <<first:utf8>>
  bit_array.concat([
    body,
    spaces(80 - bit_array.byte_size(body)),
    <<0x0d, 0x0a>>,
  ])
}

fn spaces(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, spaces(n - 1))
  }
}

// Two records: the first has a valid AN and PN; the second has no AN.
pub fn report_shows_identity_and_problems_and_summary_test() {
  let bytes =
    bit_array.concat(list.map(
      ["$$", "AN 9049442", "PN 1275-21000-008-00D", "$$", "PN 9999"],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "AN=9049442"))
  should.be_true(string.contains(text, "PN=1275-21000-008-00D"))
  should.be_true(string.contains(text, "AN required field not located"))
  should.be_true(string.contains(
    text,
    "2 records scanned; 1 with a checked Identity",
  ))
}

// A record with the required participant fields shows the constructed block.
pub fn report_shows_participants_for_a_full_record_test() {
  let bytes =
    bit_array.concat(list.map(
      [
        "$$", "AN 9049442", "PN 1275-21000-008-00D", "PI Univ of Georgia",
        "CY Tifton", "ST GEORGIA", "IN Gaines T P",
      ],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "institution=Univ of Georgia"))
  should.be_true(string.contains(text, "investigators=1"))
}

// A record with valid dates shows the constructed chronology, FY included.
pub fn report_shows_chronology_test() {
  let bytes =
    bit_array.concat(list.map(
      [
        "$$", "AN 9049442", "PN 1275-21000-008-00D", "PD 831214", "SD 880720",
        "SX 20 JUL 88", "TD 910630", "TX 30 JUN 90", "FY 1992", "UP 880203",
        "PP 9012", "PX 9001 TO 9012",
      ],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "chronology OK"))
  should.be_true(string.contains(text, "FY=1992"))
}

// A record with narrative fields shows the constructed narratives block.
pub fn report_shows_narratives_test() {
  let bytes =
    bit_array.concat(list.map(
      [
        "$$", "AN 9049442", "PN 1275-21000-008-00D", "OB Improve poultry yields",
        "DE POULTRY FORESTRY",
      ],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "narratives OK"))
}

// A record with every group's required fields present shows a constructed
// top-level project, including its title.
pub fn report_shows_project_test() {
  let bytes =
    bit_array.concat(list.map(
      [
        "$$", "AN 9049442", "PN 1275-21000-008-00D", "TI Watershed protection",
        "PI Univ of Georgia", "CY Tifton", "ST GEORGIA", "IN Gaines T P",
        "FY 1988", "SF CRIS",
      ],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "project OK"))
  should.be_true(string.contains(text, "Watershed protection"))
}

// describe_kind (private) rendering of an RpaCodeNotAttested divergence.
// Exercised directly rather than via report.report: nothing in this
// package's public scan -> assemble -> construct pipeline emits
// RpaCodeNotAttested yet (that wiring is a later task), so there is no
// record-bytes path that reaches this arm. describe_kind is annotated
// @internal in report.gleam — visible within the package for this test,
// not part of the published API.
pub fn describe_rpa_not_attested_test() {
  report.describe_kind(record_model.RpaCodeNotAttested(
    "514",
    "Rev IV RPA set (glm-ocr-audited)",
  ))
  |> should.equal("RPA 514 not attested in Rev IV RPA set (glm-ocr-audited)")
}

// Under a FY88-named file, an unattested RP code shows the active note and the
// per-record miss. (The record need not certify — report lists problems.)
pub fn report_attests_rp_under_fy88_name_test() {
  let bytes =
    bit_array.concat(list.map(
      ["$$", "AN 9049442", "PN 1275-21000-008-00D", "RP R999"],
      line,
    ))
  let assert Ok(text) =
    report.report(bytes, "data/RG310.CRIS.FY88.txt", 1, 0xAC, 100)
  should.be_true(string.contains(text, "RPA attestation active: FY88"))
  should.be_true(string.contains(text, "RPA 999 not attested"))
}

// A file name without an FY token → attestation off → no per-record miss.
pub fn report_off_without_fy_name_test() {
  let bytes =
    bit_array.concat(list.map(
      ["$$", "AN 9049442", "PN 1275-21000-008-00D", "RP R999"],
      line,
    ))
  let assert Ok(text) = report.report(bytes, "T", 1, 0xAC, 100)
  should.be_true(string.contains(text, "RPA attestation off"))
  should.be_false(string.contains(text, "not attested"))
}
