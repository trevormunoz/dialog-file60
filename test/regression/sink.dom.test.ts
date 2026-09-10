// @vitest-environment happy-dom
//
// Environment: happy-dom, declared per-file above rather than via vitest.config.ts's
// (deprecated) environmentMatchGlobs.
//
// This file exercises DomSink in a real (if headless) DOM, proving the happy-dom
// environment wiring in vitest.config.ts before covering DomSink's actual contract.
import { readFileSync } from "node:fs";
import { DomSink, type Scheduler } from "../../src/terminal/sink";
import { PaperPause } from "../../src/terminal/display-mode";
import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";
import { registry } from "../../src/registry";

// Paced output (terminal.pacing): print() emits one character per 1000/cps milliseconds
// through the scheduler the sink was built with. The tests below inject this fake clock
// instead of setTimeout, so the timing is asserted rather than waited out, and runAll() is a
// loop, not recursion -- a full record is thousands of characters.
const CPS = (registry.get("terminal.pacing").value as { cps: number }).cps;
const CHAR_MS = 1000 / CPS;

class FakeClock {
  now = 0;
  private pending: { at: number; fn: () => void }[] = [];
  readonly schedule: Scheduler = (fn, ms) => { this.pending.push({ at: this.now + ms, fn }); };
  /** Run the next scheduled callback in time order; false when nothing is pending. */
  step(): boolean {
    if (!this.pending.length) return false;
    this.pending.sort((a, b) => a.at - b.at);
    const next = this.pending.shift()!;
    this.now = next.at;
    next.fn();
    return true;
  }
  /** Run every scheduled callback, and everything they schedule, in time order. */
  runAll(): void {
    let guard = 0;
    while (this.pending.length) {
      if (++guard > 1_000_000) throw new Error("fake clock did not settle");
      this.pending.sort((a, b) => a.at - b.at);
      const next = this.pending.shift()!;
      this.now = next.at;
      next.fn();
    }
  }
}

/** A sink whose pacing runs on `clock`; returns both so a test can drive the clock. */
function pacedSink(onSubmit: (line: string) => Promise<void> = async () => {}) {
  const clock = new FakeClock();
  const root = document.createElement("div");
  const sink = new DomSink(root, onSubmit, "?", clock.schedule);
  return { clock, root, sink };
}

/** print() the lines and run the clock out, returning print()'s own promise. */
async function printAll(sink: DomSink, clock: FakeClock, lines: Parameters<DomSink["print"]>[0]): Promise<void> {
  const done = sink.print(lines);
  clock.runAll();
  await done;
}

test("the happy-dom environment mounts a real DOM for DomSink", () => {
  const { root, sink } = pacedSink();
  expect(sink.printout).toBeInstanceOf(HTMLPreElement);
  expect(root.contains(sink.printout)).toBe(true);
});

// The inspect panel reads data-ordinal/data-tags/data-keys back off a
// printed span (src/inspect/panel.ts:133-139); this is the write side of that contract.
test("print() stamps an annotated line's span with data-ordinal, data-tags, data-keys", async () => {
  const { clock, sink } = pacedSink();
  await printAll(sink, clock, [{ text: "      IN   HAMMERSCHLAG  F A", provenance: {
    recordOrdinal: 836, sources: [{ tag: "IN", valueIndex: 2 }], registryKeys: ["map.IN"],
  } }]);
  const span = sink.printout.querySelector("span[data-ordinal]") as HTMLElement;
  expect(span).not.toBeNull();
  expect(span.dataset.ordinal).toBe("836");
  expect(span.dataset.tags).toBe("IN");
  expect(span.dataset.valueIndex).toBe("2");
  expect(span.dataset.keys).toBe("map.IN");
  // A stamped span is focusable -- the production line this asserts is
  // the one keyboard-only inspect (mountInspect) depends on to reach a printed record line
  // without a pointer.
  expect(span.tabIndex).toBe(0);
});

