import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { stamp } from "../accounting";
import { registry } from "../../registry";

const header = registry.get("proto.begin.set_header").value as string[];
const banner = registry.get("proto.begin.banner").value as { fileNumber: string; title: string };
registry.get("proto.session.clock");
registry.get("proto.begin.set_reset");
registry.get("proto.error.bad_file");
// proto.begin.copyright_line: a database owner's copyright line may
// follow the banner in DIALOG generally (fixtures/1994-curso-pais.txt, a different File's
// BEGIN transcript, shows one); no source records File 60's, so the begin case below prints
// none -- this citation is the record of that gap, not a behavior it enacts.
registry.get("proto.begin.copyright_line");

export { header };

export async function runBegin(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "begin" }>): Promise<OutputLine[]> {
  if (cmd.file !== 60) return [line(`? ${cmd.file}`, { registryKeys: ["proto.error.bad_file"] })];
  session.currentFile = 60; session.sets = []; session.expand = null;
  // The same date/time/user line LOGOFF prints opens BEGIN (spec 7.2); the cost lines
  // beneath it print only when a file was already open, which cannot happen in a
  // single-file session, so BEGIN prints the stamp and nothing more.
  const stampLine = session.accounting
    ? [line(stamp(session.clock.now(), session.user), { registryKeys: ["proto.logoff.template", "proto.session.user_number", "proto.session.clock"] })]
    : [];
  // dialog.file60.title (documented) carries the actual title text this line prints;
  // proto.begin.banner (inferred) carries only the banner's own structure -- both are
  // real provenance for this one line, cited together.
  return [...stampLine, line(""), line(`File  ${banner.fileNumber}:${banner.title}`, { registryKeys: ["proto.begin.banner", "dialog.file60.title"] }), line(""), ...header.map(h => line(h, { registryKeys: ["proto.begin.set_header"] }))];
}
