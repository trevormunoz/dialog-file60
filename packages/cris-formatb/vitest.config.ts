import { defineConfig } from "vitest/config";
// gleam.toml now lives in this package directory, so `gleam test`/`gleam build`
// regenerate a gitignored build/ tree alongside src-ts/test/ — including copies
// of this package's own *.test.ts files with stale relative imports. Exclude it
// so vitest never picks those up as a second, broken copy of the suite.
export default defineConfig({ test: { globals: true, exclude: ["**/node_modules/**", "build/**"] } });
