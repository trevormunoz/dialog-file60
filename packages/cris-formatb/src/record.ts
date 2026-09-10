import { LINE_BYTES, DATA_START, DATA_END, latin1 } from "./index";
import type { RecordSpan } from "./offsets";
import { PROFILES, type Profile } from "./profiles";

export interface SourceValue { raw: string; code?: string; label?: string; line: number; offset: number; }
export interface SourceField { tag: string; values: SourceValue[]; lineStart: number; lineEnd: number; offset: number; length: number; }
export interface LogicalRecord {
  file: string; firstLine: number; lastLine: number; offset: number; length: number; an: string; fields: SourceField[];
  /** Continuation lines (tag "  ") with no preceding tagged field open, counted instead of
   * dropped silently (full-corpus check). */
  orphanContinuations: number;
}

function splitCodeLabel(v: SourceValue, sepA: number, sepB: number): void {
  const i = v.raw.indexOf(String.fromCharCode(sepA) + String.fromCharCode(sepB));
  if (i >= 0) { v.code = v.raw.slice(0, i).trimEnd(); v.label = v.raw.slice(i + 2).trimEnd(); }
}

export function parseRecord(bytes: Uint8Array, span: RecordSpan, file: string, profile: Profile, bufferBaseLine?: number): LogicalRecord {
  const p = PROFILES[profile];
  // Callers must state where `bytes` begins. Without bufferBaseLine, `bytes` has to be exactly the
  // span's own bytes; a larger buffer (a whole-corpus read) must pass the line its first byte sits on,
  // otherwise every span would silently parse the bytes at the start of the buffer.
  if (bufferBaseLine === undefined && bytes.length !== span.length) {
    throw new Error(
      `parseRecord: buffer is ${bytes.length} bytes but span lines ${span.firstLine}-${span.lastLine} ` +
      `(an ${span.an || "?"}) is ${span.length} bytes; pass bufferBaseLine for a larger buffer`
    );
  }
  const base = bufferBaseLine ?? span.firstLine;
  const start = (span.firstLine - base) * LINE_BYTES; // offset of span within `bytes`
  if (start < 0 || start + span.length > bytes.length) {
    throw new Error(
      `span lines ${span.firstLine}-${span.lastLine} (an ${span.an || "?"}) fall outside the buffer: ` +
      `buffer starts at line ${base} and is ${bytes.length} bytes`
    );
  }
  const fieldsOut: SourceField[] = [];
  let cur: SourceField | null = null;
  let orphanContinuations = 0;
  const nLines = span.length / LINE_BYTES;
  for (let i = 0; i < nLines; i++) {
    const line = span.firstLine + i;
    const at = start + i * LINE_BYTES;
    const tag = latin1(bytes.subarray(at, at + 2));
    const data = bytes.subarray(at + DATA_START, at + DATA_END);
    if (tag === "$$") continue;
    if (tag !== "  ") {
      cur = { tag, values: [{ raw: latin1(data), line, offset: (line - 1) * LINE_BYTES }], lineStart: line, lineEnd: line, offset: (line - 1) * LINE_BYTES, length: LINE_BYTES };
      fieldsOut.push(cur);
    } else if (cur) {
      cur.lineEnd = line; cur.length = (line - cur.lineStart + 1) * LINE_BYTES;
      if (data[0] === p.continuationByte) {
        cur.values.push({ raw: latin1(data.subarray(1)), line, offset: (line - 1) * LINE_BYTES });
      } else {
        const last = cur.values[cur.values.length - 1]!;
        last.raw += latin1(data); // no character inserted: "dis" + "ease"
      }
    } else {
      orphanContinuations++; // a continuation line with no open field (full-corpus check)
    }
  }
  for (const f of fieldsOut) for (const v of f.values) { v.raw = v.raw.trimEnd(); splitCodeLabel(v, p.sepA, p.sepB); }
  return { file, firstLine: span.firstLine, lastLine: span.lastLine, offset: span.offset, length: span.length, an: span.an, fields: fieldsOut, orphanContinuations };
}

export const field = (rec: LogicalRecord, tag: string): SourceField | undefined => rec.fields.find(f => f.tag === tag);
export const fields = (rec: LogicalRecord, tag: string): SourceField[] => rec.fields.filter(f => f.tag === tag);
