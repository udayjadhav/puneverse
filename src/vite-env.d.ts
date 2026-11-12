/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TILE_URL?: string;
  readonly VITE_TILE_URL_DARK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
