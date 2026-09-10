import { defineConfig } from "vite";
import { appDefine } from "./config/define";
import { appBase } from "./config/base";

// `base` retargets the built asset URLs and import.meta.env.BASE_URL at the path the app is
// actually served from.
//
// `publicDir: false` when APP_BASE is set: public/corpus/ holds a symlink to the 277,539,004-byte corpus, and Vite copies public/ into dist by following it.
// A site build must never produce a 277 MB dist -- the corpus is served from Cloudflare R2,
// not from the bundle -- so the site build ships no public/ at all. A local build (no
// APP_BASE) keeps public/ so `pnpm build && preview` still serves the corpus locally.
const base = appBase();
export default defineConfig({
  base,
  // A non-root APP_BASE always disables public/: it means this is a site build, and a site
  // build must never carry public/corpus/'s symlink to the 277 MB corpus into dist/.
  publicDir: base === "/" ? "public" : false,
  build: { target: "es2022" },
  define: appDefine,
});
