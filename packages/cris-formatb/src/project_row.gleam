import accession
import assembly
import construct
import gleam/bit_array
import gleam/dict.{type Dict}
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import record_model.{
  type Subcommodity, type Supported, Chronology, ClassificationColumns,
  ClassificationRow, Classifications, Disagreement, FieldNotYetModeled,
  FormatDisagreement, Heading, Identity, Institution, InvalidAccession,
  InvalidFieldValue, NonRepeatingFieldRepeated, PairedDate, Participants,
  Provisional, RelatedFieldsDisagree, RepetitionLimitExceeded,
  RequiredFieldNotLocated, RpaCodeNotAttested, RuleUnresolved, Subcommodity,
  TagNotAscii,
}
import report
import rpa_attestation
import scan
import source_record.{NonEmpty}
import tally

pub type Provenance {
  Provenance(record_group: String, fiscal_year: Int)
}

pub fn provenance_of(path: String) -> Result(Provenance, Nil) {
  case rpa_attestation.corpus_fy_from_path(path) {
    None -> Error(Nil)
    Some(fy) -> {
      let base = last_segment(path)
      // Record group is the leading "RGnnn" token of the basename.
      case string.split(base, ".") {
        [rg, ..] -> Ok(Provenance(rg, fy))
        [] -> Error(Nil)
      }
    }
  }
}

fn last_segment(path: String) -> String {
  case string.split(path, "/") |> list.last {
    Ok(seg) -> seg
    Error(_) -> path
  }
}

// --- row_of / unreadable_row_of ---------------------------------------------
//
// Declarative `json.object` composition over the per-group `*_fields`
// helpers below. Every helper follows the same shape: `Ok(group) -> [...
// populated columns ...]`, `Error(_) -> <the SAME columns, all json.null()>`
// (via a shared `*_null_fields` list, reused directly by `unreadable_row_of`
// so the two row shapes can never drift apart on column names).
//
// Seam (C), the provenance-ints seam: `first_line`/`offset`/`length` come
// from `supplied.witness.location` (source_record.gleam) — the `Witness`
// `assembly.assemble` builds spans the WHOLE record (see assembly.gleam's
// `assemble`, which sets `byte_length: bit_array.byte_size(record)` over the
// full multi-line record, not one line). This is faithful and required no
// signature change: `row_of`'s signature matches the plan literally,
// `row_of(supplied, provenance, tier, result)`. `an` comes from
// `construct.identity(supplied)` (computed once, reused for both
// `provenance_fields` and `identity_fields`), via the same
// `accession.to_string` path `report.gleam:99` uses; it is `null` if identity
// itself failed to construct.

pub fn row_of(
  supplied: source_record.SuppliedRecord,
  provenance: Provenance,
  tier: tally.Tier,
  result: record_model.ConstructionResult,
) -> json.Json {
  let identity_checked = construct.identity(supplied)
  json.object(
    list.flatten([
      provenance_fields(supplied, provenance, identity_checked),
      identity_fields(identity_checked),
      scalar_fields(
        construct.title(supplied),
        construct.status(supplied),
        construct.project_type(supplied),
        construct.subfiles(supplied),
      ),
      institution_fields(construct.participants(supplied)),
      participants_fields(construct.participants(supplied)),
      chronology_fields(construct.chronology(supplied)),
      classification_fields(construct.classifications(supplied), provenance),
      narratives_fields(construct.narratives(supplied)),
      validation_fields(tier, result),
    ]),
  )
}

/// The unreadable row shape: an assemble failure never produces a
/// `SuppliedRecord`, so every typed group column is null; only provenance
/// (minus `an`, which needs an assembled Identity) and `validation` populate.
pub fn unreadable_row_of(
  record: scan.ScannedRecord,
  provenance: Provenance,
  error: assembly.AssemblyError,
) -> json.Json {
  let scan.ScannedRecord(base, bytes) = record
  let first_line = base.first_line
  let offset = { first_line - 1 } * 82
  let length = bit_array.byte_size(bytes)
  json.object(
    list.flatten([
      [
        #("record_group", json.string(provenance.record_group)),
        #("fiscal_year", json.int(provenance.fiscal_year)),
        #("an", json.null()),
        #("first_line", json.int(first_line)),
        #("offset", json.int(offset)),
        #("length", json.int(length)),
      ],
      identity_null_fields(),
      scalar_null_fields(),
      institution_null_fields(),
      participants_null_fields(),
      chronology_null_fields(),
      classification_null_fields(),
      narratives_null_fields(),
      [
        #(
          "validation",
          json.object([
            #("certified", json.bool(False)),
            #("tier", json.string(tally.tier_name(tally.Unreadable))),
            #("assembly_error", json.string(assembly_error_message(error))),
            #("problems", json.preprocessed_array([])),
          ]),
        ),
      ],
    ]),
  )
}

