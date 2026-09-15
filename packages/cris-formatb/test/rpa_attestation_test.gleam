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
