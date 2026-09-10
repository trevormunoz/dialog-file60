import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Shared by vite.config.ts (the app build) and vitest.config.ts (the test run): both must
// print and compare the same app version and registry hash, so the define block that
// injects __APP_VERSION__ and __REGISTRY_HASH__ is computed once, here, not duplicated.
export const appDefine = {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  __REGISTRY_HASH__: JSON.stringify(
    createHash("sha256")
      .update(readFileSync(new URL("../registry/evidence.json", import.meta.url)))
      .digest("hex")
      .slice(0, 12),
  ),
};
