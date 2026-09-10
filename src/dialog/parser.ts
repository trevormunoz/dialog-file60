import type { DialogCommand } from "./ast";
import type { SearchExpression } from "../retrieval/engine";
import { registry } from "../registry";

registry.get("proto.select.echo_case"); // the echoed SELECT expression is uppercased
registry.get("proto.select.suffix"); // the word/CODE[,CODE...] suffix grammar SUFFIXED below implements
registry.get("proto.select.precedence"); // the parentheses-then-NOT-then-AND-then-OR order parseExpression below implements

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
// suffix combined with a PREFIX=value, or a proximity/parenthesized group inside a value's
// own text) must not be silently folded into the phrase: that would search a plain-phrase
// read of syntax the retrieval engine never evaluated, and print a fabricated zero-item set
// line for a query DIALOG File 60 users could type but this parser does not yet support. AND,
// OR and NOT are no longer reserved here -- lex() below splits on them at the expression
// level before an operand is ever handed to parseOperand, so a value that happens to contain
// one of those words as a bare token breaks the surrounding expression rather than being
// folded into a literal phrase. A bare word followed by one suffix grammar (`peach/ti`) is
// handled separately (SUFFIXED); everything else with a "/" in it -- a `/subfile` limit
// (/CRIS /HNRIMS /ICAR /CZARIS), a suffix on what looks like a PREFIX=value, or a second "/" in
// what would otherwise be a suffixed word's word part -- is rejected here and falls through to
// { cmd: "unknown" }. Measured cost of this guard over data/RG164.CRIS.FY94.txt on 2026-09-09
// (first lines of the six indexed tags CY, IN, DS, ST, SF, AN): 79 values contain "/", 18
// contain a standalone AND/OR/NOT, 47 contain a parenthesis (e.g. CY "AMES/ANKEY", DS "OR", CY
// "KANKE (RANCH)"). Those phrases are unreachable here; the rejection is not a statement that
// the values are absent from the file.
const RESERVED_IN_TERM_VALUE = /[?/()]/;

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
 * Split a SELECT expression on the operator words and parentheses only, keeping every other
 * run of characters -- including the internal double space of `IN=HAMMERSCHLAG  F A` -- as one
 * operand token (spec 6.4: the phrase index preserves internal spacing, so an operand may
 * contain spaces).
 */
function lex(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(\(|\)|\bAND\b|\bOR\b|\bNOT\b)\s*/gi;
  let last = 0;
  for (const m of src.matchAll(re)) {
    const operand = src.slice(last, m.index).trim();
    if (operand) out.push(operand);
    out.push(m[1]!.toUpperCase());
    last = m.index + m[0].length;
  }
  const tail = src.slice(last).trim();
  if (tail) out.push(tail);
  return out;
}

const OPERATORS = new Set(["AND", "OR", "NOT"]);

/**
 * Recursive descent over the documented order of processing (Successful Searching on Dialog,
 * 2001, "Order of Processing": parentheses, then proximity, then NOT, then AND, then OR;
 * innermost parentheses first). Proximity operators are out of this slice and never reach
 * here -- parse() would answer them with a capability notice before calling this, but none of
 * the CAPABILITY_WORDS below recognize a proximity operator yet, so a SELECT using one is
 * unknown, the same as before this grammar existed. Returns null for any statement this
 * grammar cannot read, including an unmatched parenthesis and a leading NOT (spec 7.12: NOT
 * is binary).
 */
export function parseExpression(src: string): SearchExpression | null {
  const t = lex(src);
  let i = 0;
  const peek = () => t[i];
  const binary = (next: () => SearchExpression | null, kind: "and" | "or" | "not", word: string) => (): SearchExpression | null => {
    let left = next();
    if (!left) return null;
    while (peek() === word) {
      i++;
      const right = next();
      if (!right) return null;
      left = { kind, left, right } as SearchExpression;
    }
    return left;
  };
  const primary = (): SearchExpression | null => {
    const tok = t[i];
    if (tok === undefined) return null;
    if (tok === "(") {
      i++;
      const inner = or();
      if (!inner || t[i] !== ")") return null; // unmatched parenthesis (proto.error.unmatched_parens)
      i++;
      return inner;
    }
    if (OPERATORS.has(tok)) return null; // a leading or doubled operator
    i++;
    return parseOperand(tok);
  };
  const not = binary(primary, "not", "NOT");
  const and = binary(not, "and", "AND");
  const or = binary(and, "or", "OR");
  const expr = or();
  return expr && i === t.length ? expr : null;
}

/** One operand: term/suffix[,suffix...] | PREFIX=value | S<n>. A value carrying a reserved
 * character does not parse, as in Plan 1: this parser must never fold syntax it does not
 * evaluate into a phrase and print a fabricated set line for it. */
function parseOperand(tok: string): SearchExpression | null {
  // An EXPAND ref, E3, or ref range, E3:E5. `ordinals` starts empty -- DialogSession resolves
  // it against the open EXPAND display before the expression reaches the retrieval engine
  // (see SearchExpression's "refs" variant in retrieval/engine.ts).
  const ref = /^e\d+(?::e\d+)?$/i.exec(tok);
  if (ref) return { kind: "refs", ordinals: [], echo: tok.toUpperCase() };
  const set = /^s(\d+)$/i.exec(tok);
  if (set) return { kind: "set", id: Number(set[1]) };
  const suffixed = SUFFIXED.exec(tok);
  if (suffixed) {
    return RESERVED_IN_TERM_VALUE.test(suffixed[1]!)
      ? null
      : { kind: "word", codes: suffixed[2]!.toUpperCase().split(",").map(c => `/${c}`), term: suffixed[1]! };
  }
  const term = /^([A-Za-z]{2})=(.+)$/.exec(tok);
  if (!term || RESERVED_IN_TERM_VALUE.test(term[2]!)) return null;
  return { kind: "term", field: term[1]!.toUpperCase(), term: term[2]! };
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
  // Checked before plain SELECT, so "ss ..." is not read as "s" followed by the operand "s ...".
  if ((m = /^(?:ss|select\s+steps)\s+(.+)$/i.exec(t))) {
    const expr = parseExpression(m[1]!);
    return expr ? { cmd: "selectsteps", expr, echo: m[1]!.replace(/\s+$/, "").toUpperCase() } : unknown(line);
  }
  if ((m = /^(?:s|select)\s+(.+)$/i.exec(t))) {
    const expr = parseExpression(m[1]!);
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
  if ((m = /^(?:e|expand)\s+(.+)$/i.exec(t))) return { cmd: "expand", term: m[1]!.trim() };
  if ((m = /^(?:p|page)(-)?$/i.exec(t))) return { cmd: "page", back: m[1] === "-" };
  for (const { pattern, command } of CAPABILITY_WORDS) {
    if ((m = pattern.exec(t))) return { cmd: "unsupported", command, rest: (m[1] ?? "").toUpperCase() };
  }
  return unknown(line);
}
