import type { LogicalRecord } from "@barcstory/cris-formatb";
import type { DialogCommand } from "./ast";
import { parse } from "./parser";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import { UnknownSet, UnknownField, UnknownSuffix, type RetrievalEngine, type SearchExpression } from "../retrieval/engine";

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

export class DialogSession {
  sets: SearchSet[] = [];
  currentFile: number | null = null;
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

  private async run(cmd: DialogCommand): Promise<OutputLine[]> {
    switch (cmd.cmd) {
      case "begin": {
        if (cmd.file !== 60) return [line(`? ${cmd.file}`, { registryKeys: ["proto.error.bad_file"] })];
        this.currentFile = 60; this.sets = [];
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
        let result;
        try {
          // prepare() loads any word-index shards this expression needs (a no-op for an
          // expression with no word operand); search() itself stays synchronous and only
          // ever reads what prepare() already cached.
          await this.engine.prepare(cmd.expr);
          result = this.engine.search(cmd.expr, new Map(this.sets.map(s => [s.id, s.ordinals])));
        }
        catch (e) {
          if (e instanceof UnknownSet) return [line(`? S${e.id}`, { registryKeys: ["proto.error.unknown_set"] })];
          if (e instanceof UnknownSuffix) return [line(`? ${e.code}`, { registryKeys: ["proto.error.unknown_suffix"] })];
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
        const set: SearchSet = { id, echo: cmd.echo, expr: cmd.expr, perTerm: result.perTerm, ordinals: result.ordinals };
        this.sets.push(set);
        const out: OutputLine[] = [];
        // render.setline.columns (the fixed setCol/itemsEnd/descCol
        // positions setLine() reads) shapes every set line's spacing, not just the parts
        // proto.select.per_term_postings/proto.select.setline name -- cited alongside them so
        // the inspect panel reaches it from the set line itself.
        if (result.perTerm.length > 1 || cmd.expr.kind !== "term")
          for (const t of result.perTerm) out.push(line(setLine(null, t.postings, t.display), { registryKeys: ["proto.select.per_term_postings", "render.setline.columns", "index.phrase.uppercase"] }));
        out.push(line(setLine(id, result.ordinals.length, cmd.echo), { registryKeys: ["proto.select.setline", "render.setline.columns", "render.record.order"] }));
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
