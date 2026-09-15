//// Shared structural types for a supplied record's raw evidence: witnessed
//// bytes, their source location, and the fragments/occurrences/parts the
//// reading layer (`card_image`/`scan`/`assembly`/`field_value`/`segment`)
//// assembles them into. Owned by the reader, not the validator — the
//// validator (`construct`/`record_model`) depends on these types, never the
//// reverse, so the facade bundle can be reader-only. Moved verbatim from
//// `record_model.gleam` (Task 7 of
//// docs/superpowers/plans/2026-09-15-unify-gleam-reader-behind-facade.md).

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
