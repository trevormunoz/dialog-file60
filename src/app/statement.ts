import type { Offsets } from "../loader/corpus-format";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The bar (main.ts) carries this same heading as plain text beside the statement panel's own
// <h2>. One constant, so the two copies cannot drift apart.
export const BAR_HEADING = "A reconstruction, not a recorded session";

/**
 * Sets `container`'s innerHTML to `html` while preserving the SHA-256 "show full" checkbox's
 * checked state across the rewrite. Looks for the same #hash-full-toggle id reconstructionProse
 * emits; a caller whose html carries no such checkbox (or whose container never had one)
 * behaves exactly like a plain innerHTML set.
 * main.ts's refresh() runs once, at startup -- reconstructionProse(offsets, registryUrl)
 * reads only the corpus offsets and the registry asset URL captured then, never session
 * state, so restart and a display-mode change have nothing in it to rewrite. This function's
 * preservation still holds for any future caller that does rewrite the panel.
 * Safety note: `html` here is always this module's own reconstructionProse output, built from
 * local corpus offsets and escaped with escapeHtml above -- never from reader input.
 */
export function setStatementHtml(container: HTMLElement, html: string): void {
  const toggleBefore = container.querySelector<HTMLInputElement>("#hash-full-toggle");
  const wasRevealed = toggleBefore ? toggleBefore.checked : false;
  container.innerHTML = html;
  if (wasRevealed) {
    const toggleAfter = container.querySelector<HTMLInputElement>("#hash-full-toggle");
    if (toggleAfter) toggleAfter.checked = true;
  }
}

/**
 * The on-screen statement panel, as prose for a reader who does not know the registry.
 * Order: a heading; one framing paragraph saying what this is and what it is not; one
 * sentence pointing at the evidence registry, with a link to the file; and a closed
 * <details> named "Integrity" holding the corpus file, its SHA-256 (truncated, with a
 * checkbox reveal for the rest), the software version, and the registry hash.
 *
 * The panel does not list the registry keys in effect in the current session, and takes no
 * keysInEffect argument. Every behaviour cites its key at its point of use, and the inspect
 * panel reaches the entry for any printed line.
 *
 * `registryUrl` is the evidence registry's build asset URL (main.ts imports it via Vite's
 * `?url` import of registry/evidence.json and passes it in here) rather than being imported
 * with `?url` inside this module -- `?url` only resolves under Vite, and this module must
 * stay importable under plain Node in tests.
 *
 * Returns an HTML string; the caller sets it as innerHTML (this module builds no DOM of its
 * own, so it stays testable under plain Node -- see test/regression/statement.test.ts).
 */
/**
 * The heading and framing paragraph shared by the on-screen statement panel and the
 * paper-mode sheet's header, so the two prose blocks cannot drift apart. The heading does
 * not deny the archival record on screen, and the framing says where the rules come from
 * when no source of the anchor years survives, rather than calling them all in-period.
 *
 * reconstructionProse wraps this with its own registry-link paragraph and an interactive
 * Integrity reveal; sheetHeaderFragment wraps the same four integrity values plainly,
 * since the sheet carries no checkbox and is read, and printed, as a whole.
 */
export function headerFragment(): string {
  return [
    `<h2>${escapeHtml(BAR_HEADING)}</h2>`,
    `<p>This is File 60's documented rules applied to the FY 1994 CRIS export held by NARA ` +
      `(National Archives Identifier 1204533). The anchor is c. 1990-1994; where no source of ` +
      `those years survives, the rules come from before them (1978-1988) or after (the 1998 ` +
      `Blue Sheet, the 2001 Pocket Guide), and each registry entry says which. It is not ` +
      `DIALOG's software, and not a record of any session that took place.</p>`,
  ].join("\n");
}

export function reconstructionProse(offsets: Offsets, registryUrl: string): string {
  return [
    headerFragment(),
    `<p>Every behaviour on this screen has an entry in the ` +
      `<a href="${escapeHtml(registryUrl)}">evidence registry</a> naming its source, or saying ` +
      `it was inferred or chosen.</p>`,
    `<details><summary>Integrity</summary>`,
    `<dl>`,
    `<dt>Corpus file</dt><dd>${escapeHtml(offsets.file)}</dd>`,
    // Truncated to 12 characters with a checkbox+label reveal for the rest -- see
    // index.html's .hash-toggle rules; the full hash stays in the markup either way. The
    // checkbox precedes both hash forms so a sibling selector can gate each one.
    `<dt>SHA-256</dt><dd>` +
      `<input type="checkbox" id="hash-full-toggle" class="hash-toggle">` +
      `<label for="hash-full-toggle" class="hash-toggle-label">show full</label>` +
      `<code class="hash-short">${escapeHtml(offsets.sha256.slice(0, 12))}</code>` +
      `<code class="hash-full">${escapeHtml(offsets.sha256)}</code></dd>`,
    `<dt>Software version</dt><dd>${escapeHtml(__APP_VERSION__)}</dd>`,
    `<dt>Registry hash</dt><dd>${escapeHtml(__REGISTRY_HASH__)}</dd>`,
    `</dl>`,
    `</details>`,
  ].join("\n");
}

/**
 * The paper-mode sheet's header, rendered once inside `#sheet` above the first printout
 * line: headerFragment's heading and paragraph, followed by the same four integrity
 * values the panel's Integrity details hold (terminal.paper_sheet: the header is part of
 * the sheet, so it carries no `data-` annotation and is not a session line). Shown
 * plainly, with no checkbox -- the sheet has no interactive control, and a printed page
 * needs the full hash visible rather than truncated behind a reveal. main.ts sets this
 * once at startup and never rewrites it, the same as the panel's own refresh().
 */
export function sheetHeaderFragment(offsets: Offsets): string {
  return [
    headerFragment(),
    `<dl>`,
    `<dt>Corpus file</dt><dd>${escapeHtml(offsets.file)}</dd>`,
    `<dt>SHA-256</dt><dd><code>${escapeHtml(offsets.sha256)}</code></dd>`,
    `<dt>Software version</dt><dd>${escapeHtml(__APP_VERSION__)}</dd>`,
    `<dt>Registry hash</dt><dd>${escapeHtml(__REGISTRY_HASH__)}</dd>`,
    `</dl>`,
  ].join("\n");
}
