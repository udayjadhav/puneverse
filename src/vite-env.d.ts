/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TILE_URL?: string;
  readonly VITE_TILE_URL_DARK?: string;
  /** Public Live API Worker base URL only — never provider secrets. */
  readonly VITE_LIVE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
