import viteConfig from "../../vite.config";
import vitestConfig from "../../vitest.config";
import { appDefine } from "../../config/define";

// vite.config.ts and vitest.config.ts both compute __APP_VERSION__ and __REGISTRY_HASH__;
// if written twice they can drift and the app and the tests would disagree about the
// registry hash printed in the banner. Both configs must use the one shared object.
test("vite and vitest configs share the same define object", () => {
  expect(viteConfig.define).toBe(appDefine);
  expect((vitestConfig as { define?: unknown }).define).toBe(appDefine);
});