fn assembly_error_message(error: assembly.AssemblyError) -> String {
  case error {
    assembly.LineUnreadable(_) -> "a card line was not readable"
  }
}

// --- provenance ---------------------------------------------------------------

fn provenance_fields(
  supplied: source_record.SuppliedRecord,
  provenance: Provenance,
  identity_checked: construct.Checked(record_model.Identity),
) -> List(#(String, json.Json)) {
  let location = supplied.witness.location
  [
    #("record_group", json.string(provenance.record_group)),
    #("fiscal_year", json.int(provenance.fiscal_year)),
    #("an", case identity_checked {
      Ok(Identity(accession: acc, project_number: _)) ->
        json.string(accession.to_string(acc.value))
      Error(_) -> json.null()
    }),
    #("first_line", json.int(location.first_line)),
    #("offset", json.int(location.byte_offset)),
    #("length", json.int(location.byte_length)),
  ]
}

// --- identity -------------------------------------------------------------

fn identity_fields(
  checked: construct.Checked(record_model.Identity),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Identity(accession: acc, project_number: pn)) -> [
      #("accession", json.string(accession.to_string(acc.value))),
      #("project_number", json.string(pn.value)),
    ]
    Error(_) -> identity_null_fields()
  }
}

fn identity_null_fields() -> List(#(String, json.Json)) {
  [#("accession", json.null()), #("project_number", json.null())]
}

// --- scalars: title/status/status_basis/project_type/subfiles --------------

fn scalar_fields(
  title: construct.Checked(Supported(String)),
  status: construct.Checked(record_model.Provisional(Supported(String))),
  project_type: construct.Checked(Option(Supported(String))),
  subfiles: construct.Checked(source_record.NonEmpty(Supported(String))),
) -> List(#(String, json.Json)) {
  list.flatten([
    supported_string_field("title", title),
    status_fields(status),
    optional_supported_string_field("project_type", project_type),
    subfiles_field(subfiles),
  ])
}

fn scalar_null_fields() -> List(#(String, json.Json)) {
  [
    #("title", json.null()),
    #("status", json.null()),
    #("status_basis", json.null()),
    #("project_type", json.null()),
    #("subfiles", json.null()),
  ]
}

fn supported_string_field(
  name: String,
  checked: construct.Checked(Supported(String)),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(s) -> [#(name, json.string(s.value))]
    Error(_) -> [#(name, json.null())]
  }
}

fn optional_supported_string_field(
  name: String,
  checked: construct.Checked(Option(Supported(String))),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(opt) -> [#(name, opt_str(opt))]
    Error(_) -> [#(name, json.null())]
  }
}

fn subfiles_field(
  checked: construct.Checked(source_record.NonEmpty(Supported(String))),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(NonEmpty(first, rest)) -> [
      #(
        "subfiles",
        json.array([first, ..rest], of: fn(s: Supported(String)) {
          json.string(s.value)
        }),
      ),
    ]
    Error(_) -> [#("subfiles", json.null())]
  }
}

// `status` is Provisional: a value when Some, plus `status_basis` naming the
// evidence grade its RuleRef rests on; both null together when the value is
// None (the field's requiredness is itself unsettled — see record_model.gleam
// `Provisional`'s docstring). Rendered as a snake_case string at the JSON
// edge, matching `tier_name`'s convention for every other sum type here.
fn status_fields(
  checked: construct.Checked(record_model.Provisional(Supported(String))),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Provisional(value: opt, basis: rule)) -> [
      #("status", opt_str(opt)),
      #("status_basis", case opt {
        Some(_) -> json.string(evidence_grade_name(rule.evidence))
        None -> json.null()
      }),
    ]
    Error(_) -> [#("status", json.null()), #("status_basis", json.null())]
  }
}

fn evidence_grade_name(grade: record_model.EvidenceGrade) -> String {
  case grade {
    record_model.PrintedDictionary -> "printed_dictionary"
    record_model.HandwrittenAmendment -> "handwritten_amendment"
    record_model.ValidationAddendum -> "validation_addendum"
    record_model.ClassificationSource -> "classification_source"
  }
}

