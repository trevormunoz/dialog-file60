// The frozen public surface (Global Constraints). Only the two heavy
// functions run on the bundled Gleam engine, via the thin wrapper; the pure
// helpers stay TS at runtime, re-exported from their existing modules.
// record.ts/offsets.ts's own scanRecords/parseRecord implementations are
// superseded here -- they remain test-only, as the parity oracle
// test/parity.test.ts imports directly.
export { scanRecords, parseRecord } from "./wrapper";
export { field, fields } from "./record";
export type { LogicalRecord, SourceField, SourceValue } from "./record";
export { lineToOffset, offsetToLine } from "./offsets";
export type { RecordSpan, FileStructure, ScanResult } from "./offsets";
export { LINE_BYTES, DATA_START, DATA_END, latin1 } from "./bytes";
export { PROFILES, PROFILE_NAMES } from "./profiles";
export type { Profile } from "./profiles";
