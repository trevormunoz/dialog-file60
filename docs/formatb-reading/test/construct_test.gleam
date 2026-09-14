//// construct: checked construction of the Identity block (AN, PN) from a
//// SuppliedRecord, accumulating typed ConstructionProblems. Inventory-backed
//// (rules/field-rule-inventory.md batch 1): AN numeric exact-7 non-repeating
//// required; PN required non-repeating length <= 20. Run with `gleam test`.

import accession.{WrongByteLength}
import assembly
import construct
import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should

import record_model.{
  type RuleRef, Disagreement, FieldNotYetModeled, FormatDisagreement, Heading,
  Identity, InvalidAccession, InvalidFieldValue, Narratives, NonEmpty,
  NonRepeatingFieldRepeated, Participants, PrintedDictionary, Provisional,
  RepetitionLimitExceeded, RequiredFieldNotLocated, RuleRef, Subcommodity,
  Supplied, Supported, UndocumentedField,
}

// A throwaway rule for exercising the generic field checkers.
fn a_rule() -> RuleRef {
  RuleRef(
    document: "test",
    pdf_page: 0,
    element: "test",
    assertion: "test",
    interpretation: "test",
    stage: Supplied,
    evidence: PrintedDictionary,
  )
}

// Build a record's bytes from (tag, value) pairs: a "$$" boundary line, then
// for each pair one or more 82-byte served lines (cols 1-2 tag, col 3 blank,
// value from col 4, space pad to 80, CRLF) — a value over the 69-byte
// single-line data width (cols 4-72) wraps onto blank-tag continuation lines,
// the same wrapped-continuation joining the reading layer performs on real
// data — and assembles the whole into a SuppliedRecord.
fn record(pairs: List(#(String, String))) -> record_model.SuppliedRecord {
  let lines =
    [served_line("$$", ""), ..[]]
    |> list.append(
      list.flat_map(pairs, fn(p) { wrapped_lines(p.0, <<p.1:utf8>>) }),
    )
  let bytes = bit_array.concat(lines)
  let assert Ok(supplied) =
    assembly.assemble(bytes, assembly.SourceBase("T", 1), 0xAC)
  supplied
}

fn served_line(tag: String, value: String) -> BitArray {
  served_line_bytes(tag, <<value:utf8>>)
}

fn spaces(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, spaces(n - 1))
  }
}

