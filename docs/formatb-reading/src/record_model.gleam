//// Design model, not the parser API. Only accession.parse is implemented.
//// Opaque Project deliberately has no public construction path yet: the full
//// rule inventory and validator must exist before we can return Ok(Project).

import accession.{type Accession, type AccessionError}
import gleam/option.{type Option}

/// A list guaranteed to hold at least one element: `first` plus any `rest`.
pub type NonEmpty(a) {
  NonEmpty(first: a, rest: List(a))
}

/// Where a witness sits in the source. These evidence containers do not
/// certify offsets, lengths or provenance.
pub type Location {
  Location(file: String, first_line: Int, byte_offset: Int, byte_length: Int)
}

pub type Witness {
  Witness(location: Location, bytes: BitArray)
}

/// Interpretive classifications of the lines within a card image. A record is
/// an 80-column card image (PDF 367_1DP.pdf p. 2): a two-letter tag in columns
/// 1-2, a blank in column 3, the field value in columns 4-72, and columns
/// 73-80 ignored (supplier's own use); a line beginning "$$" separates records.
/// Turning a witness's raw bytes into a field's lexical value therefore means
/// taking columns 4-72 and dropping trailing blanks, never columns 73-80; that
/// extracted value is what `accession.parse` and the future section
/// constructors validate. That columns 4-72 extraction is implemented in
/// `card_image.gleam` (`data_value`); dropping only the ASCII-space pad, so a
/// stray non-space trailing byte survives for a later field check to reject.
/// `card_image.classify` reads columns 1-2 into a coarse LineKind (separator,
/// tagged, continuation), and `card_image.continuation_kind` reads a
/// continuation as Wrapped (this WrappedText) or Marked (this MarkedValueStart)
/// against the profile marker byte. `assembly.gleam` walks the classified lines
/// into these Fragments and the FieldOccurrences/SuppliedRecord that hold them,
/// each carrying a Witness/Location. Joining a field's fragments into one
/// lexical value is still separate and not yet implemented.
pub type Fragment {
  TaggedStart(witness: Witness)
  WrappedText(witness: Witness)
  MarkedValueStart(witness: Witness)
}

pub type FieldOccurrence {
  FieldOccurrence(tag: String, fragments: NonEmpty(Fragment))
}

pub type RecordPart {
  Field(field: FieldOccurrence)
  Unassigned(witness: Witness)
}

pub type SuppliedRecord {
  SuppliedRecord(witness: Witness, parts: List(RecordPart))
}

pub type Supported(a) {
  Supported(value: a, locations: NonEmpty(Location))
}

/// A field whose requiredness is not settled — asserted only on lower-grade
/// evidence such as a handwritten amendment. Unlike Option (a documented
/// permission to omit) and unlike a plain required field, this keeps the value
/// optional and names the unsettled basis, so a missing value is a provisional,
/// scoped situation to record, not a hard nonconformance.
pub type Provisional(a) {
  Provisional(value: Option(a), basis: RuleRef)
}

/// Which rule set applies. Rule selection is explicit, not inferred from the
/// date of a file name.
///   - Supplied: the Format B card image as the Cooperative State Research
///     Service prepared it for DIALOG (the bytes on the transfer tape and in
///     the served file), not "supplied to us by NARA".
///   - DialogLoaded: after DIALOG's load step, which generates UD (PDF p. 23).
pub type Stage {
  Supplied
  DialogLoaded
}

/// Evidence grade of a documentary rule. The printed dictionary rows are one
/// grade; a handwritten amendment on the page is a weaker, separate grade, so a
/// requirement resting only on handwriting is not treated as firmly as one from
/// the printed rows.
pub type EvidenceGrade {
  PrintedDictionary
  HandwrittenAmendment
}

pub type RuleRef {
  RuleRef(
    document: String,
    pdf_page: Int,
    element: String,
    assertion: String,
    interpretation: String,
    stage: Stage,
    evidence: EvidenceGrade,
  )
}

pub type DisagreementKind {
  RequiredFieldNotLocated(tag: String)
  NonRepeatingFieldRepeated(tag: String, occurrences: Int)
  InvalidAccession(reason: AccessionError)
  InvalidFieldValue(tag: String, reason: String)
  RepetitionLimitExceeded(tag: String, actual: Int, maximum: Int)
  RelatedFieldsDisagree(tags: NonEmpty(String), reason: String)
}

pub type FormatDisagreement {
  FormatDisagreement(
    kind: DisagreementKind,
    rule: RuleRef,
    // For a not-located claim, this is the complete searched record span.
    examined: NonEmpty(Location),
    method: String,
  )
}

