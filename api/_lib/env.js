function firstDefined(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function hasConfiguredEnv(keys) {
  return Boolean(firstDefined(keys));
}

export function requireEnv(keys, label) {
  const value = firstDefined(keys);
  if (!value) {
    throw new Error(`${label} is not configured`);
  }
  return value;
}

export function optionalEnv(keys, fallback = '') {
  return firstDefined(keys) || fallback;
}

function parseBooleanFlag(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function getIntegrationFlags() {
  return {
    enableSunoIntegration: parseBooleanFlag(optionalEnv(['ENABLE_SUNO_INTEGRATION'], 'false'), false),
    enablePremiumVoice: parseBooleanFlag(optionalEnv(['ENABLE_PREMIUM_VOICE'], 'false'), false),
    enableAnimateArt: parseBooleanFlag(optionalEnv(['ENABLE_ANIMATE_ART'], 'false'), false),
  };
}

export function getSystemHealthSnapshot() {
  const integrationFlags = getIntegrationFlags();
  const premiumMode =
    integrationFlags.enableSunoIntegration
    || integrationFlags.enablePremiumVoice
    || integrationFlags.enableAnimateArt;

  return {
    mode: premiumMode ? 'PREMIUM' : 'SOVEREIGN',
    gemini: {
      configured: hasConfiguredEnv(['GEMINI_API_KEY']),
      model: optionalEnv(['GEMINI_MODEL'], 'gemini-3.1-pro-preview'),
    },
    integrations: integrationFlags,
    checkedAt: Date.now(),
  };
}

export function getGeminiConfig() {
  return {
    apiKey: requireEnv(['GEMINI_API_KEY'], 'Gemini API key'),
    defaultModel: optionalEnv(['GEMINI_MODEL'], 'gemini-3.1-pro-preview'),
  };
}

export function getSunoConfig() {
  const baseUrl = optionalEnv(['SUNO_API_URL'], 'https://api.aimlapi.com').replace(/\/$/, '');
  return {
    apiKey: requireEnv(['SUNO_API_KEY'], 'Suno API key'),
    baseUrl,
    assetUrl: optionalEnv(['SUNO_ASSET_URL'], `${baseUrl}/v2/assets`),
  };
}

export function getVoiceConfig() {
  return {
    apiUrl: requireEnv(['VOICE_API_URL'], 'Voice API URL').replace(/\/$/, ''),
    apiKey: requireEnv(['VOICE_API_KEY'], 'Voice API key'),
  };
}

export function getAnimateArtConfig() {
  return {
    apiUrl: requireEnv(['ANIMATE_ART_URL'], 'Animate Art URL').replace(/\/$/, ''),
    apiKey: requireEnv(['ANIMATE_ART_KEY'], 'Animate Art key'),
  };
}
