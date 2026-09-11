import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { UnknownSet, UnknownField, UnknownSuffix, UnknownRef, type SearchExpression } from "../../retrieval/engine";
import { setLine } from "../setline";
import { firstAndOperand, operands, echoOf } from "./shared";
import { registry } from "../../registry";

registry.get("proto.select.per_term_postings");
registry.get("proto.select.setline");
registry.get("proto.error.unknown_field");
registry.get("proto.error.unknown_suffix");
registry.get("proto.selectsteps.sets");
registry.get("proto.selectsteps.processing");

/** Replaces every "refs" node's empty ordinals with the postings the ref(s) it names
 * resolve to, walking and/or/not the same way engine.prepare() does. Throws UnknownRef
 * (printed `? <echo>`) when no EXPAND is open, or when a ref names a row outside the page
 * currently displayed -- an E-number is only ever selectable against the display that
 * showed it. */
async function resolveRefs(session: DialogSession, expr: SearchExpression): Promise<SearchExpression> {
  switch (expr.kind) {
    case "and": case "or": case "not":
      return { ...expr, left: await resolveRefs(session, expr.left), right: await resolveRefs(session, expr.right) };
    case "refs": {
      const refMatch = /^E(\d+)(?::E(\d+))?$/.exec(expr.echo)!;
      const a = Number(refMatch[1]), b = refMatch[2] ? Number(refMatch[2]) : a;
      if (!session.expand) throw new UnknownRef(expr.echo);
      let ordinals: number[] = [];
      for (let n = a; n <= b; n++) {
        const row = session.expand.rows.find(r => r.ref === n);
        if (!row) throw new UnknownRef(expr.echo);
        ordinals = ordinals.concat(await session.engine.termOrdinals(session.expand.code, row.term));
      }
      return { ...expr, ordinals: [...new Set(ordinals)].sort((x, y) => x - y) };
    }
    default: return expr;
  }
}

/** Resolves `expr`, searches it, numbers and stores the resulting set, and returns its
 * per-term lines (for a multi-term expression) followed by its own set line -- the set-
 * creating half of both SELECT and SELECT STEPS, which differ only in how many times, and
 * with what operands, they call this. A retrieval error is caught here, not by the caller:
 * an operand that fails to resolve prints the simulated error form and consumes no set
 * number, the same as a plain SELECT that fails. `showPerTerm` is false only for SELECT
 * STEPS' own final combined set: SS already printed each operand's postings as its own
 * numbered set line, so the plain per-term breakdown this method would otherwise add for a
 * multi-term expression is the same information a second time, not new. `extraKeys` are
 * merged into the set line's own registryKeys -- SELECT STEPS adds proto.selectsteps.sets
 * there, since it is the same set line SELECT prints, just also evidence for SS's own
 * per-term-and-final numbering rule. `bareSetErrors` is false for SELECT and SELECT STEPS
 * (an unknown-set operand echoes "S<n>", proto.error.unknown_set's documented form) and true
 * for COMBINE, whose own operand grammar has no `S` prefix at all -- an unknown set there
 * echoes the bare number it was named with, not SELECT's form (no source records COMBINE's
 * own error text; see proto.combine.statement's note). */