/// A problem that blocks construction. A missing rule/interpretation is not
/// evidence of a nonconforming record; these variants must also prevent a
/// false claim of successful full validation.
pub type ConstructionProblem {
  Disagreement(detail: FormatDisagreement)
  RuleUnresolved(tag: String, examined: Location, question: String)
  FieldNotYetModeled(tag: String, examined: Location)
}

/// Result of the intended validator (not implemented):
/// construct(SuppliedRecord, selected_rules) -> ConstructionResult.
/// Accumulate independent problems; do not fabricate dependent validations.
pub type ConstructionResult =
  Result(Project, NonEmpty(ConstructionProblem))

/// A reading of one supplied record. Always retain the witness, on either
/// outcome. Missing-field statements are provisional reports about this
/// witness and this validation method only.
pub type Assessment {
  Assessment(source: SuppliedRecord, result: ConstructionResult)
}

// Required fields are not wrapped in Option. Where Option does appear below,
// it marks a field the specification allows to be omitted; it never marks a
// reading that failed. String constraints and cardinalities are still the
// future Project constructor's job; the section constructors do not enforce
// them.
pub type Identity {
  Identity(accession: Supported(Accession), project_number: Supported(String))
}

pub type Institution {
  Institution(
    agency: Option(Supported(String)),
    division_station: Option(Supported(String)),
    institution_code: Option(Supported(String)),
    institution_name: Supported(String),
    city: Supported(String),
    state_country: Supported(String),
    zip: Option(Supported(String)),
    region: Option(Supported(String)),
    organization_code: Option(Supported(String)),
    organization_names: List(Supported(String)),
  )
}

pub type Participants {
  Participants(
    institution: Institution,
    // PDF p. 16: always present, up to six, first is sort value.
    // NonEmpty enforces the lower bound, not the upper bound.
    investigators: NonEmpty(Supported(String)),
  )
}

/// A searchable/display date pair. Both forms are independently optional in
/// the dictionary's rows: do not assert co-presence, agreement, or a century
/// rule without documentary support.
pub type PairedDate {
  PairedDate(
    search_form: Option(Supported(String)),
    display_form: Option(Supported(String)),
  )
}

pub type Chronology {
  Chronology(
    process_date: Option(Supported(String)),
    start: PairedDate,
    termination: PairedDate,
    fiscal_year: Option(Supported(String)),
    progress_updated: Option(Supported(String)),
    progress_period_end: Option(Supported(String)),
    progress_period_display: Option(Supported(String)),
  )
}

/// Seven ordered classification columns. Keep positions and duplicates.
/// Whether the columns form aligned allocation tuples remains a
/// source-reading question, not an enforced rule.
pub type ClassificationColumns {
  ClassificationColumns(
    activity: List(Supported(String)),
    commodity: List(Supported(String)),
    science: List(Supported(String)),
    problem: List(Supported(String)),
    product_percent: List(Supported(String)),
    program_area: List(Supported(String)),
    joint_council: List(Supported(String)),
  )
}

pub type Heading {
  Heading(code: Supported(String), literal: Supported(String))
}

pub type Classifications {
  Classifications(
    basic: Option(Supported(String)),
    applied: Option(Supported(String)),
    developmental: Option(Supported(String)),
    columns: ClassificationColumns,
    subcommodities: List(Supported(Heading)),
    subcommodity_percentages: List(Supported(String)),
    primary_headings: List(Supported(Heading)),
    general_headings: List(Supported(Heading)),
  )
}

pub type Narratives {
  Narratives(
    objectives: Option(Supported(String)),
    approach: Option(Supported(String)),
    descriptors: Option(Supported(String)),
    progress: Option(Supported(String)),
    publications: Option(Supported(String)),
  )
}

/// Proposed prescribed project for the supplied stage. There is no `remaining`
/// escape hatch: unmodeled material must be addressed before construction.
/// These groupings are ours, not literal sections of the source format.
pub opaque type Project {
  Project(
    rules: NonEmpty(RuleRef),
    identity: Identity,
    title: Supported(String),
    // PS (project status): its requiredness rests only on a handwritten
    // amendment (EvidenceGrade HandwrittenAmendment), so it is modelled as
    // Provisional rather than asserted as a plain required field.
    status: Provisional(Supported(String)),
    project_type: Option(Supported(String)),
    participants: Participants,
    chronology: Chronology,
    classifications: Classifications,
    narratives: Narratives,
    subfiles: NonEmpty(Supported(String)),
  )
}

/// Loading is a distinct assertion, not a mandatory UD in the supplied bytes.
/// No public construction path until the loading rules are specified.
pub opaque type LoadedRecord {
  LoadedRecord(supplied: Project, dialog_update: Supported(String))
}
