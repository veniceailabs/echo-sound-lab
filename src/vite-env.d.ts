/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUNO_API_MOCK?: string;
  readonly VITE_RATE_LIMIT_PER_DAY?: string;
  readonly VITE_ANIMATE_ART_MOCK?: string;
  readonly VITE_ELEVENLABS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
