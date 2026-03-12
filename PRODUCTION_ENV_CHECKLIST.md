# Echo Sound Lab v2.5 Production Env Checklist

## Required for `$0/month` Core Operation

- `GEMINI_API_KEY`
- Optional but recommended: `GEMINI_MODEL=gemini-3.1-pro-preview`
- `ESL_MANIFEST_SIGNING_KEY`

## Sovereign Cost Controls (Recommended Defaults)

- `ENABLE_SUNO_INTEGRATION=false`
- `ENABLE_PREMIUM_VOICE=false`
- `ENABLE_ANIMATE_ART=false`
- `VITE_ENABLE_SUNO_INTEGRATION=false`
- `VITE_ENABLE_PREMIUM_VOICE=false`
- `VITE_ENABLE_ANIMATE_ART=false`

With these defaults, premium endpoints are gated and the app keeps running without Suno/Voice/Animate Art credentials.

## Optional Premium Mode Keys

Only set these if the corresponding `ENABLE_*` flag is `true`.

- `SUNO_API_KEY`
- `SUNO_API_URL` (default supported: `https://api.aimlapi.com`)
- `SUNO_ASSET_URL` (default supported: `https://api.aimlapi.com/v2/assets`)
- `VOICE_API_URL`
- `VOICE_API_KEY`
- `ANIMATE_ART_URL`
- `ANIMATE_ART_KEY`

## Quick Verification

1. Core API smoke:
   - `POST /api/proxy/security/session` should return `200`.
2. Gemini smoke:
   - `POST /api/proxy/gemini` should return `200` with text.
3. Premium route gate checks (when disabled):
   - `POST /api/proxy/suno/generate` should return `403`.
   - `GET /api/proxy/voice-models` should return `403`.
   - `POST /api/proxy/animate-art/hooks` should return `403`.
