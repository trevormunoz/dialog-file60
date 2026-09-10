// asciicast v2 (https://docs.asciinema.org/manual/asciicast/v2/) built from a flat,
// already-ordered stream of lines: the reconstruction statement's lines first, then, per
// command, the echoed prompt+command line followed by its output lines -- the exact order
// DomSink prints in the browser (src/terminal/sink.ts's echo() then print()). Pure: no DOM,
// no DialogSession, no file I/O. scripts/cast.ts assembles that order and calls this once.
import { registry } from "../registry";
import type { OutputLine } from "../dialog/stream";

export interface CastOpts {
  cps: number;
  typeCps: number;
  pauseAfterCommand: number;
  title: string;
  /** Embedded verbatim as the header's x-reconstruction object: the
   * statement text, the corpus sha256, the software version, the registry hash, and
   * cast.pacing's status words. This module does not assemble that object itself -- it has
   * no dependency on Offsets or __APP_VERSION__/__REGISTRY_HASH__, which are resolved
   * differently depending on how the caller is run (bundled app vs. tsx script). */
  header: Record<string, unknown>;
}

type Event = [number, "o", string];

const round = (t: number): number => Math.round(t * 1000) / 1000;

/**
 * A line is "typed" (paced at opts.typeCps, then followed by opts.pauseAfterCommand) rather
 * than "output" (paced at opts.cps) if its text starts with the DIALOG prompt
 * (registry.get("proto.prompt")) and carries more than just the bare prompt --
 * exactly the text DomSink.echo() produces (prompt + raw input), with no separate marker
 * needed. This milestone's four-command session (scripts/cast.ts) has no error line
 * beginning with the bare prompt character, so the heuristic is unambiguous here; a session
 * that also recorded a `?`-prefixed error line would need a different signal to tell the two
 * apart (out of scope here).
 */
function isTyped(text: string, prompt: string): boolean {
  return text.startsWith(prompt) && text.length > prompt.length;
}

export function buildCast(lines: OutputLine[] | string[], opts: CastOpts): string {
  const items: OutputLine[] = lines.map((l) => (typeof l === "string" ? { text: l } : l));
  const prompt = registry.get("proto.prompt").value as string;

  let t = 0;
  const events: Event[] = items.map((item, i) => {
    const typed = isTyped(item.text, prompt);
    const rate = typed ? opts.typeCps : opts.cps;
    t += item.text.length / rate;
    const text = (i === 0 ? "" : "\r\n") + item.text;
    const event: Event = [round(t), "o", text];
    if (typed) t += opts.pauseAfterCommand;
    return event;
  });

  // The cast's width reads registry terminal.width rather than a hardcoded 80, so the
  // 80-column measure has one source. LineDiscipline's default and index.html's CSS enact the
  // same registry fact independently; this ties the third enactment to it too.
  const header = {
    version: 2,
    width: registry.get("terminal.width").value as number,
    height: 24,
    timestamp: Math.floor(Date.now() / 1000),
    env: {},
    title: opts.title,
    // No CRT/scanline/phosphor/sound/colour claim. The app's own neutral
    // ground and ink (index.html's --ground/--ink), not a terminal-emulator convention.
    theme: { fg: "#111111", bg: "#ffffff" },
    "x-reconstruction": opts.header,
  };

  return [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join("\n") + "\n";
}