test("print() does not make an unannotated line's span focusable", async () => {
  const { clock, sink } = pacedSink();
  await printAll(sink, clock, [{ text: "plain literal line" }]);
  const span = sink.printout.querySelector("span") as HTMLElement;
  expect(span).not.toBeNull();
  expect(span.dataset.ordinal).toBeUndefined();
  expect(span.tabIndex).toBe(-1);
});

// proto.prompt.spacing (documented, value "") -- the echoed
// line is the prompt immediately followed by the typed input, no space between them.
test("submitting a line echoes the bare prompt with no space before the input", async () => {
  const submitted: string[] = [];
  const { root } = pacedSink(async (l) => { submitted.push(l); });
  const input = root.querySelector("textarea")!;
  input.value = "b 60";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  const spans = root.querySelectorAll("pre.printout span");
  expect(spans[spans.length - 1]!.textContent).toBe("?b 60\n");
  expect(submitted).toEqual(["b 60"]);
});

// reset() is the one piece of "restart" that belongs to DomSink itself --
// emptying the printout and starting a fresh line discipline (so a wrapped line's hanging
// indent from before restart cannot bleed into a line printed after it). Restart as a whole
// (a fresh DialogSession, clearing the notice, resetting the inspect panel) is app wiring in
// src/app/main.ts, not a DomSink concern; the DIALOG layer gains no restart concept of its
// own (a plain `new DialogSession(engine, render)` already starts with no current file and no
// sets), which the second test below exercises directly, the same way it will run from main.ts.
test("reset() empties the printout and starts a fresh line discipline", async () => {
  const { clock, sink } = pacedSink();
  await printAll(sink, clock, [{ text: "some prior output" }]);
  expect(sink.printout.children.length).toBeGreaterThan(0);
  sink.reset();
  expect(sink.printout.children.length).toBe(0);
});

// Restart leaves an empty `?` prompt with focus. The Alt+R chord is bound at the document
// level and fires while the searcher is
// typing, so reset() must clear whatever is sitting in the input -- otherwise the first thing
// a fresh session sees is a command composed for the discarded one.
test("reset() clears a half-typed command from the input", () => {
  const { root, sink } = pacedSink();
  const input = root.querySelector("textarea")!;
  input.value = "s cy=ames";
  sink.reset();
  expect(input.value).toBe("");
});

// Screen mode caps the printout at terminal.screen_rows (24, registry).
// DomSink.print() implements the cap in one place, after appending; the line discipline
// itself is untouched -- screen_rows counts rows (spans) as printed, one per wrapped line,
// the same unit LineDiscipline already produces.
test("printout mode (the default) keeps every printed line", async () => {
  const { clock, sink } = pacedSink();
  expect(sink.displayMode).toBe("printout");
  await printAll(sink, clock, Array.from({ length: 30 }, (_, i) => ({ text: `line ${i}` })));
  expect(sink.printout.querySelectorAll("span").length).toBe(30);
});

test("screen mode keeps only the last terminal.screen_rows lines, removed from the DOM", async () => {
  const { clock, sink } = pacedSink();
  sink.setDisplayMode("screen");
  await printAll(sink, clock, Array.from({ length: 30 }, (_, i) => ({ text: `line ${i}` })));
  const spans = [...sink.printout.querySelectorAll("span")];
  expect(spans.length).toBe(24);
  expect(spans[0]!.textContent).toBe("line 6\n"); // the first six are gone entirely
  expect(sink.printout.textContent).not.toContain("line 0\n");
  expect(sink.printout.textContent).not.toContain("line 5\n");
});

test("switching printout to screen discards everything above the last screenful; switching back does not restore it", async () => {
  const { clock, sink } = pacedSink();
  await printAll(sink, clock, Array.from({ length: 30 }, (_, i) => ({ text: `line ${i}` })));
  expect(sink.printout.querySelectorAll("span").length).toBe(30);

  sink.setDisplayMode("screen");
  expect(sink.printout.querySelectorAll("span").length).toBe(24); // trimmed immediately, no new line needed

  sink.setDisplayMode("printout");
  expect(sink.printout.querySelectorAll("span").length).toBe(24); // not restored
  await printAll(sink, clock, [{ text: "one more" }]);
  expect(sink.printout.querySelectorAll("span").length).toBe(25); // and now grows freely again
});

