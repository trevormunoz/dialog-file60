/**
 * Read by vite.config.ts only. The app is served at "/" locally
 * (`pnpm dev`, `pnpm build`) and at "/file60/" on the BARC story site, which is served at
 * the root of https://barcstory.org and serves its public/file60/ directory verbatim. Kept in config/ beside define.ts because vite.config.ts
 * and its test both import it, exactly as they both import appDefine.
 */
export function appBase(env: Record<string, string | undefined> = process.env): string {
  const raw = env.APP_BASE;
  if (!raw) return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}
