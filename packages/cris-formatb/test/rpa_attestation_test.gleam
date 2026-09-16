import gleam/option.{None, Some}
import gleeunit/should
import rpa_attestation.{Fy94Table, NoWarrant, RevIv, RpaMiss}

pub fn warrant_for_maps_fy_test() {
  rpa_attestation.warrant_for(88) |> should.equal(RevIv)
  rpa_attestation.warrant_for(89) |> should.equal(RevIv)
  rpa_attestation.warrant_for(94) |> should.equal(Fy94Table)
  rpa_attestation.warrant_for(90) |> should.equal(NoWarrant)
}

pub fn canonical_code_strips_optional_r_test() {
  rpa_attestation.canonical_code("R101") |> should.equal(Ok("101"))
  rpa_attestation.canonical_code("101") |> should.equal(Ok("101"))
  rpa_attestation.canonical_code("R1015") |> should.equal(Error(Nil))
  rpa_attestation.canonical_code("A4100") |> should.equal(Error(Nil))
}

pub fn attest_known_code_passes_test() {
  rpa_attestation.attest("R101", RevIv) |> should.equal(Ok(Nil))
}

pub fn attest_unknown_code_misses_test() {
  rpa_attestation.attest("R999", RevIv)
  |> should.equal(Error(RpaMiss("999", rpa_attestation.set_label(RevIv))))
}

pub fn attest_no_warrant_skips_test() {
  rpa_attestation.attest("R999", NoWarrant) |> should.equal(Ok(Nil))
}

pub fn attest_uncanonicalizable_skips_test() {
  rpa_attestation.attest("A4100", RevIv) |> should.equal(Ok(Nil))
}

pub fn corpus_fy_from_path_reads_the_real_names_test() {
  rpa_attestation.corpus_fy_from_path("data/RG310.CRIS.FY88.txt")
  |> should.equal(Some(88))
  rpa_attestation.corpus_fy_from_path("data/RG164.CRIS.FY89.txt")
  |> should.equal(Some(89))
  rpa_attestation.corpus_fy_from_path("data/RG164.CRIS.FY94.txt")
  |> should.equal(Some(94))
}

pub fn corpus_fy_from_path_requires_exactly_two_digits_test() {
  rpa_attestation.corpus_fy_from_path("data/FY1988.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("data/FY888.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("data/FY8.txt") |> should.equal(None)
  rpa_attestation.corpus_fy_from_path("T") |> should.equal(None)
}

pub fn corpus_fy_from_path_takes_leftmost_valid_test() {
  // a rejected 4-digit FY, then a valid 2-digit FY: the valid one wins
  rpa_attestation.corpus_fy_from_path("FY1988.CRIS.FY94.txt")
  |> should.equal(Some(94))
}

pub fn corpus_fy_from_path_reads_basename_not_directory_test() {
  // a vintage-named directory must NOT pre-empt a differently-named file
  rpa_attestation.corpus_fy_from_path("archive/FY88/latest.txt")
  |> should.equal(None)
}

pub fn attestation_note_off_test() {
  rpa_attestation.attestation_note(None)
  |> should.equal("RPA attestation off: no fiscal year in the file name")
}

pub fn attestation_note_active_test() {
  rpa_attestation.attestation_note(Some(88))
  |> should.equal(
    "RPA attestation active: FY88 (from file name) — "
    <> rpa_attestation.set_label(RevIv),
  )
}

pub fn attestation_note_not_run_test() {
  rpa_attestation.attestation_note(Some(90))
  |> should.equal(
    "RPA attestation not run: no warrant set for FY90 (from file name)",
  )
}