export async function addSet(
  session: DialogSession, expr: SearchExpression, echo: string, showPerTerm = true, extraKeys: string[] = [],
  bareSetErrors = false,
): Promise<OutputLine[]> {
  let result; let resolved: SearchExpression;
  try {
    // Resolve any E-number operand (SELECT E3, E3:E5) against the open EXPAND display
    // first, so the retrieval engine only ever sees a "refs" node whose ordinals are
    // already the postings that ref names -- it never learns what an E-number is.
    resolved = await resolveRefs(session, expr);
    // prepare() loads any word-index shards (or truncation prefix scans) this expression
    // needs (a no-op for an expression with no word/trunc operand); search() itself stays
    // synchronous and only ever reads what prepare() already cached.
    await session.engine.prepare(resolved);
    result = session.engine.search(resolved, new Map(session.sets.map(s => [s.id, s.ordinals])));
  }
  catch (e) {
    if (e instanceof UnknownSet) return [line(`? ${bareSetErrors ? "" : "S"}${e.id}`, { registryKeys: ["proto.error.unknown_set"] })];
    if (e instanceof UnknownSuffix) return [line(`? ${e.code}`, { registryKeys: ["proto.error.unknown_suffix"] })];
    if (e instanceof UnknownRef) return [line(`? ${e.echo}`, { registryKeys: ["proto.error.unknown_field"] })];
    if (e instanceof UnknownField) {
      // A prefix the 1998 Blue Sheet documents but this build has no index for
      // (e.g. FY=) is a real File 60 search this milestone has not implemented, not a
      // typo -- route it to the same capability-notice channel as EXPAND/DISPLAY SETS
      // (session.lastNotice, read by main.ts outside the character stream) instead of the
      // simulated error form.
      if (e.documented) { session.lastNotice = { command: `${e.field.toUpperCase()}= (search prefix)` }; return []; }
      return [line(`? ${e.field.toUpperCase()}=${e.term.toUpperCase()}`, { registryKeys: ["proto.error.unknown_field"] })];
    }
    throw e;
  }
  const id = session.sets.length + 1;
  session.sets.push({ id, echo, expr: resolved, perTerm: result.perTerm, ordinals: result.ordinals });
  const out: OutputLine[] = [];
  // render.setline.columns (the fixed setCol/itemsEnd/descCol
  // positions setLine() reads) shapes every set line's spacing, not just the parts
  // proto.select.per_term_postings/proto.select.setline name -- cited alongside them so
  // the inspect panel reaches it from the set line itself. A single "term" or "trunc"
  // operand prints no separate per-term line: its own set line already carries the same
  // count and the same echoed display (2001: "?select forecast?" -> one line, "S1 16106
  // FORECAST?"; the 1978 File 60 session: "SELECT LOBSTER?" -> one line, "3 14 LOBSTER?").
  if (showPerTerm && (result.perTerm.length > 1 || (resolved.kind !== "term" && resolved.kind !== "trunc")))
    for (const t of result.perTerm) out.push(line(setLine(null, t.postings, t.display), { registryKeys: ["proto.select.per_term_postings", "render.setline.columns", "index.phrase.uppercase"] }));
  out.push(line(setLine(id, result.ordinals.length, echo), { registryKeys: ["proto.select.setline", "render.setline.columns", "render.record.order", ...extraKeys] }));
  return out;
}

export async function runSelect(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "select" }>): Promise<OutputLine[]> {
  // Never a bare "?" (see offendingToken in ./shared): print the first AND-level
  // operand of the already-parsed, already-uppercased echo -- the same rule
  // offendingToken applies from raw text, applied here to the parsed command instead,
  // since this branch has no raw input text to re-derive it from.
  if (session.currentFile === null) return [line(`? ${firstAndOperand(cmd.echo)}`, { registryKeys: ["proto.error.bad_file"] })];
  return await addSet(session, cmd.expr, cmd.echo);
}

export async function runSelectSteps(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "selectsteps" }>): Promise<OutputLine[]> {
  if (session.currentFile === null) return [line(`? ${firstAndOperand(cmd.echo)}`, { registryKeys: ["proto.error.bad_file"] })];
  const out: OutputLine[] = [line("Processing", { registryKeys: ["proto.selectsteps.processing"] })];
  const leaves = operands(cmd.expr);
  // A single-operand SS numbers one set: the operand and the whole statement are the same
  // expression, and DIALOG prints one line for it, not the same line twice.
  if (leaves.length > 1) for (const leaf of leaves) out.push(...await addSet(session, leaf, echoOf(leaf), true, ["proto.selectsteps.sets"]));
  out.push(...await addSet(session, cmd.expr, cmd.echo, leaves.length === 1, ["proto.selectsteps.sets"]));
  return out;
}
