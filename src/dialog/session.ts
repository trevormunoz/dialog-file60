import type { LogicalRecord } from "@barcstory/cris-formatb";
import type { DialogCommand } from "./ast";
import { parse } from "./parser";
import { line, type OutputLine } from "./stream";
import { registry } from "../registry";
import type { RetrievalEngine, SearchExpression } from "../retrieval/engine";
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

const DEFAULT_USER = registry.get("proto.session.user_number").value as string;
registry.get("proto.error.unknown_command");
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
      case "expand": return runExpand(this, cmd);
      case "page": return runPage(this, cmd);
      case "displaysets": return runDisplaySets(this, cmd);
      case "logoff": return runLogoff(this);
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
