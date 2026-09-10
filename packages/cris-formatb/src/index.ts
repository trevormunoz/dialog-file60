/** NARA's served form: 80 columns + CRLF. Registry: nara.conversion.line_form */
export const LINE_BYTES = 82;
export const DATA_START = 3;  // 0-based column of first data byte (column 4)
export const DATA_END = 72;   // exclusive, 0-based; columns 4..72 inclusive are bytes 3..71

/** Latin-1 as a reversible byte map: every byte maps to exactly one character and back, so
 * decoding never loses a byte. One loop-based implementation shared by offsets.ts and
 * record.ts. The loop form is deliberate: `String.fromCharCode(...b)` spreads the array into
 * arguments and is stack-limited for a large one. */
export const latin1 = (b: Uint8Array): string => { let s = ""; for (const c of b) s += String.fromCharCode(c); return s; };

export * from "./offsets";
export * from "./record";
export * from "./profiles";
