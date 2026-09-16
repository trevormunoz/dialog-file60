import gleeunit/should
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
