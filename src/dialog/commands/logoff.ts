import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { hhmmss, logoffBlock, type Rates } from "../accounting";
import { KWIC_DEFAULT } from "../kwic";
import { registry } from "../../registry";

registry.get("proto.logoff.template");
registry.get("proto.accounting.combination");
registry.get("proto.session.user_number");
registry.get("proto.session.clock");

export async function runLogoff(session: DialogSession): Promise<OutputLine[]> {
  const end = session.clock.now();
  const keys = ["proto.logoff.template", "rates.file60_1998", "proto.accounting.combination", "proto.session.user_number", "proto.session.clock"];
  const out: OutputLine[] = session.accounting
    ? logoffBlock({ start: session.start, end, user: session.user, types: session.typeCounts, rates: registry.get("rates.file60_1998").value as Rates })
        .map(t => line(t, { registryKeys: keys }))
    : [];
  out.push(line(`LOGOFF ${hhmmss(end)}`, { registryKeys: ["proto.logoff.template"] }));
  // A disconnection: no current file, no sets, no open EXPAND display, and the KWIC window
  // back to its default (2001: SET KWIC "remains in effect until LOGOFF") -- a following
  // SELECT prints the simulated error for a command issued before BEGIN.
  session.currentFile = null; session.sets = []; session.expand = null; session.kwicSize = KWIC_DEFAULT;
  return out;
}
