//// Read a whole file's bytes into records and render each record's checked
//// Identity, Participants, Chronology, Classifications, Narratives, and
//// top-level Project (or their typed construction problems), with a summary.
//// This is the runnable surface over real NARA data: scan -> assemble ->
//// construct. It reports only what the model actually checks; unmodeled
//// fields are not dumped, and a failed construction is shown as problems,
//// never repaired.

import accession
import assembly
import card_image
import construct
import gleam/int
import gleam/list
import gleam/option
import gleam/string
import record_model.{
  type ConstructionProblem, type DisagreementKind, type Supported, Disagreement,
  FieldNotYetModeled, FormatDisagreement, Identity, InvalidAccession,
  InvalidFieldValue, NonEmpty, NonRepeatingFieldRepeated, Participants,
  RelatedFieldsDisagree, RepetitionLimitExceeded, RequiredFieldNotLocated,
  RuleUnresolved, Supported,
}
import scan

/// Render up to `max_records` records from `bytes`, plus a summary over all
/// records scanned. `marker` is the profile continuation byte — 0xAC per
/// registry/evidence.json (`formatb.encoding.continuation_0xAC`), applying to
/// both the FY88 corpus verified here and FY94; it does not affect the AN/PN
/// identity slice, which has no continuations.
pub fn report(
  bytes: BitArray,
  file: String,
  base_line: Int,
  marker: Int,
  max_records: Int,
) -> Result(String, card_image.CardImageError) {
  case scan.scan(bytes, file, base_line) {
    Error(reason) -> Error(reason)
    Ok(scan.ScanResult(records, _structure)) -> {
      let outcomes = list.map(records, evaluate(_, marker))
      let total = list.length(records)
      let valid = list.count(outcomes, fn(outcome) { outcome.1 })
      let shown =
        outcomes
        |> list.take(max_records)
        |> list.map(fn(outcome) { outcome.0 })
      let summary =
        int.to_string(total)
        <> " records scanned; "
        <> int.to_string(valid)
        <> " with a checked Identity; "
        <> int.to_string(total - valid)
        <> " with problems."
      Ok(string.join(list.append(shown, [summary]), "\n\n"))
    }
  }
}

// One record's rendered text and whether its Identity was constructed.
fn evaluate(record: scan.ScannedRecord, marker: Int) -> #(String, Bool) {
  let scan.ScannedRecord(base, bytes) = record
  let where = "record @ line " <> int.to_string(base.first_line)
  case assembly.assemble(bytes, base, marker) {
    Error(problem) -> #(
      where <> ": [unreadable] " <> assembly_error(problem),
      False,
    )
    Ok(supplied) -> {
      let #(id_text, valid) = identity_line(supplied, where)
      #(
        id_text
          <> "\n"
          <> participants_line(supplied)
          <> "\n"
          <> chronology_line(supplied)
          <> "\n"
          <> classifications_line(supplied)
          <> "\n"
          <> narratives_line(supplied)
          <> "\n"
          <> project_line(supplied),
        valid,
      )
    }
  }
}

fn identity_line(
  supplied: record_model.SuppliedRecord,
  where: String,
) -> #(String, Bool) {
  case construct.identity(supplied) {
    Ok(Identity(Supported(acc, _), Supported(pn, _))) -> #(
      where <> ": identity OK — AN=" <> accession.to_string(acc) <> " PN=" <> pn,
      True,
    )
    Error(NonEmpty(first, rest)) -> #(
      where
        <> ": "
        <> int.to_string(list.length([first, ..rest]))
        <> " identity problem(s)\n"
        <> problem_lines([first, ..rest]),
      False,
    )
  }
}

fn participants_line(supplied: record_model.SuppliedRecord) -> String {
  case construct.participants(supplied) {
    Ok(Participants(institution, investigators)) ->
      "  participants OK — institution="
      <> institution.institution_name.value
      <> ", investigators="
      <> int.to_string(1 + list.length(investigators.rest))
    Error(NonEmpty(first, rest)) ->
      "  participants: "
      <> int.to_string(list.length([first, ..rest]))
      <> " problem(s)\n"
      <> problem_lines([first, ..rest])
  }
}

fn chronology_line(supplied: record_model.SuppliedRecord) -> String {
  case construct.chronology(supplied) {
    Ok(chron) -> "  chronology OK — FY=" <> optional_value(chron.fiscal_year)
    Error(NonEmpty(first, rest)) ->
      "  chronology: "
      <> int.to_string(list.length([first, ..rest]))
      <> " problem(s)"
  }
}

