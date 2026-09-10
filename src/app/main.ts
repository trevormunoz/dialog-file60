import { FetchRangeReader } from "../retrieval/reader";
import { RetrievalEngine } from "../retrieval/engine";
import { FetchWordIndex } from "../retrieval/words";
import { DialogSession } from "../dialog/session";
import { renderFor } from "../dialog/render5";
import { DomSink, type DisplayMode } from "../terminal/sink";
import { reconstructionProse, setStatementHtml, sheetHeaderFragment, BAR_HEADING } from "./statement";
import { PHRASE_FIELDS, indexUrls, offsetsUrl, corpusUrl, type Offsets, type Index } from "../loader/corpus-format";
import { mountInspect } from "../inspect/panel";
import { registry } from "../registry";
import { FY1994 } from "./corpora";
// Vite emits registry/evidence.json as a build asset and gives back a
// URL already prefixed with the configured base. The same file is imported for its *data* by
// src/registry/index.ts; this import is only for the link in the bar, so a reader can open
// the evidence the panels cite.
import registryUrl from "../../registry/evidence.json?url";

// The corpus and its indexes are served from Cloudflare R2 in the deployed build (GitHub
// Pages cannot hold a 277,539,004-byte file: GitHub blocks any file over 100 MB). A missing
// or forbidden object would otherwise surface as a JSON parse error naming nothing; this
// names the URL and the status.
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const offsets = await fetchJson<Offsets>(offsetsUrl(import.meta.env));
const indexes: Record<string, Index> = {};
for (const [c, url] of indexUrls(PHRASE_FIELDS, import.meta.env)) indexes[c] = await fetchJson<Index>(url);
const engine = new RetrievalEngine(offsets, indexes, new FetchRangeReader(corpusUrl(offsets.file, import.meta.env)), FY1994.profile, new FetchWordIndex(import.meta.env));
// Restart replaces this with a fresh DialogSession -- the DIALOG layer
// gains no "restart" concept of its own; `new DialogSession` already starts with no current
// file and no sets. `let`, not `const`, so the onSubmit closure below and restart() (further
// down) see the same current session. No opts: the constructor's own defaults already give
// the real system clock, the registered simulated user number, and accounting on -- the
// evidence-test harness and the recorded cast (scripts/cast.ts) are the callers that need a
// fixed clock instead.
let session = new DialogSession(engine, renderFor);
registry.get("capability.notice"); // cited here; rendered below, outside the stream
registry.get("terminal.restart"); // cited here; the button is wired below
const noticeEl = document.getElementById("notice")!;
const statementEl = document.getElementById("statement")!;
const barEl = document.getElementById("bar")!;
const inspectEl = document.getElementById("inspect")!;
const inspectPlaceholder = (): HTMLParagraphElement => {
  const p = document.createElement("p");
  p.textContent = "Click a typed record line, or Tab to one and press Enter, to inspect it.";
  return p;
};
// The bar's own children are built once, not on every refresh: the restart button below
// needs one stable click listener, not a fresh element and listener added on every command.
// The bar carries the statement's heading as plain text, the registry link, and the two
// buttons. There is no machine-readable provenance line, and nothing in the bar changes as
// commands run.
const barText = document.createTextNode(BAR_HEADING);
const registryLink = document.createElement("a"); registryLink.href = registryUrl; registryLink.textContent = "registry";
const restartButton = document.createElement("button");
restartButton.type = "button"; restartButton.textContent = "Restart session";
const displayModeButton = document.createElement("button");
// id="display-mode": paper mode's CSS keeps only this one control visible in the bar
// (index.html's `#bar > *:not(#display-mode)`), relocating it above the sheet rather than
// building a second control.
displayModeButton.type = "button"; displayModeButton.id = "display-mode";
barEl.append(barText, registryLink, restartButton, displayModeButton);
// reconstructionProse builds its markup from local corpus offsets -- none of it user input --
// and escapes every interpolated value itself. setStatementHtml preserves the reader's
// SHA-256 "show full" reveal across the rewrite.
const refresh = () => { setStatementHtml(statementEl, reconstructionProse(offsets, registryUrl)); };
// The sheet's own header (CSS shows it only in paper mode and under @media print), set once:
// sheetHeaderFragment(offsets) reads only the corpus offsets captured at startup, the same as
// reconstructionProse above, so nothing in it changes across a restart or a display-mode change.
document.getElementById("sheet-header")!.innerHTML = sheetHeaderFragment(offsets);
// proto.prompt (documented): the prompt DIALOG emits is a bare "?"; proto.prompt.spacing
// (documented): no trailing space -- any space after the prompt was typed by the searcher or
// set by a compositor, so the mockup's "?s cy=beltsville" is right.
const prompt = (registry.get("proto.prompt").value as string) + (registry.get("proto.prompt.spacing").value as string);
const sink = new DomSink(document.getElementById("terminal")!, async (l) => {
  const out = await session.submit(l);
  // await: print() paces the characters (terminal.pacing) and resolves when the queue has
  // drained. The prompt itself stays live throughout: sink.ts queues an Enter pressed
  // during this drain rather than disabling input for it.
  await sink.print(out);
  // Outside the character stream entirely -- never appended to
  // sink.printout, so it never reaches a copied selection.
  noticeEl.textContent = session.lastNotice
    ? `DIALOG documented \`${session.lastNotice.command}\` for File 60; this reconstruction does not implement it yet.`
    : "";
}, prompt);
refresh();
// Copied text is plain text; nothing is added to a selection on copy.
// The aside collapses to a 28px rail. State lives on the aside's own classList (index.html's
// CSS keys off `aside.collapsed`) and in localStorage, read inside try/catch (a private
// window, or a browser blocking site data, must still render an expanded panel rather than
// throw). expandPanel is passed to mountInspect below as its onExpand callback, so opening
// inspect expands the panel if it was collapsed.
const PANEL_COLLAPSE_KEY = "dialog-file60.panel-collapsed";
const panelEl = document.getElementById("panel")!;
const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;
function readPanelCollapsed(): boolean {
  try { return localStorage.getItem(PANEL_COLLAPSE_KEY) === "1"; } catch { return false; }
}
function setPanelCollapsed(collapsed: boolean): void {
  panelEl.classList.toggle("collapsed", collapsed);
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  // The button is icon-only (two inline SVG chevrons in index.html, one shown per state by
  // CSS, both aria-hidden); its accessible name and hover tooltip are set here.
  const name = collapsed ? "Show inspect panel" : "Hide inspect panel";
  panelToggle.setAttribute("aria-label", name);
  panelToggle.title = name;
  try { localStorage.setItem(PANEL_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* per-viewer convenience only */ }
}
// Alt+I in paper mode also leaves paper for printout, the same way it expands a collapsed
// panel -- both are onExpand's job (mountInspect calls it at every inspect entry point:
// click, Enter/Space on a stamped span, Alt+I), so opening inspect from the sheet always
// lands somewhere inspect is visible to look at.
function expandPanel(): void {
  if (sink.displayMode === "paper") setDisplayMode("printout");
  if (panelEl.classList.contains("collapsed")) setPanelCollapsed(false);
}
panelToggle.addEventListener("click", () => setPanelCollapsed(!panelEl.classList.contains("collapsed")));
setPanelCollapsed(readPanelCollapsed());

// Restart discards the numbered sets and the open file and empties the printout and the
// inspect panel, leaving an empty `?` prompt with focus. It prints nothing into the character
// stream, and mounts nothing new: sink.printout is the same element mountInspect below was
// given, so nothing needs remounting. Not the DIALOG layer's concern -- this function is app
// wiring only.
function restart(): void {
  session = new DialogSession(engine, renderFor);
  sink.reset();
  noticeEl.textContent = "";
  inspectEl.replaceChildren(inspectPlaceholder());
  // No refresh() here: reconstructionProse(offsets) reads only the corpus offsets captured
  // at startup, never session state -- restart changes nothing it would rewrite. refresh()
  // runs once, at startup, below.
  sink.focusInput();
}
restartButton.addEventListener("click", restart);

// Printout mode (default) keeps every line and lets the pane scroll; screen mode keeps only
// the last terminal.screen_rows lines; paper mode keeps every line, restyled as a sheet. The
// control and Alt+S cycle through the three in this order. State kept in localStorage under
// one key, beside the collapsed-panel state, read inside try/catch, default printout.
// sink.setDisplayMode() (not this function) does the actual trimming and class toggling;
// this function only persists the choice and updates the button's label and accessible name.
const DISPLAY_MODES: DisplayMode[] = ["printout", "screen", "paper"];
const DISPLAY_MODE_KEY = "dialog-file60.display-mode";
function nextDisplayMode(mode: DisplayMode): DisplayMode {
  return DISPLAY_MODES[(DISPLAY_MODES.indexOf(mode) + 1) % DISPLAY_MODES.length]!;
}
function readDisplayMode(): DisplayMode {
  try {
    const stored = localStorage.getItem(DISPLAY_MODE_KEY);
    return stored === "screen" || stored === "paper" ? stored : "printout";
  } catch { return "printout"; }
}
function setDisplayMode(mode: DisplayMode, opts: { restored?: boolean } = {}): void {
  sink.setDisplayMode(mode, opts);
  const next = nextDisplayMode(mode);
  displayModeButton.textContent = `Display: ${mode}`;
  displayModeButton.setAttribute("aria-label", `Display mode: ${mode}. Press to switch to ${next} mode.`);
  try { localStorage.setItem(DISPLAY_MODE_KEY, mode); } catch { /* per-viewer convenience only */ }
  // No refresh() here: reconstructionProse(offsets) does not read the display mode, or any
  // other session state -- see restart()'s comment above.
}
displayModeButton.addEventListener("click", () => setDisplayMode(nextDisplayMode(sink.displayMode)));
// restored: true -- a mode read back from localStorage on load shows paper's sheet at once;
// the pause marks the act of switching, not the page loading.
setDisplayMode(readDisplayMode(), { restored: true });

// Alt+R restarts the session; Alt+S cycles the display mode. Matches panel.ts's Alt+I
// handling: ke.code, not ke.key,
// since Option is a dead-key modifier on macOS (this app's only platform) and composes an
// accented character rather than letting ke.key report the plain letter.
document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  if (e.code === "KeyR" || e.key.toLowerCase() === "r") { e.preventDefault(); restart(); }
  else if (e.code === "KeyS" || e.key.toLowerCase() === "s") {
    e.preventDefault(); setDisplayMode(nextDisplayMode(sink.displayMode));
  }
});

// The SourceFile passed to mountInspect names only the archival-source facts the inspect
// panel needs -- offsets.file and FY1994.profile are the same values the
// RetrievalEngine above was built with; FY1994.naid and offsets.sha256 name the holding and
// the corpus's own fixity hash, neither of which the engine's constructor takes.
mountInspect(document.getElementById("inspect")!, sink.printout, engine, { file: offsets.file, naid: FY1994.naid, profile: FY1994.profile, sha256: offsets.sha256 }, () => sink.focusInput(), expandPanel);
