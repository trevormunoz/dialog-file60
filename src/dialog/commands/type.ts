import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { kwicLines, kwicTerms } from "../kwic";
import { registry } from "../../registry";

registry.get("proto.type.item_header");
registry.get("proto.error.unknown_set");
registry.get("proto.error.type_range");

export async function runType(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "type" }>): Promise<OutputLine[]> {
  const set = session.sets.find(s => s.id === cmd.set);
  // An unknown set number is its own simulated-error case
  // (proto.error.unknown_set), the same key SELECT's UnknownSet branch cites -- not
  // proto.error.type_range, whose own claim is about an item number past the end of
  // a set that does exist (the case below, when ordinal is undefined).
  if (!set) return [line(`? S${cmd.set}`, { registryKeys: ["proto.error.unknown_set"] })];
  const out: OutputLine[] = [];
  for (const i of cmd.items) {
    const ordinal = set.ordinals[i - 1];
    if (ordinal === undefined) { out.push(line(`? ${i}`, { registryKeys: ["proto.error.type_range"] })); break; }
    const rec = await session.engine.record(ordinal);
    session.typeCounts[cmd.format] = (session.typeCounts[cmd.format] ?? 0) + 1;
    out.push(line(""), line(`${set.id}/${cmd.format}/${i}`, { recordOrdinal: ordinal, registryKeys: ["proto.type.item_header"] }));
    // Format K (KWIC) needs the set's own search expression and the session's window size,
    // neither of which renderFor -- pure over one record -- has access to, so it is routed
    // here instead of through session.render. Every other format is unaffected.
    const rendered = cmd.format === "K" ? kwicLines(rec, kwicTerms(set.expr), session.kwicSize) : session.render(rec, cmd.format);
    for (const l of rendered) out.push({ ...l, provenance: { ...l.provenance, recordOrdinal: ordinal } });
  }
  return out;
}
