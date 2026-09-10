/**
 * Every URL the browser fetches is derived here, from two values the
 * build supplies:
 *
 *   BASE_URL              where the app itself is served (Vite's `base`; "/" locally,
 *                         "/site-barcstory/file60/" on the BARC story site).
 *   VITE_CORPUS_BASE_URL  where the corpus and its derived index files are served. Unset
 *                         locally, so the corpus resolves under the app's own base and
 *                         `pnpm dev` keeps serving public/corpus/ exactly as before. Set to
 *                         the Cloudflare R2 prefix for the site build, because GitHub's
 *                         100 MB per-file limit puts a 277,539,004-byte corpus out of reach
 *                         of the host that serves the app.
 *
 * Browser-safe: no node: imports, no DOM. The environment is a parameter rather than a read
 * of import.meta.env so these rules stay pure and testable from Node; src/app/main.ts is the
 * one module that passes import.meta.env in.
 */
export interface UrlEnv {
  BASE_URL?: string;
  VITE_CORPUS_BASE_URL?: string;
}

const withTrailingSlash = (s: string): string => (s.endsWith("/") ? s : `${s}/`);

export function corpusBase(env: UrlEnv): string {
  const configured = env.VITE_CORPUS_BASE_URL;
  if (configured) return withTrailingSlash(configured);
  return `${withTrailingSlash(env.BASE_URL ?? "/")}corpus/`;
}

export const offsetsUrl = (env: UrlEnv): string => `${corpusBase(env)}offsets.json`;
export const indexUrl = (code: string, env: UrlEnv): string => `${corpusBase(env)}index/${code}.json`;
export const corpusUrl = (file: string, env: UrlEnv): string => `${corpusBase(env)}${file}`;
export const indexUrls = (codes: readonly string[], env: UrlEnv): [string, string][] =>
  codes.map(c => [c, indexUrl(c, env)]);

// The word indexes are too large to load whole, so they are sharded by first character and
// fetched on demand. Same base as every other corpus URL, so a corpus-base change reaches
// these without another rule.
/** One directory per suffix code, with the punctuation dropped so the name is path-safe:
 * "/TI" -> "TI", "PO=" -> "PO". The loader and the browser must agree, so the rule lives here. */
export const wordDir = (code: string): string => code.replace(/[/=]/g, "");
export const wordTermsUrl = (code: string, env: UrlEnv): string => `${corpusBase(env)}word/${wordDir(code)}/terms.json`;
export const wordShardUrl = (code: string, shard: string, env: UrlEnv): string =>
  `${corpusBase(env)}word/${wordDir(code)}/${shard}.json`;