fn opt_str(opt: Option(Supported(String))) -> json.Json {
  json.nullable(opt, fn(s) { json.string(s.value) })
}

// --- institution (nested in Participants) -----------------------------------

fn institution_fields(
  checked: construct.Checked(record_model.Participants),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Participants(institution: inst, investigators: _)) -> {
      let Institution(
        agency: agency,
        division_station: division_station,
        institution_code: institution_code,
        institution_name: institution_name,
        city: city,
        state_country: state_country,
        zip: zip,
        region: region,
        region_abbreviation: region_abbreviation,
        organization_code: organization_code,
        organization_names: organization_names,
        contract_grant: contract_grant,
        regional_project_number: regional_project_number,
      ) = inst
      [
        #("agency", opt_str(agency)),
        #("division_station", opt_str(division_station)),
        #("institution_code", opt_str(institution_code)),
        #("institution_name", json.string(institution_name.value)),
        #("city", json.string(city.value)),
        #("state_country", json.string(state_country.value)),
        #("zip", opt_str(zip)),
        #("region", opt_str(region)),
        #("region_abbreviation", opt_str(region_abbreviation)),
        #("organization_code", opt_str(organization_code)),
        #(
          "organization_names",
          json.array(organization_names, of: fn(s: Supported(String)) {
            json.string(s.value)
          }),
        ),
        #("contract_grant", opt_str(contract_grant)),
        #("regional_project_number", opt_str(regional_project_number)),
      ]
    }
    Error(_) -> institution_null_fields()
  }
}

fn institution_null_fields() -> List(#(String, json.Json)) {
  [
    #("agency", json.null()),
    #("division_station", json.null()),
    #("institution_code", json.null()),
    #("institution_name", json.null()),
    #("city", json.null()),
    #("state_country", json.null()),
    #("zip", json.null()),
    #("region", json.null()),
    #("region_abbreviation", json.null()),
    #("organization_code", json.null()),
    #("organization_names", json.null()),
    #("contract_grant", json.null()),
    #("regional_project_number", json.null()),
  ]
}

// --- participants: investigators ---------------------------------------------

fn participants_fields(
  checked: construct.Checked(record_model.Participants),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Participants(institution: _, investigators: NonEmpty(first, rest))) -> [
      #("investigators", json.array([first, ..rest], of: bit_array_struct)),
    ]
    Error(_) -> participants_null_fields()
  }
}

fn participants_null_fields() -> List(#(String, json.Json)) {
  [#("investigators", json.null())]
}

fn bit_array_struct(s: Supported(BitArray)) -> json.Json {
  json.object([
    #("raw", json.string(bit_array.base64_encode(s.value, True))),
    #("text", json.string(record_model.render(s.value))),
  ])
}

// --- chronology ---------------------------------------------------------------

fn chronology_fields(
  checked: construct.Checked(record_model.Chronology),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Chronology(
      process_date: process_date,
      start: start,
      termination: termination,
      fiscal_year: fiscal_year_field,
      grant_year: grant_year,
      progress_updated: progress_updated,
      progress_period_end: progress_period_end,
      progress_period_display: progress_period_display,
      progress_report_period: progress_report_period,
    )) -> {
      let PairedDate(search_form: start_search, display_form: start_display) =
        start
      let PairedDate(
        search_form: termination_search,
        display_form: termination_display,
      ) = termination
      [
        #("process_date", opt_str(process_date)),
        #("start_search", opt_str(start_search)),
        #("start_display", opt_str(start_display)),
        #("termination_search", opt_str(termination_search)),
        #("termination_display", opt_str(termination_display)),
        #("fiscal_year_field", opt_str(fiscal_year_field)),
        #("grant_year", opt_str(grant_year)),
        #("progress_updated", opt_str(progress_updated)),
        #("progress_period_end", opt_str(progress_period_end)),
        #("progress_period_display", opt_str(progress_period_display)),
        #("progress_report_period", opt_str(progress_report_period)),
      ]
    }
    Error(_) -> chronology_null_fields()
  }
}

fn chronology_null_fields() -> List(#(String, json.Json)) {
  [
    #("process_date", json.null()),
    #("start_search", json.null()),
    #("start_display", json.null()),
    #("termination_search", json.null()),
    #("termination_display", json.null()),
    #("fiscal_year_field", json.null()),
    #("grant_year", json.null()),
    #("progress_updated", json.null()),
    #("progress_period_end", json.null()),
    #("progress_period_display", json.null()),
    #("progress_report_period", json.null()),
  ]
}