const stubOffsets = { file: "RG164.CRIS.FY94.txt", sha256: "x", records: [["9049442", 1, 1] as [string, number, number]] };
const stubIndexes = { CY: { code: "CY", terms: { BELTSVILLE: [0] } } };
const stubReader: RangeReader = { async read() { return new Uint8Array(0); } };
const render = () => [{ text: "<record>" }];

// After B 60 and one SELECT, restart leaves zero set lines in the printout and a session
// with no current file; a subsequent SELECT prints the simulated pre-BEGIN error. Exercised
// directly against DomSink.reset() and a freshly constructed DialogSession -- the same two
// production pieces src/app/main.ts's restart() recombines -- rather than through main.ts
// itself, which bootstraps by fetching the corpus and has no automated test anywhere in this
// repository (it is verified by driving the app in a browser).
test("restart (DomSink.reset() plus a fresh DialogSession) leaves no set lines and a pre-BEGIN session", async () => {
  const { clock, sink } = pacedSink();
  let session = new DialogSession(new RetrievalEngine(stubOffsets, stubIndexes, stubReader, "fy1991plus"), render);
  await printAll(sink, clock, await session.submit("b 60"));
  await printAll(sink, clock, await session.submit("s cy=beltsville"));
  expect(sink.printout.textContent).toMatch(/S1/);
  expect(session.currentFile).toBe(60);

  session = new DialogSession(new RetrievalEngine(stubOffsets, stubIndexes, stubReader, "fy1991plus"), render);
  sink.reset();

  expect(sink.printout.querySelectorAll("span").length).toBe(0);
  expect(session.currentFile).toBeNull();
  expect(session.sets).toEqual([]);
  const out = await session.submit("s cy=beltsville");
  expect(out.map(l => l.text)).toEqual(["? CY=BELTSVILLE"]); // proto.error.bad_file: issued before BEGIN
});

// terminal.pacing: printed characters arrive at the registry's cps, one at a
// time, through the injected scheduler. Output already queued keeps its order, and a second
// print() waits for the first to drain before any of its own characters appear.
describe("paced output (terminal.pacing)", () => {
  test("a printed line appears one character at a time, at the registry's rate", () => {
    const { clock, sink } = pacedSink();
    void sink.print([{ text: "ABCD" }]);
    const span = () => sink.printout.querySelector("span")!.textContent;
    // The first character goes out when print() is called; each later one waits a tick.
    expect(span()).toBe("A");
    expect(clock.now).toBe(0);
    clock.step(); expect(span()).toBe("AB"); expect(clock.now).toBeCloseTo(CHAR_MS, 6);
    clock.step(); expect(span()).toBe("ABC"); expect(clock.now).toBeCloseTo(2 * CHAR_MS, 6);
    clock.step(); expect(span()).toBe("ABCD"); expect(clock.now).toBeCloseTo(3 * CHAR_MS, 6);
    clock.runAll();
    expect(span()).toBe("ABCD\n"); // the newline closes the row after the last character
    expect(clock.now).toBeCloseTo(4 * CHAR_MS, 6);
    expect(CPS).toBe(120); // pinned: registry terminal.pacing's documented rate
  });

  test("print() resolves only once the whole queue has been written", async () => {
    const { clock, sink } = pacedSink();
    let firstDone = false, secondDone = false;
    void sink.print([{ text: "first" }]).then(() => { firstDone = true; });
    const second = sink.print([{ text: "second" }]).then(() => { secondDone = true; });
    expect(firstDone).toBe(false);
    clock.runAll();
    await second;
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    expect(sink.printout.textContent).toBe("first\nsecond\n");
  });

  test("output already queued keeps its order behind an echo typed after it", () => {
    const { clock, sink } = pacedSink();
    void sink.print([{ text: "printed" }]);
    sink.echo("?", "typed"); // queued behind the paced output, not written over it
    clock.runAll();
    expect(sink.printout.textContent).toBe("printed\n?typed\n");
  });

  test("the echo of a typed line is not paced: it appears without the clock advancing", () => {
    const { clock, sink } = pacedSink();
    sink.echo("?", "b 60");
    expect(sink.printout.textContent).toBe("?b 60\n");
    expect(clock.now).toBe(0);
  });

  test("inspect stamping and screen-mode trimming still hold on paced output", async () => {
    const { clock, sink } = pacedSink();
    sink.setDisplayMode("screen");
    await printAll(sink, clock, Array.from({ length: 30 }, (_, i) => ({
      text: `line ${i}`, provenance: { recordOrdinal: i, registryKeys: ["map.IN"] },
    })));
    const spans = [...sink.printout.querySelectorAll("span")];
    expect(spans.length).toBe(24);
    expect(spans[0]!.textContent).toBe("line 6\n");
    expect(spans[0]!.dataset.ordinal).toBe("6");
    expect(spans[0]!.dataset.keys).toBe("map.IN");
    expect(spans[0]!.tabIndex).toBe(0);
  });

  test("reset() drops output still queued from the discarded session", async () => {
    const { clock, sink } = pacedSink();
    const done = sink.print([{ text: "from the old session" }]);
    sink.reset();
    await done; // reset releases whoever was waiting on the queue
    clock.runAll();
    expect(sink.printout.textContent).toBe("");
  });
});

