import gleeunit/should
import project_row.{Provenance}

pub fn provenance_from_rg164_fy94_test() {
  project_row.provenance_of("data/RG164.CRIS.FY94.txt")
  |> should.equal(Ok(Provenance("RG164", 94)))
}

pub fn provenance_from_rg310_fy88_test() {
  project_row.provenance_of("data/RG310.CRIS.FY88.txt")
  |> should.equal(Ok(Provenance("RG310", 88)))
}

pub fn provenance_none_when_no_fy_test() {
  project_row.provenance_of("data/whatever.txt") |> should.equal(Error(Nil))
}
