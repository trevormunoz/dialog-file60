import type { LogicalRecord } from "@barcstory/cris-formatb";
import type { DialogCommand } from "./ast";
import { parse } from "./parser";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import { UnknownSet, UnknownField, UnknownSuffix, UnknownRef, type RetrievalEngine, type SearchExpression } from "../retrieval/engine";
import { expandWindow, expandPage, expandLines, BASIC_INDEX, PAGE_ROWS, MAX_REF, type ExpandState } from "./expand";

const cols = registry.get("render.setline.columns").value as { setCol: number; itemsEnd: number; descCol: number };
const header = registry.get("proto.begin.set_header").value as string[];
const banner = registry.get("proto.begin.banner").value as { fileNumber: string; title: string };
registry.get("proto.begin.set_reset"); registry.get("proto.select.setline"); registry.get("proto.type.item_header");
// proto.begin.copyright_line: a database owner's copyright line may
// follow the banner in DIALOG generally (fixtures/1994-curso-pais.txt, a different File's
// BEGIN transcript, shows one); no source records File 60's, so the begin case below prints
// none -- this citation is the record of that gap, not a behavior it enacts.
registry.get("proto.begin.copyright_line");
registry.get("proto.error.unknown_command"); registry.get("proto.error.bad_file"); registry.get("proto.error.unknown_field"); registry.get("proto.error.unknown_suffix"); registry.get("proto.error.type_range");
// proto.error.unmatched_parens is recorded, not printed: an unclosed bracket falls through
// parseExpression to parse()'s ordinary { cmd: "unknown" } path and prints the same simulated
// question-mark form as any other unparseable SELECT (proto.error.unknown_command), above --
// this citation is the record of the documented reply this reconstruction chose not to adopt,
// not a behavior enacted here.
registry.get("proto.error.unmatched_parens");

export interface SearchSet { id: number; echo: string; expr: SearchExpression; perTerm: { display: string; postings: number }[]; ordinals: number[]; }

/** Set number at column setCol (1-based), items right-aligned ending at itemsEnd, description from descCol. */
export function setLine(id: number | null, items: number, desc: string): string {
  const setText = id === null ? "" : `S${id}`;
  const left = " ".repeat(cols.setCol - 1) + setText;
  const itemsText = String(items);
  const padded = left + " ".repeat(Math.max(1, cols.itemsEnd - left.length - itemsText.length)) + itemsText;
  return padded + " ".repeat(Math.max(1, cols.descCol - padded.length - 1)) + desc;
}

/** The first AND-level operand of `expr`, splitting on a bare (case-insensitive) "AND" token
 * -- this milestone's SELECT grammar has no nested AND, so the first operand is well defined
 * without duplicating parser.ts's recursion. Shared by offendingToken below (the raw SELECT
 * tail) and the select-before-BEGIN branch in run() (the already-uppercased echo), so the
 * same split is not spelled two different ways. */
function firstAndOperand(expr: string): string {
  return expr.split(/\s+and\s+/i)[0]!.trim();
}

/** The token a bare `?` names for the cases reached from raw input text (the simulated error
 * form is `?` plus an offending token, never a bare `?`): for a SELECT whose expression
 * failed to parse, the first AND-level operand of the attempted expression; for a TYPE whose
 * form parser.ts otherwise recognizes (`T`/`TYPE`) but whose remainder matches neither the
 * set/format/items form nor the by-accession-number form, that whole remainder -- blaming
 * bare "T" would name the recognized command word instead of the form that actually failed
 * to parse; otherwise the input line's first word. Pure text
 * matching, not a re-parse. The select-before-BEGIN branch below reaches the SELECT rule
 * differently, from the already-parsed command's echo rather than raw text, since by that
 * point the raw line is gone. */
function offendingToken(text: string): string {
  const t = text.trim();
  const select = /^(?:s|select)\s+(.+)$/i.exec(t);
  if (select) return firstAndOperand(select[1]!).toUpperCase();
  const type = /^(?:t|type)\s+(.+)$/i.exec(t);
  if (type) return type[1]!.trim().toUpperCase();
  return (t.split(/\s+/)[0] ?? "").toUpperCase();
}

/** Wraps an E-number back into DIALOG's 1..MAX_REF sequence -- used to compute PAGE-'s ref
 * numbers, since it moves the window without reusing an already-computed ExpandState.nextRef. */
