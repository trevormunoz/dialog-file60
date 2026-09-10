import { defineConfig } from "vitest/config";
import { appDefine } from "./config/define";
// Root project covers only root-level test/; packages/* run through their own
// vitest.config.ts as a separate project (see test.projects below).
// Without this exclude the root project's default include also picks up
// packages/**/test/*.test.ts, double-running every package test.
export default defineConfig({
  define: appDefine,
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "packages/**"],
    // DOM-touching tests (DomSink, mountInspect) run under happy-dom; everything else stays
    // on the default "node" environment above. Each test/**/*.dom.test.ts file declares this
    // itself via a `// @vitest-environment happy-dom` docblock at the top of the file, rather
    // than an environmentMatchGlobs entry here (deprecated as of Vitest 3).
    //
    // packages/cris-formatb runs its own vitest.config.ts as a second project, listed here
    // (not in a vitest.workspace.ts, itself deprecated).
    projects: ["packages/*", "."],
  },
});
