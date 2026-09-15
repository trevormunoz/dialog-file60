// Type companion to engine-entry.mjs (Task 12). Kept in lockstep by hand;
// rollup-plugin-dts bundles this into dist/engine.d.mts. See engine-entry.mjs
// for why the surface spans javascript.d.mts, facade.d.mts, the
// gleam_stdlib Option module, and prelude.d.mts's BitArray constructor.
export type {
  RecordSpan$,
  SourceValue$,
  SourceField$,
  LogicalRecord$,
} from "../build/dev/javascript/cris_formatb/facade.d.mts";

export {
  scan_records,
  parse_record,
  spans_array,
  record_fields_array,
  field_values_array,
} from "../build/dev/javascript/cris_formatb/javascript.d.mts";

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
} from "../build/dev/javascript/cris_formatb/facade.d.mts";

export {
  Option$isSome,
  Option$Some$0,
} from "../build/dev/javascript/gleam_stdlib/gleam/option.d.mts";

export { BitArray$BitArray } from "../build/dev/javascript/prelude.d.mts";
