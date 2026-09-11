import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { setLine } from "../setline";
import { header } from "./begin";
import { registry } from "../../registry";

registry.get("proto.displaysets.table");
registry.get("proto.error.bad_file");

export async function runDisplaySets(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "displaysets" }>): Promise<OutputLine[]> {
  if (session.currentFile === null) return [line("? DS", { registryKeys: ["proto.error.bad_file"] })];
  const shown = session.sets.filter(s => cmd.from === null || (s.id >= cmd.from && s.id <= cmd.to!));
  return [
    ...header.map(h => line(h, { registryKeys: ["proto.begin.set_header"] })),
    ...shown.map(s => line(setLine(s.id, s.ordinals.length, s.echo), { registryKeys: ["proto.displaysets.table"] })),
  ];
}
