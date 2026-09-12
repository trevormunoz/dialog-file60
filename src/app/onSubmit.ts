import type { DialogSession } from "../dialog/session";
import type { DomSink } from "../terminal/sink";
import { ReconstructionFailure } from "../retrieval/failures";

export type NoticeState = { kind: "capability"; command: string } | { kind: "reconstruction" } | null;

/** The one place a per-command failure is caught. Returning normally (never rejecting) is what
 * lets DomSink.runSubmit reach `submitting = false` and drain queued input -- an uncaught
 * throw here is what froze the terminal. A ReconstructionFailure renders the modern D notice;
 * anything else is a code bug, rendered the same to the user but logged loudly for a developer. */
export function makeOnSubmit(
  getSession: () => DialogSession,
  sink: Pick<DomSink, "print">,
  showNotice: (n: NoticeState) => void,
): (line: string) => Promise<void> {
  return async (line) => {
    try {
      const session = getSession();
      const out = await session.submit(line);
      await sink.print(out);
      showNotice(session.lastNotice ? { kind: "capability", command: session.lastNotice.command } : null);
    } catch (e) {
      if (!(e instanceof ReconstructionFailure)) console.error(e);
      showNotice({ kind: "reconstruction" });
    }
  };
}
