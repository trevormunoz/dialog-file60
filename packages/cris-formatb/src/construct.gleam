//// Checked construction of the Identity block (AN, PN) from a SuppliedRecord.
//// Reads only rules the documentary inventory has settled at printed grade
//// (rules/field-rule-inventory.md, batch 1): AN is numeric, exact length 7,
//// non-repeating, required; PN is required, non-repeating, length <= 20 bytes.
//// The PN character class is deliberately NOT checked ("A,N" is not a literal
//// class — its own examples carry hyphens). Problems are typed and returned,
//// never repaired.

import accession.{type Accession}
import card_image
import field_value
import gleam/bit_array
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import record_model.{
  type Chronology, type Classifications, type ConstructionProblem,
  type FieldOccurrence, type Fragment, type Heading, type Identity,
  type Institution, type Location, type Narratives, type Participants,
  type Provisional, type RuleRef, type Subcommodity, type SuppliedRecord,
  type Supported, type UndocumentedField, Chronology, ClassificationColumns,
  Classifications, Disagreement, Field, FieldNotYetModeled, FieldOccurrence,
  FormatDisagreement, HandwrittenAmendment, Heading, Identity, Institution,
  InvalidAccession, InvalidFieldValue, Location, MarkedValueStart, Narratives,
  NonEmpty, PairedDate, Participants, PrintedDictionary, Provisional,
  RelatedFieldsDisagree, RequiredFieldNotLocated, RuleRef, Subcommodity,
  Supplied, Supported, TaggedStart, Unassigned, UndocumentedField,
  ValidationAddendum, Witness, WrappedText,
}
import segment

/// AN rule, PDF p.13 row 1, printed (rules/field-rule-inventory.md batch 1).
const an_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 13,
  element: "1 (AN)",
  assertion: "Character Type N; Length Exact 7; Repeating Field N; Always Present Y",
  interpretation: "exactly seven ASCII-digit bytes; required; one occurrence",
  stage: Supplied,
  evidence: PrintedDictionary,
)

/// PN rule, PDF p.13 row 5, printed. Length <= 20 is checkable; the "A,N"
/// character class is NOT (its own examples carry hyphens), so it is not checked.
const pn_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 13,
  element: "5 (PN)",
  assertion: "Character Type A,N; Length MAX 20; Repeating Field N; Always Present Y",
  interpretation: "required; one occurrence; value length <= 20 bytes; character class unresolved",
  stage: Supplied,
  evidence: PrintedDictionary,
)

const pn_max_bytes: Int = 20