const wrapRef = (n: number): number => ((n - 1) % MAX_REF + MAX_REF) % MAX_REF + 1;

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
    default: return "";   // operands() returns leaves only, so this is unreachable
  }
}

export class DialogSession {
  sets: SearchSet[] = [];
  currentFile: number | null = null;
  /** The currently open EXPAND display, if any -- BEGIN clears it, a new `EXPAND <term>`
   * replaces it ("erases the previous list", 2001), and SELECT resolves E-number operands
   * against it. */
  expand: ExpandState | null = null;
  /** The most recent capability notice: a command the
   * parser recognizes as documented for File 60 but outside this milestone's slice. `null`
   * when the most recent command was not one of those -- an ordinary command clears a stale
   * notice, so the app never shows a notice about a command two turns ago. Read by the app
   * (main.ts) to show one modern line beneath the prompt; never printed into the character
   * stream. */
  lastNotice: { command: string } | null = null;
  constructor(private engine: RetrievalEngine, private render: (rec: LogicalRecord, format: string) => OutputLine[]) {}

  async submit(input: string): Promise<OutputLine[]> {
    const cmd = parse(input);
    this.lastNotice = cmd.cmd === "unsupported" ? { command: cmd.command } : null;
    return this.run(cmd);
  }

  /** Replaces every "refs" node's empty ordinals with the postings the ref(s) it names
   * resolve to, walking and/or/not the same way engine.prepare() does. Throws UnknownRef
   * (printed `? <echo>`) when no EXPAND is open, or when a ref names a row outside the page
   * currently displayed -- an E-number is only ever selectable against the display that
   * showed it. */
  private async resolveRefs(expr: SearchExpression): Promise<SearchExpression> {
    switch (expr.kind) {
      case "and": case "or": case "not":
        return { ...expr, left: await this.resolveRefs(expr.left), right: await this.resolveRefs(expr.right) };
      case "refs": {
        const m = /^E(\d+)(?::E(\d+))?$/.exec(expr.echo)!;
        const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
        if (!this.expand) throw new UnknownRef(expr.echo);
        let ordinals: number[] = [];
        for (let n = a; n <= b; n++) {
          const row = this.expand.rows.find(r => r.ref === n);
          if (!row) throw new UnknownRef(expr.echo);
          ordinals = ordinals.concat(await this.engine.termOrdinals(this.expand.code, row.term));
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
   * per-term-and-final numbering rule. */
  private async addSet(expr: SearchExpression, echo: string, showPerTerm = true, extraKeys: string[] = []): Promise<OutputLine[]> {
    let result; let resolved: SearchExpression;
    try {
      // Resolve any E-number operand (SELECT E3, E3:E5) against the open EXPAND display
      // first, so the retrieval engine only ever sees a "refs" node whose ordinals are
      // already the postings that ref names -- it never learns what an E-number is.
      resolved = await this.resolveRefs(expr);
      // prepare() loads any word-index shards this expression needs (a no-op for an
      // expression with no word operand); search() itself stays synchronous and only
      // ever reads what prepare() already cached.
      await this.engine.prepare(resolved);
      result = this.engine.search(resolved, new Map(this.sets.map(s => [s.id, s.ordinals])));
    }
    catch (e) {
      if (e instanceof UnknownSet) return [line(`? S${e.id}`, { registryKeys: ["proto.error.unknown_set"] })];
      if (e instanceof UnknownSuffix) return [line(`? ${e.code}`, { registryKeys: ["proto.error.unknown_suffix"] })];
      if (e instanceof UnknownRef) return [line(`? ${e.echo}`, { registryKeys: ["proto.error.unknown_field"] })];
      if (e instanceof UnknownField) {
        // A prefix the 1998 Blue Sheet documents but this build has no index for
        // (e.g. FY=) is a real File 60 search this milestone has not implemented, not a
        // typo -- route it to the same capability-notice channel as EXPAND/DISPLAY SETS
        // (this.lastNotice, read by main.ts outside the character stream) instead of the
        // simulated error form.
        if (e.documented) { this.lastNotice = { command: `${e.field.toUpperCase()}= (search prefix)` }; return []; }
        return [line(`? ${e.field.toUpperCase()}=${e.term.toUpperCase()}`, { registryKeys: ["proto.error.unknown_field"] })];
      }
      throw e;
    }
    const id = this.sets.length + 1;
    const set: SearchSet = { id, echo, expr: resolved, perTerm: result.perTerm, ordinals: result.ordinals };
    this.sets.push(set);
    const out: OutputLine[] = [];
    // render.setline.columns (the fixed setCol/itemsEnd/descCol
    // positions setLine() reads) shapes every set line's spacing, not just the parts
    // proto.select.per_term_postings/proto.select.setline name -- cited alongside them so
    // the inspect panel reaches it from the set line itself.
    if (showPerTerm && (result.perTerm.length > 1 || resolved.kind !== "term"))
      for (const t of result.perTerm) out.push(line(setLine(null, t.postings, t.display), { registryKeys: ["proto.select.per_term_postings", "render.setline.columns", "index.phrase.uppercase"] }));
    out.push(line(setLine(id, result.ordinals.length, echo), { registryKeys: ["proto.select.setline", "render.setline.columns", "render.record.order", ...extraKeys] }));
    return out;
  }

  private async run(cmd: DialogCommand): Promise<OutputLine[]> {
    switch (cmd.cmd) {
      case "begin": {
        if (cmd.file !== 60) return [line(`? ${cmd.file}`, { registryKeys: ["proto.error.bad_file"] })];
        this.currentFile = 60; this.sets = []; this.expand = null;
        // dialog.file60.title (documented) carries the actual title text this line prints;
        // proto.begin.banner (inferred) carries only the banner's own structure -- both are
        // real provenance for this one line, cited together.
        return [line(""), line(`File  ${banner.fileNumber}:${banner.title}`, { registryKeys: ["proto.begin.banner", "dialog.file60.title"] }), line(""), ...header.map(h => line(h, { registryKeys: ["proto.begin.set_header"] }))];
      }
      case "select": {
        // Never a bare "?" (see offendingToken above): print the first AND-level
        // operand of the already-parsed, already-uppercased echo -- the same rule
        // offendingToken applies from raw text, applied here to the parsed command instead,
        // since this branch has no raw input text to re-derive it from.
        if (this.currentFile === null) return [line(`? ${firstAndOperand(cmd.echo)}`, { registryKeys: ["proto.error.bad_file"] })];
        return await this.addSet(cmd.expr, cmd.echo);
      }
      case "selectsteps": {
        if (this.currentFile === null) return [line(`? ${firstAndOperand(cmd.echo)}`, { registryKeys: ["proto.error.bad_file"] })];
        const out: OutputLine[] = [line("Processing", { registryKeys: ["proto.selectsteps.processing"] })];
        const leaves = operands(cmd.expr);
        // A single-operand SS numbers one set: the operand and the whole statement are the same
        // expression, and DIALOG prints one line for it, not the same line twice.
        if (leaves.length > 1) for (const leaf of leaves) out.push(...await this.addSet(leaf, echoOf(leaf), true, ["proto.selectsteps.sets"]));
        out.push(...await this.addSet(cmd.expr, cmd.echo, leaves.length === 1, ["proto.selectsteps.sets"]));
        return out;
      }
      case "type": {
        const set = this.sets.find(s => s.id === cmd.set);
        // An unknown set number is its own simulated-error case
        // (proto.error.unknown_set), the same key SELECT's UnknownSet branch cites above --
        // not proto.error.type_range, whose own claim is about an item number past the end of
        // a set that does exist (the case below, when ordinal is undefined).
        if (!set) return [line(`? S${cmd.set}`, { registryKeys: ["proto.error.unknown_set"] })];
        const out: OutputLine[] = [];
        for (const i of cmd.items) {
          const ordinal = set.ordinals[i - 1];
          if (ordinal === undefined) { out.push(line(`? ${i}`, { registryKeys: ["proto.error.type_range"] })); break; }
          const rec = await this.engine.record(ordinal);
          out.push(line(""), line(`${set.id}/${cmd.format}/${i}`, { recordOrdinal: ordinal, registryKeys: ["proto.type.item_header"] }));
          for (const l of this.render(rec, cmd.format)) out.push({ ...l, provenance: { ...l.provenance, recordOrdinal: ordinal } });
        }
        return out;
      }
      case "expand": {
        if (this.currentFile === null) return [line(`? ${cmd.term.trim().toUpperCase()}`, { registryKeys: ["proto.error.bad_file"] })];
        const m = /^([A-Za-z]{2})=(.*)$/.exec(cmd.term);
        const code = m ? m[1]!.toUpperCase() : BASIC_INDEX;
        const enteredRaw = (m ? m[2]! : cmd.term).trim();
        const entered = enteredRaw === "" ? null : enteredRaw.toUpperCase();
        let terms: [string, number][];
        try { terms = await this.engine.termList(code); }
        catch (e) {
          if (e instanceof UnknownSuffix) return [line(`? ${e.code}`, { registryKeys: ["proto.error.unknown_suffix"] })];
          if (e instanceof UnknownField) {
            // A documented prefix this build has no index for (see SELECT's own UnknownField
            // branch above) routes to the same capability-notice channel, not the simulated
            // typo error.
            if (e.documented) { this.lastNotice = { command: `${e.field.toUpperCase()}= (search prefix)` }; return []; }
            return [line(`? ${e.field.toUpperCase()}=${entered ?? ""}`, { registryKeys: ["proto.error.unknown_field"] })];
          }
          throw e;
        }
        const w = entered !== null ? expandWindow(terms, entered) : { start: 0, enteredAt: null, absent: false };
        this.expand = expandPage({ terms, start: w.start, firstRef: 1, entered, enteredAt: w.enteredAt, absent: w.absent, code });
        return expandLines(this.expand).map(t => line(t, { registryKeys: ["proto.expand.display", "proto.expand.window", "proto.expand.page", "proto.expand.enumbers"] }));
      }
      case "page": {
        // PAGE- moves back two windows from the state's own `start` (already the position
        // just past the page shown, so one PAGE_ROWS back reaches the start of that page, and
        // a second reaches the page before it); a plain PAGE continues forward from `start`
        // as it stands (proto.expand.page: "the next 12 entries"). expandPage still gets the
        // original entered/enteredAt/absent so an absent entered term stays in the browsed
        // list at its inserted position on every later page (2001: "the original EXPAND entry
        // is no longer asterisked" says the row is still there, just unstarred) -- the star is
        // cleared afterward, not by passing entered: null into expandPage, which would drop an
        // absent term's inserted row entirely instead of only un-starring it.
        if (!this.expand) return [line(`? ${cmd.back ? "PAGE-" : "PAGE"}`, { registryKeys: ["proto.error.unknown_command"] })];
        const { terms, code, entered, enteredAt, absent } = this.expand;
        const start = cmd.back ? Math.max(0, this.expand.start - 2 * PAGE_ROWS) : this.expand.start;
        const firstRef = cmd.back ? wrapRef(this.expand.nextRef - 2 * PAGE_ROWS) : this.expand.nextRef;
        // paged.entered stays the original entered term (not null): a later PAGE or PAGE- must
        // still see it, so an absent term's inserted row keeps its position across every
        // further page of the same EXPAND browse, not just the first PAGE call.
        const paged = expandPage({ terms, start, firstRef, entered, enteredAt, absent, code });
        this.expand = { ...paged, rows: paged.rows.map(r => ({ ...r, starred: false })) };
        return expandLines(this.expand).map(t => line(t, { registryKeys: ["proto.expand.page", "proto.expand.enumbers"] }));
      }
      case "displaysets": {
        if (this.currentFile === null) return [line("? DS", { registryKeys: ["proto.error.bad_file"] })];
        const shown = this.sets.filter(s => cmd.from === null || (s.id >= cmd.from && s.id <= cmd.to!));
        return [
          ...header.map(h => line(h, { registryKeys: ["proto.begin.set_header"] })),
          ...shown.map(s => line(setLine(s.id, s.ordinals.length, s.echo), { registryKeys: ["proto.displaysets.table"] })),
        ];
      }
      case "unsupported": {
        // The terminal prints nothing for this. this.lastNotice (set in submit(), above) is
        // the app's route to it, outside the stream this method returns.
        return [];
      }
      case "unknown": {
        const token = offendingToken(cmd.text);
        return [line(token ? `? ${token}` : "?", { registryKeys: ["proto.error.unknown_command"] })];
      }
    }
  }
}
