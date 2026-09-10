import { fields, type LogicalRecord } from "@barcstory/cris-formatb";
import type { RetrievalEngine } from "../retrieval/engine";
import { MAP } from "../dialog/map";
import { registry, type Status } from "../registry";
import { statusWords, sourceName, sourceGloss } from "../registry/words";
import { FY1994, type TapeProvenance } from "../app/corpora";

registry.get("inspect.mode");

/** NARA's National Archives Identifier for the digitized series this reconstruction reads
 * (data/README.md; fixtures/ACCEPTANCE.md); a fact about the holding, not about any one
 * record, so it has no home in the per-record Offsets type -- panel.ts is the one place that
 * displays it, and main.ts imports it from here to build the SourceFile it passes in. */
export const NAID = FY1994.naid;

/** The archival-source facts describeLine needs, all of them values main.ts already has in
 * scope from building the RetrievalEngine (`offsets.file`, `offsets.sha256`) or from NAID
 * above -- never a whole Offsets object, most of which describeLine has no use for. */
export interface SourceFile { file: string; naid: string; profile: string; sha256: string; }

export type { TapeProvenance };
/** The tape facts for the file this app actually serves; ../app/corpora.ts holds the typed
 * config (FY1994, FY1988) both this panel and main.ts read from. */
export const FY1994_TAPE: TapeProvenance = FY1994.tape;

export interface InspectView {
  historical: string[]; dialog: { code: string; value: string }[];
  source: { tag: string; raw: string; line: number; offset: number; continuation?: boolean }[];
  archival: { file: string; naid: string; lines: string; offset: number; length: number; profile: string; sha256: string };
  tape: TapeProvenance;
  /** `sources[].source` carries the registry's citation key alongside the
   * already-formatted citation text, so the caller can look up sourceGloss(source) without
   * re-deriving it from the formatted string. */
  evidence: { key: string; status: Status; claim: string; sources: { text: string; source: string }[] }[];
  /** Registry keys tied to this line's own CRIS source tags -- the basis for the Historical
   * display card's pill. Empty for a pure literal line (a blank
   * separator, a caption, the 1998 header) that carries no source tag of its own. */
  historicalKeys: string[];
}

/** Confidence rank of each status, least confident first. A `Record<Status, number>` rather
 * than an ordered array: TypeScript rejects this object literal if it
 * omits a member of Status, so a status added to the registry's vocabulary without a rank
 * here is a compile error, not a silent gap. */
const STATUS_ORDER: Record<Status, number> = {
  chosen: 0,
  inferred: 1,
  documented: 2,
};

/** The least-confident status among `statuses`, per STATUS_ORDER; `undefined` for an empty
 * list. Pure; used to derive a card's pill instead of hardcoding one. */
export function weakest(statuses: Status[]): Status | undefined {
  let best: Status | undefined; let bestRank = Infinity;
  for (const s of statuses) {
    const rank = STATUS_ORDER[s];
    if (rank < bestRank) { bestRank = rank; best = s; }
  }
  return best;
}

/** A tag's values, narrowed to the one at `valueIndex` when given (a classification-grid
 * row, an SC/SN row selects one value per tag) or every value the tag
 * carries otherwise (a whole-field line). Shared by the CRIS source card and the DIALOG
 * representation card below so the two never disagree about which values a line shows. */
function pickValues(rec: LogicalRecord, tag: string, valueIndex: number | undefined) {
  const values = fields(rec, tag).flatMap(f => f.values);
  return valueIndex === undefined ? values : values[valueIndex] !== undefined ? [values[valueIndex]!] : [];
}

/** `sources` links each displayed value to its Format B tag; `valueIndex`, when present,
 * selects that tag's single value at that position (a classification-grid row, an SC/SN
 * row) instead of every value the tag carries. */
export function describeLine(rec: LogicalRecord, sources: { tag: string; valueIndex?: number }[], keys: string[], tape: TapeProvenance, sourceFile: SourceFile): InspectView {
  const source = sources.flatMap(({ tag, valueIndex }) =>
    pickValues(rec, tag, valueIndex).map(v => ({ tag, raw: v.raw, line: v.line, offset: v.offset, continuation: v.continuation })));
  const tags = [...new Set(sources.map(s => s.tag))];
  const dialog = tags.map(t => {
    const m = MAP[t];
    const code = !m ? "?" : m.dialog === null ? "no display code" : m.dialog;
    const valueIndex = sources.find(s => s.tag === t)?.valueIndex;
    return { code, value: pickValues(rec, t, valueIndex).map(v => v.raw).join(" | ") };
  });
  const historicalKeys = tags.map(t => MAP[t]?.registry).filter((k): k is string => !!k);
  const allKeys = [...new Set([...keys, ...historicalKeys, ...tape.evidence])];
  // Sources print a reader's citation (sourceName), never the registry's citation key, in
  // the "Why it prints this way" card.
  const evidence = allKeys.map(k => {
    const e = registry.get(k);
    return {
      key: k, status: e.status, claim: e.claim,
      sources: (e.sources ?? []).map(s => ({ text: `${sourceName(s.source)} (${s.locator})`, source: s.source })),
    };
  });
  return { historical: [], dialog, source,
    archival: { file: sourceFile.file, naid: sourceFile.naid, lines: `${rec.firstLine}-${rec.lastLine}`, offset: rec.offset, length: rec.length, profile: sourceFile.profile, sha256: sourceFile.sha256 },
    tape, evidence, historicalKeys };
}