// --- classification (the decode join) -----------------------------------------
//
// (A) ClassificationRow field -> wire mapping, verified against
// record_model.gleam:252-260's field-order comment (RP, AC, CM, FS, CT, PA,
// JC) and its :261-271 field list:
//   problem -> rp_code   activity -> ac_code   commodity -> cm_code
//   science -> fs_code   percent -> ct_percent program_area -> pa_code
//   joint_council -> jc_code

fn classification_fields(
  checked: construct.Checked(record_model.Classifications),
  provenance: Provenance,
) -> List(#(String, json.Json)) {
  case checked {
    Ok(Classifications(
      basic: basic,
      applied: applied,
      developmental: developmental,
      columns: columns,
      subcommodities: subcommodities,
      subcommodity_percentages: _,
      primary_headings: primary_headings,
      general_headings: general_headings,
    )) -> {
      let ClassificationColumns(
        activity: activity,
        commodity: commodity,
        science: science,
        problem: problem,
        product_percent: product_percent,
        program_area: program_area,
        joint_council: joint_council,
      ) = columns
      let labels = heading_label_index(primary_headings, general_headings)
      let warrant = rpa_attestation.warrant_for(provenance.fiscal_year)
      let rows_json = case record_model.classification_rows(columns) {
        Ok(rows) ->
          json.preprocessed_array(
            list.index_map(rows, fn(row, index) {
              classification_row_json(index, row, labels, warrant)
            }),
          )
        // Misaligned columns (the seven lists are not equal length): rely on
        // the raw parallel *_codes columns below instead of guessing rows.
        Error(Nil) -> json.preprocessed_array([])
      }
      [
        #("basic", opt_str(basic)),
        #("applied", opt_str(applied)),
        #("developmental", opt_str(developmental)),
        #("rp_codes", supported_string_list(problem)),
        #("ac_codes", supported_string_list(activity)),
        #("cm_codes", supported_string_list(commodity)),
        #("fs_codes", supported_string_list(science)),
        #("ct_percents", supported_string_list(product_percent)),
        #("pa_codes", supported_string_list(program_area)),
        #("jc_codes", supported_string_list(joint_council)),
        #("classification_rows", rows_json),
        #("subcommodities", json.array(subcommodities, of: subcommodity_json)),
        #("primary_headings", json.array(primary_headings, of: heading_json)),
        #("general_headings", json.array(general_headings, of: heading_json)),
      ]
    }
    Error(_) -> classification_null_fields()
  }
}

fn classification_null_fields() -> List(#(String, json.Json)) {
  [
    #("basic", json.null()),
    #("applied", json.null()),
    #("developmental", json.null()),
    #("rp_codes", json.null()),
    #("ac_codes", json.null()),
    #("cm_codes", json.null()),
    #("fs_codes", json.null()),
    #("ct_percents", json.null()),
    #("pa_codes", json.null()),
    #("jc_codes", json.null()),
    #("classification_rows", json.null()),
    #("subcommodities", json.null()),
    #("primary_headings", json.null()),
    #("general_headings", json.null()),
  ]
}

fn supported_string_list(values: List(Supported(String))) -> json.Json {
  json.array(values, of: fn(s) { json.string(s.value) })
}

// PH covers A…/C…/F…/R… (AC/CM/FS/RP); GH covers J…/P… (JC/PA) — the codes
// themselves carry the disambiguating prefix (record_model.gleam's
// classification_rows doc + the design spec's "Decode / cross-link" section).
// Built once per record: index every PH/GH expansion by its bare code, value
// = its literal. A columnar code with no key here gets a null label — flagged,
// never guessed (prefix-disjointness across facets is verified corpus-wide by
// Task 12, not assumed here).
fn heading_label_index(
  primary: List(Supported(record_model.Heading)),
  general: List(Supported(record_model.Heading)),
) -> Dict(String, String) {
  list.append(primary, general)
  |> list.map(fn(s) {
    let Heading(code: code, literal: literal) = s.value
    #(record_model.render(code.value), record_model.render(literal.value))
  })
  |> dict.from_list
}

fn label_lookup(labels: Dict(String, String), code: String) -> json.Json {
  case dict.get(labels, code) {
    Ok(label) -> json.string(label)
    Error(Nil) -> json.null()
  }
}

