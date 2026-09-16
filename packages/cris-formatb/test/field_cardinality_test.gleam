import construct
import field_cardinality.{MultiValue, SingleValue}
import gleam/list
import gleeunit/should

// The 35 Manual-documented non-repeating tags (design spec bucket (a)).
const single_value_tags = [
  "AN", "PN", "TI", "PS", "PT", "AS", "DS", "IC", "PI", "CY", "ST", "ZP", "RE",
  "CG", "RG", "RN", "OC", "PD", "SD", "SX", "TD", "TX", "FY", "GY", "UP", "PP",
  "PX", "BT", "AT", "DT", "OB", "AP", "DE", "PR", "PB",
]

// COVERAGE guard: the table must classify exactly the modeled-tag universe, and
// no single-value tag may sit outside it. (The SIDE of each tag is guarded by
// H1 — Manual re-sourcing — not by this test.) Importing construct is test-only
// and never enters dist/engine.mjs.
pub fn classification_matches_modeled_tags_test() {
  list.each(single_value_tags, fn(tag) {
    list.contains(construct.modeled_tags, tag) |> should.be_true
  })
  list.each(construct.modeled_tags, fn(tag) {
    let want = case list.contains(single_value_tags, tag) {
      True -> SingleValue
      False -> MultiValue
    }
    field_cardinality.cardinality(tag) |> should.equal(want)
  })
}

// BP and SN are modeled but unsourced -> MultiValue (old reading), NOT single.
pub fn unsourced_tags_are_multivalue_test() {
  field_cardinality.cardinality("BP") |> should.equal(MultiValue)
  field_cardinality.cardinality("SN") |> should.equal(MultiValue)
  field_cardinality.cardinality("HP") |> should.equal(MultiValue)
  // an unknown tag defaults to the old reading too
  field_cardinality.cardinality("ZZ") |> should.equal(MultiValue)
}
