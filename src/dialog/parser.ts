import type { DialogCommand } from "./ast";
import type { SearchExpression } from "../retrieval/engine";
import { registry } from "../registry";

registry.get("proto.select.echo_case"); // the echoed SELECT expression is uppercased
registry.get("proto.select.suffix"); // the word/CODE[,CODE...] suffix grammar SUFFIXED below implements

const unknown = (text: string): DialogCommand => ({ cmd: "unknown", text });

function parseItems(s: string): number[] | null {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (b < a) return null; // a reversed range (e.g. 3-1) is not a range TYPE ever prints
    for (let i = a; i <= b; i++) out.push(i);
  }
  return out;
}

// A term value outside this milestone's slice (right truncation `?`, a `/subfile` limit, a
// suffix combined with a PREFIX=value, a standalone OR/NOT/AND token, or a
// proximity/parenthesized group) must not be silently folded into the phrase: that would
// search a plain-phrase read of syntax the retrieval engine never evaluated, and print a
// fabricated zero-item set line for a query DIALOG File 60 users could type but this parser
// does not yet support. A bare word followed by one suffix grammar (`peach/ti`) is handled
// separately, below (SUFFIXED); everything else with a "/" in it -- a `/subfile` limit
// (/CRIS /HNRIMS /ICAR /CZARIS), a suffix on what looks like a PREFIX=value, or a second "/" in
// what would otherwise be a suffixed word's word part -- is rejected here and falls through to
// { cmd: "unknown" }. Measured cost of this guard over data/RG164.CRIS.FY94.txt on 2026-09-09
// (first lines of the six indexed tags CY, IN, DS, ST, SF, AN): 79 values contain "/", 18
// contain a standalone AND/OR/NOT, 47 contain a parenthesis (e.g. CY "AMES/ANKEY", DS "OR", CY
// "KANKE (RANCH)"). Those phrases are unreachable here; the rejection is not a statement that
// the values are absent from the file.
const RESERVED_IN_TERM_VALUE = /[?/()]|\b(?:and|or|not)\b/i;

// A bare word term with a trailing suffix, e.g. `peach/ti` or `peach/ti,de`: the word is
// everything up to the last "/", and after it a comma-joined list of two-letter suffix codes.
// The word part is restricted to none of "= / ? ( )": an operand with "=" before the slash is
// a PREFIX=value candidate instead (checked below, and then rejected by
// RESERVED_IN_TERM_VALUE since its value still carries the "/"), and a second "/" in the word
// part (e.g. `peach/ti/de`) matches neither branch and is unknown. Suffix codes are not
// checked against WORD_CODES here; an unrecognized code (e.g. `peach/zz`) still parses, and is
// refused later by RetrievalEngine.prepare (UnknownSuffix). See registry entry
// proto.select.suffix for the suffix grammar's source.
const SUFFIXED = /^([^=/?()]+)\/([A-Za-z]{2}(?:,[A-Za-z]{2})*)$/;

/**
 * Operand grammar for this milestone: term/suffix[,suffix...] | PREFIX=value | S<n> | ( expr );
 * joined by AND. Limit: the AND split is not nesting-aware, so a parenthesized group that
 * itself contains AND (e.g. `(cy=beltsville and in=smith)`) parses to unknown. Only a group
 * with no internal operator parses. Grouping is not implemented here. Right truncation (`?`)
 * and DIALOG's own phrase/subfile suffix limits beyond a plain word suffix are also not
 * implemented here.
 */
