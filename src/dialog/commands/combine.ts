import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import type { OutputLine } from "../stream";
import { addSet } from "./select";
import { registry } from "../../registry";

registry.get("proto.combine.statement");

/** COMBINE: builds a new set from set arithmetic over existing set numbers, reusing the same
 * expression-search path SELECT's operands already go through (addSet, ./select.ts) --
 * COMBINE's own set is just a "set"/"and"/"or"/"not" expression parser.ts already built by
 * the time it reaches here. `showPerTerm` is false: the 1978 session's own set lines show
 * COMBINE printing only its own line, never a per-term breakdown, even for its multi-operand
 * statements ("? COMBINE (8 AND 12) NOT 15" prints one line, "16 35 (8 AND 12) NOT 15", not
 * three). `bareSetErrors` is true: COMBINE's operands are bare set numbers, without the `S`
 * prefix SELECT uses, so a set COMBINE names that does not exist echoes the same way its own
 * operand was typed ("? 1"), not SELECT's "? S1". */
export async function runCombine(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "combine" }>): Promise<OutputLine[]> {
  return await addSet(session, cmd.expr, cmd.echo, false, ["proto.combine.statement"], true);
}
