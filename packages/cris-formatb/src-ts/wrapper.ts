// The thin TS-over-Gleam wrapper: marshals the compiled Gleam facade
// (`javascript.gleam` + `facade.gleam`, target `cris_formatb`) to the frozen
// `scanRecords`/`parseRecord` interfaces `record.ts`/`offsets.ts` define,
// through Gleam's generated `$`-API only — every read goes through a typed
// accessor, never the raw runtime representation. Modeled on
// docs/gleam-spike/facade.ts (see also its source,
// docs/gleam-spike/gleam_scan/src/gleam_scan.gleam): same pattern, this
// package's actual module names and build paths.
//
// Task 12 (bundling): the runtime import resolves to the single
// self-contained `dist/engine.mjs` esbuild bundles from
// `scripts/engine-entry.mjs` (javascript.mjs + facade.mjs + the Option/
// BitArray helpers those need — javascript.gleam stays thin per Task 10 and
// doesn't re-export them itself, so the entry gathers them). Types resolve
// to the sibling `dist/engine.d.mts` rollup-plugin-dts bundles from
// `scripts/engine-entry.d.mts` over the gleam-generated `.d.mts` files —
// see the design note on that file for the `.d.mts` bundling approach.
//
// Key-insertion order in marshalValue/marshalField below is chosen to match
// record.ts's own object-literal order exactly, so JSON.stringify of the two
// is byte-for-byte identical (the parity harness, test/parity.test.ts,
// depends on this).

import {
  BitArray$BitArray,
  scan_records,
  parse_record,
  spans_array,
  record_fields_array,
  field_values_array,
  type RecordSpan$ as GleamSpan,
  type SourceValue$ as GleamValue,
  type SourceField$ as GleamField,
  type LogicalRecord$ as GleamRecord,
  RecordSpan$RecordSpan as makeSpan,
  RecordSpan$RecordSpan$first_line as spanFirstLine,
  RecordSpan$RecordSpan$last_line as spanLastLine,
  RecordSpan$RecordSpan$offset as spanOffset,
  RecordSpan$RecordSpan$length as spanLength,
  RecordSpan$RecordSpan$an as spanAn,
  ScanResult$ScanResult$structure as resultStructure,
  ScanResult$ScanResult$bad_lines as resultBadLines,
  FileStructure$FileStructure$header as structureHeader,
  FileStructure$FileStructure$trailer as structureTrailer,
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
  Option$isSome,
  Option$Some$0,
} from "../dist/engine.mjs";

import type { RecordSpan, FileStructure, ScanResult } from "./offsets";
import type { SourceValue, SourceField, LogicalRecord } from "./record";
import type { Profile } from "./profiles";

const optString = (o: unknown): string | undefined =>
  Option$isSome(o) ? (Option$Some$0(o) as string) : undefined;

const LINE_BYTES = 82;

export function scanRecords(bytes: Uint8Array, baseLine = 1): ScanResult {
  // Parity with offsets.ts:36 — reject a non-whole-line buffer at the
  // boundary, so the Gleam scanner only ever sees complete 82-byte lines.
  if (bytes.length % LINE_BYTES !== 0) {
    throw new Error(`buffer length ${bytes.length} is not a multiple of 82`);
  }
  const result = scan_records(BitArray$BitArray(bytes), baseLine);
  const gStructure = resultStructure(result);

  const structure: FileStructure = {};
  const header = optString(structureHeader(gStructure));
  const trailer = optString(structureTrailer(gStructure));
  if (header !== undefined) structure.header = header;
  if (trailer !== undefined) structure.trailer = trailer;

  return {
    // spans_array did the List->Array conversion on the Gleam side; here we
    // only reshape each record (snake_case -> camelCase) via the $-API.
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
  // Parity with record.ts:44-50 — a span falling outside the buffer throws
  // there; reproduce it at the boundary so the oracle matches. (record.ts's
  // other throw, the missing-bufferBaseLine size check, is unreachable here:
  // the Gleam engine makes bufferBaseLine mandatory, so the facade always
  // supplies it.)
  const start = (span.firstLine - bufferBaseLine) * LINE_BYTES;
  if (start < 0 || start + span.length > bytes.length) {
    throw new Error(
      `span lines ${span.firstLine}-${span.lastLine} (an ${span.an || "?"}) fall outside the buffer: ` +
        `buffer starts at line ${bufferBaseLine} and is ${bytes.length} bytes`,
    );
  }
  const gSpan = makeSpan(
    span.firstLine,
    span.lastLine,
    span.offset,
    span.length,
    span.an,
  );
  const gProfile =
    profile === "fy1988" ? profileFy1988() : profileFy1991plus();
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
