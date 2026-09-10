import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The DIALOG layer, the retrieval engine, the loader, the registry, the asciicast builder,
// and the shared Format B reader never touch the DOM -- src/terminal (the sink) and
// src/inspect (the panel) are the only places that do. This held in code but nothing
// enforced it; this pins it.
const ROOTS = ["src/dialog", "src/retrieval", "src/loader", "src/registry", "src/cast", "packages/cris-formatb/src"];
const FORBIDDEN = [/\bdocument\./, /\bwindow\./, /\bHTMLElement\b/, /\binnerHTML\b/];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("src/dialog, src/retrieval, src/loader, src/registry, src/cast and the reader package never reference the DOM", () => {
  const files = ROOTS.flatMap(walk);
  expect(files.length, "a broken walk must fail loudly, not pass on an empty set").toBeGreaterThan(10);
  const offenders: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const re of FORBIDDEN) if (re.test(text)) offenders.push(`${f}: matches ${re}`);
  }
  expect(offenders).toEqual([]);
});
