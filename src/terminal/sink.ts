// DOM sink: the only place in this milestone that touches the DOM. Built with
// createElement and textContent, never HTML strings. The DIALOG layer never
// imports this module; the DIALOG layer never touches the DOM.
import type { OutputLine } from "../dialog/stream";
import { LineDiscipline } from "./discipline";
import { registry } from "../registry";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; return e;
};

/** "printout" (the default) keeps
 * every line and lets the pane scroll -- a printing terminal's paper; "screen" keeps only the
 * most recent terminal.screen_rows lines, an unbuffered CRT. */
export type DisplayMode = "printout" | "screen";

/** Runs `fn` after `ms` milliseconds. The default is setTimeout; a test injects a fake clock
 * so paced output can be driven without waiting in real time (test/regression/sink.dom.test.ts).
 * Injected through the constructor rather than read from a module-level global, so two sinks
 * in one process can be paced differently. */
export type Scheduler = (fn: () => void, ms: number) => void;

const setTimeoutScheduler: Scheduler = (fn, ms) => { setTimeout(fn, ms); };

/** Milliseconds between printed characters: registry terminal.pacing's own cps. 120 characters
 * per second is a speed documented for DIALOG access in 1984-1988; no source records the speed
 * of a File 60 session (see the entry's note for the statement of absence). */
const CHAR_MS = 1000 / (registry.get("terminal.pacing").value as { cps: number }).cps;

/** One queued write. `paced` is false for the echo of a line the searcher typed: those
 * characters came from the keyboard, not down the line, so no transmission speed applies. */
interface Batch { lines: OutputLine[]; paced: boolean }