fn classifications_line(supplied: record_model.SuppliedRecord) -> String {
  case construct.classifications(supplied) {
    Ok(c) ->
      "  classifications OK — "
      <> int.to_string(column_code_count(c.columns))
      <> " column code(s), "
      <> int.to_string(list.length(c.subcommodities))
      <> " SC, "
      <> int.to_string(list.length(c.primary_headings))
      <> " PH, "
      <> int.to_string(list.length(c.general_headings))
      <> " GH"
    Error(NonEmpty(first, rest)) ->
      "  classifications: "
      <> int.to_string(list.length([first, ..rest]))
      <> " problem(s)\n"
      <> problem_lines([first, ..rest])
  }
}

// Total codes across the seven independent classification columns (they are not
// aligned tuples; a plain sum is the honest count of codes present).
fn column_code_count(columns: record_model.ClassificationColumns) -> Int {
  list.length(columns.activity)
  + list.length(columns.commodity)
  + list.length(columns.science)
  + list.length(columns.problem)
  + list.length(columns.product_percent)
  + list.length(columns.program_area)
  + list.length(columns.joint_council)
}

// Narratives are potentially long free text (OB/AP/PR/PB up to 3200 bytes,
// DE up to 2400), so the report shows presence per field, not the text
// itself — the same concise-summary shape as `classifications_line`'s
// counts, not a raw dump.
fn narratives_line(supplied: record_model.SuppliedRecord) -> String {
  case construct.narratives(supplied) {
    Ok(n) ->
      "  narratives OK — OB="
      <> presence(n.objectives)
      <> " AP="
      <> presence(n.approach)
      <> " DE="
      <> presence(n.descriptors)
      <> " PR="
      <> presence(n.progress)
      <> " PB="
      <> presence(n.publications)
    Error(NonEmpty(first, rest)) ->
      "  narratives: "
      <> int.to_string(list.length([first, ..rest]))
      <> " problem(s)\n"
      <> problem_lines([first, ..rest])
  }
}

fn presence(field: option.Option(Supported(String))) -> String {
  case field {
    option.Some(_) -> "Y"
    option.None -> "N"
  }
}

// The top-level project result: every group and field the model currently
// checks, composed and re-checked as a whole. Renders only the title (the
// one field guaranteed short and meant for display) rather than dumping the
// whole opaque `Project`.
fn project_line(supplied: record_model.SuppliedRecord) -> String {
  case construct.project(supplied) {
    Ok(project) ->
      "  project OK — title=\""
      <> record_model.project_title(project).value
      <> "\""
    Error(NonEmpty(first, rest)) ->
      "  project: "
      <> int.to_string(list.length([first, ..rest]))
      <> " problem(s)\n"
      <> problem_lines([first, ..rest])
  }
}

fn optional_value(field: option.Option(Supported(String))) -> String {
  case field {
    option.Some(Supported(value, _)) -> value
    option.None -> "-"
  }
}

fn problem_lines(problems: List(ConstructionProblem)) -> String {
  problems
  |> list.map(fn(problem) { "    - " <> describe(problem) })
  |> string.join("\n")
}

fn describe(problem: ConstructionProblem) -> String {
  case problem {
    Disagreement(FormatDisagreement(kind, _, _, _)) -> describe_kind(kind)
    RuleUnresolved(tag, _, question) -> tag <> " rule unresolved: " <> question
    FieldNotYetModeled(tag, _) -> tag <> " not yet modeled"
  }
}

fn describe_kind(kind: DisagreementKind) -> String {
  case kind {
    RequiredFieldNotLocated(tag) -> tag <> " required field not located"
    NonRepeatingFieldRepeated(tag, occurrences) ->
      tag
      <> " is non-repeating but appears "
      <> int.to_string(occurrences)
      <> " times"
    InvalidAccession(reason) -> "AN invalid: " <> accession_error(reason)
    InvalidFieldValue(tag, reason) -> tag <> " invalid: " <> reason
    RepetitionLimitExceeded(tag, actual, maximum) ->
      tag
      <> " appears "
      <> int.to_string(actual)
      <> " times, over the maximum "
      <> int.to_string(maximum)
    RelatedFieldsDisagree(_tags, reason) ->
      "related fields disagree: " <> reason
  }
}

fn accession_error(reason: accession.AccessionError) -> String {
  case reason {
    accession.WrongByteLength(actual) ->
      "wrong byte length " <> int.to_string(actual) <> " (need 7)"
    accession.NonAsciiDigit -> "a byte is not an ASCII digit"
  }
}

fn assembly_error(problem: assembly.AssemblyError) -> String {
  case problem {
    assembly.LineUnreadable(_) -> "a card line was not readable"
    assembly.TagNotAscii(_) -> "a field tag was not ASCII"
  }
}