fn classification_row_json(
  position: Int,
  row: record_model.ClassificationRow,
  labels: Dict(String, String),
  warrant: rpa_attestation.WarrantSet,
) -> json.Json {
  let ClassificationRow(
    problem: problem,
    activity: activity,
    commodity: commodity,
    science: science,
    percent: percent,
    program_area: program_area,
    joint_council: joint_council,
  ) = row
  let rp_code = problem.value
  let ac_code = activity.value
  let cm_code = commodity.value
  let fs_code = science.value
  let ct_percent = percent.value
  let pa_code = program_area.value
  let jc_code = joint_council.value
  json.object(
    list.flatten([
      [
        #("position", json.int(position)),
        #("rp_code", json.string(rp_code)),
        #("rp_label", label_lookup(labels, rp_code)),
      ],
      rp_attestation_fields(rp_code, warrant),
      [
        #("ac_code", json.string(ac_code)),
        #("ac_label", label_lookup(labels, ac_code)),
        #("cm_code", json.string(cm_code)),
        #("cm_label", label_lookup(labels, cm_code)),
        #("fs_code", json.string(fs_code)),
        #("fs_label", label_lookup(labels, fs_code)),
        #("ct_percent", json.string(ct_percent)),
        #("pa_code", json.string(pa_code)),
        #("pa_label", label_lookup(labels, pa_code)),
        #("jc_code", json.string(jc_code)),
        #("jc_label", label_lookup(labels, jc_code)),
      ],
    ]),
  )
}

// The four-state Attestation rendering (design spec "Decode / cross-link").
fn rp_attestation_fields(
  code: String,
  set: rpa_attestation.WarrantSet,
) -> List(#(String, json.Json)) {
  case rpa_attestation.attestation(code, set) {
    rpa_attestation.Attested(_, label) -> [
      #("rp_attested", json.string("attested")),
      #("rp_canonical_label", json.string(label)),
    ]
    rpa_attestation.NotAttested(_) -> [
      #("rp_attested", json.string("not_attested")),
      #("rp_canonical_label", json.null()),
    ]
    rpa_attestation.NoWarrantSet -> [
      #("rp_attested", json.string("no_warrant_set")),
      #("rp_canonical_label", json.null()),
    ]
    rpa_attestation.NotApplicable -> [
      #("rp_attested", json.string("not_applicable")),
      #("rp_canonical_label", json.null()),
    ]
  }
}

fn subcommodity_json(s: Supported(Subcommodity)) -> json.Json {
  let Subcommodity(code: code, literal: literal, percent: percent) = s.value
  json.object([
    #("code_raw", json.string(bit_array.base64_encode(code.value, True))),
    #("code_text", json.string(record_model.render(code.value))),
    #("literal_raw", json.string(bit_array.base64_encode(literal.value, True))),
    #("literal_text", json.string(record_model.render(literal.value))),
    #(
      "percent_raw",
      json.nullable(percent, fn(p: Supported(BitArray)) {
        json.string(bit_array.base64_encode(p.value, True))
      }),
    ),
    #(
      "percent_text",
      json.nullable(percent, fn(p: Supported(BitArray)) {
        json.string(record_model.render(p.value))
      }),
    ),
  ])
}

fn heading_json(s: Supported(record_model.Heading)) -> json.Json {
  let Heading(code: code, literal: literal) = s.value
  json.object([
    #("code_raw", json.string(bit_array.base64_encode(code.value, True))),
    #("code_text", json.string(record_model.render(code.value))),
    #("literal_raw", json.string(bit_array.base64_encode(literal.value, True))),
    #("literal_text", json.string(record_model.render(literal.value))),
  ])
}

// --- narratives -----------------------------------------------------------

fn narratives_fields(
  checked: construct.Checked(record_model.Narratives),
) -> List(#(String, json.Json)) {
  case checked {
    Ok(record_model.Narratives(
      objectives: objectives,
      approach: approach,
      descriptors: descriptors,
      progress: progress,
      publications: publications,
    )) ->
      list.flatten([
        bytes_field("objectives", objectives),
        bytes_field("approach", approach),
        bytes_field("descriptors", descriptors),
        bytes_field("progress", progress),
        bytes_field("publications", publications),
      ])
    Error(_) -> narratives_null_fields()
  }
}