// The textarea is never disabled across `await onSubmit(l)`, which includes onSubmit's own
// paced drain (main.ts's onSubmit calls `await sink.print(out)`); disabling it there dropped
// keystrokes typed while output was still printing. The input stays enabled the whole time;
// Enter pressed during a drain queues its line instead of being lost or racing the drain
// already in flight.
describe("the prompt stays live during output", () => {
  /** Advances the fake clock one scheduled step at a time, yielding a microtask after each step
   * so a promise continuation that itself schedules more clock steps (runSubmit picking up a
   * queued line once the line ahead of it finishes) is seen before the loop asks the clock
   * whether anything is still pending. */
  async function runClockToSettled(clock: FakeClock): Promise<void> {
    let guard = 0;
    while (clock.step()) {
      await Promise.resolve();
      if (++guard > 100_000) throw new Error("fake clock did not settle");
    }
  }

  test("typing during a drain is not lost: the input is never disabled while onSubmit's own paced output is printing", async () => {
    let sinkRef!: DomSink;
    const { clock, root, sink } = pacedSink(async () => { await sinkRef.print([{ text: "AB" }]); });
    sinkRef = sink;
    const input = root.querySelector("textarea")!;
    input.value = "b 60";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    // The "AB" drain triggered by onSubmit is now in flight (nothing advances it until the
    // clock steps), so this is squarely inside the window the old code disabled the input for.
    expect(input.disabled).toBe(false);
    input.value = "s cy=beltsville"; // what the searcher typed while output was still printing
    expect(input.disabled).toBe(false);
    await runClockToSettled(clock);
    await Promise.resolve(); await Promise.resolve();
    expect(input.value).toBe("s cy=beltsville"); // never cleared or blocked by the drain
  });

  test("a second Enter during a drain is processed after the first output completes, in order", async () => {
    const submitted: string[] = [];
    let sinkRef!: DomSink;
    const { clock, root, sink } = pacedSink(async (l) => { submitted.push(l); await sinkRef.print([{ text: `out:${l}` }]); });
    sinkRef = sink;
    const input = root.querySelector("textarea")!;

    input.value = "first";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    input.value = "second";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve();
    // "second" is only queued: onSubmit must not have started running for it yet, and it must
    // not be echoed yet, while the first output is still draining.
    expect(submitted).toEqual(["first"]);
    expect(sink.printout.textContent).not.toContain("second");

    await runClockToSettled(clock);
    await runClockToSettled(clock); // a trailing round: "out:second"'s own pacing starts only
    // after the promise chain from "first"'s finish resolves, one microtask after the loop
    // above last saw the clock empty.

    expect(submitted).toEqual(["first", "second"]);
    expect(sink.printout.textContent).toBe("?first\nout:first\n?second\nout:second\n");
  });

  test("reset() during a drain drops queued output and the queued line", async () => {
    const submitted: string[] = [];
    let sinkRef!: DomSink;
    const { clock, root, sink } = pacedSink(async (l) => { submitted.push(l); await sinkRef.print([{ text: `out:${l}` }]); });
    sinkRef = sink;
    const input = root.querySelector("textarea")!;

    input.value = "first";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    input.value = "second";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve();

    sink.reset();
    await runClockToSettled(clock);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(submitted).toEqual(["first"]); // "second" was still queued, never submitted
    expect(sink.printout.textContent).toBe(""); // reset cleared everything, including "first"'s in-flight output
  });
});

