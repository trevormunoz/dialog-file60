import { RECONSTRUCTION_FAILURE_MESSAGE } from "../retrieval/failures";

/** The whole-app failure surface: shown when offsets/indexes/manifest cannot load, in place of
 * the terminal. Modern chrome only -- never a DIALOG banner or `?` line. */
export function renderStartupError(root: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "reconstruction-error";
  const p = document.createElement("p");
  p.textContent = RECONSTRUCTION_FAILURE_MESSAGE;
  panel.appendChild(p);
  root.replaceChildren(panel);
}
