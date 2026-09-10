import { LINE_BYTES, DATA_START, latin1 } from "./index";

export interface RecordSpan {
  firstLine: number;
  lastLine: number;
  offset: number;
  length: number;
  an: string;
}

/**
 * NARA's file-level header and trailer lines, the raw text observed for each (trimmed of
 * trailing pad).
 * Registry: nara.file.header_record, nara.file.trailer_record
 */
export interface FileStructure { header?: string; trailer?: string; }

export interface ScanResult {
  spans: RecordSpan[];
  structure: FileStructure;
  /** Lines whose last two bytes are not CRLF (full-corpus check). */
  badLines: number;
}

export const lineToOffset = (line: number): number => (line - 1) * LINE_BYTES;
export const offsetToLine = (offset: number): number => offset / LINE_BYTES + 1;

/**
 * Scan fixed 82-byte lines; a line beginning "$$" starts a record. A line beginning "<<" is
 * NARA's file header and a line beginning ">>" is its trailer; neither opens or extends a
 * record, and the trailer closes whatever record is open before it, excluding itself from
 * that span.
 * Registry: formatb.record.separator, nara.file.header_record, nara.file.trailer_record
 */
export function scanRecords(bytes: Uint8Array, baseLine = 1): ScanResult {
  if (bytes.length % LINE_BYTES !== 0) throw new Error(`buffer length ${bytes.length} is not a multiple of 82`);
  const n = bytes.length / LINE_BYTES;
  const spans: RecordSpan[] = [];
  const structure: FileStructure = {};
  let open: RecordSpan | null = null;
  let badLines = 0;
  const closeOpen = (lastLine: number) => {
    if (!open) return;
    open.lastLine = lastLine; open.length = (open.lastLine - open.firstLine + 1) * LINE_BYTES; spans.push(open); open = null;
  };
  for (let i = 0; i < n; i++) {
    const at = i * LINE_BYTES;
    if (!(bytes[at + 80] === 0x0d && bytes[at + 81] === 0x0a)) badLines++;
    if (bytes[at] === 0x3c && bytes[at + 1] === 0x3c) { // "<<" file header
      structure.header = latin1(bytes.subarray(at, at + 80)).trimEnd();
      continue;
    }
    if (bytes[at] === 0x3e && bytes[at + 1] === 0x3e) { // ">>" file trailer
      closeOpen(baseLine + i - 1);
      structure.trailer = latin1(bytes.subarray(at, at + 80)).trimEnd();
      continue;
    }
    const isSep = bytes[at] === 0x24 && bytes[at + 1] === 0x24; // "$$"
    if (isSep) {
      closeOpen(baseLine + i - 1);
      open = { firstLine: baseLine + i, lastLine: baseLine + i, offset: lineToOffset(baseLine + i), length: LINE_BYTES, an: "" };
    } else if (open && !open.an && bytes[at] === 0x41 && bytes[at + 1] === 0x4e) { // "AN"
      open.an = latin1(bytes.subarray(at + DATA_START, at + LINE_BYTES - 2)).trimEnd();
    }
  }
  closeOpen(baseLine + n - 1);
  return { spans, structure, badLines };
}
