import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { parseItems } from "../parser";
import { registry } from "../../registry";

registry.get("proto.print.ack");
registry.get("proto.print.no_artefact");
registry.get("proto.error.unknown_set");
registry.get("proto.print.item_range"); // cited here; the reversed-range zero-count normalization below

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
  // at nothing. A range naming items past the set's own last item (e.g. "1-10" on a 1-item set)
  // is clamped to the items that actually exist, the same clamp TYPE applies via its own
  // set.ordinals[i-1] check (commands/type.ts) -- PRINT must not bill for records that do not
  // exist, and the 2001 manual's own worked example (ALL -> "items 1-75") equals the set size,
  // never a requested range larger than it.
  const count = cmd.items === "ALL"
    ? set.ordinals.length
    : (parseItems(cmd.items) ?? []).filter(i => i <= set.ordinals.length).length;
  session.printCounts[cmd.format] = (session.printCounts[cmd.format] ?? 0) + count;
  // Printed<echo>, the 1978 File 60 session's own acknowledgement, missing space preserved as
  // printed (proto.print.ack's note). PRINT's sort codes are part of `echo` here, not read
  // separately -- they are echoed, not obeyed (proto.print.no_artefact): this reconstruction
  // prints no artefact for them to order.
  return [line(`Printed${cmd.echo}`, { registryKeys: ["proto.print.ack", "proto.print.no_artefact"] })];
}