function parseExpr(src: string): SearchExpression | null {
  const parts = src.split(/\s+and\s+/i);
  let acc: SearchExpression | null = null;
  for (const raw of parts) {
    const p = raw.trim();
    let node: SearchExpression | null = null;
    const set = /^s(\d+)$/i.exec(p);
    const suffixed = SUFFIXED.exec(p);
    const term = /^([A-Za-z]{2})=(.+)$/.exec(p);
    if (set) node = { kind: "set", id: Number(set[1]) };
    else if (suffixed) {
      node = RESERVED_IN_TERM_VALUE.test(suffixed[1]!)
        ? null
        : { kind: "word", codes: suffixed[2]!.toUpperCase().split(",").map(c => `/${c}`), term: suffixed[1]! };
    }
    else if (term) node = RESERVED_IN_TERM_VALUE.test(term[2]!) ? null : { kind: "term", field: term[1]!.toUpperCase(), term: term[2]! };
    else if (p.startsWith("(") && p.endsWith(")")) node = parseExpr(p.slice(1, -1));
    if (!node) return null;
    acc = acc ? { kind: "and", left: acc, right: node } : node;
  }
  return acc;
}

/**
 * A capability-notice stub. Each command word here is documented for File 60 but outside
 * this milestone's slice; recognizing it here, rather than
 * letting it fall through to `unknown`, is what lets the session tell "documented but not
 * reconstructed" apart from a typo. Each pattern's one capture group is the text after the
 * command word (undefined when nothing follows); `rest` below defaults that to "".
 * `\s+(.*)` (not `\b`) requires at least one space before any remainder, so "expandable" does
 * not parse as EXPAND with rest "able" -- the capture is only ever a separate word or words.
 */
const CAPABILITY_WORDS: { pattern: RegExp; command: string }[] = [
  { pattern: /^(?:expand|e)(?:\s+(.*))?$/i, command: "EXPAND" },
  { pattern: /^(?:page|p)(?:\s+(.*))?$/i, command: "PAGE" },
  { pattern: /^(?:display\s+sets|ds)(?:\s+(.*))?$/i, command: "DISPLAY SETS" },
  { pattern: /^logoff(?:\s+(.*))?$/i, command: "LOGOFF" },
  { pattern: /^sort(?:\s+(.*))?$/i, command: "SORT" },
  { pattern: /^(?:print|pr)(?:\s+(.*))?$/i, command: "PRINT" },
  { pattern: /^kwic(?:\s+(.*))?$/i, command: "KWIC" },
];

export function parse(line: string): DialogCommand {
  const t = line.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(?:b|begin)\s*(\d+)$/i.exec(t))) return { cmd: "begin", file: Number(m[1]) };
  if ((m = /^(?:s|select)\s+(.+)$/i.exec(t))) {
    const expr = parseExpr(m[1]!);
    return expr ? { cmd: "select", expr, echo: m[1]!.replace(/\s+$/, "").toUpperCase() } : unknown(line);
  }
  if ((m = /^(?:t|type)\s+s(\d+)\/([A-Za-z0-9,]+)\/([\d,\-]+)$/i.exec(t))) {
    const items = parseItems(m[3]!);
    return items ? { cmd: "type", set: Number(m[1]), format: m[2]!.toUpperCase(), items } : unknown(line);
  }
  // TYPE by accession number (documented in the Blue Sheet, e.g. "T 09143165/5"): recognized,
  // not implemented -- a capability notice, same as the command words below. The number must
  // be 7 or 8 digits: File 60 accession numbers are 7 digits in the FY 1994 export (AN
  // 9049442) and 8 with the leading zero the Blue Sheet prints, while a set number is at
  // most 3 -- so a set TYPE missing its item range ("T 1/5") stays unknown and is blamed as
  // such, rather than being reported as an accession-number TYPE.
  if ((m = /^(?:t|type)\s+(\d{7,8})\/([A-Za-z0-9,]+)$/i.exec(t))) {
    return { cmd: "unsupported", command: "TYPE (by accession number)", rest: `${m[1]}/${m[2]!.toUpperCase()}` };
  }
  for (const { pattern, command } of CAPABILITY_WORDS) {
    if ((m = pattern.exec(t))) return { cmd: "unsupported", command, rest: (m[1] ?? "").toUpperCase() };
  }
  return unknown(line);
}
