/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_REALTIME_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
