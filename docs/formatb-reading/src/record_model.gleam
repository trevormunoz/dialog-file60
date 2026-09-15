//// Design model, not the parser API. The reading layer and accession.parse
//// are implemented; complete Project construction remains gated on rules.
//// Opaque Project has a public construction path, `build_project`, used only
//// by `construct.project` once every group/field has been checked — it does
//// not itself check anything, so callers outside `construct` should not use
//// it to bypass the rule inventory.

import accession.{type Accession, type AccessionError}
import gleam/list
import gleam/option.{type Option}
import gleam/string

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
/// each carrying a Witness/Location. `field_value.field_values` separately
/// joins these fragments into ordered lexical byte values.
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

/// Payload-provenance rule: OB, AP, DE, PR, PB (Narratives) and IN
/// (Participants' investigators) are `Supported(BitArray)`, not
/// `Supported(String)`. A whole-corpus FY88 UTF-8 census (32,016 records)
/// found non-UTF-8 bytes confined to exactly these six free-text/name
/// fields — AP 1.8% (584), PR 0.7% (221), OB 0.4% (127), PB 0.3% (68), DE
/// 0.03% (8), IN 0.002% (1) — scattered high bytes (0xa3, 0xa5, 0xa7, 0xfe,
/// 0xdd, …) that are the fingerprint of EBCDIC-to-ASCII conversion artifacts
/// on extended characters, not noise: evidence to preserve. Every other
/// field stays `String`, a true "this decodes as text" assertion. Use
/// `render` below to display a BitArray payload; it is lossy and does not
/// undo the decode question the bytes still pose (see
/// registry/evidence.json).
///
/// A lossy Latin-1 display render of a byte-preserving field's payload: each
/// byte 0..255 maps to its Latin-1 code point (matching the TS parser's
/// `latin1` and the inspect panel), so this never fails on non-UTF-8 bytes.
/// This is display-only, deliberately not a faithful decode — the bytes'
/// actual code page is unknown (see registry/evidence.json); `render` just
/// gives every byte a visible glyph rather than asserting what it means.
pub fn render(bytes: BitArray) -> String {
  bytes
  |> bit_array_to_latin1_codepoints
  |> string.from_utf_codepoints
}

fn bit_array_to_latin1_codepoints(bytes: BitArray) -> List(UtfCodepoint) {
  case bytes {
    <<byte, rest:bytes>> -> {
      let assert Ok(codepoint) = string.utf_codepoint(byte)
        as "every byte 0..255 is a valid Latin-1/Unicode code point"
      [codepoint, ..bit_array_to_latin1_codepoints(rest)]
    }
    _ -> []
  }
}

/// A field whose requiredness is not settled — asserted only on lower-grade
/// evidence such as a handwritten amendment. Unlike Option (a documented
/// permission to omit) and unlike a plain required field, this keeps the value
/// optional and names the unsettled basis, so a missing value is a provisional,
/// scoped situation to record, not a hard nonconformance.
pub type Provisional(a) {
  Provisional(value: Option(a), basis: RuleRef)
}

/// A field the SOURCE ITSELF declares undocumented. The validation-report
/// addendum (367_1DP.pdf p.28-29) names SN and BP as fields that "appear in the
/// data but are not included in the Data Element Descriptions". BP had a clear
/// shape (exact-12 `YYMM TO YYMM`) and a stated meaning, so it was modelled as a
/// checked field. SN ("a percentage tied to the preceding SC") has no checkable
/// rule, and the inventory's standing instruction is not to infer one from the
/// data. So an SN occurrence is neither a divergence nor a `FieldNotYetModeled`
/// backlog item (that grade is for fields WE have not modelled yet, e.g. HP,
/// which does have a — handwritten — dictionary row). It is recorded here as a
/// **preserved, unvalidated presence**: the raw bytes are kept (never decoded or
/// length-checked, evidence grade `ValidationAddendum`) with their witness, so a
/// record carrying only such fields still certifies while the presence is never
/// hidden. `value` is `BitArray` for the same byte-preservation reason as the
/// prose payloads; use `render` to display it.
pub type UndocumentedField {
  UndocumentedField(tag: String, value: BitArray, locations: NonEmpty(Location))
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
/// the printed rows. `ValidationAddendum` is a third, distinct grade: a field
/// that has NO dictionary row at all but is described in the validation report's
/// addendum (PDF p.28-29: "appear in the data but are not included in the Data
/// Element Descriptions") — SN and BP. Its identity comes from that note (and,
/// for BP, an agency phone note, Aug 26 1992); its shape rule rests on observed
/// data plus any printed precedent, never on a dictionary row for the field
/// itself. Weaker than a printed row, and not to be mistaken for one.
pub type EvidenceGrade {
  PrintedDictionary
  HandwrittenAmendment
  ValidationAddendum
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
    // RG (element 16): the 2-letter regional abbreviation. Distinct from
    // `region`/RE (element 11, a numeric region code, Exact 1) above — RG and
    // RE are two separate documented fields, not two readings of one field.
    region_abbreviation: Option(Supported(String)),
    organization_code: Option(Supported(String)),
    organization_names: List(Supported(String)),
    // CG (element 14): contract/grant/agreement number.
    contract_grant: Option(Supported(String)),
    // RN (element 17): "the second part of a two-part designation" per the
    // dictionary's own Remarks — modeled independently of RG, not as an
    // asserted pairing (the source only hints at it).
    regional_project_number: Option(Supported(String)),
  )
}