/// Construct the Identity block. Ok only when AN and PN each satisfy their
/// settled rules; otherwise the accumulated problems from BOTH fields, so a
/// record with a bad AN and a bad PN reports both at once rather than
/// short-circuiting on AN — matching institution/participants and the module's
/// "surface every divergence" philosophy.
pub fn identity(record: SuppliedRecord) -> Checked(Identity) {
  let accession = accession_field(record)
  let project_number = required(record, "PN", pn_rule, upto(pn_max_bytes))
  case list.append(problems_of(accession), problems_of(project_number)) {
    [] ->
      Ok(Identity(
        accession: value_of(accession),
        project_number: value_of(project_number),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

// AN: required, non-repeating, exactly seven ASCII digits (accession.parse).
// Kept a separate checked field so `identity` can accumulate AN and PN problems
// together instead of returning on the first AN failure.
fn accession_field(record: SuppliedRecord) -> Checked(Supported(Accession)) {
  case occurrences(record, "AN") {
    [] -> Error(NonEmpty(required_not_located(record, "AN", an_rule), []))
    [an] ->
      case resolve_accession(an) {
        Ok(accession_supported) -> Ok(accession_supported)
        Error(problem) -> Error(NonEmpty(problem, []))
      }
    repeated -> Error(NonEmpty(non_repeating(repeated, "AN", an_rule), []))
  }
}

fn non_repeating(
  occurrences: List(FieldOccurrence),
  tag: String,
  rule: RuleRef,
) -> ConstructionProblem {
  disagreement(
    record_model.NonRepeatingFieldRepeated(tag, list.length(occurrences)),
    rule,
    all_locations(occurrences),
    "count of tagged " <> tag <> " occurrences in the record",
  )
}

// Flatten the locations of several occurrences into one NonEmpty. Callers pass a
// non-empty list, so the first occurrence seeds the NonEmpty.
fn all_locations(
  occurrences: List(FieldOccurrence),
) -> record_model.NonEmpty(Location) {
  case occurrences {
    [] -> NonEmpty(placeholder_location, [])
    [first, ..rest] -> {
      let NonEmpty(l0, l0_rest) = locations(first)
      let more =
        list.flat_map(rest, fn(occurrence) {
          let NonEmpty(f, r) = locations(occurrence)
          [f, ..r]
        })
      NonEmpty(l0, list.append(l0_rest, more))
    }
  }
}

const placeholder_location: Location = Location(
  file: "",
  first_line: 0,
  byte_offset: 0,
  byte_length: 0,
)

fn resolve_accession(
  an: FieldOccurrence,
) -> Result(Supported(Accession), ConstructionProblem) {
  case single_value(an) {
    Ok(an_bytes) ->
      case accession.parse(an_bytes) {
        Ok(acc) -> Ok(Supported(acc, locations(an)))
        Error(reason) ->
          Error(disagreement(
            InvalidAccession(reason),
            an_rule,
            locations(an),
            "accession.parse of the AN field value",
          ))
      }
    Error(Nil) -> Error(fragment_placeholder(an))
  }
}

// --- institution and participants -------------------------------------------

/// The performing-institution block. Requiredness is inventory batch 5: PI, CY,
/// ST are required (printed Always Present Y); the rest optional. OC's optionality
/// and PF's max length rest on handwritten amendments, marked as such.
pub fn institution(record: SuppliedRecord) -> Checked(Institution) {
  let agency =
    optional(record, "AS", printed_rule(13, "3 (AS)", "A; MAX 4"), upto(4))
  let division_station =
    optional(record, "DS", printed_rule(13, "4 (DS)", "A,N; MAX 4"), upto(4))
  let institution_code =
    optional(
      record,
      "IC",
      printed_rule(13, "6 (IC)", "N; MAX 6 MIN 4"),
      between(4, 6),
    )
  let institution_name =
    required(
      record,
      "PI",
      printed_rule(14, "7 (PI)", "A,N; MAX 40; required"),
      upto(40),
    )
  let city =
    required(
      record,
      "CY",
      printed_rule(14, "8 (CY)", "A,N; MAX 20; required"),
      upto(20),
    )
  let state_country =
    required(
      record,
      "ST",
      printed_rule(14, "9 (ST)", "A; MAX 20; required"),
      upto(20),
    )
  let zip =
    optional(record, "ZP", printed_rule(14, "10 (ZP)", "N; MAX 10"), upto(10))
  let region =
    optional(record, "RE", printed_rule(14, "11 (RE)", "N; Exact 1"), exact(1))
  let contract_grant =
    optional(
      record,
      "CG",
      printed_rule(
        15,
        "14 (CG)",
        "A,N; MAX 20; Repeating N; Always N; contract/grant/agreement number",
      ),
      upto(20),
    )
  let region_abbreviation =
    optional(
      record,
      "RG",
      printed_rule(
        15,
        "16 (RG)",
        "A; MAX 2; Repeating N; Always N; abbreviation for region",
      ),
      upto(2),
    )
  let regional_project_number =
    optional(
      record,
      "RN",
      printed_rule(
        16,
        "17 (RN)",
        "N; Exact 5; Repeating N; Always N; five-digit numerical field; second part of a two-part designation",
      ),
      exact(5),
    )
  let organization_code =
    optional(
      record,
      "OC",
      handwritten_rule(
        15,
        "12 (OC)",
        "N; MAX 6 MIN 4; Always Present Y struck to N",
      ),
      between(4, 6),
    )
  let organization_names =
    repeating(
      record,
      "PF",
      handwritten_rule(15, "13 (PF)", "A,N; MAX 40 struck to 80; repeating"),
      upto(80),
    )
  let problems =
    list.flatten([
      problems_of(agency),
      problems_of(division_station),
      problems_of(institution_code),
      problems_of(institution_name),
      problems_of(city),
      problems_of(state_country),
      problems_of(zip),
      problems_of(region),
      problems_of(contract_grant),
      problems_of(region_abbreviation),
      problems_of(regional_project_number),
      problems_of(organization_code),
      problems_of(organization_names),
    ])
  case problems {
    [] ->
      Ok(Institution(
        agency: value_of(agency),
        division_station: value_of(division_station),
        institution_code: value_of(institution_code),
        institution_name: value_of(institution_name),
        city: value_of(city),
        state_country: value_of(state_country),
        zip: value_of(zip),
        region: value_of(region),
        region_abbreviation: value_of(region_abbreviation),
        organization_code: value_of(organization_code),
        organization_names: value_of(organization_names),
        contract_grant: value_of(contract_grant),
        regional_project_number: value_of(regional_project_number),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

/// Institution plus the investigators (IN): required, ordered, 1..6, each <= 30,
/// first is sort (order preserved). Problems accumulate across the whole block.
pub fn participants(record: SuppliedRecord) -> Checked(Participants) {
  let inst = institution(record)
  let invs =
    bounded_nonempty_bytes(
      record,
      "IN",
      printed_rule(
        16,
        "18 (IN)",
        "A; MAX 30 for each IN; Repeating Y; Always Present Y; up to 6; first is sort",
      ),
      upto(30),
      6,
    )
  case list.append(problems_of(inst), problems_of(invs)) {
    [] ->
      Ok(Participants(
        institution: value_of(inst),
        investigators: value_of(invs),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

// --- chronology -------------------------------------------------------------

/// The chronology block. Dates are optional with EXACT documented lengths (a
/// wrong length is a divergence, not silently accepted). FY is optional for FY88
/// (the printed "Always Present Y" is a later vintage; see `fiscal_year`).
pub fn chronology(record: SuppliedRecord) -> Checked(Chronology) {
  let process_date =
    optional(
      record,
      "PD",
      printed_rule(13, "2.1 (PD)", "N; Exact 6; YYMMDD"),
      exact(6),
    )
  let sd =
    optional(
      record,
      "SD",
      printed_rule(16, "20 (SD)", "N; Exact 6; YYMMDD"),
      exact(6),
    )
  let sx =
    optional(
      record,
      "SX",
      printed_rule(16, "21 (SX)", "A,N; Exact 9; display form"),
      exact(9),
    )
  let td =
    optional(
      record,
      "TD",
      printed_rule(16, "22 (TD)", "N; Exact 6; YYMMDD"),
      exact(6),
    )
  let tx =
    optional(
      record,
      "TX",
      printed_rule(16, "23 (TX)", "A,N; Exact 9; display form"),
      exact(9),
    )
  let fy = fiscal_year(record)
  let gy = grant_year(record)
  let up =
    optional(
      record,
      "UP",
      printed_rule(17, "25 (UP)", "N; Exact 6; YYMMDD"),
      exact(6),
    )
  let pp =
    optional(
      record,
      "PP",
      printed_rule(17, "26 (PP)", "A,N; Exact 4; YYMM"),
      exact(4),
    )
  let px =
    optional(
      record,
      "PX",
      printed_rule(17, "27 (PX)", "A,N; Exact 12; YYMM TO YYMM"),
      exact(12),
    )
  let bp = optional(record, "BP", bp_rule, exact(12))
  let problems =
    list.flatten([
      problems_of(process_date),
      problems_of(sd),
      problems_of(sx),
      problems_of(td),
      problems_of(tx),
      problems_of(fy),
      problems_of(gy),
      problems_of(up),
      problems_of(pp),
      problems_of(px),
      problems_of(bp),
    ])
  case problems {
    [] ->
      Ok(Chronology(
        process_date: value_of(process_date),
        start: PairedDate(search_form: value_of(sd), display_form: value_of(sx)),
        termination: PairedDate(
          search_form: value_of(td),
          display_form: value_of(tx),
        ),
        fiscal_year: value_of(fy),
        grant_year: value_of(gy),
        progress_updated: value_of(up),
        progress_period_end: value_of(pp),
        progress_period_display: value_of(px),
        progress_report_period: value_of(bp),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

/// FY (Fiscal Year): OPTIONAL for the FY88 corpus. The printed dictionary marks
/// FY "Always Present Y", but that requiredness is Feb-1990 and does not govern
/// FY88 (RG310): a full-corpus `tally` run finds 25.6% of real FY88 records carry
/// no FY (8182/32016), the FY1991 validation says "elements may vary per physical
/// record", and the model already types `fiscal_year` as Option — so the
/// constructor now matches the type rather than enforcing a later-vintage rule
/// against an earlier corpus. Absent is therefore Ok(None), not a
/// required-not-located problem. When PRESENT, the value's length still honours
/// both documented forms — the printed "Exact 2" (YY) and the handwritten "Exact
/// 4" (YYYY) — and anything else is a typed divergence that matches neither.
pub fn fiscal_year(
  record: SuppliedRecord,
) -> Checked(Option(Supported(String))) {
  optional_year_2_or_4(record, "FY", fy_rule)
}

const fy_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 17,
  element: "24 (FY)",
  assertion: "N; printed 'Always Present Y'; printed Exact 2 (YY); handwritten amendment Exact 4 (YYYY)",
  interpretation: "OPTIONAL for FY88: the Feb-1990 'Always Present Y' is a later vintage than FY88 (RG310) and is contradicted by 25.6% of FY88 records (8182/32016, per a full-corpus tally); this matches the model's Option type and the FY1991 'elements may vary per physical record' caveat. When present, length must equal 2 (printed YY) or 4 (handwritten YYYY); matches-neither is a divergence.",
  stage: Supplied,
  evidence: PrintedDictionary,
)

/// GY (Grant Year, element 28): FY's exact twin — the printed dictionary's
/// Exact 2 (YY) struck by hand to Exact 4 (YYYY), with a handwritten remark
/// "Format is YYYY / may be blank". "Always Present N" in the printed row, so
/// this is optional outright (no later-vintage contradiction to resolve, unlike
/// FY). Same dual-length rule: present length must be 2 or 4, else a
/// typed divergence.
pub fn grant_year(
  record: SuppliedRecord,
) -> Checked(Option(Supported(String))) {
  optional_year_2_or_4(record, "GY", gy_rule)
}

const gy_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 17,
  element: "28 (GY)",
  assertion: "N; printed Exact 2 struck by hand to Exact 4; Repeating N; Always Present N; handwritten remark 'Format is YYYY / may be blank'",
  interpretation: "optional (printed Always Present N); when present, length must equal 2 (printed YY) or 4 (handwritten YYYY) — the same dual-length rule as FY; matches-neither is a divergence. Evidence PrintedDictionary for the Exact-2/2-digit example; the Exact-4 widening rests on the handwritten amendment.",
  stage: Supplied,
  evidence: PrintedDictionary,
)

/// BP (Progress report period covered): a field with NO printed dictionary row.
/// It is one of the two tags the validation report addendum (367_1DP.pdf p.28-29)
/// records as appearing in the data but absent from the Data Element Descriptions;
/// the agency described it by phone (Note 1, Aug 26 1992) as "Progress report
/// period covered". Absent from FY88 (RG310) entirely; present in FY94 (RG164),
/// where every observed value is exact-12 "YYMM TO YYMM" (19,739/19,739) — the
/// same shape as the printed PX (element 27), with which BP co-occurs. Modeled
/// optional, exact-12; the shape rests on that PX precedent plus the FY94 census,
/// not a dictionary row (EvidenceGrade ValidationAddendum). Scoped to FY94/RG164.
const bp_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 28,
  element: "— (BP, no element number)",
  assertion: "no printed dictionary row; validation addendum p.28-29 records BP as present in the data but not in the Data Element Descriptions; agency note (Aug 26 1992): 'Progress report period covered'",
  interpretation: "optional; when present, exact 12 bytes 'YYMM TO YYMM' — observed in 19,739/19,739 FY94/RG164 values and identical to the printed PX (element 27), with which BP co-occurs. Absent in FY88. Shape rests on the PX precedent plus the FY94 census, not a BP dictionary row.",
  stage: Supplied,
  evidence: ValidationAddendum,
)

/// Shared dual-length optional-year check for FY and GY: absent is Ok(None);
/// present, present value's byte length must be 2 (printed YY) or 4
/// (handwritten YYYY), else a typed divergence naming neither documented
/// form; more than one occurrence is non-repeating.
fn optional_year_2_or_4(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
) -> Checked(Option(Supported(String))) {
  case occurrences(record, tag) {
    [] -> Ok(None)
    [one] ->
      case single_value(one) {
        Error(Nil) -> Error(NonEmpty(fragment_placeholder(one), []))
        Ok(bytes) ->
          case bit_array.byte_size(bytes) {
            2 | 4 ->
              case bit_array.to_string(bytes) {
                Ok(text) -> Ok(Some(Supported(text, locations(one))))
                Error(Nil) ->
                  Error(
                    NonEmpty(
                      invalid_value(tag, rule, one, "value is not valid text"),
                      [],
                    ),
                  )
              }
            other ->
              Error(
                NonEmpty(
                  invalid_value(
                    tag,
                    rule,
                    one,
                    "length "
                      <> int.to_string(other)
                      <> " bytes matches neither the printed Exact-2 (YY) nor the handwritten Exact-4 (YYYY) rule",
                  ),
                  [],
                ),
              )
          }
      }
    many -> Error(NonEmpty(non_repeating(many, tag, rule), []))
  }
}

// --- classifications ---------------------------------------------------------

/// The classifications block (rules/field-rule-inventory.md batch 3). BT/AT/DT
/// are optional Exact-4 codes; the seven ClassificationColumns fields are
/// bounded-repeating (max 15 codes each); SC/PH/GH are repeating headings
/// (code+literal split on the documented 0xA0 0x02 separator); SN has no
/// dictionary row at all, so any SN occurrence is FieldNotYetModeled rather
/// than silently accepted or guessed at.
pub fn classifications(record: SuppliedRecord) -> Checked(Classifications) {
  let basic =
    optional(
      record,
      "BT",
      printed_rule(17, "29 (BT)", "A,N; Exact 4; optional; e.g. 100%"),
      exact(4),
    )
  let applied =
    optional(
      record,
      "AT",
      printed_rule(18, "30 (AT)", "A,N; Exact 4; optional"),
      exact(4),
    )
  let developmental =
    optional(
      record,
      "DT",
      printed_rule(18, "31 (DT)", "A,N; Exact 4; optional"),
      exact(4),
    )
  let activity =
    bounded_repeating(
      record,
      "AC",
      printed_rule(18, "32 (AC)", "A,N; MAX 89 MIN 5; Repeating; Max 15 codes"),
      between(5, 89),
      15,
    )
  let commodity =
    bounded_repeating(
      record,
      "CM",
      printed_rule(18, "33 (CM)", "A,N; MAX 89 MIN 5; Repeating; Max 15 codes"),
      between(5, 89),
      15,
    )
  let science =
    bounded_repeating(
      record,
      "FS",
      printed_rule(18, "34 (FS)", "A,N; MAX 89 MIN 5; Repeating; Max 15 codes"),
      between(5, 89),
      15,
    )
  let problem =
    bounded_repeating(
      record,
      "RP",
      printed_rule(19, "35 (RP)", "A,N; MAX 74 MIN 4; Repeating; Max 15 codes"),
      between(4, 74),
      15,
    )
  let product_percent =
    bounded_repeating(
      record,
      "CT",
      printed_rule(
        19,
        "36 (CT)",
        "A,N; MAX 74 MIN 4; Repeating; Max 15 percentages",
      ),
      between(4, 74),
      15,
    )
  let program_area =
    bounded_repeating(
      record,
      "PA",
      printed_rule(19, "37 (PA)", "A,N; MAX 89 MIN 5; Repeating; Max 15 codes"),
      between(5, 89),
      15,
    )
  let joint_council =
    bounded_repeating(
      record,
      "JC",
      printed_rule(19, "38 (JC)", "A,N; MAX 59 MIN 3; Repeating; Max 15 codes"),
      between(3, 59),
      15,
    )
  let subcommodities =
    subcommodity_field(
      record,
      "SC",
      printed_rule(
        20,
        "39 (SC)",
        "A,N; multi-value (0xAC-marked); each value code+literal+percent separated by (data) 0xA0 0x02, (footnote) HEX40 HEX41 HEX02; percent required (present in every FY88 value); Max 50 lines (enforced as <=50 values, a sound lower bound); documented MIN 51/MAX 2599 is aggregate, not per-value",
      ),
      50,
    )
  // SN: source-undocumented, preserved (values, never checked) — see
  // sn_undocumented. When present, SN is an ordered parallel field: percentage i
  // pairs with subcommodity i, so the counts must match (the documented SN<->SC
  // bond). The pairing is checked below once the SC values are known.
  let subcommodity_percentages = sn_undocumented(record)
  let primary_headings =
    heading_field(
      record,
      "PH",
      printed_rule(
        21,
        "46 (PH)",
        "A,N; Repeating; Max 60 classifications (only four may be present — tighter bound unresolved); separator/length notes as SC",
      ),
      60,
    )
  let general_headings =
    heading_field(
      record,
      "GH",
      printed_rule(
        23,
        "47 (GH)",
        "A,N; Repeating; Max 60 classifications (only two may be present — tighter bound unresolved); separator/length notes as SC",
      ),
      60,
    )
  // The SN<->SC positional bond: only checkable once the SC values are in hand.
  let sn_sc_pairing = case subcommodities {
    Ok(scs) -> sn_sc_bond(scs, subcommodity_percentages)
    Error(_) -> []
  }
  let problems =
    list.flatten([
      problems_of(basic),
      problems_of(applied),
      problems_of(developmental),
      problems_of(activity),
      problems_of(commodity),
      problems_of(science),
      problems_of(problem),
      problems_of(product_percent),
      problems_of(program_area),
      problems_of(joint_council),
      problems_of(subcommodities),
      sn_sc_pairing,
      problems_of(primary_headings),
      problems_of(general_headings),
    ])
  case problems {
    [] ->
      Ok(Classifications(
        basic: value_of(basic),
        applied: value_of(applied),
        developmental: value_of(developmental),
        columns: ClassificationColumns(
          activity: value_of(activity),
          commodity: value_of(commodity),
          science: value_of(science),
          problem: value_of(problem),
          product_percent: value_of(product_percent),
          program_area: value_of(program_area),
          joint_council: value_of(joint_council),
        ),
        subcommodities: value_of(subcommodities),
        subcommodity_percentages: subcommodity_percentages,
        primary_headings: value_of(primary_headings),
        general_headings: value_of(general_headings),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

// SN has no dictionary row (rules/field-rule-inventory.md): it is SOURCE-
// undocumented — the validation addendum names SN (with BP) as present in the
// data but absent from the Data Element Descriptions, and the standing rule is
// not to infer an SN rule from its data behaviour. So SN is neither a divergence
// nor a `FieldNotYetModeled` backlog item: each occurrence is PRESERVED as an
// `UndocumentedField` (raw bytes kept, never checked, with its witness), so a
// record carrying SN still certifies while the presence is recorded. This never
// fails — absent is [], present is one entry per readable value (an unreadable
// occurrence still records its presence with empty bytes, never dropped).
fn sn_undocumented(record: SuppliedRecord) -> List(UndocumentedField) {
  list.flat_map(occurrences(record, "SN"), fn(occurrence) {
    case field_value.field_values(occurrence) {
      Ok(values) ->
        list.map(values, fn(value) {
          UndocumentedField("SN", value, locations(occurrence))
        })
      Error(_) -> [UndocumentedField("SN", <<>>, locations(occurrence))]
    }
  })
}

/// The SN<->SC positional bond. SN is an ordered parallel field: percentage i is
/// the percentage for subcommodity i (agency note, Aug 26 1992: "SN = percentage
/// that refers to the previous SC field tag"; confirmed value-for-value in FY94,
/// 34,090/34,090 records). So when SN is present its value count must equal the SC
/// value count — a `RelatedFieldsDisagree` divergence otherwise. Absent SN ([]) is
/// no divergence: FY88 carries the percentage inline in a three-part SC instead.
/// The pairing is documented, so enforcing it does not "infer an SN rule from
/// data"; the percentage VALUES stay preserved and unchecked.
fn sn_sc_bond(
  subcommodities: List(Supported(Subcommodity)),
  percentages: List(UndocumentedField),
) -> List(ConstructionProblem) {
  case percentages {
    [] -> []
    [first, ..] ->
      case list.length(percentages) == list.length(subcommodities) {
        True -> []
        False -> [
          disagreement(
            RelatedFieldsDisagree(
              NonEmpty("SN", ["SC"]),
              "SN carries "
                <> int.to_string(list.length(percentages))
                <> " percentage(s) but SC carries "
                <> int.to_string(list.length(subcommodities))
                <> " value(s); the documented one-to-one SN<->SC pairing requires equal counts",
            ),
            sn_sc_bond_rule,
            first.locations,
            "count of SN percentages against count of SC values",
          ),
        ]
      }
  }
}

const sn_sc_bond_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 29,
  element: "— (SN)",
  assertion: "validation addendum p.28-29, agency note Aug 26 1992: 'Percentage that refers to the previous SC field tag. The SN changes depending on the SC.'",
  interpretation: "SN is an ordered parallel field bound position-for-position to SC: percentage i is subcommodity i's percentage, so a present SN must carry exactly one value per SC value. Documented pairing (not inferred); the percentage values themselves are source-undocumented and kept unchecked. Confirmed value-for-value across FY94 (34,090/34,090 records).",
  stage: Supplied,
  evidence: ValidationAddendum,
)

// PH/GH: a multi-value classification-heading field. Each 0xAC-marked value
// across the occurrence(s) is parsed into a two-part Heading (code+literal);
// the count cap bounds total values. Absent is Ok([]); structural, extraction,
// and count problems accumulate together.
fn heading_field(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  max_count: Int,
) -> Checked(List(Supported(Heading))) {
  let #(values, extraction) = flat_values(record, tag)
  let results =
    list.map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      case parse_heading(bytes, occurrence, tag, rule) {
        Ok(heading) -> Ok(Supported(heading, locations(occurrence)))
        Error(problem) -> Error(problem)
      }
    })
  collect(results, extraction, over_count(record, tag, rule, values, max_count))
}

// SC: a multi-value subcommodity-allocation field. Each 0xAC-marked value is
// parsed into a three-part Subcommodity (code+literal+percent, percent
// required); the count cap bounds total values.
fn subcommodity_field(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  max_count: Int,
) -> Checked(List(Supported(Subcommodity))) {
  let #(values, extraction) = flat_values(record, tag)
  let results =
    list.map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      case parse_subcommodity(bytes, occurrence, tag, rule) {
        Ok(sc) -> Ok(Supported(sc, locations(occurrence)))
        Error(problem) -> Error(problem)
      }
    })
  collect(results, extraction, over_count(record, tag, rule, values, max_count))
}

// Every lexical value of a repeating field, flattened across its occurrences,
// each paired with the occurrence it came from (for locations). An occurrence
// whose fragments cannot be read contributes a problem instead of its values.
// This is the multi-value counterpart of `single_value`: the reading layer
// already splits one occurrence into several 0xAC-marked values; the checked
// constructors must consume all of them, not just the first.
fn flat_values(
  record: SuppliedRecord,
  tag: String,
) -> #(List(#(BitArray, FieldOccurrence)), List(ConstructionProblem)) {
  list.fold(occurrences(record, tag), #([], []), fn(acc, occurrence) {
    let #(vals, probs) = acc
    case field_value.field_values(occurrence) {
      Ok(values) -> #(
        list.append(vals, list.map(values, fn(v) { #(v, occurrence) })),
        probs,
      )
      Error(_) -> #(
        vals,
        list.append(probs, [fragment_placeholder(occurrence)]),
      )
    }
  })
}

// The count-cap problem for a multi-value field: over the documented maximum
// number of values, or [] when within it.
fn over_count(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  values: List(a),
  max_count: Int,
) -> List(ConstructionProblem) {
  case list.length(values) > max_count {
    True -> [
      repetition_limit(
        occurrences(record, tag),
        tag,
        rule,
        list.length(values),
        max_count,
      ),
    ]
    False -> []
  }
}

// Fold per-value results plus extraction and count problems into a Checked list:
// Ok(values) only when nothing went wrong, else all accumulated problems.
fn collect(
  results: List(Result(a, ConstructionProblem)),
  extraction: List(ConstructionProblem),
  over: List(ConstructionProblem),
) -> Checked(List(a)) {
  let value_problems =
    list.filter_map(results, fn(result) {
      case result {
        Error(problem) -> Ok(problem)
        Ok(_) -> Error(Nil)
      }
    })
  case list.flatten([extraction, value_problems, over]) {
    [] ->
      Ok(
        list.filter_map(results, fn(result) {
          case result {
            Ok(value) -> Ok(value)
            Error(_) -> Error(Nil)
          }
        }),
      )
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

// --- narratives (OB, AP, DE, PR, PB, HP) -------------------------------------
// rules/field-rule-inventory.md batch 4. Verified against 3,000,000 real FY88
// lines (`data/RG310.CRIS.FY88.txt`): all five narrative fields are
// SINGLE-VALUE (wrapped continuations join to one value; zero 0xAC-marked
// values in that scan — statement of absence, provisional to this method and
// span, FY94 held out). So every field but DE reuses the plain single-value
// `optional(...)` path, the same as any other optional printed field; DE gets
// a dedicated constructor for its per-keyword bound (below). HP has no
// settled dictionary row worth building against (batch 4: appears twice and
// inconsistently — a handwritten stub and a separate printed row) so any HP
// occurrence is `FieldNotYetModeled`, mirroring `sn_not_yet_modeled`; there is
// no `remaining` escape hatch, so a record carrying HP cannot silently pass.

/// The narratives block. OB/AP/PR/PB are optional printed fields at their
/// documented MAX lengths; DE additionally enforces a per-keyword bound (see
/// `descriptors`); HP blocks construction as not-yet-modeled. Problems
/// accumulate across all six.
pub fn narratives(record: SuppliedRecord) -> Checked(Narratives) {
  let objectives =
    optional_bytes(
      record,
      "OB",
      printed_rule(
        20,
        "41 (OB)",
        "A,N; MAX 1600; Repeating N; Always N; Word index (/OB,/TX); upper- and lower-case",
      ),
      upto(1600),
    )
  let approach =
    optional_bytes(
      record,
      "AP",
      printed_rule(
        20,
        "42 (AP)",
        "A,N; MAX 1600; Repeating N; Always N; upper- and lower-case; the handwritten /AP index code is a DIALOG-stage note, not a supplied constraint",
      ),
      upto(1600),
    )
  let descriptors_field = descriptors(record)
  let progress =
    optional_bytes(
      record,
      "PR",
      printed_rule(
        21,
        "44 (PR)",
        "A,N; MAX 3200; Repeating N; Always N; most recent progress report; upper- and lower-case",
      ),
      upto(3200),
    )
  let publications =
    optional_bytes(
      record,
      "PB",
      printed_rule(
        21,
        "45.1 (PB)",
        "A,N; MAX 3200; Repeating N; Always N; list of bibliographic citations",
      ),
      upto(3200),
    )
  let history_publications = hp_not_yet_modeled(record)
  let problems =
    list.flatten([
      problems_of(objectives),
      problems_of(approach),
      problems_of(descriptors_field),
      problems_of(progress),
      problems_of(publications),
      problems_of(history_publications),
    ])
  case problems {
    [] ->
      Ok(Narratives(
        objectives: value_of(objectives),
        approach: value_of(approach),
        descriptors: value_of(descriptors_field),
        progress: value_of(progress),
        publications: value_of(publications),
      ))
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

// HP (History Publications, 45.2) has no settled model: it appears twice and
// inconsistently in the dictionary (a handwritten stub row and a separate
// printed row, not reconciled). Any HP occurrence reports FieldNotYetModeled;
// absent is Ok([]) so the surrounding narratives block can still be built.
// Mirrors `sn_not_yet_modeled` in `classifications`.
fn hp_not_yet_modeled(
  record: SuppliedRecord,
) -> Checked(List(Supported(String))) {
  case occurrences(record, "HP") {
    [] -> Ok([])
    occs -> {
      let assert [first, ..rest] =
        list.map(occs, fn(occurrence) {
          let NonEmpty(first, _) = locations(occurrence)
          FieldNotYetModeled("HP", first)
        })
        as "occs is non-empty in this branch, so list.map's output is non-empty"
      Error(NonEmpty(first, rest))
    }
  }
}

/// DE (Keywords/Descriptors, element 43): a dedicated constructor because the
/// printed dictionary states TWO independent bounds — an aggregate MAX 2400
/// for the whole (single) value, AND a 60-character max per whitespace-
/// separated keyword. Both are checked and their problems accumulate
/// together, so an aggregate-length record that also has one long keyword
/// reports both. The 60-byte-per-keyword bound is enforced at the printed/
/// documented grade even though FY88 data never approaches it (see
/// `de_rule`): honouring the written contract, not the narrower observed
/// range, so held-out FY94 data within the documented 60 is not wrongly
/// rejected.
pub fn descriptors(
  record: SuppliedRecord,
) -> Checked(Option(Supported(BitArray))) {
  case occurrences(record, "DE") {
    [] -> Ok(None)
    [one] -> descriptors_value(one)
    many -> Error(NonEmpty(non_repeating(many, "DE", de_rule), []))
  }
}

// DE is byte-preserving (payload-provenance rule, record_model.gleam): both
// documented bounds (aggregate MAX 2400, per-keyword MAX 60) are still
// checked against the raw bytes, but the final UTF-8 decode step is dropped —
// a non-UTF-8 DE value within both bounds is now accepted rather than
// flagged "value is not valid text".
fn descriptors_value(
  one: FieldOccurrence,
) -> Checked(Option(Supported(BitArray))) {
  case single_value(one) {
    Error(Nil) -> Error(NonEmpty(fragment_placeholder(one), []))
    Ok(bytes) -> {
      let aggregate_problems = case
        within(upto(2400), bit_array.byte_size(bytes))
      {
        True -> []
        False -> [
          invalid_value(
            "DE",
            de_rule,
            one,
            "length "
              <> int.to_string(bit_array.byte_size(bytes))
              <> " bytes is not at most 2400 bytes",
          ),
        ]
      }
      let keyword_problems =
        list.map(oversized_keywords(bytes), fn(token) {
          invalid_value(
            "DE",
            de_rule,
            one,
            "keyword '"
              <> keyword_prefix(token)
              <> "…' is "
              <> int.to_string(bit_array.byte_size(token))
              <> " bytes, over the documented 60-byte per-keyword maximum",
          )
        })
      case list.append(aggregate_problems, keyword_problems) {
        [] -> Ok(Some(Supported(bytes, locations(one))))
        [first, ..rest] -> Error(NonEmpty(first, rest))
      }
    }
  }
}

// Every whitespace-separated keyword in a DE value that exceeds the
// documented 60-byte per-keyword maximum, as its own bytes. Splits on runs of
// the ASCII space byte (0x20) and drops empty tokens (leading/trailing/
// repeated spaces do not produce phantom zero-length keywords). Returns the
// keyword's bytes (not just its length) so the problem message can name which
// token diverged, via `keyword_prefix`'s bounded, non-dumping prefix.
fn oversized_keywords(bytes: BitArray) -> List(BitArray) {
  split_on_ascii_spaces(bytes)
  |> list.filter(fn(token) { bit_array.byte_size(token) > 60 })
}

// The maximum bytes of an oversized keyword shown in its problem message, so
// a pathological value cannot dump arbitrarily large bytes into a problem.
const keyword_prefix_max_bytes: Int = 24

// A short, bounded prefix of an oversized keyword's bytes for its problem
// message: decoded to text when the prefix is valid UTF-8, else its hex
// encoding, so the message is always renderable.
fn keyword_prefix(token: BitArray) -> String {
  let prefix = case bit_array.byte_size(token) > keyword_prefix_max_bytes {
    True -> {
      let assert Ok(head) = bit_array.slice(token, 0, keyword_prefix_max_bytes)
        as "keyword_prefix_max_bytes is within token by construction"
      head
    }
    False -> token
  }
  case bit_array.to_string(prefix) {
    Ok(text) -> text
    Error(Nil) -> bit_array.base16_encode(prefix)
  }
}

fn split_on_ascii_spaces(bytes: BitArray) -> List(BitArray) {
  split_on_ascii_spaces_loop(bytes, <<>>, [])
  |> list.filter(fn(token) { bit_array.byte_size(token) > 0 })
}

fn split_on_ascii_spaces_loop(
  bytes: BitArray,
  current: BitArray,
  done_reversed: List(BitArray),
) -> List(BitArray) {
  case bytes {
    <<0x20, rest:bytes>> ->
      split_on_ascii_spaces_loop(rest, <<>>, [current, ..done_reversed])
    <<b, more:bytes>> ->
      split_on_ascii_spaces_loop(more, <<current:bits, b>>, done_reversed)
    _ -> list.reverse([current, ..done_reversed])
  }
}

/// DE rule, PDF p.20, printed. MAX 2400 is the aggregate (single-value) bound;
/// 60-character Max per keyword is a distinct, per-value-internal bound the
/// dictionary states in the same Remarks cell. FY88 observed (first 3,000,000
/// lines of RG310.CRIS.FY88.txt, statement of absence scoped to that method
/// and span, FY94 held out): single value (never 0xAC-marked), keyword byte
/// length max 30 with a pile-up at 30 (looks truncated-at-30 in this vintage).
/// 60 is enforced here — the documented/printed contract — not the narrower
/// FY88-observed 30, so a held-out FY94 keyword up to 60 bytes is not wrongly
/// rejected.
const de_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 20,
  element: "43 (DE)",
  assertion: "A,N; MAX 2400; Repeating N; Always N; upper-case; 60-character Max per keyword",
  interpretation: "optional (Always N); single joined value <= 2400 bytes aggregate; each ASCII-space-separated keyword <= 60 bytes (printed grade, enforced); FY88 observed keyword max 30 bytes with a spike at 30 (scoped, provisional, FY94 held out, not enforced as the bound)",
  stage: Supplied,
  evidence: PrintedDictionary,
)

// --- PS (Project Status): Provisional, handwritten grade ---------------------

/// PS (Project Status, element 2.2): the ENTIRE row is a handwritten
/// insertion (rules/field-rule-inventory.md PS section) — there is no printed
/// row at all, so even "Always Present Y" rests only on handwriting. Modeled
/// as `Provisional`: presence is captured, but NO length is enforced (the
/// documented max digit itself is uncertain, 16 vs 10) — enforcing an
/// uncertain bound at this evidence grade would manufacture a conclusion the
/// source does not support.
pub fn status(
  record: SuppliedRecord,
) -> Checked(Provisional(Supported(String))) {
  case occurrences(record, "PS") {
    [] -> Ok(Provisional(None, ps_rule))
    [one] ->
      case single_value(one) {
        Error(Nil) -> Error(NonEmpty(fragment_placeholder(one), []))
        Ok(bytes) ->
          case bit_array.to_string(bytes) {
            Ok(text) ->
              Ok(Provisional(Some(Supported(text, locations(one))), ps_rule))
            Error(Nil) ->
              Error(
                NonEmpty(
                  invalid_value("PS", ps_rule, one, "value is not valid text"),
                  [],
                ),
              )
          }
      }
    many -> Error(NonEmpty(non_repeating(many, "PS", ps_rule), []))
  }
}

/// PS rule, PDF p.13 bottom row 2.2, handwritten in its entirety (batch 1 PS
/// section). Length is deliberately not part of the checked interpretation —
/// see `status`.
const ps_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 13,
  element: "2.2 (PS)",
  assertion: "A; MAX 16 MIN 3 (max digit uncertain 16 vs 10); Repeating N; the entire row is handwritten",
  interpretation: "requiredness unsettled -> Provisional; presence captured; no length enforced at handwritten grade",
  stage: Supplied,
  evidence: HandwrittenAmendment,
)

// --- project: top-level composition ------------------------------------------

/// TI rule, PDF p.16, printed.
const ti_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 16,
  element: "19 (TI)",
  assertion: "A,N; MAX 100; Repeating N; Always Present Y; upper-case text field",
  interpretation: "required; one occurrence; joined value <= 100 bytes",
  stage: Supplied,
  evidence: PrintedDictionary,
)

/// PT rule, PDF p.15, printed.
const pt_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 15,
  element: "15 (PT)",
  assertion: "A; MAX 20; Repeating N; Always N",
  interpretation: "optional; one occurrence; value <= 20 bytes",
  stage: Supplied,
  evidence: PrintedDictionary,
)

/// SF rule, PDF p.20, printed. No documented occurrence cap (unlike IN's
/// documented "Up to 6"), only a per-value MAX 11 MIN 4 — hence
/// `required_nonempty`, not `bounded_nonempty`.
const sf_rule: RuleRef = RuleRef(
  document: "367_1DP.pdf",
  pdf_page: 20,
  element: "40 (SF)",
  assertion: "A; MAX 11 MIN 4; Repeating Y; Always Present Y; no documented occurrence cap",
  interpretation: "required; non-empty list of subfile codes; each value 4..11 bytes; caret-composite value question unresolved (see inventory), not modeled as a composite",
  stage: Supplied,
  evidence: PrintedDictionary,
)

// The authoritative set of two-letter tags any constructor in this module
// handles — every tag composed into `project`, INCLUDING SN and HP, which are
// flagged rather than parsed by `sn_not_yet_modeled`/`hp_not_yet_modeled`.
// This is the boundary `unmodeled_material` checks a record's parts against:
// nothing outside this set, and no Unassigned material, may pass through
// `project` uncounted (record_model.gleam: "no `remaining` escape hatch").
const modeled_tags: List(String) = [
  "AN", "PN", "TI", "PS", "PT", "SF", "IN", "AS", "DS", "IC", "PI", "CY", "ST",
  "ZP", "RE", "CG", "RG", "RN", "OC", "PF", "PD", "SD", "SX", "TD", "TX", "FY",
  "GY", "UP", "PP", "PX", "BP", "BT", "AT", "DT", "AC", "CM", "FS", "RP", "CT",
  "PA", "JC", "SC", "SN", "PH", "GH", "OB", "AP", "DE", "PR", "PB", "HP",
]

// Sentinel tag naming unassigned material (an orphan continuation with no
// tagged field open above it) in a FieldNotYetModeled problem — chosen to be
// unambiguous against any real two-letter card-image tag.
const unassigned_tag: String = "<unassigned>"

// Every part of the record outside the modeled-tag set: a Field occurrence
// whose tag this module does not compose into `project`, or an Unassigned
// part. Each contributes one FieldNotYetModeled problem, so a record carrying
// unmodeled material cannot be silently certified Ok. SN and HP are members
// of `modeled_tags` (their own constructors already flag every occurrence),
// so this generic pass does not re-flag them — no double-flagging.
fn unmodeled_material(record: SuppliedRecord) -> List(ConstructionProblem) {
  list.filter_map(record.parts, fn(part) {
    case part {
      Field(occurrence) ->
        case list.contains(modeled_tags, occurrence.tag) {
          True -> Error(Nil)
          False -> {
            let NonEmpty(first, _) = locations(occurrence)
            Ok(FieldNotYetModeled(occurrence.tag, first))
          }
        }
      Unassigned(witness) ->
        Ok(FieldNotYetModeled(unassigned_tag, witness.location))
    }
  })
}

/// The top-level composition: every group and field the model currently
/// checks, gathering ALL problems across ALL of them (a record surfaces every
/// divergence at once, the accumulation philosophy the whole module follows)
/// rather than stopping at the first failing group. `rules` names the
/// RuleRefs this function applies directly (identity's AN/PN rules plus
/// TI/PS/PT/SF); each group's own internal rules already ride on that group's
/// own values and problems — extending `rules` to cover every rule used
/// throughout would mean threading rules out of every group constructor,
/// deliberately out of scope for this composition. `unmodeled_material` adds
/// a generic pass over every part of the record so no unmodeled tag or
/// unassigned material can be silently certified alongside a clean modeled set.
pub fn project(record: SuppliedRecord) -> record_model.ConstructionResult {
  let identity_result = identity(record)
  let title = required(record, "TI", ti_rule, upto(100))
  let status_result = status(record)
  let project_type = optional(record, "PT", pt_rule, upto(20))
  let participants_result = participants(record)
  let chronology_result = chronology(record)
  let classifications_result = classifications(record)
  let narratives_result = narratives(record)
  let subfiles = required_nonempty(record, "SF", sf_rule, between(4, 11))
  let problems =
    list.flatten([
      problems_of(identity_result),
      problems_of(title),
      problems_of(status_result),
      problems_of(project_type),
      problems_of(participants_result),
      problems_of(chronology_result),
      problems_of(classifications_result),
      problems_of(narratives_result),
      problems_of(subfiles),
      unmodeled_material(record),
    ])
  case problems {
    [] -> {
      let assert Ok(built_identity) = identity_result
      let assert Ok(built_participants) = participants_result
      Ok(record_model.build_project(
        rules: NonEmpty(an_rule, [pn_rule, ti_rule, ps_rule, pt_rule, sf_rule]),
        identity: built_identity,
        title: value_of(title),
        status: value_of(status_result),
        project_type: value_of(project_type),
        participants: built_participants,
        chronology: value_of(chronology_result),
        classifications: value_of(classifications_result),
        narratives: value_of(narratives_result),
        subfiles: value_of(subfiles),
      ))
    }
    [first, ..rest] -> Error(NonEmpty(first, rest))
  }
}

fn printed_rule(page: Int, element: String, assertion: String) -> RuleRef {
  RuleRef(
    document: "367_1DP.pdf",
    pdf_page: page,
    element: element,
    assertion: assertion,
    interpretation: assertion,
    stage: Supplied,
    evidence: PrintedDictionary,
  )
}

fn handwritten_rule(page: Int, element: String, assertion: String) -> RuleRef {
  RuleRef(
    document: "367_1DP.pdf",
    pdf_page: page,
    element: element,
    assertion: assertion,
    interpretation: assertion,
    stage: Supplied,
    evidence: HandwrittenAmendment,
  )
}

fn problems_of(checked: Checked(a)) -> List(ConstructionProblem) {
  case checked {
    Ok(_) -> []
    Error(NonEmpty(first, rest)) -> [first, ..rest]
  }
}

// Safe only in the all-Ok branch, where every checked value is known Ok.
fn value_of(checked: Checked(a)) -> a {
  let assert Ok(value) = checked
  value
}

// --- generic checked-field toolkit ------------------------------------------
// Reused by the group constructors (institution, chronology, ...). Each returns
// the checked value or a list of problems, so a group can accumulate across
// fields. String rules check presence, cardinality, and byte length only; the
// character class is never checked (the dictionary "A,N" is not a literal class).

pub type Checked(a) =
  Result(a, record_model.NonEmpty(ConstructionProblem))

/// A documented byte-length bound. Every field's length is one of these, so the
/// dictionary's own distinctions are honored uniformly and none is quietly widened
/// to a loose upper bound: `exact(n)` for "Exact N", `upto(n)` for "MAX N" (no
/// documented minimum), `between(min, max)` for "MAX x MIN y".
pub type Length {
  Length(min: Int, max: Int)
}

pub fn exact(n: Int) -> Length {
  Length(n, n)
}

pub fn upto(n: Int) -> Length {
  Length(0, n)
}

pub fn between(minimum: Int, maximum: Int) -> Length {
  Length(minimum, maximum)
}

fn within(length: Length, size: Int) -> Bool {
  size >= length.min && size <= length.max
}

fn describe_length(length: Length) -> String {
  case length.min == length.max, length.min {
    True, _ -> "exactly " <> int.to_string(length.max) <> " bytes"
    False, 0 -> "at most " <> int.to_string(length.max) <> " bytes"
    False, _ ->
      "between "
      <> int.to_string(length.min)
      <> " and "
      <> int.to_string(length.max)
      <> " bytes"
  }
}

/// A required, non-repeating string field of the given documented length.
pub fn required(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(Supported(String)) {
  case occurrences(record, tag) {
    [] -> Error(NonEmpty(required_not_located(record, tag, rule), []))
    [one] ->
      case checked_string(one, tag, rule, length) {
        Ok(supported) -> Ok(supported)
        Error(problem) -> Error(NonEmpty(problem, []))
      }
    many -> Error(NonEmpty(non_repeating(many, tag, rule), []))
  }
}

/// An optional, non-repeating field checked by `check`: absent is Ok(None), not
/// a problem. Shared by `optional` (check_string_bytes) and `optional_bytes`
/// (check_raw_bytes) — the two are byte-identical apart from that one check
/// function, including the present-but-empty `Ok(<<>>) -> Ok(None)` special
/// case, which belongs to this single-value path only (the repeating-family
/// functions below do NOT skip empty values).
fn optional_checked(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  check: fn(BitArray, FieldOccurrence, String, RuleRef, Length) ->
    Result(Supported(a), ConstructionProblem),
) -> Checked(Option(Supported(a))) {
  case occurrences(record, tag) {
    [] -> Ok(None)
    [one] ->
      // A present tag with an empty (all-pad) value is read as omission, not a
      // length divergence: in fixed-width card data a blank optional field is
      // indistinguishable from an absent one. FY88 exercises this only via UP
      // (12.4% present-but-empty = "no progress-update date yet"). A non-empty
      // wrong-length value still diverges; empty REQUIRED fields still fail,
      // because `required` does not take this path.
      case single_value(one) {
        Error(Nil) -> Error(NonEmpty(fragment_placeholder(one), []))
        Ok(<<>>) -> Ok(None)
        Ok(bytes) ->
          case check(bytes, one, tag, rule, length) {
            Ok(supported) -> Ok(Some(supported))
            Error(problem) -> Error(NonEmpty(problem, []))
          }
      }
    many -> Error(NonEmpty(non_repeating(many, tag, rule), []))
  }
}

/// An optional, non-repeating string field: absent is Ok(None), not a problem.
pub fn optional(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(Option(Supported(String))) {
  optional_checked(record, tag, rule, length, check_string_bytes)
}

/// The byte-preserving counterpart of `optional`, for OB/AP/PR/PB: absent is
/// Ok(None), not a problem; a present value's byte length is still checked
/// against `length`, but the value is kept as BitArray with no UTF-8 decode
/// step, so a non-UTF-8 value within `length` is accepted rather than
/// flagged (the point of the payload-provenance rule — see record_model.gleam).
pub fn optional_bytes(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(Option(Supported(BitArray))) {
  optional_checked(record, tag, rule, length, check_raw_bytes)
}

/// A repeating field checked by `check`: every lexical value across the
/// occurrences, length-checked. Multi-value — a field may carry several
/// 0xAC-marked values in one occurrence (e.g. PF), so it consumes
/// `flat_values`, not `single_value`. Absent is Ok([]). Every overlong/invalid
/// value contributes a problem; if any, the whole field fails with all of
/// them, so problems accumulate across values. Shared by `repeating`
/// (check_string_bytes) and `repeating_bytes` (check_raw_bytes) — unlike
/// `optional_checked`, there is no empty-value special case: every value is
/// length-checked exactly as documented.
fn repeating_checked(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  check: fn(BitArray, FieldOccurrence, String, RuleRef, Length) ->
    Result(Supported(a), ConstructionProblem),
) -> Checked(List(Supported(a))) {
  let #(values, extraction) = flat_values(record, tag)
  let results =
    list.map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      check(bytes, occurrence, tag, rule, length)
    })
  collect(results, extraction, [])
}

/// A repeating string field: every lexical value across the occurrences,
/// length-checked. Multi-value — a field may carry several 0xAC-marked values in
/// one occurrence (e.g. PF), so it consumes `flat_values`, not `single_value`.
/// Absent is Ok([]). Every overlong/invalid value contributes a problem; if any,
/// the whole field fails with all of them, so problems accumulate across values.
pub fn repeating(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(List(Supported(String))) {
  repeating_checked(record, tag, rule, length, check_string_bytes)
}

/// A required, non-empty, repeating field with a per-value byte bound and a
/// maximum occurrence count (e.g. IN: 1..6, each <= 30, first is sort), values
/// read via `repeating_fn`. Order is preserved. Empty is
/// RequiredFieldNotLocated; over the count limit is RepetitionLimitExceeded;
/// overlong values accumulate. Shared by `bounded_nonempty` (parameterized by
/// `repeating`) and `bounded_nonempty_bytes` (parameterized by
/// `repeating_bytes`) — the two are byte-identical apart from which
/// repeating-family function reads the values.
fn bounded_nonempty_checked(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  max_count: Int,
  repeating_fn: fn(SuppliedRecord, String, RuleRef, Length) ->
    Checked(List(Supported(a))),
) -> Checked(record_model.NonEmpty(Supported(a))) {
  let occ = occurrences(record, tag)
  case occ {
    [] -> Error(NonEmpty(required_not_located(record, tag, rule), []))
    _ -> {
      // Count VALUES, not tagged occurrences: a multi-value field carries several
      // 0xAC-marked values per occurrence, and the documented bound is on values.
      let #(values, _extraction) = flat_values(record, tag)
      let over = case list.length(values) > max_count {
        True -> [
          repetition_limit(occ, tag, rule, list.length(values), max_count),
        ]
        False -> []
      }
      case repeating_fn(record, tag, rule, length), over {
        Error(NonEmpty(first, rest)), _ -> {
          let assert [combined_first, ..combined_rest] =
            list.append([first, ..rest], over)
            as "[first, ..rest] is never empty, so appending over stays non-empty"
          Error(NonEmpty(combined_first, combined_rest))
        }
        Ok(_), [first, ..rest] -> Error(NonEmpty(first, rest))
        Ok(values), [] ->
          case values {
            [first, ..rest] -> Ok(NonEmpty(first, rest))
            [] -> Error(NonEmpty(required_not_located(record, tag, rule), []))
          }
      }
    }
  }
}

/// A required, non-empty, repeating string field with a per-value byte bound
/// and a maximum occurrence count (e.g. IN: 1..6, each <= 30, first is sort).
/// Order is preserved. Empty is RequiredFieldNotLocated; over the count limit is
/// RepetitionLimitExceeded; overlong values accumulate.
pub fn bounded_nonempty(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  max_count: Int,
) -> Checked(record_model.NonEmpty(Supported(String))) {
  bounded_nonempty_checked(record, tag, rule, length, max_count, repeating)
}

// The byte-preserving counterpart of `repeating`, for IN via
// `bounded_nonempty_bytes`: every lexical value across the occurrences,
// length-checked but kept as BitArray (no UTF-8 decode), so a non-UTF-8
// value within `length` is accepted.
fn repeating_bytes(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(List(Supported(BitArray))) {
  repeating_checked(record, tag, rule, length, check_raw_bytes)
}

/// The byte-preserving counterpart of `bounded_nonempty`, for IN: required,
/// ordered, 1..max_count, each within `length`, first is sort — but kept as
/// BitArray (no UTF-8 decode), so a non-UTF-8 investigator name within
/// `length` is accepted rather than flagged.
pub fn bounded_nonempty_bytes(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  max_count: Int,
) -> Checked(record_model.NonEmpty(Supported(BitArray))) {
  bounded_nonempty_checked(
    record,
    tag,
    rule,
    length,
    max_count,
    repeating_bytes,
  )
}

/// An optional, repeating string field with a per-value byte bound AND a
/// maximum occurrence count. Like `repeating`, absent is `Ok([])`; unlike
/// `repeating`, more than `max_count` occurrences also reports
/// RepetitionLimitExceeded. Length problems and the count problem accumulate
/// together, the same way `bounded_nonempty` accumulates for a required field.
pub fn bounded_repeating(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
  max_count: Int,
) -> Checked(List(Supported(String))) {
  let #(values, extraction) = flat_values(record, tag)
  let results =
    list.map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      check_string_bytes(bytes, occurrence, tag, rule, length)
    })
  collect(results, extraction, over_count(record, tag, rule, values, max_count))
}

/// A required, non-empty, repeating string field with NO documented occurrence
/// cap (e.g. SF: "MAX 11 MIN 4" per value, repeating, no upper bound on how
/// many). Like `bounded_nonempty` minus the count check. Empty is
/// RequiredFieldNotLocated; per-value length problems accumulate; a tag that
/// is present but yields no readable value is also RequiredFieldNotLocated
/// (the tag alone is not a value).
pub fn required_nonempty(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Checked(record_model.NonEmpty(Supported(String))) {
  case occurrences(record, tag) {
    [] -> Error(NonEmpty(required_not_located(record, tag, rule), []))
    _ ->
      case repeating(record, tag, rule, length) {
        Error(problems) -> Error(problems)
        Ok([first, ..rest]) -> Ok(NonEmpty(first, rest))
        Ok([]) -> Error(NonEmpty(required_not_located(record, tag, rule), []))
      }
  }
}

fn repetition_limit(
  occurrences: List(FieldOccurrence),
  tag: String,
  rule: RuleRef,
  actual: Int,
  maximum: Int,
) -> ConstructionProblem {
  disagreement(
    record_model.RepetitionLimitExceeded(tag, actual, maximum),
    rule,
    all_locations(occurrences),
    "count of tagged " <> tag <> " occurrences against the documented maximum",
  )
}

// One occurrence's single value, decoded and length-checked against the
// documented Length. A value outside the bound is a typed divergence naming the
// bound, never quietly accepted or repaired.
fn checked_string(
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Result(Supported(String), ConstructionProblem) {
  case single_value(occurrence) {
    Error(Nil) -> Error(fragment_placeholder(occurrence))
    Ok(bytes) -> check_string_bytes(bytes, occurrence, tag, rule, length)
  }
}

// Length-check already-extracted value bytes, then `decode` them. Shared leaf
// behind both the String path (`check_string_bytes`, decode = UTF-8, "value
// is not valid text" on failure) and the byte-preserving path
// (`check_raw_bytes`, decode never fails) — one length-checking
// implementation, so the String path's behavior stays byte-identical to
// before this field split existed. `decode` carries its own failure reason,
// so a decoder is never forced to report a dead reason string (as the raw
// path previously did with `""`).
fn check_bytes(
  bytes: BitArray,
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
  length: Length,
  decode: fn(BitArray) -> Result(a, String),
) -> Result(Supported(a), ConstructionProblem) {
  case within(length, bit_array.byte_size(bytes)) {
    False ->
      Error(invalid_value(
        tag,
        rule,
        occurrence,
        "length "
          <> int.to_string(bit_array.byte_size(bytes))
          <> " bytes is not "
          <> describe_length(length),
      ))
    True ->
      case decode(bytes) {
        Ok(value) -> Ok(Supported(value, locations(occurrence)))
        Error(reason) -> Error(invalid_value(tag, rule, occurrence, reason))
      }
  }
}

// Length-check and UTF-8-decode already-extracted value bytes, using the
// occurrence only for its locations. Shared by the single-value
// `checked_string` and the multi-value `bounded_repeating` so both apply the
// documented Length and the same "not valid text" check to the exact bytes
// read.
fn check_string_bytes(
  bytes: BitArray,
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Result(Supported(String), ConstructionProblem) {
  check_bytes(bytes, occurrence, tag, rule, length, fn(b) {
    bit_array.to_string(b) |> result.replace_error("value is not valid text")
  })
}

// Length-check already-extracted value bytes, keeping them as BitArray — no
// decode step, so non-UTF-8 bytes within the documented length are accepted.
// Shared by the single-value `checked_bytes` and the multi-value
// `repeating_bytes` (IN's `bounded_nonempty_bytes`).
fn check_raw_bytes(
  bytes: BitArray,
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
  length: Length,
) -> Result(Supported(BitArray), ConstructionProblem) {
  check_bytes(bytes, occurrence, tag, rule, length, fn(b) { Ok(b) })
}

// --- classification headings (SC/PH/GH) --------------------------------------
// Each classification value (verified against 300,000 real FY88 lines) is one
// of two byte shapes, separated by 0xA0 0x02 (data) / footnote HEX40 HEX41
// HEX02: PH/GH are two-part (code, literal); SC is three-part (code, literal,
// percent — the percent present in every FY88 SC value). The whole value is NOT
// valid UTF-8 (the 0xA0), so every part is kept as BitArray. A value whose part
// count or separator structure does not match is a typed divergence, never a
// guess — so a percent-less SC and a percent-bearing PH are both caught.

// Parse one PH/GH value into a two-part Heading (code, literal).
fn parse_heading(
  bytes: BitArray,
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
) -> Result(Heading, ConstructionProblem) {
  case segment.segments_on_0x02(bytes) {
    [code_segment, literal] ->
      case segment.drop_trailing_0xa0(code_segment) {
        Ok(padded_code) ->
          Ok(Heading(
            code: Supported(
              card_image.trim_trailing_spaces(padded_code),
              locations(occurrence),
            ),
            literal: Supported(literal, locations(occurrence)),
          ))
        Error(Nil) -> Error(missing_0xa0(tag, rule, occurrence))
      }
    segments ->
      Error(invalid_value(
        tag,
        rule,
        occurrence,
        "expected 2 parts (code, literal) separated by 0x02 but found "
          <> int.to_string(list.length(segments)),
      ))
  }
}

// Parse one SC value into a Subcommodity. The percent is OPTIONAL (the FY94
// generalization finding): a three-part value (code, literal, percent) carries
// Some(percent); a two-part value (code, literal) is an omission, None. A
// one-part or 4+-part value is a divergence. In the three-part shape the literal
// is followed by a 0xA0 0x02 separator and so ends with 0xA0 (dropped); in the
// two-part shape the literal is the final segment and is kept raw (as in
// parse_heading).
fn parse_subcommodity(
  bytes: BitArray,
  occurrence: FieldOccurrence,
  tag: String,
  rule: RuleRef,
) -> Result(Subcommodity, ConstructionProblem) {
  case segment.segments_on_0x02(bytes) {
    [code_segment, literal_segment, percent] ->
      case
        segment.drop_trailing_0xa0(code_segment),
        segment.drop_trailing_0xa0(literal_segment)
      {
        Ok(padded_code), Ok(padded_literal) ->
          Ok(subcommodity(
            occurrence,
            padded_code,
            padded_literal,
            Some(Supported(percent, locations(occurrence))),
          ))
        _, _ -> Error(missing_0xa0(tag, rule, occurrence))
      }
    [code_segment, literal] ->
      case segment.drop_trailing_0xa0(code_segment) {
        Ok(padded_code) ->
          Ok(subcommodity(occurrence, padded_code, literal, None))
        Error(Nil) -> Error(missing_0xa0(tag, rule, occurrence))
      }
    segments ->
      Error(invalid_value(
        tag,
        rule,
        occurrence,
        "expected 2 or 3 parts (code, literal, optional percent) separated by 0x02 but found "
          <> int.to_string(list.length(segments)),
      ))
  }
}

// Assemble a Subcommodity from already-split code/literal bytes and an optional
// percent, trimming the trailing space padding from both code and literal (as
// the original three-part path did for both). The two-part path passes the raw
// final literal segment; the three-part path passes the 0xA0-dropped one — both
// are then space-trimmed identically here.
fn subcommodity(
  occurrence: FieldOccurrence,
  padded_code: BitArray,
  padded_literal: BitArray,
  percent: option.Option(Supported(BitArray)),
) -> Subcommodity {
  Subcommodity(
    code: Supported(
      card_image.trim_trailing_spaces(padded_code),
      locations(occurrence),
    ),
    literal: Supported(
      card_image.trim_trailing_spaces(padded_literal),
      locations(occurrence),
    ),
    percent: percent,
  )
}

fn missing_0xa0(
  tag: String,
  rule: RuleRef,
  occurrence: FieldOccurrence,
) -> ConstructionProblem {
  invalid_value(
    tag,
    rule,
    occurrence,
    "a part does not end with the documented 0xA0 separator byte",
  )
}

fn invalid_value(
  tag: String,
  rule: RuleRef,
  occurrence: FieldOccurrence,
  reason: String,
) -> ConstructionProblem {
  disagreement(
    InvalidFieldValue(tag, reason),
    rule,
    locations(occurrence),
    "checked value of the " <> tag <> " field",
  )
}

fn occurrences(record: SuppliedRecord, tag: String) -> List(FieldOccurrence) {
  list.filter_map(record.parts, fn(part) {
    case part {
      Field(field) ->
        case field.tag == tag {
          True -> Ok(field)
          False -> Error(Nil)
        }
      _ -> Error(Nil)
    }
  })
}

// A single-value field's one value: ALL the occurrence's fragments joined,
// treating a line-start marker byte as data, not a value boundary (see
// field_value.joined_value and the FY94 0xAC-collision finding). A single-value
// field never carries marked values, so joining is the faithful reading; only
// genuinely unreadable bytes (raw_columns Error) fail here.
fn single_value(occurrence: FieldOccurrence) -> Result(BitArray, Nil) {
  field_value.joined_value(occurrence)
  |> result.replace_error(Nil)
}

fn locations(occurrence: FieldOccurrence) -> record_model.NonEmpty(Location) {
  let FieldOccurrence(_tag, NonEmpty(first, rest)) = occurrence
  NonEmpty(fragment_location(first), list.map(rest, fragment_location))
}

fn fragment_location(fragment: Fragment) -> Location {
  case fragment {
    TaggedStart(Witness(location, _)) -> location
    WrappedText(Witness(location, _)) -> location
    MarkedValueStart(Witness(location, _)) -> location
  }
}

fn disagreement(
  kind: record_model.DisagreementKind,
  rule: RuleRef,
  examined: record_model.NonEmpty(Location),
  method: String,
) -> ConstructionProblem {
  Disagreement(FormatDisagreement(
    kind: kind,
    rule: rule,
    examined: examined,
    method: method,
  ))
}

// AN present but not exactly one joined value: not yet a modeled situation.
fn fragment_placeholder(occurrence: FieldOccurrence) -> ConstructionProblem {
  let NonEmpty(first, _) = locations(occurrence)
  FieldNotYetModeled(occurrence.tag, first)
}

// A required field with no located occurrence: examined is the whole record span.
fn required_not_located(
  record: SuppliedRecord,
  tag: String,
  rule: RuleRef,
) -> ConstructionProblem {
  let Witness(location, _) = record.witness
  Disagreement(FormatDisagreement(
    kind: RequiredFieldNotLocated(tag),
    rule: rule,
    examined: NonEmpty(location, []),
    method: "scan of the record's tagged occurrences for " <> tag,
  ))
}
