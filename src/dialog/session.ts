import type { LogicalRecord } from "@barcstory/cris-formatb";
import type { DialogCommand } from "./ast";
import { parse } from "./parser";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import { UnknownField, type RetrievalEngine, type SearchExpression } from "../retrieval/engine";
import { rankTally, rankLines, isWordIndexedField } from "./rank";
import type { ExpandState } from "./expand";
import type { SessionClock } from "./accounting";
import { setLine } from "./setline";
import { offendingToken } from "./commands/shared";
import { runBegin } from "./commands/begin";
import { runSelect, runSelectSteps } from "./commands/select";
import { runType } from "./commands/type";
import { runExpand, runPage } from "./commands/expand";
import { runDisplaySets } from "./commands/displaysets";
import { runLogoff } from "./commands/logoff";
import { runSort } from "./commands/sort";
import { runCombine } from "./commands/combine";
import { runPrint } from "./commands/print";
import { KWIC_DEFAULT } from "./kwic";

const DEFAULT_USER = registry.get("proto.session.user_number").value as string;
registry.get("proto.error.unknown_command");
registry.get("proto.setkwic.ack");
// proto.error.unmatched_parens is recorded, not printed: an unclosed bracket falls through
// parseExpression to parse()'s ordinary { cmd: "unknown" } path and prints the same simulated
// question-mark form as any other unparseable SELECT (proto.error.unknown_command) -- this
// citation is the record of the documented reply this reconstruction chose not to adopt, not
// a behavior enacted here.
registry.get("proto.error.unmatched_parens");

export interface SearchSet { id: number; echo: string; expr: SearchExpression; perTerm: { display: string; postings: number }[]; ordinals: number[]; }

// Re-exported so callers that only need the printed set-line layout (tests included) do not
// have to know it now lives in ./setline.
export { setLine };

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
  clock: SessionClock;
  user: string;
  accounting: boolean;
  /** The moment the session was constructed -- LOGOFF's connect-time line prices from here,
   * not from the most recent BEGIN, matching a real DIALOG connection's own billed span. */
  start: Date;
  /** TYPE calls actually made (a valid item ordinal reached, format-render errors included),
   * counted per format string -- what LOGOFF's per-format cost lines price. */
  typeCounts: Record<string, number> = {};
  /** PRINT calls actually made, counted per format string the same way typeCounts counts
   * TYPE -- what LOGOFF's Prints lines price. Not `private`: commands/print.ts increments it
   * and commands/logoff.ts reads it, the same access every other extracted handler has to
   * this session's other state (see kwicSize's own note on the same point). PRINT produces no
   * artefact (proto.print.no_artefact); this is only a count. */
  printCounts: Record<string, number> = {};
  /** The KWIC window size, in words -- SET KWIC nn sets it; the 2001 entry's own note says it
   * "remains in effect until LOGOFF", so runLogoff resets it back to KWIC_DEFAULT rather than
   * this field's initializer running again. Not `private`: commands/type.ts reads it directly
   * to build format K's windows, the same access every other extracted handler has to this
   * session's other state. */
  kwicSize = KWIC_DEFAULT;
  constructor(
    public engine: RetrievalEngine,
    public render: (rec: LogicalRecord, format: string) => OutputLine[],
    opts?: { clock?: SessionClock; user?: string; accounting?: boolean },
  ) {
    this.clock = opts?.clock ?? { now: () => new Date() };
    this.user = opts?.user ?? DEFAULT_USER;
    this.accounting = opts?.accounting ?? true;
    this.start = this.clock.now();
  }

  async submit(input: string): Promise<OutputLine[]> {
    const cmd = parse(input);
    this.lastNotice = cmd.cmd === "unsupported" ? { command: cmd.command } : null;
    return this.run(cmd);
  }

  /** Dispatches to one handler per command kind, each in ./commands -- see that directory's
   * files for the behavior itself; this method only routes. */
  private async run(cmd: DialogCommand): Promise<OutputLine[]> {
    switch (cmd.cmd) {
      case "begin": return runBegin(this, cmd);
      case "select": return runSelect(this, cmd);
      case "selectsteps": return runSelectSteps(this, cmd);
      case "type": return runType(this, cmd);
      case "sort": return runSort(this, cmd);
      case "rank": return this.runRank(cmd);
      case "combine": return runCombine(this, cmd);
      case "print": return runPrint(this, cmd);
      case "expand": return runExpand(this, cmd);
      case "page": return runPage(this, cmd);
      case "displaysets": return runDisplaySets(this, cmd);
      case "logoff": return runLogoff(this);
      case "setkwic": {
        this.kwicSize = cmd.size;
        // "KWIC is set to 14." -- the 2001 manual's own worked example's acknowledgement,
        // verbatim, with this command's own size in place of its 14.
        return [line(`KWIC is set to ${cmd.size}.`, { registryKeys: ["proto.setkwic.ack"] })];
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

  /** RANK <field> <Sn>: refuses a word-indexed field (proto.rank.wordfields) or an unknown
   * set/field (proto.error.unknown_set / proto.error.unknown_field, the same simulated `?`
   * forms SORT already uses) before tallying; otherwise prints the RANK Results block
   * (src/dialog/rank.ts's rankLines, over rankTally's ranked rows). No `Sn` (cmd.set === null)
   * ranks this session's own most recently created set. */
  private runRank(cmd: Extract<DialogCommand, { cmd: "rank" }>): OutputLine[] {
    const set = cmd.set !== null ? this.sets.find(s => s.id === cmd.set) : this.sets[this.sets.length - 1];
    if (cmd.set !== null && !set) return [line(`? S${cmd.set}`, { registryKeys: ["proto.error.unknown_set"] })];
    if (!set) return [line("? RANK", { registryKeys: ["proto.error.unknown_command"] })];
    if (isWordIndexedField(cmd.field)) return [line(`? ${cmd.field}`, { registryKeys: ["proto.rank.wordfields"] })];
    let counts: [string, number][];
    try { counts = this.engine.rankValues(cmd.field, set.ordinals); }
    catch (e) {
      if (e instanceof UnknownField) return [line(`? ${cmd.field}`, { registryKeys: ["proto.error.unknown_field"] })];
      throw e;
    }
    const rows = rankTally(counts);
    return rankLines({ setId: set.id, itemsSearched: set.ordinals.length, field: cmd.field, rows }).map(t =>
      line(t, { registryKeys: ["proto.rank.command", "proto.rank.display", "proto.rank.columns"] }),
    );
  }
}