/** Render a raw value with the three control bytes shown as visible tokens. */
function bytesNode(raw: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const tokens: Record<string, string> = { "\u00ac": "[AC]", "\u00a0": "[A0]", "\u0002": "[02]" };
  let buf = "";
  const flush = () => { if (buf) { frag.append(document.createTextNode(buf)); buf = ""; } };
  for (const ch of raw) {
    const tok = tokens[ch];
    if (tok) { flush(); const b = document.createElement("b"); b.textContent = tok; frag.append(b); } else buf += ch;
  }
  flush();
  return frag;
}

/** One status pill (`.pill.pill-<status>`), text the status itself. */
function pill(status: string): HTMLElement {
  const s = document.createElement("span"); s.className = `pill pill-${status}`; s.textContent = status; return s;
}

/** A `.card`, title with an optional pill, an optional one-line lead-in sentence, an optional
 * list, then an optional body node. `status` is null only for the "How DIALOG names it" card: its content is drawn from the
 * same source fields "The bytes in the NARA file" card shows, with per-mapping statuses
 * already enumerated in "Why it prints this way", so a single pill on it would either
 * duplicate or flatten that detail. `body`, when given, is appended after the list (or in its
 * place, when `items` is empty) -- card 1 ("What was printed") uses it for the `<pre>` plus
 * its conditional "assembled for the reconstruction" note, the one card whose content is not
 * a list of items. */
function section(root: HTMLElement, title: string, status: string | null, items: (string | Node)[], lead?: string, body?: Node): void {
  const card = document.createElement("div"); card.className = "card";
  const h = document.createElement("h3"); h.textContent = title;
  if (status) h.append(pill(status));
  card.append(h);
  if (lead) { const p = document.createElement("p"); p.className = "lead"; p.textContent = lead; card.append(p); }
  if (items.length) {
    const ul = document.createElement("ul");
    for (const it of items) { const li = document.createElement("li"); li.append(it); ul.append(li); }
    card.append(ul);
  }
  if (body) card.append(body);
  root.append(card);
}

/** Clears any previous ring+chip and places both on `span` together -- the
 * ring never appears without the chip. The chip is a floating
 * element positioned over the printout rather than appended into the line's
 * own text node, so it never becomes part of a copied selection. */
function markInspected(printout: HTMLElement, span: HTMLElement): void {
  printout.querySelectorAll(".inspected").forEach(s => s.classList.remove("inspected"));
  printout.querySelector(".chip")?.remove();
  span.classList.add("inspected");
  const chip = el<HTMLSpanElement>("span", "chip"); chip.textContent = "Inspect ▸"; chip.setAttribute("aria-hidden", "true");
  printout.append(chip);
  const pr = printout.getBoundingClientRect(); const sr = span.getBoundingClientRect();
  chip.style.top = `${sr.top - pr.top + printout.scrollTop}px`;
  chip.style.left = `${sr.right - pr.left + printout.scrollLeft}px`;
}

function el<K extends HTMLElement>(tag: string, cls: string): K {
  const e = document.createElement(tag) as K; e.className = cls; return e;
}

