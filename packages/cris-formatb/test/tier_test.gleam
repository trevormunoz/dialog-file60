import assembly
import construct
import gleam/bit_array
import gleam/option.{Some}
import gleeunit/should
import source_record
import tally.{
  Certified, CertifiedRpaAbsence, CertifiedUndocumented, Failed, UnmodeledOnly,
  Unreadable,
}

pub fn is_certified_family_test() {
  tally.is_certified(Certified) |> should.be_true
  tally.is_certified(CertifiedUndocumented) |> should.be_true
  tally.is_certified(CertifiedRpaAbsence) |> should.be_true
  tally.is_certified(UnmodeledOnly) |> should.be_false
  tally.is_certified(Failed) |> should.be_false
  tally.is_certified(Unreadable) |> should.be_false
}

pub fn tier_name_matches_wire_vocabulary_test() {
  tally.tier_name(Certified) |> should.equal("certified")
  tally.tier_name(CertifiedUndocumented)
  |> should.equal("certified_undocumented")
  tally.tier_name(CertifiedRpaAbsence) |> should.equal("certified_rpa_absence")
  tally.tier_name(UnmodeledOnly) |> should.equal("unmodeled_only")
  tally.tier_name(Failed) |> should.equal("failed")
  tally.tier_name(Unreadable) |> should.equal("unreadable")
}

// --- tier_of fixtures --------------------------------------------------
// One 82-byte served line: cols 1-2 tag, col 3 blank, value from col 4, space
// pad to 80, CRLF. Mirrors tally_test.gleam's `line`/`certifying_record`.
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

// A record that certifies (every required group present), carrying the given
// RP value. All values fit one line (<= 69 bytes).
fn certifying_record(rp: String) -> source_record.SuppliedRecord {
  let lines = [
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
  let bytes = bit_array.concat(lines)
  let assert Ok(supplied) =
    assembly.assemble(bytes, assembly.SourceBase("T", 1), 0xAC)
  supplied
}

// A structurally-failing record (missing PN, PT, FY, OB, DE, SF), also
// carrying an unattested RP code — mirrors
// tally_test.gleam's `tally_mixed_structural_and_rpa_is_failed_test` fixture.
fn broken_record() -> source_record.SuppliedRecord {
  let lines = [
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
  let bytes = bit_array.concat(lines)
  let assert Ok(supplied) =
    assembly.assemble(bytes, assembly.SourceBase("T", 1), 0xAC)
  supplied
}

pub fn tier_of_certified_test() {
  let supplied = certifying_record("R101")
  let result = construct.project_with_vintage(supplied, Some(88))
  tally.tier_of(result) |> should.equal(Certified)
}

pub fn tier_of_certified_rpa_absence_test() {
  let supplied = certifying_record("R999")
  let result = construct.project_with_vintage(supplied, Some(88))
  tally.tier_of(result) |> should.equal(CertifiedRpaAbsence)
}

pub fn tier_of_failed_test() {
  let supplied = broken_record()
  let result = construct.project_with_vintage(supplied, Some(88))
  tally.tier_of(result) |> should.equal(Failed)
}
