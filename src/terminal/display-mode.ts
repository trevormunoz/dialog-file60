// Display mode: the type, the injected scheduler it shares with paced output, and paper
// mode's own class toggling and pause. Split out of sink.ts to keep that file under 300 lines
// (design note: "if sink.ts crosses it, the mode handling splits into
// src/terminal/display-mode.ts").

/** "printout" (the default) keeps
 * every line and lets the pane scroll -- a printing terminal's paper; "screen" keeps only the
 * most recent terminal.screen_rows lines, an unbuffered CRT; "paper" keeps every line, like
 * printout, and restyles the retained scrollback as a fixed-pitch sheet (terminal.paper_sheet). */
export type DisplayMode = "printout" | "screen" | "paper";

/** Runs `fn` after `ms` milliseconds. The default is setTimeout; a test injects a fake clock
 * so paced output -- and paper mode's own pause -- can be driven without waiting in real time
 * (test/regression/sink.dom.test.ts). Injected through DomSink's constructor rather than read
 * from a module-level global, so two sinks in one process can be paced differently. */
export type Scheduler = (fn: () => void, ms: number) => void;

export const setTimeoutScheduler: Scheduler = (fn, ms) => { setTimeout(fn, ms); };

/** terminal.paper_delay's own figure: the empty-sheet pause on a live switch into paper mode.
 * The entry's value is prose, not a structured number, so the milliseconds live here; the
 * registry.get call at the switch handler (DomSink.setDisplayMode) is the citation. */
export const PAPER_DELAY_MS = 600;

/** Owns paper mode's `paper` and `pending` classes on the document root and the pause between
 * them. `pending` is read by DomSink to decide whether a submitted line queues instead of
 * running immediately (the same queue a second Enter during a drain already uses). */
export class PaperPause {
  pending = false;
  constructor(private schedule: Scheduler) {}
  /** Adds the `paper` class. A restored mode (main.ts applying a stored mode on load) or
   * reduced motion shows the sheet at once; a live switch adds `pending` and calls `onEnd`
   * once the scheduled pause completes -- the pause marks the act of switching, not the page
   * loading. */
  enter(opts: { restored?: boolean }, onEnd: () => void): void {
    const root = document.documentElement;
    root.classList.add("paper");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (opts.restored || reduced) { this.end(onEnd); return; }
    this.pending = true;
    root.classList.add("pending");
    this.schedule(() => { this.end(onEnd); }, PAPER_DELAY_MS);
  }
  /** Removes the `paper` class immediately, with no pause, and releases anything still queued
   * behind a pause that had not finished. */
  leave(onEnd: () => void): void {
    document.documentElement.classList.remove("paper");
    this.end(onEnd);
  }
  private end(onEnd: () => void): void {
    this.pending = false;
    document.documentElement.classList.remove("pending");
    onEnd();
  }
}