export class DomSink {
  readonly printout: HTMLPreElement;
  private input: HTMLTextAreaElement;
  private cursor: HTMLElement;
  private live: HTMLElement;
  private discipline = new LineDiscipline();
  /** Read by print() after every append; changed only through
   * setDisplayMode(), which also trims immediately on the printout->screen transition. */
  displayMode: DisplayMode = "printout";
  // registry.get("proto.prompt").value is "?" with no trailing space: the prompt DIALOG emits
  // is a bare "?", and any space after it was typed by the searcher or set by a compositor.
  // The default here matches it so a caller that omits `prompt` still gets the grounded form.
  /** Batches waiting to be written, oldest first, and the callers waiting for the queue to
   * drain. Output already queued keeps its order. */
  private queue: Batch[] = [];
  private draining = false;
  private drained: (() => void)[] = [];
  /** Bumped by reset(). A drain in flight when the session is restarted checks this before
   * every step and stops, so a half-written line from the discarded session cannot keep
   * appending into the fresh printout. */
  private generation = 0;
  /** The prompt stays live while `onSubmit` runs, including the
   * paced drain it triggers -- the input is never disabled, so a searcher can keep typing
   * while output is still printing. Only one submission runs at a time; Enter pressed while
   * one is in flight queues its line here instead of racing it or being dropped. Cleared by
   * reset(), which drops any line queued for a session that no longer exists. */
  private pendingLines: string[] = [];
  private submitting = false;
  constructor(root: HTMLElement, onSubmit: (line: string) => Promise<void>, private prompt = "?", private schedule: Scheduler = setTimeoutScheduler) {
    // terminal.scrollback: scrolling this <pre> is a modern
    // convenience, not a reconstruction of any DIALOG-period behavior. No custom scroll
    // chrome is added -- the browser's own scrollbar is kept as-is.
    registry.get("terminal.scrollback");
    registry.get("terminal.display_mode"); // cited here; the toggle and its state live in src/app/main.ts
    // terminal.width (inferred, 80): index.html's `.printout{max-width:80ch}` is this
    // fact's enactment -- CSS cannot call registry.get() itself, so this no-op citation is
    // the source-side reference for it.
    registry.get("terminal.width");
    // terminal.width_rule (chosen): the printout's border-right in index.html marks that width;
    // same CSS-side enactment, same source-side citation.
    registry.get("terminal.width_rule");
    this.printout = el("pre", "printout");
    const promptline = el("div", "promptline");
    const promptSpan = el("span", "prompt"); promptSpan.textContent = prompt;
    this.input = el("textarea"); this.input.rows = 1; this.input.spellcheck = false; this.input.setAttribute("aria-label", "DIALOG command");
    // terminal.cursorForm (inferred): a blinking underline at an idle prompt, measured in the
    // 1984 broadcast of a DIALOG search on an IBM PC. The underline is that PC program's, not
    // DIALOG's, which sent characters and left the cursor to the searcher's terminal.
    const cursorForm = registry.get("terminal.cursorForm").value as string;
    this.cursor = el("span", `cursor cursor-${cursorForm}`);
    this.live = el("div", "live"); this.live.setAttribute("aria-live", "polite");
    promptline.append(promptSpan, this.input, this.cursor);
    root.replaceChildren(this.printout, promptline, this.live);
    const moveCursor = (): void => {
      const pos = this.input.selectionStart ?? this.input.value.length;
      this.cursor.style.left = `${this.prompt.length + pos}ch`;
    };
    this.input.addEventListener("input", moveCursor);
    this.input.addEventListener("keyup", moveCursor);
    this.input.addEventListener("click", moveCursor);
    // A submission runs to completion (echo, then onSubmit's own
    // paced drain) before the next one starts, but the input is never disabled while that
    // happens -- only Enter is intercepted here, so ordinary typing reaches the textarea the
    // whole time. A second Enter pressed while one submission is still running queues its line
    // in pendingLines instead of starting a second, overlapping onSubmit; runSubmit echoes and
    // submits each queued line only once the one ahead of it has finished, in the order Enter
    // was pressed.
    const runSubmit = async (l: string): Promise<void> => {
      this.submitting = true;
      this.echo(this.prompt, l);
      moveCursor();
      await onSubmit(l);
      this.submitting = false;
      const next = this.pendingLines.shift();
      if (next !== undefined) { void runSubmit(next); return; }
      this.input.focus();
      moveCursor();
    };
    this.input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const l = this.input.value; this.input.value = "";
      moveCursor();
      if (this.submitting) { this.pendingLines.push(l); return; }
      void runSubmit(l);
    });
    moveCursor();
    this.input.focus();
  }
  /** The prompt keeps focus after each command already (see the
   * keydown handler below); this is the same return-to-prompt action, callable from
   * mountInspect's Escape handler so a keyboard-only user can leave the inspect panel. */
  focusInput(): void { this.input.focus(); }
  /** The DomSink half of "restart" -- empties the printout and starts a fresh LineDiscipline,
   * so a hanging indent left over from a wrapped line before restart cannot bleed into a line
   * printed after it. The rest of restart (a fresh DialogSession, clearing the notice,
   * resetting the inspect panel) is app wiring (src/app/main.ts), not this sink's concern.
   * It also clears the input. Restart is not only ever invoked between commands -- the Alt+R
   * chord is bound at the document level and fires while the searcher is typing -- and
   * restart leaves an empty `?` prompt with focus, not a command composed for the discarded
   * session. */
  reset(): void {
    this.discipline = new LineDiscipline(); this.printout.replaceChildren();
    this.input.value = "";
    // Anything still queued belongs to the discarded session. Drop it, and release whoever is
    // waiting on it, rather than letting it print into the fresh printout.
    this.queue = [];
    this.generation++;
    this.finishDrain();
    // A line queued behind a still-running submission (pendingLines)
    // also belongs to the discarded session -- drop it too, so runSubmit's continuation (which
    // fires once the in-flight onSubmit above resolves via finishDrain) has nothing left to pick
    // up.
    this.pendingLines = [];
  }
  /** Switching into screen mode discards everything above the last
   * screenful immediately (no confirmation -- the reader chose it); switching back to
   * printout does not restore what screen mode already removed, since those rows are gone
   * from the DOM, not hidden. */
  setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
    if (mode === "screen") this.trimToScreenRows();
  }
  private trimToScreenRows(): void {
    const rows = registry.get("terminal.screen_rows").value as number;
    while (this.printout.children.length > rows) this.printout.firstElementChild?.remove();
  }
  /** The echo of a line the searcher typed. Not paced (see Batch), and written straight away
   * when nothing is queued ahead of it. */
  echo(prompt: string, input: string): void { void this.enqueue({ lines: [{ text: prompt + input }], paced: false }); }
  /** Print output lines at terminal.pacing's rate, one character at a time. Resolves when the
   * whole queue -- these lines and anything already ahead of them -- has been written. */
  print(lines: OutputLine[]): Promise<void> {
    return this.enqueue({ lines, paced: true });
  }
  private enqueue(batch: Batch): Promise<void> {
    this.queue.push(batch);
    const waited = new Promise<void>(resolve => this.drained.push(resolve));
    if (!this.draining) this.drain();
    return waited;
  }
  private finishDrain(): void {
    this.draining = false;
    const waiting = this.drained; this.drained = [];
    for (const resolve of waiting) resolve();
  }
  private drain(): void {
    this.draining = true;
    const gen = this.generation;
    const nextBatch = (): void => {
      if (gen !== this.generation) return;
      const batch = this.queue.shift();
      if (!batch) { this.finishDrain(); return; }
      let i = 0;
      const nextLine = (): void => {
        if (gen !== this.generation) return;
        if (i >= batch.lines.length) {
          this.live.textContent = batch.lines.map(l => l.text).join("\n");
          nextBatch();
          return;
        }
        this.writeLine(batch.lines[i]!, batch.paced, gen, () => { i++; nextLine(); });
      };
      nextLine();
    };
    nextBatch();
  }
  /** Wrap one output line, append its spans (stamped, empty), then fill them -- a character at
   * a time when `paced`, all at once otherwise -- and call `done`. The stamping is identical
   * either way, so click-to-inspect works on paced output exactly as it did on instant output.
   */
  private writeLine(l: OutputLine, paced: boolean, gen: number, done: () => void): void {
    const before = this.discipline.lines.length;
    this.discipline.write(l.text);
    const rows = this.discipline.lines.slice(before).map(text => ({ span: this.stampedSpan(l), text }));
    for (const row of rows) this.printout.appendChild(row.span);
    const endOfLine = (): void => {
      // The cap lives in this one place; the line discipline stays
      // untouched, and terminal.wrap's own row count is exactly what screen_rows counts.
      if (this.displayMode === "screen") this.trimToScreenRows();
      this.printout.scrollTop = this.printout.scrollHeight;
      done();
    };
    if (!paced) {
      for (const row of rows) row.span.textContent = row.text + "\n";
      endOfLine();
      return;
    }
    let r = 0, c = 0;
    const tick = (): void => {
      if (gen !== this.generation) return;
      const row = rows[r];
      if (!row) { endOfLine(); return; }
      if (c >= row.text.length) { row.span.textContent = row.text + "\n"; r++; c = 0; tick(); return; }
      c++;
      row.span.textContent = row.text.slice(0, c);
      this.printout.scrollTop = this.printout.scrollHeight;
      this.schedule(tick, CHAR_MS);
    };
    tick();
  }
  private stampedSpan(l: OutputLine): HTMLSpanElement {
    const span = el("span");
    const p = l.provenance;
    // A stamped span is focusable so inspect is reachable without a
    // pointer (Enter/Space on it, wired in mountInspect, opens it exactly as a click does).
    if (p?.recordOrdinal !== undefined) { span.dataset.ordinal = String(p.recordOrdinal); span.tabIndex = 0; }
    if (p?.sources) {
      span.dataset.tags = p.sources.map(s => s.tag).join(",");
      // One shared value index per line (render5's L() applies it to every tag on the
      // line together); see ProvenanceSource in stream.ts.
      const vi = p.sources.find(s => s.valueIndex !== undefined)?.valueIndex;
      if (vi !== undefined) span.dataset.valueIndex = String(vi);
    }
    if (p?.registryKeys) span.dataset.keys = p.registryKeys.join(",");
    return span;
  }
}
