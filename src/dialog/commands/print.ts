import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { parseItems } from "../parser";
import { registry } from "../../registry";

registry.get("proto.print.ack");
registry.get("proto.print.no_artefact");
registry.get("proto.error.unknown_set");

export async function runPrint(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "print" }>): Promise<OutputLine[]> {
  // An unknown set number is the same simulated error TYPE's own unknown-set branch prints
  // (proto.error.unknown_set), not a PRINT-specific form -- no source records one.
  const set = session.sets.find(s => s.id === cmd.set);
  if (!set) return [line(`? S${cmd.set}`, { registryKeys: ["proto.error.unknown_set"] })];
  // ALL means the whole set (the same reading DISPLAY SETS and SORT give it elsewhere); a
  // range resolves through the same parseItems parser.ts's own TYPE grammar uses. A malformed
  // range (e.g. a reversed one, "35-1") cannot reach here -- the parser's item group only
  // admits digits, commas and hyphens, but parseItems can still refuse it (a reversed range),
  // and counting zero items for that case rather than throwing keeps PRINT's own acknowledgement
  // line -- unconditional in every source held -- from failing on a request LOGOFF simply prices
  // at nothing.
  const count = cmd.items === "ALL" ? set.ordinals.length : (parseItems(cmd.items) ?? []).length;
  session.printCounts[cmd.format] = (session.printCounts[cmd.format] ?? 0) + count;
  // Printed<echo>, the 1978 File 60 session's own acknowledgement, missing space preserved as
  // printed (proto.print.ack's note). PRINT's sort codes are part of `echo` here, not read
  // separately -- they are echoed, not obeyed (proto.print.no_artefact): this reconstruction
  // prints no artefact for them to order.
  return [line(`Printed${cmd.echo}`, { registryKeys: ["proto.print.ack", "proto.print.no_artefact"] })];
}