// Paper mode (terminal.display_mode, terminal.paper_sheet, terminal.paper_delay). These tests
// exercise the real CSS in index.html against a fixture built from the same element shapes
// main.ts assembles -- #bar, aside, .pane-label, #notice, #sheet around DomSink's own root --
// rather than reimplementing the hiding rules, the same way inspect.dom.test.ts's wrapping
// test checks a real computed style instead of asserting a class name.
describe("paper mode", () => {
  let styleEl: HTMLStyleElement;
  beforeAll(() => {
    const css = readFileSync("index.html", "utf8").match(/<style>([\s\S]*?)<\/style>/)![1]!;
    styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  });
  afterAll(() => { styleEl.remove(); });
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.classList.remove("paper", "pending");
  });

  /** Builds the chrome paper mode hides or keeps -- #bar (a text node, a link, a restart
   * button, and the one button that keeps the id="display-mode" CSS keys off), aside, the
   * pane label, the notice paragraph -- around a DomSink mounted in #sheet > #terminal, and
   * attaches all of it to document.body (getComputedStyle only reflects a connected element).
   */
  function chromeFixture(onSubmit?: (line: string) => Promise<void>) {
    const bar = document.createElement("div"); bar.id = "bar";
    const link = document.createElement("a"); link.textContent = "registry";
    const restartButton = document.createElement("button"); restartButton.textContent = "Restart session";
    const displayModeButton = document.createElement("button"); displayModeButton.id = "display-mode";
    bar.append(document.createTextNode("A reconstruction, not a recorded session"), link, restartButton, displayModeButton);
    const aside = document.createElement("aside");
    const paneLabel = document.createElement("div"); paneLabel.className = "pane-label";
    const notice = document.createElement("p"); notice.id = "notice";
    const layout = document.createElement("div"); layout.className = "layout";
    const pane = document.createElement("div"); pane.className = "terminal-pane";
    const sheet = document.createElement("div"); sheet.id = "sheet";
    const { clock, root: terminal, sink } = pacedSink(onSubmit);
    terminal.id = "terminal";
    sheet.appendChild(terminal);
    pane.append(paneLabel, sheet, notice);
    layout.append(pane, aside);
    document.body.append(bar, layout);
    return { bar, aside, paneLabel, notice, link, restartButton, displayModeButton, sheet, terminal, clock, sink };
  }

  /** happy-dom caches an element's computed style and does not recompute it from a later
   * classList change alone; re-appending the element (a no-op move -- it is already its
   * parent's child) forces a fresh cascade before the next getComputedStyle call on it. Only
   * needed before a second getComputedStyle read on the same element within one test. */
  function restyle(el: Element): void { el.parentNode?.appendChild(el); }

  test("entering paper hides the aside, the bar (except the display-mode control), the pane label and the notice", () => {
    const f = chromeFixture();
    f.sink.setDisplayMode("paper", { restored: true });
    expect(getComputedStyle(f.aside).display).toBe("none");
    expect(getComputedStyle(f.paneLabel).display).toBe("none");
    expect(getComputedStyle(f.notice).display).toBe("none");
    expect(getComputedStyle(f.link).display).toBe("none");
    expect(getComputedStyle(f.restartButton).display).toBe("none");
    expect(getComputedStyle(f.displayModeButton).display).not.toBe("none");
  });

  test("paper mode keeps every printed line, exactly as printout does", async () => {
    const f = chromeFixture();
    f.sink.setDisplayMode("paper", { restored: true });
    await printAll(f.sink, f.clock, Array.from({ length: 30 }, (_, i) => ({ text: `line ${i}` })));
    expect(f.sink.printout.querySelectorAll("span").length).toBe(30);
  });

  test("entering paper live shows an empty sheet until the scheduler advances 600 ms", () => {
    const f = chromeFixture();
    f.sink.setDisplayMode("paper");
    expect(document.documentElement.classList.contains("pending")).toBe(true);
    expect(getComputedStyle(f.sink.printout).visibility).toBe("hidden");
    const stepped = f.clock.step();
    expect(stepped).toBe(true);
    expect(f.clock.now).toBe(600);
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    restyle(f.sink.printout);
    expect(getComputedStyle(f.sink.printout).visibility).not.toBe("hidden");
  });

  test("a pause superseded by a leave and a new enter is not ended early by the first pause's stale timer", () => {
    const clock = new FakeClock();
    const pause = new PaperPause(clock.schedule);
    const ends: number[] = [];
    pause.enter({}, () => ends.push(clock.now)); // t=0: schedules an end at t=600
    clock.now = 200;
    pause.leave(() => ends.push(clock.now)); // t=200: ends immediately, but the t=600 timer is still pending
    clock.now = 400;
    pause.enter({}, () => ends.push(clock.now)); // t=400: schedules a new end at t=1000
    expect(clock.step()).toBe(true); // the stale t=600 callback runs and must do nothing
    expect(clock.now).toBe(600);
    expect(document.documentElement.classList.contains("pending")).toBe(true);
    expect(clock.step()).toBe(true); // the t=1000 callback ends the second pause
    expect(clock.now).toBe(1000);
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    expect(ends).toEqual([200, 1000]);
  });

  test("no pause under reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      const f = chromeFixture();
      f.sink.setDisplayMode("paper");
      expect(document.documentElement.classList.contains("pending")).toBe(false);
      expect(getComputedStyle(f.sink.printout).visibility).not.toBe("hidden");
    } finally { window.matchMedia = original; }
  });

  test("no pause when the mode is restored on load", () => {
    const f = chromeFixture();
    f.sink.setDisplayMode("paper", { restored: true });
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    expect(getComputedStyle(f.sink.printout).visibility).not.toBe("hidden");
  });

  test("leaving paper restores the chrome immediately, with no pause", () => {
    const f = chromeFixture();
    f.sink.setDisplayMode("paper", { restored: true });
    expect(getComputedStyle(f.aside).display).toBe("none");
    f.sink.setDisplayMode("printout");
    expect(document.documentElement.classList.contains("paper")).toBe(false);
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    restyle(f.aside);
    expect(getComputedStyle(f.aside).display).not.toBe("none");
  });

  test("a command submitted while paper mode is pending runs only after the pause", async () => {
    const submitted: string[] = [];
    const f = chromeFixture(async (l) => { submitted.push(l); });
    f.sink.setDisplayMode("paper");
    const input = f.terminal.querySelector("textarea")!;
    input.value = "b 60";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(submitted).toEqual([]);
    expect(f.sink.printout.textContent).toBe("");
    f.clock.step();
    await Promise.resolve(); await Promise.resolve();
    expect(submitted).toEqual(["b 60"]);
    expect(f.sink.printout.textContent).toBe("?b 60\n");
  });

  test("an echoed command line carries the paper input-weight marker", () => {
    const f = chromeFixture();
    f.sink.echo("?", "b 60");
    const span = f.sink.printout.querySelector("span[data-echo]");
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe("?b 60\n");
  });

  test("a printed output line does not carry the echo marker", async () => {
    const f = chromeFixture();
    await printAll(f.sink, f.clock, [{ text: "plain output" }]);
    const span = f.sink.printout.querySelector("span")!;
    expect(span.dataset.echo).toBeUndefined();
  });
});
