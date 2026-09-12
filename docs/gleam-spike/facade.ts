// The permanent TS facade, idiomatic form (Gleam >= 1.13 `$`-API + generated
// .d.mts). Gleam is the engine, imported internally and fully typed; consumers
// never see Gleam types. No `@ts-expect-error`, no access to the internal
// runtime representation — every read goes through the formalised `$`-API, which
// Gleam's own declarations bless (and mark the raw fields `@deprecated`).
import { BitArray$BitArray } from "./gleam_scan/build/dev/javascript/prelude.mjs";
import {
  type RecordSpan$ as GleamSpan,
  scan_records,
  spans_array,
  RecordSpan$RecordSpan$first_line as spanFirstLine,
  RecordSpan$RecordSpan$last_line as spanLastLine,
  RecordSpan$RecordSpan$offset as spanOffset,
  RecordSpan$RecordSpan$length as spanLength,
  RecordSpan$RecordSpan$an as spanAn,
  ScanResult$ScanResult$structure as resultStructure,
  ScanResult$ScanResult$bad_lines as resultBadLines,
  FileStructure$FileStructure$header as structureHeader,
  FileStructure$FileStructure$trailer as structureTrailer,
} from "./gleam_scan/build/dev/javascript/gleam_scan/gleam_scan.mjs";
import {
  type SourceValue$ as GleamValue,
  type SourceField$ as GleamField,
  type LogicalRecord$ as GleamRecord,
  parse_record,
  record_fields_array,
  field_values_array,
  RecordSpan$RecordSpan as makeSpan,
  Profile$Fy1988 as profileFy1988,
  Profile$Fy1991plus as profileFy1991plus,
  SourceValue$SourceValue$raw as valRaw,
  SourceValue$SourceValue$code as valCode,
  SourceValue$SourceValue$label as valLabel,
  SourceValue$SourceValue$percent as valPercent,
  SourceValue$SourceValue$line as valLine,
  SourceValue$SourceValue$offset as valOffset,
  SourceValue$SourceValue$continuation as valContinuation,
  SourceField$SourceField$tag as fieldTag,
  SourceField$SourceField$line_start as fieldLineStart,
  SourceField$SourceField$line_end as fieldLineEnd,
  SourceField$SourceField$offset as fieldOffset,
  SourceField$SourceField$length as fieldLength,
  LogicalRecord$LogicalRecord$file as recFile,
  LogicalRecord$LogicalRecord$first_line as recFirstLine,
  LogicalRecord$LogicalRecord$last_line as recLastLine,
  LogicalRecord$LogicalRecord$offset as recOffset,
  LogicalRecord$LogicalRecord$length as recLength,
  LogicalRecord$LogicalRecord$an as recAn,
  LogicalRecord$LogicalRecord$orphan_continuations as recOrphan,
} from "./gleam_scan/build/dev/javascript/gleam_scan/gleam_scan.mjs";
import {
  Option$isSome,
  Option$Some$0,
} from "./gleam_scan/build/dev/javascript/gleam_stdlib/gleam/option.mjs";

// Public types — the frozen contract, identical to packages/cris-formatb/src/offsets.ts.
export interface RecordSpan {
  firstLine: number;
  lastLine: number;
  offset: number;
  length: number;
  an: string;
}
export interface FileStructure {
  header?: string;
  trailer?: string;
}
export interface ScanResult {
  spans: RecordSpan[];
  structure: FileStructure;
  badLines: number;
}
export interface SourceValue {
  raw: string;
  code?: string;
  label?: string;
  percent?: string;
  line: number;
  offset: number;
  continuation?: true;
}
export interface SourceField {
  tag: string;
  values: SourceValue[];
  lineStart: number;
  lineEnd: number;
  offset: number;
  length: number;
}
export interface LogicalRecord {
  file: string;
  firstLine: number;
  lastLine: number;
  offset: number;
  length: number;
  an: string;
  fields: SourceField[];
  orphanContinuations: number;
}
export type Profile = "fy1988" | "fy1991plus";

const optString = (o: unknown): string | undefined =>
  Option$isSome(o) ? (Option$Some$0(o) as string) : undefined;

const LINE_BYTES = 82;

export function scanRecords(bytes: Uint8Array, baseLine = 1): ScanResult {
  // Parity with offsets.ts:36 — reject a non-whole-line buffer at the boundary,
  // so the Gleam scanner only ever sees complete 82-byte lines. (The idiomatic
  // rewrite models this as a diagnostic rather than a throw; see the spec.)
  if (bytes.length % LINE_BYTES !== 0)
    throw new Error(`buffer length ${bytes.length} is not a multiple of 82`);
  const result = scan_records(BitArray$BitArray(bytes), baseLine);
  const gStructure = resultStructure(result);

  const structure: FileStructure = {};
  const header = optString(structureHeader(gStructure));
  const trailer = optString(structureTrailer(gStructure));
  if (header !== undefined) structure.header = header;
  if (trailer !== undefined) structure.trailer = trailer;

  return {
    // spans_array did the List->Array conversion on the Gleam side; here we only
    // reshape each record (snake_case -> camelCase) via the $-API accessors.
    spans: spans_array(result).map((s: GleamSpan) => ({
      firstLine: spanFirstLine(s),
      lastLine: spanLastLine(s),
      offset: spanOffset(s),
      length: spanLength(s),
      an: spanAn(s),
    })),
    structure,
    badLines: resultBadLines(result),
  };
}

// Key-insertion order below is chosen to match record.ts exactly, so
// JSON.stringify of the two is byte-for-byte identical.
function marshalValue(v: GleamValue): SourceValue {
  const out: SourceValue = {
    raw: valRaw(v),
    line: valLine(v),
    offset: valOffset(v),
  };
  if (valContinuation(v)) out.continuation = true;
  const code = optString(valCode(v));
  const label = optString(valLabel(v));
  const percent = optString(valPercent(v));
  if (code !== undefined) out.code = code;
  if (label !== undefined) out.label = label;
  if (percent !== undefined) out.percent = percent;
  return out;
}

function marshalField(f: GleamField): SourceField {
  return {
    tag: fieldTag(f),
    values: field_values_array(f).map((v: GleamValue) => marshalValue(v)),
    lineStart: fieldLineStart(f),
    lineEnd: fieldLineEnd(f),
    offset: fieldOffset(f),
    length: fieldLength(f),
  };
}

export function parseRecord(
  bytes: Uint8Array,
  span: RecordSpan,
  file: string,
  profile: Profile,
  bufferBaseLine: number,
): LogicalRecord {
  const gSpan = makeSpan(
    span.firstLine,
    span.lastLine,
    span.offset,
    span.length,
    span.an,
  );
  const gProfile = profile === "fy1988" ? profileFy1988() : profileFy1991plus();
  const r: GleamRecord = parse_record(
    BitArray$BitArray(bytes),
    gSpan,
    file,
    gProfile,
    bufferBaseLine,
  );
  return {
    file: recFile(r),
    firstLine: recFirstLine(r),
    lastLine: recLastLine(r),
    offset: recOffset(r),
    length: recLength(r),
    an: recAn(r),
    fields: record_fields_array(r).map((f: GleamField) => marshalField(f)),
    orphanContinuations: recOrphan(r),
  };
}
