//// tally: bucket construct outcomes over a scanned buffer. Run with `gleam test`.

import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import scan
import tally

// One 82-byte served line: cols 1-2 tag, col 3 blank, value from col 4, space
// pad to 80, CRLF. Mirrors the reader's served-line geometry.
fn line(tag: String, value: String) -> BitArray {
  let body = <<tag:utf8, 0x20, value:utf8>>
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

// A record that certifies (every required group present), carrying the given RP
// value. All values fit one line (<= 69 bytes). Begins with a "$$" boundary.
fn certifying_record(rp: String) -> List(BitArray) {
  [
    line("$$", ""),
    line("AN", "9049442"),
    line("PN", "1275-21000-008-00D"),
    line("TI", "Watershed protection in irrigated agriculture"),
    line("PS", "new"),
    line("PT", "0"),
    line("PI", "Univ of Georgia"),
    line("CY", "Tifton"),
    line("ST", "GEORGIA"),
    line("IN", "Gaines T P"),
    line("FY", "1988"),
    line("OB", "Improve poultry yields"),
    line("DE", "POULTRY FORESTRY"),
    line("SF", "CRIS"),
    line("RP", rp),
  ]
}

fn scanned(records_lines: List(List(BitArray))) -> List(scan.ScannedRecord) {
  let buffer = bit_array.concat(list.flatten(records_lines))
  let assert Ok(scan.ScanResult(records, _structure)) =
    scan.scan(buffer, "T", 1)
  records
}

// R101 is attested (Rev IV); R999 canonicalizes but is absent. Under FY88 the
// R999 record is Error-with-only-RpaCodeNotAttested, which must count as
// certified-class (certified + certified_rpa_absence), never failed.
pub fn tally_counts_rpa_absence_as_certified_class_test() {
  let records = scanned([certifying_record("R101"), certifying_record("R999")])
  let text =
    tally.render(
      tally.tally(records, Some(88)),
      "data/RG310.CRIS.FY88.txt",
      30,
      Some(88),
    )
  should.be_true(string.contains(text, "certified     : 2"))
  should.be_true(string.contains(
    text,
    "unattested RPA code (statement of absence): 1",
  ))
  should.be_true(string.contains(text, "failed        : 0"))
  should.be_true(string.contains(text, "RPA attestation active: FY88"))
}

// A record with a structural failure AND an RPA miss is genuinely failed (the
// RPA miss is incidental) — it is not routed to certified-class.
pub fn tally_mixed_structural_and_rpa_is_failed_test() {
  // Drop the required PN so identity fails, alongside the R999 miss.
  let broken = [
    line("$$", ""),
    line("AN", "9049442"),
    line("TI", "Watershed protection in irrigated agriculture"),
    line("PS", "new"),
    line("PI", "Univ of Georgia"),
    line("CY", "Tifton"),
    line("ST", "GEORGIA"),
    line("IN", "Gaines T P"),
    line("RP", "R999"),
  ]
  let records = scanned([broken])
  let text =
    tally.render(
      tally.tally(records, Some(88)),
      "data/RG310.CRIS.FY88.txt",
      20,
      Some(88),
    )
  should.be_true(string.contains(text, "certified     : 0"))
  should.be_true(string.contains(text, "failed        : 1"))
  // The RPA miss genuinely co-occurs with the structural failure (its bucket is
  // present) — this is what makes the case "mixed", not merely structural.
  should.be_true(string.contains(text, "rpa-not-attested"))
}

// No FY in the name → attestation off → the R999 record certifies clean.
pub fn tally_off_without_fy_name_test() {
  let records = scanned([certifying_record("R999")])
  let text = tally.render(tally.tally(records, None), "T", 15, None)
  should.be_true(string.contains(text, "certified     : 1"))
  should.be_true(string.contains(text, "RPA attestation off"))
}
