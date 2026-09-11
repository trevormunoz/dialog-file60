import type { DialogCommand } from "./ast";
import type { SearchExpression } from "../retrieval/engine";
import { BASIC_INDEX } from "./expand";
import { KWIC_MIN, KWIC_MAX } from "./kwic";
import { registry } from "../registry";

registry.get("proto.select.echo_case"); // the echoed SELECT expression is uppercased
registry.get("proto.select.suffix"); // the word/CODE[,CODE...] suffix grammar SUFFIXED below implements
registry.get("proto.select.precedence"); // the parentheses-then-proximity-then-NOT-then-AND-then-OR order parseExpression below implements
registry.get("proto.select.truncation"); // the single-trailing-? rule TRUNCATED below implements
registry.get("proto.select.proximity"); // (W)/(N)/(F), implemented by prox() below
registry.get("proto.select.proximity.numbered"); // (nW)/(nN), also implemented by prox() below
registry.get("proto.select.proximity.unimplemented"); // (S)/(L)/(T), refused by prox() below

const unknown = (text: string): DialogCommand => ({ cmd: "unknown", text });

// Exported for commands/print.ts: PRINT keeps `items` as typed (ALL or a range, see the
// "print" AST variant's own comment), and resolves it to a count with this same function
// rather than a second copy of its range grammar.
export function parseItems(s: string): number[] | null {
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

// A truncated word term, with or without a suffix list: `oyster?`, `technolog?/ti`,
// `technolog?/ti,de`. The stem is everything before the single trailing "?", and must itself
// carry none of "= / ? ( )" -- `techno?logy` (internal), `technolog??` (bounded) and
// `technolog? ?` (spaced) all fail this and fall through to { cmd: "unknown" }, which is what
// this reconstruction owes them: no held source documents those forms for File 60 (see the
// statement of absence in registry key proto.select.truncation).
const TRUNCATED = /^([^=/?()]+)\?(?:\/([A-Za-z]{2}(?:,[A-Za-z]{2})*))?$/;

/**
 * Split a SELECT expression on the operator words and parentheses only, keeping every other
 * run of characters -- including the internal double space of `IN=HAMMERSCHLAG  F A` -- as one
 * operand token (spec 6.4: the phrase index preserves internal spacing, so an operand may
 * contain spaces).
 */
function lex(src: string): string[] {
  const out: string[] = [];
  // The proximity alternative (a whole "(nX)" unit, e.g. "(W)" or "(3N)") is tried before the
  // bare "(" so a proximity operator is never mis-split into "(" + "3N" + ")" -- the likeliest
  // bug in this grammar (parser.ts's own note on prox() below).
  const re = /\s*(\(\d*[A-Za-z]\)|\(|\)|\bAND\b|\bOR\b|\bNOT\b)\s*/gi;
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

// A proximity operator token, as lex() now emits it: "(", an optional digit run (the numbered
// forms' n), one letter, ")". Six letters are documented (Successful Searching on Dialog, 2001,
// "Order of Processing": T W N L S F); only W, N and F are implemented here -- (S), (L) and (T)
// are each defined only relative to something "as defined by the database", and no held source
// states File 60's own subfield unit, descriptor unit, or chemical-name parts. Statement of
// absence: not found by grepping "(S)", "(L)", "(T)", "subfield", "descriptor unit" and
// "chemical name" across the stripped 1998 Blue Sheet text and the 2001 manual text on
// 2026-09-10 (proto.select.proximity.unimplemented).
const PROX = /^\((\d*)([WNFSLT])\)$/i;
// A bare word or truncated word with no suffix of its own -- inside a proximity expression the
// suffix belongs to the WHOLE expression, carried only on the run's last token (see prox()
// below), so an earlier leaf like "SERUM" in "SERUM(W)LIPID?/DE" is genuinely bare here.
const PROX_TRUNC = /^([^=/?()]+)\?$/;
const PROX_BARE = /^[^=/?()]+$/;

/**
 * Recursive descent over the documented order of processing (Successful Searching on Dialog,
 * 2001, "Order of Processing": parentheses, then proximity, then NOT, then AND, then OR;
 * innermost parentheses first). Returns null for any statement this grammar cannot read,
 * including an unmatched parenthesis and a leading NOT (spec 7.12: NOT is binary).
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
  /**
   * A single proximity operand pair: leftTok (op) rightTok. Only rightTok, the run's last
   * token, is parsed through the ordinary parseOperand (so it carries its own real suffix or
   * truncation, e.g. "LIPID?/DE"); leftTok is parsed bare. The suffix codes found on rightTok
   * (or BASIC_INDEX if it names none) are pushed onto BOTH leaves -- SERUM(W)LIPID?/DE searches
   * /DE for both operands, not only the right one (Blue Sheet's own four File 60 examples, and
   * the 1994 Curso p. 99 SS session, TECHNOLOG?(W)TRANSFER?/TI, show the same single trailing
   * suffix). Chains of more than one proximity operator are not attempted: no held source shows
   * one, and every documented example is exactly two operands.
   */
  const prox = (): SearchExpression | null => {
    const tok = peek();
    if (tok === undefined || !(t[i + 1] !== undefined && PROX.test(t[i + 1]!))) return primary();
    const leftTok = t[i]!;
    const opTok = t[i + 1]!;
    const m = PROX.exec(opTok)!;
    const op = m[2]!.toUpperCase();
    const rightTok = t[i + 2];
    if (rightTok === undefined || rightTok === "(" || OPERATORS.has(rightTok) || PROX.test(rightTok)) return null;
    i += 3;
    if (op === "S" || op === "L" || op === "T") return null; // proto.select.proximity.unimplemented
    const suffixMatch = /^(.+)\/([A-Za-z]{2}(?:,[A-Za-z]{2})*)$/.exec(rightTok);
    const codes = suffixMatch ? suffixMatch[2]!.toUpperCase().split(",").map(c => `/${c}`) : [BASIC_INDEX];
    const leaf = (raw: string): SearchExpression | null => {
      const truncM = PROX_TRUNC.exec(raw);
      if (truncM) return { kind: "trunc", codes, stem: truncM[1]!.toUpperCase(), echo: raw.toUpperCase() };
      if (PROX_BARE.test(raw)) return { kind: "word", codes, term: raw.toUpperCase() };
      return null;
    };
    const left = leaf(leftTok);
    const right = leaf(suffixMatch ? suffixMatch[1]! : rightTok);
    if (!left || !right) return null;
    const distance = m[1] ? Number(m[1]) : 1; // proto.select.proximity.numbered: inferred, see registry
    const echo = `${leftTok.toUpperCase()}${opTok.toUpperCase()}${rightTok.toUpperCase()}`;
    return { kind: "prox", op: op as "W" | "N" | "F", distance, left, right, echo };
  };
  const not = binary(prox, "not", "NOT");
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
  // Tested before SUFFIXED, so `technolog?/ti` is not first read as a suffixed word whose
  // word part carries a reserved character (see TRUNCATED's comment above).
  const truncatedMatch = TRUNCATED.exec(tok);
  if (truncatedMatch) {
    const [, stemText, suffixList] = truncatedMatch;
    return {
      kind: "trunc",
      codes: suffixList ? suffixList.toUpperCase().split(",").map(c => `/${c}`) : [BASIC_INDEX],
      stem: stemText!.toUpperCase(),
      echo: tok.toUpperCase(),
    };
  }
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
 * PRINT no longer lives here: its two documented shapes are recognized above, one implemented
 * (the set form), one still a capability notice of its own (the accession-number form). Empty
 * for now -- kept as the route for a future documented-but-unimplemented command word.
 */
const CAPABILITY_WORDS: { pattern: RegExp; command: string }[] = [];

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
  // SORT <Sn>/<items>/<ff>[,D][/<ff>[,D]...] -- the 2001 command format, with the Blue
  // Sheet's own File 60 example SORT S13/ALL/PN. `items` is ALL or a range; the 2001 note
  // "For correct results, you must sort ALL items in a set" is recorded, not enforced.
  if ((m = /^sort\s+s(\d+)\/(all|[\d,\-]+)\/(.+)$/i.exec(t))) {
    const keys = m[3]!.split("/").map(part => {
      const [field, suffix] = part.split(",");
      return { field: field!.trim().toUpperCase(), descending: (suffix ?? "").trim().toUpperCase() === "D" };
    });
    return { cmd: "sort", set: Number(m[1]), items: m[2]!.toUpperCase(), keys, echo: t.slice(5).trim().toUpperCase() };
  }
  // COMBINE <a>-<b>/<OP>: the 1978 File 60 session's range-and-operator form ("? COMBINE
  // 1-7/OR" printing "8 197 1-7/OR"). Folds the set numbers left-associatively into OP,
  // echoing "a-b/OP" uppercased. A reversed range (b < a) is not a range the 1978 transcript
  // ever shows and falls through to unknown, the same way parseItems refuses one for TYPE.
  // Checked before the expression form below, so "1-7/OR" is never handed to the S<n>
  // rewrite, which would misread it as one word/suffix operand ("1-7" word, "OR" suffix).
  if ((m = /^combine\s+(\d+)-(\d+)\/(and|or|not)$/i.exec(t))) {
    const a = Number(m[1]), b = Number(m[2]), op = m[3]!.toLowerCase() as "and" | "or" | "not";
    if (b < a) return unknown(line);
    let expr: SearchExpression = { kind: "set", id: a };
    for (let n = a + 1; n <= b; n++) expr = { kind: op, left: expr, right: { kind: "set", id: n } };
    return { cmd: "combine", expr, echo: `${a}-${b}/${op.toUpperCase()}` };
  }
  // COMBINE <expr>: the expression form over bare set numbers ("? COMBINE (8 AND 12) NOT
  // 15"), read by the same parentheses/NOT/AND/OR grammar (parseExpression) SELECT uses.
  // COMBINE's grammar has no bare-word operand the way SELECT's does -- every integer in a
  // COMBINE statement is a set number -- so rewriting each standalone integer to S<n> before
  // handing the text to parseExpression is safe here (and would not be for SELECT, where a
  // bare integer could be a search term's own text, e.g. "S CY=1994").
  if ((m = /^combine\s+(.+)$/i.exec(t))) {
    const expr = parseExpression(m[1]!.replace(/\b(\d+)\b/g, "S$1"));
    return expr ? { cmd: "combine", expr, echo: m[1]!.replace(/\s+$/, "").toUpperCase() } : unknown(line);
  }
  // PRINT <Sn>/<format>/<items>[/<sortcode>...] -- the 1978 File 60 session's own form
  // (`PRINT 16/5/1-35/AS/PN`, bare set number) and the Blue Sheet's (`PRINT S5/5/ZP`,
  // S-prefixed). `items` is ALL or a range, kept as typed (see parseItems, called at
  // commands/print.ts's run time, not here); the trailing sort-code group is zero or more
  // `/CC` or `/CC,D` runs, echoed only -- see the "print" AST variant's own comment on why
  // they are never obeyed.
  if ((m = /^(?:print|pr)\s+s?(\d+)\/([A-Za-z0-9,]+)\/([\d,-]+|all)((?:\/[A-Za-z]{2}(?:,[Dd])?)*)$/i.exec(t))) {
    return {
      cmd: "print",
      set: Number(m[1]),
      format: m[2]!.toUpperCase(),
      items: m[3]!.toUpperCase(),
      sortCodes: m[4]!.toUpperCase(),
      echo: t.replace(/^(?:print|pr)\s+/i, "").toUpperCase(),
    };
  }
  // PRINT by accession number (Blue Sheet, N/A section: `PRINT 09136021/2`): recognized, not
  // implemented -- the same capability-notice channel TYPE by accession number already uses.
  if ((m = /^(?:print|pr)\s+(\d{7,8})\/([A-Za-z0-9,]+)$/i.exec(t))) {
    return { cmd: "unsupported", command: "PRINT (by accession number)", rest: `${m[1]}/${m[2]!.toUpperCase()}` };
  }
  if ((m = /^(?:e|expand)\s+(.+)$/i.exec(t))) return { cmd: "expand", term: m[1]!.trim() };
  if ((m = /^(?:p|page)(-)?$/i.exec(t))) return { cmd: "page", back: m[1] === "-" };
  // Both the bare (`DS 1-3`) and S-prefixed (`DS S1-S3`) range forms are documented; a single
  // set number leaves `to` equal to `from`, and no number at all shows every set.
  if ((m = /^(?:ds|display\s+sets)(?:\s+s?(\d+)(?:\s*-\s*s?(\d+))?)?$/i.exec(t))) {
    const from = m[1] ? Number(m[1]) : null;
    return { cmd: "displaysets", from, to: m[2] ? Number(m[2]) : from };
  }
  if (/^logoff$/i.test(t)) return { cmd: "logoff" };
  // SET KWIC nn (2001: "Command Format: SET KWIC nn"). A size outside 2..50 is not a
  // recognized SET KWIC at all -- it falls through to { cmd: "unknown" } below, the same as
  // any other unparseable command, rather than being silently clamped into range.
  if ((m = /^set\s+kwic\s+(\d+)$/i.exec(t))) {
    const n = Number(m[1]);
    if (n >= KWIC_MIN && n <= KWIC_MAX) return { cmd: "setkwic", size: n };
  }
  for (const { pattern, command } of CAPABILITY_WORDS) {
    if ((m = pattern.exec(t))) return { cmd: "unsupported", command, rest: (m[1] ?? "").toUpperCase() };
  }
  return unknown(line);
}
