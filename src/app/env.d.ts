declare const __APP_VERSION__: string;
declare const __REGISTRY_HASH__: string;

// Vite's own ImportMetaEnv (from "vite/client", in tsconfig.base.json's types array)
// declares BASE_URL, MODE, DEV, PROD and SSR; this adds the one variable this
// app defines. Unset locally, so corpusBase() falls back to the app's own base and public/corpus/.
interface ImportMetaEnv {
  readonly VITE_CORPUS_BASE_URL?: string;
}