async function openInspect(root: HTMLElement, printout: HTMLElement, engine: RetrievalEngine, source: SourceFile, span: HTMLElement): Promise<void> {
  markInspected(printout, span);
  const rec = await engine.record(Number(span.dataset.ordinal));
  const tags = span.dataset.tags?.split(",").filter(Boolean) ?? [];
  const valueIndex = span.dataset.valueIndex !== undefined ? Number(span.dataset.valueIndex) : undefined;
  const sources = tags.map(tag => ({ tag, valueIndex }));
  const view = describeLine(rec, sources, span.dataset.keys?.split(",").filter(Boolean) ?? [], FY1994_TAPE, source);
  view.historical = [span.textContent ?? ""];
  root.replaceChildren();

  // Card 1: "What was printed" -- the line exactly as it appeared in the session. Its body is
  // the `<pre>` plus, when no historical status backs the line, a note -- neither is a list
  // item, so this card is the one caller of section()'s body parameter.
  const historicalStatus = weakest(view.historicalKeys.map(k => registry.get(k).status));
  const body = document.createDocumentFragment();
  const pre = document.createElement("pre"); pre.textContent = view.historical.join("\n");
  body.append(pre);
  if (!historicalStatus) {
    const note = document.createElement("p"); note.className = "modern";
    note.textContent = "This line was assembled for the reconstruction; see “Why it prints this way” below.";
    body.append(note);
  }
  section(root, "What was printed", historicalStatus ?? null, [], "This is the line exactly as it appeared in the session.", body);

  // Card 2: "How DIALOG names it" -- the search/display code a searcher would have typed.
  // A prefix code (ends "=", e.g. "IN=") prints with no separator before its value, the
  // "DS=1275" form; a suffix code (starts "/", e.g. "/TI") prints one space before its value;
  // anything else (no code, or "no display code") keeps "code: value". Giving a prefix code
  // the ": " separator too would double the punctuation, "IN=: HAMMERSCHLAG...".
  // The card is omitted entirely for a line with no DIALOG search/display code (a literal
  // structural line, e.g. the copyright banner); rendering it anyway leaves a lead sentence
  // promising a code with an empty list under it.
  if (view.dialog.length) {
    const dialogLine = (d: { code: string; value: string }): string =>
      d.code.endsWith("=") ? `${d.code}${d.value}` : d.code.startsWith("/") ? `${d.code} ${d.value}` : `${d.code}: ${d.value}`;
    section(root, "How DIALOG names it", null, view.dialog.map(dialogLine),
      "This is the code a searcher would type to search or display this field.");
  }

  // Card 3: "The bytes in the NARA file" -- tag and raw value first, then where in the file
  // it sits, numbers with thousands separators. A trailing sentence carries the record-level
  // identification (NAID, line range, byte length, encoding profile, and the corpus's own
  // fixity hash) so the panel names the NARA holding these bytes come from and lets a reader
  // confirm the file itself; the two source cards are merged into this one, and nothing else
  // would carry it.
  const [firstLine, lastLine] = view.archival.lines.split("-");
  const profileName = view.archival.profile === "fy1991plus" ? "FY 1991-and-later" : view.archival.profile === "fy1988" ? "FY 1988" : view.archival.profile;
  section(root, "The bytes in the NARA file", "documented", [
    ...view.source.map(s => {
      // A <pre>, not a plain text run -- a raw value can be a single
      // unbroken token (no spaces for pre-wrap alone to break on), so overflow-wrap is set
      // directly on the element rather than relied on from the aside's inherited rule; this
      // also makes the styling independently testable under happy-dom, which does not
      // resolve an external stylesheet against elements a test builds by hand.
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap"; pre.style.overflowWrap = "anywhere"; pre.style.margin = "0";
      if (s.continuation) {
        registry.get("formatb.encoding.continuation_0xAC"); // cited here, where the panel shows the byte a value was opened by
        const marker = document.createElement("b"); marker.textContent = "[AC]";
        pre.append(marker, " ");
      }
      pre.append(`${s.tag} `, bytesNode(s.raw), `  —  line ${s.line.toLocaleString()}, byte ${s.offset.toLocaleString()} of ${view.archival.file}`);
      return pre;
    }),
    `NARA holds this file as National Archives Identifier ${view.archival.naid}; this record runs from line ${Number(firstLine).toLocaleString()} to line ${Number(lastLine).toLocaleString()} (${view.archival.length.toLocaleString()} bytes), read under the ${profileName} encoding profile, corpus SHA-256 ${view.archival.sha256}.`,
  ], "This is the exact text NARA's file holds for this field, and where it sits in the file.");

  // Card 4: "Where the file came from" -- the tape chain, as three short sentences plus
  // the one thing not recorded (code page).
  const tapeStatus = weakest(view.tape.evidence.map(k => registry.get(k).status)) ?? "chosen";
  section(root, "Where the file came from", tapeStatus, [
    `The tape was transferred to NARA as ${view.tape.transferMedia}.`,
    `NARA copied it to ${view.tape.naraCopy}.`,
    `NARA converted it to ASCII text on ${view.tape.asciiConversion.manifestPrepared}.`,
    "Code page not recorded.",
  ], "This is how the bytes reached NARA and became the text file read here.");

  // Card 5: "Why it prints this way" -- each rule behind this line: its claim, its status
  // words, then its sources; the registry key trails as a small muted reference. Each item is
  // a DocumentFragment built here and passed straight through to section(), which already
  // accepts `string | Node` items.
  //
  // A source's gloss (Blue Sheet, Format B, Curso, ...) appears in a
  // muted line beneath its first citation on this card; a later citation of the same kind --
  // tracked here by gloss text, since two paths (the Blue Sheet's HTML and text forms; the
  // NARA validation statement's two PDF forms) share one gloss -- does not repeat it.
  const seenGlosses = new Set<string>();
  const evidenceItems = view.evidence.map(v => {
    const f = document.createDocumentFragment();
    const keyref = document.createElement("span"); keyref.className = "keyref"; keyref.textContent = `[${v.key}]`;
    f.append(`${v.claim} `, keyref, ` — ${statusWords(v.status)}`);
    if (v.sources.length) f.append(` — Sources: ${v.sources.map(s => s.text).join("; ")}`);
    for (const s of v.sources) {
      const gloss = sourceGloss(s.source);
      if (!gloss || seenGlosses.has(gloss)) continue;
      seenGlosses.add(gloss);
      const g = document.createElement("div"); g.className = "gloss"; g.textContent = gloss;
      f.append(g);
    }
    return f;
  });
  section(root, "Why it prints this way", null, evidenceItems, "Each rule behind this line, and how well it is documented.");

  const p = document.createElement("p"); p.className = "modern";
  p.textContent = "Inspect is modern apparatus added by the reconstruction; it does not change the session.";
  root.append(p);
}