fn narratives_null_fields() -> List(#(String, json.Json)) {
  list.flatten([
    bytes_field_null("objectives"),
    bytes_field_null("approach"),
    bytes_field_null("descriptors"),
    bytes_field_null("progress"),
    bytes_field_null("publications"),
  ])
}

fn bytes_field(
  name: String,
  opt: Option(Supported(BitArray)),
) -> List(#(String, json.Json)) {
  case opt {
    Some(s) -> [
      #(name <> "_raw", json.string(bit_array.base64_encode(s.value, True))),
      #(name <> "_text", json.string(record_model.render(s.value))),
    ]
    None -> bytes_field_null(name)
  }
}

fn bytes_field_null(name: String) -> List(#(String, json.Json)) {
  [#(name <> "_raw", json.null()), #(name <> "_text", json.null())]
}

// --- validation -------------------------------------------------------------

fn validation_fields(
  tier: tally.Tier,
  result: record_model.ConstructionResult,
) -> List(#(String, json.Json)) {
  [
    #(
      "validation",
      json.object([
        #("certified", json.bool(tally.is_certified(tier))),
        #("tier", json.string(tally.tier_name(tier))),
        #("assembly_error", json.null()),
        #("problems", problems_json(result)),
      ]),
    ),
  ]
}

fn problems_json(result: record_model.ConstructionResult) -> json.Json {
  case result {
    Ok(_) -> json.preprocessed_array([])
    Error(NonEmpty(first, rest)) ->
      json.preprocessed_array(list.map([first, ..rest], problem_json))
  }
}

fn problem_json(problem: record_model.ConstructionProblem) -> json.Json {
  let #(kind, tag, rule_doc, rule_page, method) = describe_problem(problem)
  json.object([
    #("kind", json.string(kind)),
    #("tag", json.nullable(tag, json.string)),
    #("rule_doc", json.nullable(rule_doc, json.string)),
    #("rule_page", json.nullable(rule_page, json.int)),
    #("method", json.nullable(method, json.string)),
  ])
}

// Models `report.describe_kind` (report.gleam:252-273) but covers the whole
// `ConstructionProblem`, not just its `Disagreement`-wrapped `DisagreementKind`
// case, and returns a structured tuple rather than only a sentence: `kind` is
// the human-readable one-line description (describe_kind's own text for a
// Disagreement; an equivalent one-liner, matching report.gleam's own inline
// rendering, for the other three ConstructionProblem variants), while `tag`/
// `rule_doc`/`rule_page`/`method` are pulled out as separate structured
// columns so an analyst can filter/group without re-parsing the sentence.
// This is a judgment call the plan left to the implementer ("Trevor fills the
// field lists"): the plan names only the five output columns, not this
// internal split.
fn describe_problem(
  problem: record_model.ConstructionProblem,
) -> #(String, Option(String), Option(String), Option(Int), Option(String)) {
  case problem {
    Disagreement(FormatDisagreement(kind, rule, _examined, method)) -> #(
      report.describe_kind(kind),
      tag_of_kind(kind),
      Some(rule.document),
      Some(rule.pdf_page),
      Some(method),
    )
    RuleUnresolved(tag, _, question) -> #(
      tag <> " rule unresolved: " <> question,
      Some(tag),
      None,
      None,
      None,
    )
    FieldNotYetModeled(tag, _) -> #(
      tag <> " not yet modeled",
      Some(tag),
      None,
      None,
      None,
    )
    TagNotAscii(tag, _) -> #(
      tag <> " tag is not ASCII",
      Some(tag),
      None,
      None,
      None,
    )
  }
}

// Per the spec: every DisagreementKind variant carries a usable tag EXCEPT
// InvalidAccession and RelatedFieldsDisagree (whose "tags" is a NonEmpty(String)
// plural, not one field tag). RpaCodeNotAttested has no `tag` field at all, but
// it can only ever originate from RP (tally.gleam's own bucket hardcodes
// "RP rpa-not-attested" the same way), so "RP" is used here, not fabricated.
fn tag_of_kind(kind: record_model.DisagreementKind) -> Option(String) {
  case kind {
    RequiredFieldNotLocated(tag) -> Some(tag)
    NonRepeatingFieldRepeated(tag, _) -> Some(tag)
    InvalidAccession(_) -> None
    InvalidFieldValue(tag, _) -> Some(tag)
    RepetitionLimitExceeded(tag, _, _) -> Some(tag)
    RelatedFieldsDisagree(_, _) -> None
    RpaCodeNotAttested(_, _) -> Some("RP")
  }
}
