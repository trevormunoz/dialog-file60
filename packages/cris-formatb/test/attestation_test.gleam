import gleeunit/should
import rpa_attestation.{Attested, NoWarrantSet, NotApplicable, NotAttested}

pub fn attested_carries_label_test() {
  // "101" is in the Rev IV set (vocab_rpa.rev_iv_label) -> "Appraisal of Soil
  // Resources".
  case rpa_attestation.attestation("101", rpa_attestation.RevIv) {
    Attested(code, label) -> {
      code |> should.equal("101")
      label |> should.equal("Appraisal of Soil Resources")
    }
    _ -> should.fail()
  }
}

pub fn no_warrant_set_test() {
  rpa_attestation.attestation("101", rpa_attestation.NoWarrant)
  |> should.equal(NoWarrantSet)
}

pub fn not_applicable_when_uncanonicalizable_test() {
  // Fewer than the 3 digits canonical_code needs.
  case rpa_attestation.attestation("xx", rpa_attestation.RevIv) {
    NotApplicable -> should.be_true(True)
    _ -> should.fail()
  }
}

pub fn not_attested_when_absent_from_set_test() {
  case rpa_attestation.attestation("999", rpa_attestation.RevIv) {
    NotAttested(_) -> should.be_true(True)
    _ -> should.fail()
  }
}
