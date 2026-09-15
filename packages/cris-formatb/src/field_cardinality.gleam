//// The reader-layer cardinality of a Format B field tag: whether the facade
//// reads it as one joined value (a line-start 0xAC is a data byte) or splits it
//// on the 0xAC marker. The SingleValue set is the tags the 1982 Manual of
//// Classification documents as non-repeating (mirrored from the validator's
//// single_value dispatch, and re-sourced against the Manual in H1). Unsourced
//// tags -- HP, SN, BP, and any tag the Manual does not document -- default to
//// MultiValue = the old reading, correcting nothing we cannot source. See
//// docs/superpowers/specs/2026-09-15-correct-0xac-field-aware-reading-design.md.
//// MUST NOT import `construct`: this module is in the reader bundle; the
//// completeness cross-check lives in field_cardinality_test.gleam instead.

pub type Cardinality {
  SingleValue
  MultiValue
}

/// SingleValue for the 35 Manual-documented non-repeating tags; MultiValue for
/// every sourced repeating field, the undocumented BP/SN, HP, and any unknown
/// tag.
pub fn cardinality(tag: String) -> Cardinality {
  case tag {
    "AN"
    | "PN"
    | "TI"
    | "PS"
    | "PT"
    | "AS"
    | "DS"
    | "IC"
    | "PI"
    | "CY"
    | "ST"
    | "ZP"
    | "RE"
    | "CG"
    | "RG"
    | "RN"
    | "OC"
    | "PD"
    | "SD"
    | "SX"
    | "TD"
    | "TX"
    | "FY"
    | "GY"
    | "UP"
    | "PP"
    | "PX"
    | "BT"
    | "AT"
    | "DT"
    | "OB"
    | "AP"
    | "DE"
    | "PR"
    | "PB" -> SingleValue
    _ -> MultiValue
  }
}
