import { handleOptions, readJsonBody, sendJson } from '../../_lib/http.js';
import { AuthError, requireAuthContext } from '../../_lib/auth.js';
import { checkRateLimit } from '../../_lib/rate-limit.js';
import { signManifestPayload } from '../../_lib/manifest-signing.js';

function isValidManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (!manifest.sessionId || typeof manifest.sessionId !== 'string') return false;
  if (!Number.isFinite(manifest.exportTimestamp)) return false;
  if (!Array.isArray(manifest.entries)) return false;
  return true;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `security:sign-manifest:${auth.actorFingerprint}`,
      limit: 120,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return sendJson(res, 429, {
        error: 'Rate limit exceeded',
        retryAfterSeconds: rate.retryAfterSeconds,
      });
    }

    const body = await readJsonBody(req);
    const manifest = body?.manifest;

    if (!isValidManifest(manifest)) {
      return sendJson(res, 400, { error: 'Invalid manifest payload' });
    }

    const signed = signManifestPayload(manifest);
    return sendJson(res, 200, signed);
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to sign manifest',
    });
  }
}