// Like `record`, but builds served lines from raw value BYTES so a value can
// carry non-UTF-8 bytes (the SC/PH/GH 0xA0 separator).
fn record_bytes(
  pairs: List(#(String, BitArray)),
) -> record_model.SuppliedRecord {
  let lines =
    [served_line("$$", ""), ..[]]
    |> list.append(list.flat_map(pairs, fn(p) { wrapped_lines(p.0, p.1) }))
  let bytes = bit_array.concat(lines)
  let assert Ok(supplied) =
    assembly.assemble(bytes, assembly.SourceBase("T", 1), 0xAC)
  supplied
}

// Like `served_line`, but the value comes in as raw bytes rather than `:utf8`,
// so it can express the 0xA0/0x02 separator (which is not valid UTF-8).
fn served_line_bytes(tag: String, value: BitArray) -> BitArray {
  let body = bit_array.concat([<<tag:utf8, 0x20>>, value])
  let pad = spaces(80 - bit_array.byte_size(body))
  bit_array.concat([body, pad, <<0x0d, 0x0a>>])
}

// The one-or-more served lines a value needs: a value up to 69 bytes (cols
// 4-72) fits on the tagged line; a longer value continues on blank-tag ("  ")
// wrapped-continuation lines, exactly as the reading layer joins them back
// (`field_value.field_values`) — so a test value can exceed one line's 69-byte
// data width without corrupting line alignment.
const data_width: Int = 69

fn wrapped_lines(tag: String, value: BitArray) -> List(BitArray) {
  case chunk_bytes(value, data_width) {
    [] -> [served_line_bytes(tag, <<>>)]
    [first, ..rest] -> [
      served_line_bytes(tag, first),
      ..list.map(rest, fn(chunk) { served_line_bytes("  ", chunk) })
    ]
  }
}

fn chunk_bytes(bytes: BitArray, size: Int) -> List(BitArray) {
  case bit_array.byte_size(bytes) <= size {
    True -> [bytes]
    False -> {
      let assert Ok(head) = bit_array.slice(bytes, 0, size)
      let assert Ok(tail) =
        bit_array.slice(bytes, size, bit_array.byte_size(bytes) - size)
      [head, ..chunk_bytes(tail, size)]
    }
  }
}

// A record with a valid AN and PN constructs a checked Identity.
pub fn identity_from_valid_an_and_pn_test() {
  let supplied = record([#("AN", "9049442"), #("PN", "1275-21000-008-00D")])
  let assert Ok(Identity(acc, pn)) = construct.identity(supplied)
  let Supported(accession_value, _) = acc
  accession.to_string(accession_value) |> should.equal("9049442")
  let Supported(pn_value, _) = pn
  pn_value |> should.equal("1275-21000-008-00D")
}

// A record with no AN occurrence fails with a scoped RequiredFieldNotLocated.
pub fn missing_an_is_required_field_not_located_test() {
  let supplied = record([#("PN", "1275-21000-008-00D")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  kind |> should.equal(RequiredFieldNotLocated("AN"))
}

// An AN of the wrong length reports InvalidAccession, carrying the lexical reason.
pub fn invalid_an_reports_invalid_accession_test() {
  let supplied = record([#("AN", "904944"), #("PN", "1275-21000-008-00D")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  kind |> should.equal(InvalidAccession(WrongByteLength(6)))
}

// Two AN occurrences violate the non-repeating rule.
pub fn repeated_an_reports_non_repeating_field_repeated_test() {
  let supplied =
    record([#("AN", "9049442"), #("AN", "9049443"), #("PN", "1275-2100")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  kind |> should.equal(NonRepeatingFieldRepeated("AN", 2))
}

// A PN longer than 20 bytes reports InvalidFieldValue (length rule, printed).
pub fn pn_over_20_bytes_reports_invalid_field_value_test() {
  let supplied = record([#("AN", "9049442"), #("PN", "123456789012345678901")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  let assert InvalidFieldValue("PN", _reason) = kind
}

// A record with a valid AN but no PN fails with RequiredFieldNotLocated(PN).
pub fn missing_pn_is_required_field_not_located_test() {
  let supplied = record([#("AN", "9049442")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  kind |> should.equal(RequiredFieldNotLocated("PN"))
}

// Two PN occurrences violate the non-repeating rule.
pub fn repeated_pn_reports_non_repeating_field_repeated_test() {
  let supplied = record([#("AN", "9049442"), #("PN", "A-1"), #("PN", "B-2")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), _)) =
    construct.identity(supplied)
  kind |> should.equal(NonRepeatingFieldRepeated("PN", 2))
}

// A record whose AN and PN are BOTH wrong reports both problems at once, rather
// than short-circuiting on AN. Matches institution/participants and the module's
// "surface every divergence" philosophy (and identity's own docstring).
pub fn identity_accumulates_an_and_pn_problems_test() {
  // No AN; PN is 21 bytes (over the MAX-20 rule).
  let supplied = record([#("PN", "123456789012345678901")])
  let assert Error(NonEmpty(first, rest)) = construct.identity(supplied)
  let problems = [first, ..rest]
  list.length(problems) |> should.equal(2)
  should.be_true(
    list.any(problems, fn(p) {
      case p {
        Disagreement(FormatDisagreement(RequiredFieldNotLocated("AN"), _, _, _)) ->
          True
        _ -> False
      }
    }),
  )
  should.be_true(
    list.any(problems, fn(p) {
      case p {
        Disagreement(FormatDisagreement(InvalidFieldValue("PN", _), _, _, _)) ->
          True
        _ -> False
      }
    }),
  )
}

// --- generic field checkers -------------------------------------------------

// required: a present, in-bounds single value yields Ok(Supported).
pub fn required_present_returns_supported_test() {
  let supplied = record([#("CY", "Tifton")])
  let assert Ok(Supported(value, _)) =
    construct.required(supplied, "CY", a_rule(), construct.upto(20))
  value |> should.equal("Tifton")
}

// required: a repeated field reports NonRepeatingFieldRepeated.
pub fn required_repeated_reports_non_repeating_test() {
  let supplied = record([#("CY", "Tifton"), #("CY", "Athens")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.required(supplied, "CY", a_rule(), construct.upto(20))
  kind |> should.equal(NonRepeatingFieldRepeated("CY", 2))
}

// optional: an absent field is Ok(None), not a problem.
pub fn optional_absent_returns_none_test() {
  let supplied = record([#("CY", "Tifton")])
  construct.optional(supplied, "AS", a_rule(), construct.upto(4))
  |> should.equal(Ok(None))
}

// optional: a present, in-bounds field is Ok(Some(...)).
pub fn optional_present_returns_some_test() {
  let supplied = record([#("AS", "ARS")])
  let assert Ok(Some(Supported(value, _))) =
    construct.optional(supplied, "AS", a_rule(), construct.upto(4))
  value |> should.equal("ARS")
}

// optional: a present tag with an empty (all-pad) value reads as absent (None),
// not a length divergence — a blank fixed-width optional field is omission.
// FY88 exercises this only via UP (12.4% present-but-empty = no update date yet).
pub fn optional_present_but_empty_reads_as_absent_test() {
  let supplied = record([#("UP", "")])
  construct.optional(supplied, "UP", a_rule(), construct.exact(6))
  |> should.equal(Ok(None))
}

// optional: a present, NON-empty value of the wrong length still diverges —
// empty means omitted, wrong-but-present means nonconformance.
pub fn optional_present_nonempty_wrong_length_diverges_test() {
  let supplied = record([#("UP", "8802")])
  let assert Error(NonEmpty(_, _)) =
    construct.optional(supplied, "UP", a_rule(), construct.exact(6))
}

// optional_bytes: an empty byte-payload optional field is likewise absent.
pub fn optional_bytes_present_but_empty_reads_as_absent_test() {
  let supplied = record([#("OB", "")])
  construct.optional_bytes(supplied, "OB", a_rule(), construct.upto(1600))
  |> should.equal(Ok(None))
}

// repeating: several occurrences collect into a list of values.
pub fn repeating_collects_values_test() {
  let supplied = record([#("PF", "Poultry Science"), #("PF", "Dual-Comm Inc")])
  let assert Ok(values) =
    construct.repeating(supplied, "PF", a_rule(), construct.upto(80))
  list.length(values) |> should.equal(2)
}

// repeating: each overlong value is reported; problems accumulate across values.
pub fn repeating_accumulates_overlong_values_test() {
  let supplied = record([#("PF", "Poultry"), #("PF", "Science")])
  let assert Error(NonEmpty(first, rest)) =
    construct.repeating(supplied, "PF", a_rule(), construct.upto(4))
  list.length([first, ..rest]) |> should.equal(2)
}

// bounded_nonempty: 1..max occurrences yield a NonEmpty preserving order.
pub fn bounded_nonempty_preserves_order_test() {
  let supplied = record([#("IN", "Gaines T P"), #("IN", "Harper A K III")])
  let assert Ok(NonEmpty(Supported(first, _), rest)) =
    construct.bounded_nonempty(supplied, "IN", a_rule(), construct.upto(30), 6)
  first |> should.equal("Gaines T P")
  list.length(rest) |> should.equal(1)
}

// bounded_nonempty: more than max_count occurrences reports RepetitionLimitExceeded.
pub fn bounded_nonempty_over_limit_reports_repetition_limit_test() {
  let supplied = record(list.repeat(#("IN", "X"), 7))
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.bounded_nonempty(supplied, "IN", a_rule(), construct.upto(30), 6)
  kind |> should.equal(RepetitionLimitExceeded("IN", 7, 6))
}

// A value below a documented MIN is a divergence, not silently accepted.
pub fn below_min_length_reports_problem_test() {
  let supplied = record([#("IC", "006")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.optional(supplied, "IC", a_rule(), construct.between(4, 6))
  let assert InvalidFieldValue("IC", _reason) = kind
}

// optional_exact: a present value of the exact byte length is Ok(Some).
pub fn optional_exact_present_correct_length_test() {
  let supplied = record([#("SD", "880720")])
  let assert Ok(Some(Supported(value, _))) =
    construct.optional(supplied, "SD", a_rule(), construct.exact(6))
  value |> should.equal("880720")
}

// optional_exact: a present value of the wrong length reports InvalidFieldValue.
pub fn optional_exact_wrong_length_reports_problem_test() {
  let supplied = record([#("SD", "8807")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.optional(supplied, "SD", a_rule(), construct.exact(6))
  let assert InvalidFieldValue("SD", _reason) = kind
}

// --- fiscal year (FY): required, honoring both documented rules --------------

// FY accepts the handwritten-amendment 4-digit form (Exact 4).
pub fn fiscal_year_accepts_four_digit_test() {
  let supplied = record([#("FY", "1992")])
  let assert Ok(Some(Supported(value, _))) = construct.fiscal_year(supplied)
  value |> should.equal("1992")
}

// FY accepts the printed 2-digit form (Exact 2).
pub fn fiscal_year_accepts_two_digit_test() {
  let supplied = record([#("FY", "92")])
  let assert Ok(Some(Supported(value, _))) = construct.fiscal_year(supplied)
  value |> should.equal("92")
}

// FY is optional for the FY88 corpus: a missing FY is Ok(None), not a problem.
// The printed "Always Present Y" is a later-vintage rule that FY88 contradicts
// (25.6% absence over the full corpus); see fiscal_year's recorded rationale.
pub fn fiscal_year_missing_is_optional_test() {
  let supplied = record([#("PD", "831214")])
  construct.fiscal_year(supplied) |> should.equal(Ok(None))
}

// FY matching neither documented length is a divergence, not silently accepted.
pub fn fiscal_year_other_length_is_divergence_test() {
  let supplied = record([#("FY", "199")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.fiscal_year(supplied)
  let assert InvalidFieldValue("FY", _reason) = kind
}

// --- chronology -------------------------------------------------------------

// A record with valid dates constructs a Chronology; FY present, SD searchable.
pub fn chronology_happy_test() {
  let supplied =
    record([
      #("PD", "831214"),
      #("SD", "880720"),
      #("SX", "20 JUL 88"),
      #("TD", "910630"),
      #("TX", "30 JUN 90"),
      #("FY", "1992"),
      #("UP", "880203"),
      #("PP", "9012"),
      #("PX", "9001 TO 9012"),
    ])
  let assert Ok(chron) = construct.chronology(supplied)
  let assert Some(Supported(fy, _)) = chron.fiscal_year
  fy |> should.equal("1992")
  let assert Some(Supported(sd, _)) = chron.start.search_form
  sd |> should.equal("880720")
}

// BP ("Progress report period covered" — validation-report addendum p.28, agency
// note Aug 26 1992): an FY94/RG164 field absent from FY88, exact-12 "YYMM TO
// YYMM" (the same shape as the printed PX, with which it co-occurs). Present -> Some.
pub fn chronology_parses_bp_progress_report_period_test() {
  let supplied = record([#("BP", "9201 TO 9209")])
  let assert Ok(chron) = construct.chronology(supplied)
  let assert Some(Supported(bp, _)) = chron.progress_report_period
  bp |> should.equal("9201 TO 9209")
}

// BP is optional: an absent BP yields None (as it always does in FY88).
pub fn chronology_bp_absent_is_none_test() {
  let supplied = record([#("PD", "831214")])
  let assert Ok(chron) = construct.chronology(supplied)
  chron.progress_report_period |> should.equal(None)
}

// A BP of the wrong length is a divergence: the exact-12 shape is enforced, not
// guessed around, just as PX's is.
pub fn chronology_bp_wrong_length_reports_divergence_test() {
  let supplied = record([#("BP", "9201 TO 92")])
  let assert Error(NonEmpty(first, rest)) = construct.chronology(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "BP")))
}

// --- institution / participants composition ---------------------------------

// A record with the required institution fields and one IN constructs Participants.
pub fn participants_happy_test() {
  let supplied =
    record([
      #("PI", "Univ of Georgia"),
      #("CY", "Tifton"),
      #("ST", "GEORGIA"),
      #("IN", "Gaines T P"),
    ])
  let assert Ok(Participants(inst, invs)) = construct.participants(supplied)
  inst.institution_name.value |> should.equal("Univ of Georgia")
  inst.city.value |> should.equal("Tifton")
  invs.first.value |> should.equal(<<"Gaines T P":utf8>>)
}

// Missing required fields accumulate: no PI and no CY yields two problems.
pub fn participants_accumulates_missing_required_test() {
  let supplied = record([#("ST", "GEORGIA"), #("IN", "Gaines T P")])
  let assert Error(NonEmpty(first, rest)) = construct.participants(supplied)
  list.length([first, ..rest]) |> should.equal(2)
}

// A non-UTF-8 byte within IN's documented MAX 30 bytes is ACCEPTED, not
// flagged InvalidFieldValue: IN is byte-preserving per the FY88 UTF-8 census,
// same as OB/AP/DE/PR/PB (see narratives_accepts_non_utf8_ob_test).
pub fn participants_accepts_non_utf8_investigator_test() {
  let in_bytes = <<"Doe":utf8, 0xfe>>
  let supplied =
    record_bytes([
      #("PI", <<"Univ of Georgia":utf8>>),
      #("CY", <<"Tifton":utf8>>),
      #("ST", <<"GEORGIA":utf8>>),
      #("IN", in_bytes),
    ])
  let assert Ok(Participants(_inst, invs)) = construct.participants(supplied)
  invs.first.value |> should.equal(in_bytes)
}

// --- bounded_repeating: like repeating, but also caps occurrence count ------

// bounded_repeating: several in-bounds values collect into a list.
pub fn bounded_repeating_collects_in_bounds_values_test() {
  let supplied = record([#("AC", "12345"), #("AC", "67890")])
  let assert Ok(values) =
    construct.bounded_repeating(
      supplied,
      "AC",
      a_rule(),
      construct.between(5, 89),
      15,
    )
  list.length(values) |> should.equal(2)
}

// bounded_repeating: more than max_count occurrences reports RepetitionLimitExceeded.
pub fn bounded_repeating_over_limit_reports_repetition_limit_test() {
  let supplied = record(list.repeat(#("AC", "12345"), 3))
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.bounded_repeating(
      supplied,
      "AC",
      a_rule(),
      construct.between(5, 89),
      2,
    )
  kind |> should.equal(RepetitionLimitExceeded("AC", 3, 2))
}

// bounded_repeating: an absent field is Ok([]), not a problem.
pub fn bounded_repeating_absent_returns_empty_test() {
  let supplied = record([#("PI", "Univ of Georgia")])
  construct.bounded_repeating(
    supplied,
    "AC",
    a_rule(),
    construct.between(5, 89),
    15,
  )
  |> should.equal(Ok([]))
}

// --- headings & subcommodities (multi-value, split on 0xA0 0x02) ------------

// A three-part SC value (code, literal, percent) carries its percent as
// Some(...); every part is kept as BitArray (bit_array.to_string is a TEST-ONLY
// check that the extracted bytes are what's expected).
pub fn classifications_parses_subcommodity_with_percent_test() {
  let sc = <<
    "XFRS":utf8, 0x20, 0x20, 0xA0, 0x02, "Forestry Related":utf8, 0xA0, 0x02,
    "100%":utf8,
  >>
  let assert Ok(c) = construct.classifications(record_bytes([#("SC", sc)]))
  let assert [Supported(Subcommodity(code, literal, Some(percent)), _)] =
    c.subcommodities
  let assert Ok("XFRS") = bit_array.to_string(code.value)
  let assert Ok("Forestry Related") = bit_array.to_string(literal.value)
  let assert Ok("100%") = bit_array.to_string(percent.value)
}

// A two-part SC value (code, literal, no percent) is accepted with percent None.
// FY94/RG164 SC values omit the percent (see the FY94 generalization finding in
// rules/field-rule-inventory.md); the percent is optional, not required.
pub fn classifications_parses_subcommodity_without_percent_test() {
  let sc = <<"XFRS":utf8, 0x20, 0x20, 0xA0, 0x02, "Forestry Related":utf8>>
  let assert Ok(c) = construct.classifications(record_bytes([#("SC", sc)]))
  let assert [Supported(Subcommodity(code, literal, None), _)] =
    c.subcommodities
  let assert Ok("XFRS") = bit_array.to_string(code.value)
  let assert Ok("Forestry Related") = bit_array.to_string(literal.value)
}

// A one-part SC value (no 0x02 separator at all) is still a divergence: optional
// means two OR three parts, not "any shape".
pub fn classifications_subcommodity_single_part_reports_divergence_test() {
  let sc = <<"XFRS only":utf8>>
  let assert Error(NonEmpty(first, rest)) =
    construct.classifications(record_bytes([#("SC", sc)]))
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "SC")))
}

// A PH value is two parts (code, literal), no percent.
pub fn classifications_parses_two_part_heading_test() {
  let ph = <<"R107":utf8, 0x20, 0x20, 0xA0, 0x02, "Watershed Protection":utf8>>
  let assert Ok(c) = construct.classifications(record_bytes([#("PH", ph)]))
  let assert [Supported(Heading(code, literal), _)] = c.primary_headings
  let assert Ok("R107") = bit_array.to_string(code.value)
  let assert Ok("Watershed Protection") = bit_array.to_string(literal.value)
}

// A PH value that carries a percent (three parts) is a divergence: PH/GH must
// not carry a percent, and the distinct types enforce that.
pub fn classifications_heading_with_percent_reports_divergence_test() {
  let ph = <<
    "R107":utf8, 0x20, 0x20, 0xA0, 0x02, "Watershed":utf8, 0xA0, 0x02,
    "100%":utf8,
  >>
  let assert Error(NonEmpty(first, rest)) =
    construct.classifications(record_bytes([#("PH", ph)]))
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "PH")))
}

// Values flatten across occurrences: two SC tagged lines -> two subcommodities.
pub fn classifications_flattens_multiple_sc_occurrences_test() {
  let sc1 = <<
    "XFRS":utf8, 0x20, 0x20, 0xA0, 0x02, "Forestry":utf8, 0xA0, 0x02,
    "100%":utf8,
  >>
  let sc2 = <<
    "XPR":utf8, 0x20, 0x20, 0x20, 0xA0, 0x02, "Pollution":utf8, 0xA0, 0x02,
    "050%":utf8,
  >>
  let assert Ok(c) =
    construct.classifications(record_bytes([#("SC", sc1), #("SC", sc2)]))
  list.length(c.subcommodities) |> should.equal(2)
}

// --- narratives (OB/AP/DE/PR/PB/HP) ------------------------------------------

// All five narrative fields are optional: an absent record yields all None.
pub fn narratives_absent_returns_all_none_test() {
  let supplied = record([#("AN", "9049442")])
  let assert Ok(Narratives(ob, ap, de, pr, pb)) = construct.narratives(supplied)
  ob |> should.equal(None)
  ap |> should.equal(None)
  de |> should.equal(None)
  pr |> should.equal(None)
  pb |> should.equal(None)
}

// Present, in-bounds values populate every field, including DE.
pub fn narratives_populates_all_fields_test() {
  let supplied =
    record([
      #("OB", "Improve poultry yields"),
      #("AP", "Field trials across three seasons"),
      #("DE", "POULTRY FORESTRY #IPM"),
      #("PR", "Trials completed for FY88"),
      #("PB", "Smith 1988, Journal of Poultry Science"),
    ])
  let assert Ok(Narratives(ob, ap, de, pr, pb)) = construct.narratives(supplied)
  let assert Some(Supported(ob_value, _)) = ob
  ob_value |> should.equal(<<"Improve poultry yields":utf8>>)
  let assert Some(Supported(de_value, _)) = de
  de_value |> should.equal(<<"POULTRY FORESTRY #IPM":utf8>>)
  let assert Some(_) = ap
  let assert Some(_) = pr
  let assert Some(_) = pb
}

// An OB value over the documented MAX 1600 bytes reports InvalidFieldValue.
pub fn narratives_accumulates_overlong_ob_test() {
  let supplied = record([#("OB", string.repeat("x", 1601))])
  let assert Error(NonEmpty(first, rest)) = construct.narratives(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "OB")))
}

// A non-UTF-8 byte within OB's documented MAX 1600 bytes is ACCEPTED, not
// flagged InvalidFieldValue "value is not valid text": OB is byte-preserving
// per the FY88 UTF-8 census (1.8% of real OB values carry non-UTF-8 bytes,
// the EBCDIC-conversion-artifact fingerprint), so the checked payload is kept
// as BitArray rather than decoded.
pub fn narratives_accepts_non_utf8_ob_test() {
  let ob_bytes = <<"abc":utf8, 0xfe>>
  let supplied = record_bytes([#("OB", ob_bytes)])
  let assert Ok(Narratives(ob, _ap, _de, _pr, _pb)) =
    construct.narratives(supplied)
  let assert Some(Supported(value, _)) = ob
  value |> should.equal(ob_bytes)
}

// A 0xAC byte (the profile continuation marker) that is actually DATA -- a
// left-quote conversion artifact -- can land at the start of a wrapped line when
// a long single-value narrative wraps. PR is single-value, so this is NOT a
// marked-value boundary: the value must read as ONE joined BitArray with the
// 0xAC preserved, never split (and never mislabelled FieldNotYetModeled). The
// value here is 69 data bytes (filling the tagged line) + 0xAC + more, so the
// 0xAC begins the continuation line -- exactly the FY94 collision.
pub fn narratives_line_start_marker_in_single_value_pr_is_data_test() {
  let pr =
    bit_array.concat([
      <<string.repeat("A", 69):utf8>>,
      <<0xAC>>,
      <<
        "Empire":utf8,
      >>,
    ])
  let supplied = record_bytes([#("PR", pr)])
  let assert Ok(Narratives(_ob, _ap, _de, progress, _pb)) =
    construct.narratives(supplied)
  let assert Some(Supported(value, _)) = progress
  value |> should.equal(pr)
}

// HP is not yet modeled: any occurrence blocks construction rather than being
// silently accepted or dropped (the model has no `remaining` escape hatch).
pub fn narratives_hp_present_reports_field_not_yet_modeled_test() {
  let supplied = record([#("HP", "See attached bibliography")])
  let assert Error(NonEmpty(first, rest)) = construct.narratives(supplied)
  let assert True =
    list.any([first, ..rest], fn(problem) {
      case problem {
        FieldNotYetModeled("HP", _) -> True
        _ -> False
      }
    })
}

// --- descriptors (DE): aggregate MAX 2400 AND a 60-byte per-keyword bound ----

// An absent DE is Ok(None).
pub fn descriptors_absent_returns_none_test() {
  let supplied = record([#("AN", "9049442")])
  construct.descriptors(supplied) |> should.equal(Ok(None))
}

// A DE value within both the aggregate and per-keyword bounds is Ok(Some).
pub fn descriptors_within_bounds_returns_some_test() {
  let supplied = record([#("DE", "FORESTRY FOREST-MANAGEMENT #IPM")])
  let assert Ok(Some(Supported(value, _))) = construct.descriptors(supplied)
  value |> should.equal(<<"FORESTRY FOREST-MANAGEMENT #IPM":utf8>>)
}

// A DE value over the aggregate 2400-byte MAX reports InvalidFieldValue,
// naming the DE tag.
pub fn descriptors_aggregate_over_2400_reports_invalid_test() {
  let supplied = record([#("DE", string.repeat("A", 2401))])
  let assert Error(NonEmpty(first, rest)) = construct.descriptors(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "DE")))
}

// A single whitespace-separated keyword over the documented 60-byte MAX
// reports InvalidFieldValue, even though the aggregate is well within 2400.
// The message names the offending keyword: a bounded prefix of its bytes plus
// its actual byte length, so the divergence is identifiable, not anonymous.
pub fn descriptors_keyword_over_60_reports_invalid_test() {
  let supplied =
    record([#("DE", "FORESTRY " <> string.repeat("A", 61) <> " #IPM")])
  let assert Error(NonEmpty(first, rest)) = construct.descriptors(supplied)
  let problems = [first, ..rest]
  should.be_true(list.any(problems, is_invalid_field_value(_, "DE")))
  let reasons = invalid_field_value_reasons(problems, "DE")
  should.be_true(
    list.any(reasons, fn(reason) {
      string.contains(reason, "61 bytes")
      && string.contains(reason, "per-keyword maximum")
      && string.contains(reason, string.repeat("A", 24))
    }),
  )
}

// Two DE occurrences violate the non-repeating rule.
pub fn descriptors_repeated_de_reports_non_repeating_test() {
  let supplied = record([#("DE", "FORESTRY"), #("DE", "POULTRY")])
  let assert Error(NonEmpty(first, rest)) = construct.descriptors(supplied)
  let assert True =
    list.any([first, ..rest], fn(problem) {
      case problem {
        Disagreement(FormatDisagreement(kind, _, _, _)) ->
          kind == NonRepeatingFieldRepeated("DE", 2)
        _ -> False
      }
    })
}

// --- required_nonempty: like bounded_nonempty, but with no count cap --------

// required_nonempty: a present field's values collect into a NonEmpty.
pub fn required_nonempty_collects_values_test() {
  let supplied = record([#("SF", "CRIS"), #("SF", "HNRIMS")])
  let assert Ok(NonEmpty(Supported(first, _), rest)) =
    construct.required_nonempty(
      supplied,
      "SF",
      a_rule(),
      construct.between(4, 11),
    )
  first |> should.equal("CRIS")
  list.length(rest) |> should.equal(1)
}

// required_nonempty: an absent field reports RequiredFieldNotLocated.
pub fn required_nonempty_absent_reports_required_not_located_test() {
  let supplied = record([#("AN", "9049442")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.required_nonempty(
      supplied,
      "SF",
      a_rule(),
      construct.between(4, 11),
    )
  kind |> should.equal(RequiredFieldNotLocated("SF"))
}

// --- status (PS): Provisional, handwritten grade, no length enforced --------

// An absent PS is Ok(Provisional(None, ...)) — presence, not a problem.
pub fn status_absent_returns_provisional_none_test() {
  let supplied = record([#("AN", "9049442")])
  let assert Ok(Provisional(value, _basis)) = construct.status(supplied)
  value |> should.equal(None)
}

// A present PS is Ok(Provisional(Some(...), ...)).
pub fn status_present_returns_provisional_some_test() {
  let supplied = record([#("PS", "Terminated")])
  let assert Ok(Provisional(Some(Supported(value, _)), _basis)) =
    construct.status(supplied)
  value |> should.equal("Terminated")
}

// PS enforces NO length at the handwritten grade: a value far past any
// plausible printed MAX (16) still constructs.
pub fn status_long_value_not_length_checked_test() {
  let supplied = record([#("PS", string.repeat("x", 100))])
  let assert Ok(Provisional(Some(_), _basis)) = construct.status(supplied)
}

// Two PS occurrences violate the non-repeating rule.
pub fn status_repeated_reports_non_repeating_test() {
  let supplied = record([#("PS", "new"), #("PS", "Terminated")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.status(supplied)
  kind |> should.equal(NonRepeatingFieldRepeated("PS", 2))
}

// --- project: top-level composition, accumulating every group's problems ----

fn full_record_pairs() -> List(#(String, String)) {
  [
    #("AN", "9049442"),
    #("PN", "1275-21000-008-00D"),
    #("TI", "Watershed protection in irrigated agriculture"),
    #("PS", "new"),
    #("PT", "0"),
    #("PI", "Univ of Georgia"),
    #("CY", "Tifton"),
    #("ST", "GEORGIA"),
    #("IN", "Gaines T P"),
    #("FY", "1988"),
    #("OB", "Improve poultry yields"),
    #("DE", "POULTRY FORESTRY"),
    #("SF", "CRIS"),
  ]
}

fn full_record() -> record_model.SuppliedRecord {
  record(full_record_pairs())
}

// A record with an orphan continuation line (no tagged field open above it):
// assembly emits this as an Unassigned part, never a Field occurrence.
fn record_with_orphan_continuation() -> record_model.SuppliedRecord {
  let boundary = served_line("$$", "")
  let orphan = served_line_bytes("  ", <<"stray data":utf8>>)
  let bytes = bit_array.concat([boundary, orphan])
  let assert Ok(supplied) =
    assembly.assemble(bytes, assembly.SourceBase("T", 1), 0xAC)
  supplied
}

// A record with every group's required fields present constructs a Project.
pub fn project_happy_test() {
  let assert Ok(project) = construct.project(full_record())
  record_model.project_title(project).value
  |> should.equal("Watershed protection in irrigated agriculture")
  let NonEmpty(first, _) = record_model.project_subfiles(project)
  first.value |> should.equal("CRIS")
}

// Missing required fields across several groups accumulate into one error:
// no AN, no TI, no FY, no SF should report (at least) four problems.
pub fn project_accumulates_problems_across_groups_test() {
  let supplied =
    record([
      #("PI", "Univ of Georgia"),
      #("CY", "Tifton"),
      #("ST", "GEORGIA"),
      #("IN", "Gaines T P"),
    ])
  let assert Error(NonEmpty(first, rest)) = construct.project(supplied)
  should.be_true(list.length([first, ..rest]) >= 4)
}

fn is_invalid_field_value(
  problem: record_model.ConstructionProblem,
  tag: String,
) -> Bool {
  case problem {
    Disagreement(FormatDisagreement(InvalidFieldValue(t, _), _, _, _)) ->
      t == tag
    _ -> False
  }
}

// Every InvalidFieldValue reason reported for `tag`, across the problem list.
fn invalid_field_value_reasons(
  problems: List(record_model.ConstructionProblem),
  tag: String,
) -> List(String) {
  list.filter_map(problems, fn(problem) {
    case problem {
      Disagreement(FormatDisagreement(InvalidFieldValue(t, reason), _, _, _))
        if t == tag
      -> Ok(reason)
      _ -> Error(Nil)
    }
  })
}

// --- unmodeled material: no `remaining` escape hatch (record_model.gleam) ---

// A record otherwise fully modeled, but carrying an NI occurrence (outside the
// authoritative modeled-tag set), fails construction with FieldNotYetModeled
// naming NI — the generic unmodeled-material pass, not a per-field special case.
pub fn project_with_unmodeled_tag_reports_field_not_yet_modeled_test() {
  let supplied = record(list.append(full_record_pairs(), [#("NI", "50")]))
  let assert Error(NonEmpty(first, rest)) = construct.project(supplied)
  let assert True =
    list.any([first, ..rest], fn(problem) {
      case problem {
        FieldNotYetModeled("NI", _) -> True
        _ -> False
      }
    })
}

// A record carrying an Unassigned part (orphan continuation material with no
// tagged field open above it) also fails construction with a
// FieldNotYetModeled naming the sentinel unassigned tag.
pub fn project_with_unassigned_part_reports_field_not_yet_modeled_test() {
  let supplied = record_with_orphan_continuation()
  let assert Error(NonEmpty(first, rest)) = construct.project(supplied)
  let assert True =
    list.any([first, ..rest], fn(problem) {
      case problem {
        FieldNotYetModeled("<unassigned>", _) -> True
        _ -> False
      }
    })
}

// SN is source-undocumented, so a full record that also carries SN CERTIFIES:
// SN is neither a divergence nor a FieldNotYetModeled backlog item. The presence
// is surfaced via `project_undocumented_fields`, never hidden — exactly one SN
// entry, and the generic unmodeled-material pass does not double-count it (SN is
// a member of the authoritative modeled-tag set).
pub fn project_with_sn_certifies_carrying_undocumented_field_test() {
  let supplied = record(list.append(full_record_pairs(), [#("SN", "50")]))
  let assert Ok(project) = construct.project(supplied)
  let assert [UndocumentedField("SN", _, _)] =
    record_model.project_undocumented_fields(project)
}

// --- DE: the aggregate 2400 bound in isolation, and the 60-byte accepting edge

// Many keywords, each within the 60-byte per-keyword bound, whose TOTAL joined
// length exceeds 2400: this exercises the aggregate check ALONE. Deleting the
// aggregate check (and only it) must turn this test RED.
pub fn descriptors_aggregate_over_2400_without_oversized_keyword_test() {
  let value =
    list.repeat(string.repeat("A", 50), 50)
    |> string.join(" ")
  let supplied = record([#("DE", value)])
  let assert Error(NonEmpty(first, rest)) = construct.descriptors(supplied)
  let problems = [first, ..rest]
  should.be_true(list.any(problems, is_invalid_field_value(_, "DE")))
  should.be_true(
    !list.any(invalid_field_value_reasons(problems, "DE"), fn(reason) {
      string.contains(reason, "per-keyword")
    }),
  )
}

// A keyword of EXACTLY 60 bytes (the documented maximum) is accepted, not
// rejected: the accepting side of the boundary.
pub fn descriptors_keyword_exactly_60_bytes_is_accepted_test() {
  let supplied = record([#("DE", string.repeat("A", 60))])
  let assert Ok(Some(Supported(value, _))) = construct.descriptors(supplied)
  value |> should.equal(<<string.repeat("A", 60):utf8>>)
}

// --- classifications: composing the whole block -----------------------------

// A record with BT, one AC, one SC builds a Classifications with those fields
// populated. Uses record_bytes because SC carries the non-UTF-8 separator.
pub fn classifications_happy_path_test() {
  let sc = <<
    "XFRS":utf8, 0x20, 0x20, 0xA0, 0x02, "Forestry Related":utf8, 0xA0, 0x02,
    "100%":utf8,
  >>
  let supplied =
    record_bytes([
      #("BT", <<"1000":utf8>>),
      #("AC", <<"12345":utf8>>),
      #("SC", sc),
    ])
  let assert Ok(c) = construct.classifications(supplied)
  let assert Some(_) = c.basic
  list.length(c.columns.activity) |> should.equal(1)
  list.length(c.subcommodities) |> should.equal(1)
}

// SN has no dictionary row: it is source-undocumented (the validation addendum
// names SN and BP as present in the data but not in the Data Element
// Descriptions). Its occurrence is PRESERVED as an UndocumentedField, not
// reported as a problem and not silently dropped: Classifications still builds,
// and the SN bytes are carried in `subcommodity_percentages`.
pub fn classifications_with_sn_preserves_undocumented_field_test() {
  let supplied = record([#("BT", "1000"), #("SN", "50")])
  let assert Ok(c) = construct.classifications(supplied)
  let assert [UndocumentedField("SN", value, _)] = c.subcommodity_percentages
  value |> should.equal(<<"50":utf8>>)
}

// An AC value below the documented MIN 5 is a divergence, not silently
// accepted.
pub fn classifications_below_min_ac_reports_invalid_field_value_test() {
  let supplied = record([#("AC", "123")])
  let assert Error(NonEmpty(first, rest)) = construct.classifications(supplied)
  let assert True =
    list.any([first, ..rest], fn(problem) {
      case problem {
        Disagreement(FormatDisagreement(InvalidFieldValue("AC", _), _, _, _)) ->
          True
        _ -> False
      }
    })
}

// --- CG/RG/RN (Institution) and GY (Chronology): batch 6, adjacency to FY --

fn institution_required_pairs() -> List(#(String, String)) {
  [#("PI", "Univ of Georgia"), #("CY", "Tifton"), #("ST", "GEORGIA")]
}

// CG (Contract/Grant/Agreement No., element 14): present, <= 20 bytes, no
// char-class check (its own example carries hyphens).
pub fn institution_cg_present_within_max_returns_some_test() {
  let supplied =
    record(
      list.append(institution_required_pairs(), [
        #("CG", "58-7830-3-546"),
      ]),
    )
  let assert Ok(inst) = construct.institution(supplied)
  let assert Some(Supported(value, _)) = inst.contract_grant
  value |> should.equal("58-7830-3-546")
}

// CG over the documented MAX 20 bytes reports InvalidFieldValue.
pub fn institution_cg_over_20_bytes_reports_invalid_test() {
  let supplied =
    record(
      list.append(institution_required_pairs(), [
        #("CG", string.repeat("9", 21)),
      ]),
    )
  let assert Error(NonEmpty(first, rest)) = construct.institution(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "CG")))
}

// CG absent is None in a built Institution, not a problem.
pub fn institution_cg_absent_returns_none_test() {
  let supplied = record(institution_required_pairs())
  let assert Ok(inst) = construct.institution(supplied)
  inst.contract_grant |> should.equal(None)
}

// RG (Regional Project Region, element 16): present, <= 2 bytes. Distinct
// field from RE (numeric region code, already modeled).
pub fn institution_rg_present_within_max_returns_some_test() {
  let supplied =
    record(list.append(institution_required_pairs(), [#("RG", "NE")]))
  let assert Ok(inst) = construct.institution(supplied)
  let assert Some(Supported(value, _)) = inst.region_abbreviation
  value |> should.equal("NE")
}

// RG over the documented MAX 2 bytes reports InvalidFieldValue.
pub fn institution_rg_over_2_bytes_reports_invalid_test() {
  let supplied =
    record(list.append(institution_required_pairs(), [#("RG", "NEW")]))
  let assert Error(NonEmpty(first, rest)) = construct.institution(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "RG")))
}

// RN (Regional Project Number, element 17): present, exactly 5 bytes, length
// only (not a digit check — only AN is digit-checked).
pub fn institution_rn_present_exact_5_returns_some_test() {
  let supplied =
    record(list.append(institution_required_pairs(), [#("RN", "00153")]))
  let assert Ok(inst) = construct.institution(supplied)
  let assert Some(Supported(value, _)) = inst.regional_project_number
  value |> should.equal("00153")
}

// RN of the wrong length reports InvalidFieldValue.
pub fn institution_rn_wrong_length_reports_invalid_test() {
  let supplied =
    record(list.append(institution_required_pairs(), [#("RN", "153")]))
  let assert Error(NonEmpty(first, rest)) = construct.institution(supplied)
  should.be_true(list.any([first, ..rest], is_invalid_field_value(_, "RN")))
}

// --- grant_year (GY): FY's exact twin — same dual-length rule -------------

// GY accepts the handwritten-amendment 4-digit form (Exact 4).
pub fn grant_year_accepts_four_digit_test() {
  let supplied = record([#("GY", "1985")])
  let assert Ok(Some(Supported(value, _))) = construct.grant_year(supplied)
  value |> should.equal("1985")
}

// GY accepts the printed 2-digit form (Exact 2).
pub fn grant_year_accepts_two_digit_test() {
  let supplied = record([#("GY", "85")])
  let assert Ok(Some(Supported(value, _))) = construct.grant_year(supplied)
  value |> should.equal("85")
}

// GY is optional: a missing GY is Ok(None), not a problem.
pub fn grant_year_missing_is_optional_test() {
  let supplied = record([#("PD", "831214")])
  construct.grant_year(supplied) |> should.equal(Ok(None))
}

// GY matching neither documented length is a divergence.
pub fn grant_year_other_length_is_divergence_test() {
  let supplied = record([#("GY", "199")])
  let assert Error(NonEmpty(Disagreement(FormatDisagreement(kind, _, _, _)), [])) =
    construct.grant_year(supplied)
  let assert InvalidFieldValue("GY", _reason) = kind
}

// --- modeled_tags: CG/RG/RN/GY no longer flagged FieldNotYetModeled -------

// A record carrying valid CG/RG/RN/GY alongside every other required field
// constructs Ok — none of the four tags trips the generic unmodeled-material
// pass any more.
pub fn project_with_cg_rg_rn_gy_not_flagged_unmodeled_test() {
  let supplied =
    record(
      list.append(full_record_pairs(), [
        #("CG", "58-7830-3-546"),
        #("RG", "NE"),
        #("RN", "00153"),
        #("GY", "1988"),
      ]),
    )
  let assert Ok(_project) = construct.project(supplied)
}
