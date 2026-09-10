// Pure line discipline: no DOM, no I/O, no editing state. Registry keys: terminal.wrap,
// terminal.line_editing, terminal.pacing.
//
// The textarea's native editing is the input model (see src/terminal/sink.ts), so this class
// is the output wrapper only: it has no key() method and no `current` line buffer.
import { registry } from "../registry";
const WRAP = registry.get("terminal.wrap").value as { width: number; hangingIndent: number };
registry.get("terminal.line_editing"); registry.get("terminal.pacing");

export class LineDiscipline {
  lines: string[] = [];
  /** Clamped to width - 1: an indent equal to or wider than the width would never let a
   * wrapped remainder shrink below the width, looping write() forever. */
  private readonly hangingIndent: number;
  constructor(private width = WRAP.width) {
    this.hangingIndent = Math.min(WRAP.hangingIndent, this.width - 1);
  }
  write(text: string): void {
    let rest = text;
    while (rest.length > this.width) {
      this.lines.push(rest.slice(0, this.width));
      rest = " ".repeat(this.hangingIndent) + rest.slice(this.width);
    }
    this.lines.push(rest);
  }
}