/**
 * Keyboard-only operation. A stamped span is focusable (DomSink sets
 * tabindex="0" on it); Enter or Space on one opens inspect exactly as a click does; Escape
 * while focus sits in the printout or the inspect panel returns focus to the prompt
 * (`focusPrompt`); Alt+I -- the chord named in the pane label -- inspects the most recently
 * typed record line regardless of where focus currently is. Registered as
 * terminal.keyboard_inspect (chosen): no DIALOG-period precedent gives a
 * keyboard equivalent for a mouse-only action DIALOG never had in the first place.
 * `onExpand`, when given, is called at every one of those entry points: src/app/main.ts uses
 * it to expand the collapsible aside if it is collapsed. This
 * module has no notion of the aside's own collapsed state or DOM structure and never reads
 * it back; a second call while the panel is already open is harmless.
 */
export function mountInspect(root: HTMLElement, printout: HTMLElement, engine: RetrievalEngine, source: SourceFile, focusPrompt?: () => void, onExpand?: () => void): () => void {
  registry.get("terminal.keyboard_inspect");
  const spanOf = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest("span[data-ordinal]") as HTMLElement | null;
  // Opening inspect expands the aside if it is collapsed. This
  // module knows nothing about the aside's collapsed state or DOM structure -- onExpand is
  // called at every entry point below and left to the caller (src/app/main.ts); clicking a
  // different stamped span while the panel is already open calls it again, harmlessly, and
  // still only replaces the open card's content (openInspect always starts with
  // root.replaceChildren()), never touching collapse state itself.
  printout.addEventListener("click", (e) => { const span = spanOf(e); if (span) { onExpand?.(); void openInspect(root, printout, engine, source, span); } });
  printout.addEventListener("keydown", (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== "Enter" && ke.key !== " ") return;
    const span = spanOf(e); if (!span) return;
    e.preventDefault(); onExpand?.(); void openInspect(root, printout, engine, source, span);
  });
  // Bound to document, not printout or root: Alt+I must work regardless of where focus
  // currently is, and Escape must work whether focus is on a stamped span (in printout) or
  // on something inside the inspect panel (root). Returned as a disposer -- mountInspect is
  // called once per real session, but each test that calls it needs to remove its own
  // document-level listener afterward so it stops observing later tests' key events.
  const onKey = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Escape" && (root.contains(document.activeElement) || printout.contains(document.activeElement))) {
      focusPrompt?.();
      return;
    }
    // Match the physical key (ke.code), not the composed character (ke.key): on macOS,
    // the only platform this app runs on, Option+I is a dead key -- it composes the
    // circumflex accent, so ke.key is "Dead", never "i". ke.code stays "KeyI" regardless
    // of what the key composes to. The ke.key check is kept as a fallback for a layout
    // or platform where Option/Alt does not intercept the letter.
    if (ke.altKey && (ke.code === "KeyI" || ke.key.toLowerCase() === "i")) {
      const spans = printout.querySelectorAll("span[data-ordinal]");
      const last = spans[spans.length - 1] as HTMLElement | undefined;
      if (!last) return;
      e.preventDefault(); onExpand?.(); void openInspect(root, printout, engine, source, last);
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
