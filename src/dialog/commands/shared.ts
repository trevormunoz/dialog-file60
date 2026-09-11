import type { SearchExpression } from "../../retrieval/engine";
import { MAX_REF } from "../expand";

/** The first AND-level operand of `expr`, splitting on a bare (case-insensitive) "AND" token
 * -- this milestone's SELECT grammar has no nested AND, so the first operand is well defined
 * without duplicating parser.ts's recursion. Shared by the select-before-BEGIN branches
 * (both the raw SELECT tail and the already-uppercased echo), so the same split is not spelled
 * two different ways. */
export function firstAndOperand(expr: string): string {
  return expr.split(/\s+and\s+/i)[0]!.trim();
}

/** The token a bare `?` names for the cases reached from raw input text (the simulated error
 * form is `?` plus an offending token, never a bare `?`): for a SELECT whose expression
 * failed to parse, the first AND-level operand of the attempted expression; for a TYPE whose
 * form parser.ts otherwise recognizes (`T`/`TYPE`) but whose remainder matches neither the
 * set/format/items form nor the by-accession-number form, that whole remainder -- blaming
 * bare "T" would name the recognized command word instead of the form that actually failed
 * to parse; otherwise the input line's first word. Pure text
 * matching, not a re-parse. */
export function offendingToken(text: string): string {
  const t = text.trim();
  const selectMatch = /^(?:s|select)\s+(.+)$/i.exec(t);
  if (selectMatch) return firstAndOperand(selectMatch[1]!).toUpperCase();
  const typeMatch = /^(?:t|type)\s+(.+)$/i.exec(t);
  if (typeMatch) return typeMatch[1]!.trim().toUpperCase();
  return (t.split(/\s+/)[0] ?? "").toUpperCase();
}

/** Wraps an E-number back into DIALOG's 1..MAX_REF sequence -- used to compute PAGE-'s ref
 * numbers, since it moves the window without reusing an already-computed ExpandState.nextRef. */
export const wrapRef = (n: number): number => ((n - 1) % MAX_REF + MAX_REF) % MAX_REF + 1;

/** The leaf operands of an expression, left to right: what SELECT STEPS numbers a set for. A
 * set reference is an operand too, and prints its own set line (1988 figure 2). */
export function operands(expr: SearchExpression): SearchExpression[] {
  return expr.kind === "and" || expr.kind === "or" || expr.kind === "not"
    ? [...operands(expr.left), ...operands(expr.right)] : [expr];
}

/** The uppercased echo for one operand, rebuilt from the AST rather than re-split from the
 * input line: SS prints each operand's own set line, and the input's spacing is not it. */
export function echoOf(expr: SearchExpression): string {
  switch (expr.kind) {
    case "term": return `${expr.field}=${expr.term.toUpperCase()}`;
    case "word": return `${expr.term.toUpperCase()}${expr.codes[0]}${expr.codes.slice(1).map(c => `,${c.slice(1)}`).join("")}`;
    case "set": return `S${expr.id}`;
    // `echo` is already the operand as typed and uppercased, including the trailing "?".
    case "trunc": return expr.echo;
    default: return "";   // operands() returns leaves only, so this is unreachable
  }
}
