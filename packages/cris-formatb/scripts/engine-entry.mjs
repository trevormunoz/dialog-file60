// The single ESM entry esbuild bundles into dist/engine.mjs (Task 12).
//
// javascript.gleam (compiled to javascript.mjs) re-exports the two
// array-returning traversal functions — scan_records/parse_record — plus the
// List->Array helpers. But the $-API accessor and constructor functions
// wrapper.ts marshals field-by-field still live on facade.mjs (Gleam's
// auto-generated accessors for facade.gleam's types), and two small pieces
// come from gleam_stdlib's Option module and the shared prelude's BitArray
// constructor. javascript.gleam deliberately stays thin (Task 10) and does
// not re-export any of these itself, so this entry gathers exactly the
// surface wrapper.ts uses from all four generated modules under one path,
// so esbuild --bundle produces a single self-contained artifact.
//
// Keep this list in lockstep with engine-entry.d.mts and with wrapper.ts's
// import list.
export {
  scan_records,
  parse_record,
  spans_array,
  record_fields_array,
  field_values_array,
} from "../build/dev/javascript/cris_formatb/javascript.mjs";

export {
  RecordSpan$RecordSpan,
  RecordSpan$RecordSpan$first_line,
  RecordSpan$RecordSpan$last_line,
  RecordSpan$RecordSpan$offset,
  RecordSpan$RecordSpan$length,
  RecordSpan$RecordSpan$an,
  ScanResult$ScanResult$structure,
  ScanResult$ScanResult$bad_lines,
  FileStructure$FileStructure$header,
  FileStructure$FileStructure$trailer,
  Profile$Fy1988,
  Profile$Fy1991plus,
  SourceValue$SourceValue$raw,
  SourceValue$SourceValue$code,
  SourceValue$SourceValue$label,
  SourceValue$SourceValue$percent,
  SourceValue$SourceValue$line,
  SourceValue$SourceValue$offset,
  SourceValue$SourceValue$continuation,
  SourceField$SourceField$tag,
  SourceField$SourceField$line_start,
  SourceField$SourceField$line_end,
  SourceField$SourceField$offset,
  SourceField$SourceField$length,
  LogicalRecord$LogicalRecord$file,
  LogicalRecord$LogicalRecord$first_line,
  LogicalRecord$LogicalRecord$last_line,
  LogicalRecord$LogicalRecord$offset,
  LogicalRecord$LogicalRecord$length,
  LogicalRecord$LogicalRecord$an,
  LogicalRecord$LogicalRecord$orphan_continuations,
} from "../build/dev/javascript/cris_formatb/facade.mjs";

export {
  Option$isSome,
  Option$Some$0,
} from "../build/dev/javascript/gleam_stdlib/gleam/option.mjs";

export { BitArray$BitArray } from "../build/dev/javascript/prelude.mjs";