pub type Participants {
  Participants(
    institution: Institution,
    // PDF p. 16: always present, up to six, first is sort value. IN is
    // byte-preserving (payload-provenance rule near `Supported`, above) —
    // Supported(BitArray), not Supported(String). NonEmpty enforces the
    // lower bound, not the upper bound.
    investigators: NonEmpty(Supported(BitArray)),
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
    // GY (element 28): grant year — FY's exact twin (same printed Exact-2
    // widened by hand to Exact-4 dual-length rule); see `fiscal_year`/`gy_rule`.
    grant_year: Option(Supported(String)),
    progress_updated: Option(Supported(String)),
    progress_period_end: Option(Supported(String)),
    progress_period_display: Option(Supported(String)),
    // BP: "Progress report period covered" — an FY94/RG164 field with no printed
    // dictionary row (EvidenceGrade ValidationAddendum), absent in FY88. Same
    // exact-12 "YYMM TO YYMM" shape as PX, but a distinct field that co-occurs
    // with it. Optional, like every chronology field but FY.
    progress_report_period: Option(Supported(String)),
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

/// One classification allocation line: the position-aligned tuple across the
/// seven columns, with CT as the line's `percent` (field order RP, AC, CM, FS,
/// CT, PA, JC — the PC-heading order). This is a DERIVED VIEW, produced by
/// `classification_rows`, never a stored or certified structure: the source
/// documents only "columnar display", so the one-to-one alignment is a
/// census-observed regularity (equal counts in 100% of FY88/FY89/FY94 records —
/// rules/field-rule-inventory.md classification census 2026-09-14), NOT a
/// documented rule. The stored `ClassificationColumns` (seven independent lists)
/// remains the source-faithful representation.
pub type ClassificationRow {
  ClassificationRow(
    problem: Supported(String),
    activity: Supported(String),
    commodity: Supported(String),
    science: Supported(String),
    percent: Supported(String),
    program_area: Supported(String),
    joint_council: Supported(String),
  )
}

/// Project the seven classification columns into position-aligned rows: value i
/// of every column forms row i. Returns `Error(Nil)` when the columns are not all
/// the same length — i.e. the undocumented alignment does not hold for this
/// record — rather than silently truncating or padding. This OFFERS the observed
/// alignment to a caller that wants rows; it makes no claim the alignment always
/// holds, and it enforces nothing at construction. See `ClassificationRow`.
pub fn classification_rows(
  columns: ClassificationColumns,
) -> Result(List(ClassificationRow), Nil) {
  let ClassificationColumns(
    activity:,
    commodity:,
    science:,
    problem:,
    product_percent:,
    program_area:,
    joint_council:,
  ) = columns
  let n = list.length(problem)
  case
    list.length(activity) == n
    && list.length(commodity) == n
    && list.length(science) == n
    && list.length(product_percent) == n
    && list.length(program_area) == n
    && list.length(joint_council) == n
  {
    True ->
      Ok(zip_classification_rows(
        problem,
        activity,
        commodity,
        science,
        product_percent,
        program_area,
        joint_council,
      ))
    False -> Error(Nil)
  }
}

// Zip seven equal-length classification columns into rows. Called only after
// `classification_rows` has verified the lengths match, so every column steps in
// lock-step; the base case is reached with all seven simultaneously empty.
fn zip_classification_rows(
  problem: List(Supported(String)),
  activity: List(Supported(String)),
  commodity: List(Supported(String)),
  science: List(Supported(String)),
  percent: List(Supported(String)),
  program_area: List(Supported(String)),
  joint_council: List(Supported(String)),
) -> List(ClassificationRow) {
  case
    problem,
    activity,
    commodity,
    science,
    percent,
    program_area,
    joint_council
  {
    [rp, ..rp_rest],
      [ac, ..ac_rest],
      [cm, ..cm_rest],
      [fs, ..fs_rest],
      [ct, ..ct_rest],
      [pa, ..pa_rest],
      [jc, ..jc_rest]
    -> [
      ClassificationRow(rp, ac, cm, fs, ct, pa, jc),
      ..zip_classification_rows(
        rp_rest,
        ac_rest,
        cm_rest,
        fs_rest,
        ct_rest,
        pa_rest,
        jc_rest,
      )
    ]
    _, _, _, _, _, _, _ -> []
  }
}

/// A classification heading value (PH, GH): a fixed-width code and a literal,
/// separated in the supplied bytes by a byte sequence the printed footnote and
/// the FY88 data disagree on (footnote HEX40 HEX41 HEX02; FY88 0xA0 0x02 — see
/// rules/field-rule-inventory.md batch 3). TWO parts, no percent (verified: PH/
/// GH values never carry a trailing percent in FY88). The value is NOT valid
/// UTF-8 (the lone high byte 0xA0), and code/literal are carved out of that
/// byte structure, so they are kept as BitArray with their provenance rather
/// than cast to String; decoding to text happens only at a display edge.
pub type Heading {
  Heading(code: Supported(BitArray), literal: Supported(BitArray))
}

/// A subcommodity allocation value (SC): code + literal + an OPTIONAL percent,
/// the parts separated by 0xA0 0x02 in the supplied bytes. FY88/RG310 values are
/// three-part and always carry a percent (6487/6487); FY94/RG164 values are
/// two-part and never do (the FY94 generalization finding — see
/// rules/field-rule-inventory.md). So the percent is `Option`: a two-part value
/// is an omission (`None`), a three-part value carries `Some(percent)`, and a
/// one-part (or 4+-part) value is still a divergence. SC stays a distinct type
/// from Heading — a Heading is always two-part and a percent on one is a
/// divergence, whereas SC permits both shapes. All parts are carved from the
/// same non-UTF-8 byte structure, so all are kept as BitArray (see Heading).
pub type Subcommodity {
  Subcommodity(
    code: Supported(BitArray),
    literal: Supported(BitArray),
    percent: Option(Supported(BitArray)),
  )
}

pub type Classifications {
  Classifications(
    basic: Option(Supported(String)),
    applied: Option(Supported(String)),
    developmental: Option(Supported(String)),
    columns: ClassificationColumns,
    subcommodities: List(Supported(Subcommodity)),
    // SN: source-undocumented (see UndocumentedField), and an ORDERED PARALLEL
    // field to `subcommodities` — element i is the percentage for subcommodity i
    // (agency note, Aug 26 1992: "SN = percentage that refers to the previous SC").
    // Preserved, unvalidated values; empty when the record carries no SN (FY88,
    // where the percentage is inline in a three-part SC instead). When non-empty,
    // the constructor enforces len == len(subcommodities) (the documented bond);
    // the values themselves are kept unchecked.
    subcommodity_percentages: List(UndocumentedField),
    primary_headings: List(Supported(Heading)),
    general_headings: List(Supported(Heading)),
  )
}

// OB/AP/DE/PR/PB are byte-preserving (payload-provenance rule near
// `Supported`, above) — Supported(BitArray), not Supported(String). Use
// `render` to display a value.
pub type Narratives {
  Narratives(
    objectives: Option(Supported(BitArray)),
    approach: Option(Supported(BitArray)),
    descriptors: Option(Supported(BitArray)),
    progress: Option(Supported(BitArray)),
    publications: Option(Supported(BitArray)),
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

/// Smart constructor for the opaque `Project`. Performs no checking itself —
/// it exists so `construct.project` can assemble a `Project` only after every
/// field/group has been independently checked and found problem-free; the
/// checking discipline lives in `construct`, not here.
pub fn build_project(
  rules rules: NonEmpty(RuleRef),
  identity identity: Identity,
  title title: Supported(String),
  status status: Provisional(Supported(String)),
  project_type project_type: Option(Supported(String)),
  participants participants: Participants,
  chronology chronology: Chronology,
  classifications classifications: Classifications,
  narratives narratives: Narratives,
  subfiles subfiles: NonEmpty(Supported(String)),
) -> Project {
  Project(
    rules: rules,
    identity: identity,
    title: title,
    status: status,
    project_type: project_type,
    participants: participants,
    chronology: chronology,
    classifications: classifications,
    narratives: narratives,
    subfiles: subfiles,
  )
}

/// The title (TI), for callers (tests, `report.gleam`) that only need to read
/// back one field of an already-constructed `Project`.
pub fn project_title(project: Project) -> Supported(String) {
  project.title
}

/// The subfile codes (SF).
pub fn project_subfiles(project: Project) -> NonEmpty(Supported(String)) {
  project.subfiles
}

/// The narratives group (OB/AP/DE/PR/PB), for report rendering.
pub fn project_narratives(project: Project) -> Narratives {
  project.narratives
}

/// The source-undocumented fields the record carries (currently only SN; see
/// UndocumentedField). Empty for a record that carries none. A caller (tally,
/// report) uses non-emptiness to tell a fully-clean certified record apart from
/// one that certifies while carrying an unvalidatable, source-undocumented field
/// — the presence is surfaced, never hidden.
pub fn project_undocumented_fields(
  project: Project,
) -> List(UndocumentedField) {
  project.classifications.subcommodity_percentages
}
