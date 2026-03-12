function parseBooleanFlag(raw: unknown, fallback: boolean): boolean {
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export const INTEGRATION_FLAGS = {
  ENABLE_SUNO_INTEGRATION: parseBooleanFlag(import.meta.env.VITE_ENABLE_SUNO_INTEGRATION, false),
  ENABLE_PREMIUM_VOICE: parseBooleanFlag(import.meta.env.VITE_ENABLE_PREMIUM_VOICE, false),
  ENABLE_ANIMATE_ART: parseBooleanFlag(import.meta.env.VITE_ENABLE_ANIMATE_ART, false),
} as const;

export function isPremiumStackEnabled(): boolean {
  return (
    INTEGRATION_FLAGS.ENABLE_SUNO_INTEGRATION ||
    INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE ||
    INTEGRATION_FLAGS.ENABLE_ANIMATE_ART
  );
}
