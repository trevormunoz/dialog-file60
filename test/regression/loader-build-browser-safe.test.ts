import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Regression for a real bug found while re-running the acceptance session:
// src/app/main.ts imports indexUrls/Offsets/Index from src/loader/corpus-format.ts so the app's fetch
// list can never drift from the loader's PHRASE_FIELDS. But build.ts also
// statically imported node:fs *and* node:crypto for its own CLI block. Vite externalizes node
// builtins for the browser bundle, and merely importing a named binding from an externalized
// module throws immediately on module evaluation -- so the whole app failed to mount, silently,
// with the terminal never appearing (no error reached the DOM; only the browser console showed
// it). Vitest's node environment does not reproduce this (node builtins work there), so this
// needs a static check on the source text, not a runtime import. The check matches any
// "node:*" specifier, not just fs, so reintroducing node:crypto (the other half of the
// original bug) fails it too.
test("src/loader/corpus-format.ts has no static import of a node builtin (browser-loaded by src/app/main.ts)", () => {
  const text = readFileSync("src/loader/corpus-format.ts", "utf8");
  expect(text).not.toMatch(/from\s+["']node:/);
  expect(text).not.toMatch(/import\s+["']node:/);
});

// The check above guarded exactly one filename. src/retrieval/
// reader.ts's FsRangeReader carried a dynamic `await import("node:fs/promises")` -- it does
// not break the app at runtime (the import only ever executes in Node), but Vite still
// detects the specifier in the module main.ts imports for FetchRangeReader and externalizes
// it, printing a warning on every `pnpm build`. Widened to every file under src/ except the
// Node-only loader CLI modules (never imported by src/app/main.ts's browser graph), and to
// any node: specifier -- static or dynamic -- not just a static `from`/bare `import`.
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}
const NODE_ONLY_UNREACHABLE_FROM_BROWSER = new Set([
  join("src", "loader", "cli.ts"),
  join("src", "loader", "index-builder.ts"),
  join("src", "loader", "fixity.ts"),
  join("src", "retrieval", "reader-node.ts"),
  join("src", "retrieval", "words-node.ts"),
]);

test("no src file reachable from the browser bundle references a node: specifier, static or dynamic", () => {
  const files = tsFiles("src").filter(f => !NODE_ONLY_UNREACHABLE_FROM_BROWSER.has(f));
  expect(files.length).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    expect(text, `${f} references a node: specifier`).not.toMatch(/["']node:/);
  }
});
