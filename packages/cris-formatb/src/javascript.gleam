//// The JS marshalling boundary behind the facade bundle: thin List->Array
//// conversions (`gleam/javascript/array.from_list`) for the frozen
//// contract's three nested-list fields (`ScanResult.spans`,
//// `LogicalRecord.fields`, `SourceField.values`), plus straight re-exports
//// of `facade.scan_records`/`parse_record`. No reading logic lives here —
//// see `facade.gleam` for the projection itself, and
//// docs/gleam-spike/gleam_scan/src/gleam_scan.gleam for the reference
//// pattern this follows (`spans_array`/`record_fields_array`/
//// `field_values_array`). Compiled with `typescript_declarations = true`
//// (gleam.toml `[javascript]`), so `wrapper.ts` (Task 11) reaches every
//// value through the generated `$`-API, never the raw runtime
//// representation.

import facade
import gleam/javascript/array.{type Array}

pub fn scan_records(bytes: BitArray, base_line: Int) -> facade.ScanResult {
  facade.scan_records(bytes, base_line)
}

pub fn parse_record(
  bytes: BitArray,
  span: facade.RecordSpan,
  file: String,
  profile: facade.Profile,
  buffer_base_line: Int,
) -> facade.LogicalRecord {
  facade.parse_record(bytes, span, file, profile, buffer_base_line)
}

/// A scan's record spans as a JS array — `ScanResult.spans` is otherwise a
/// Gleam `List`, unreachable from TS without walking the prelude directly.
pub fn spans_array(result: facade.ScanResult) -> Array(facade.RecordSpan) {
  array.from_list(result.spans)
}

/// A parsed record's fields as a JS array (`LogicalRecord.fields`).
pub fn record_fields_array(
  record: facade.LogicalRecord,
) -> Array(facade.SourceField) {
  array.from_list(record.fields)
}

/// A field's values as a JS array (`SourceField.values`).
pub fn field_values_array(
  field: facade.SourceField,
) -> Array(facade.SourceValue) {
  array.from_list(field.values)
}
