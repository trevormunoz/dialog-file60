import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { setLine } from "../setline";
import { registry } from "../../registry";

registry.get("proto.sort.command");
registry.get("proto.sort.newset");
registry.get("proto.sort.fields");
// SORT reuses EXPAND's already-recorded statement of absence about DIALOG's collation
// (proto.expand.collation) instead of restating it -- see RetrievalEngine.sortOrdinals.
registry.get("proto.expand.collation");
registry.get("proto.error.unknown_field");
registry.get("proto.error.unknown_set");

/** The Blue Sheet, Sorting section's own field list (heading "SORTABLE FIELDS / EXAMPLES"),
 * verbatim -- the set of field codes SORT accepts at all, whether or not this build carries a
 * value for one. A code outside this list is refused (the simulated `? <FIELD>` form, citing
 * proto.error.unknown_field, the same key an unresolved SELECT PREFIX= uses); a code on the
 * list this corpus has no built phrase index for (AG, AI, AT, CG, ID, SP -- five HNRIMS/ICAR
 * codes plus AT, whose only built index lives under the composite code A1, see registry key
 * proto.sort.fields) succeeds with every record's key empty, which is the corpus's own answer,
 * not an error. */
export const SORTABLE_FIELDS = [
  "AG", "AI", "AN", "AS", "AT", "CG", "CY", "DS", "ID", "IN", "PD", "PN", "PO", "PT", "RE", "SF", "SP", "ST", "ZP",
];

export async function runSort(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "sort" }>): Promise<OutputLine[]> {
  const badField = cmd.keys.find(k => !SORTABLE_FIELDS.includes(k.field));
  if (badField) return [line(`? ${badField.field}`, { registryKeys: ["proto.error.unknown_field"] })];
  const set = session.sets.find(s => s.id === cmd.set);
  if (!set) return [line(`? S${cmd.set}`, { registryKeys: ["proto.error.unknown_set"] })];
  const ordinals = session.engine.sortOrdinals(set.ordinals, cmd.keys);
  const id = session.sets.length + 1;
  // "Sort " (mixed case, "Sort" capitalised) followed by the command's own argument,
  // uppercased -- the literal string the 2001 book's two worked examples print twice
  // ("S2 60 Sort Sl/ALL/AU", "S2 147 Sort S1/ALL/SA,D/ST"), reproduced rather than
  // normalised (see proto.sort.newset's note).
  const echo = `Sort ${cmd.echo}`;
  session.sets.push({ id, echo, expr: { kind: "set", id: cmd.set }, perTerm: [], ordinals });
  return [line(setLine(id, ordinals.length, echo), { registryKeys: ["proto.sort.newset", "render.setline.columns", "proto.expand.collation"] })];
}
