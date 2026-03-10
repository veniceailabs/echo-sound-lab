import { getVoiceConfig } from '../_lib/env.js';
import { handleOptions, proxyJson, sendJson } from '../_lib/http.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `voice:delete:${auth.actorFingerprint}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return sendJson(res, 429, {
        error: 'Rate limit exceeded',
        retryAfterSeconds: rate.retryAfterSeconds,
      });
    }

    const { apiUrl, apiKey } = getVoiceConfig();
    const id = req.query?.id;

    if (!id || typeof id !== 'string') {
      return sendJson(res, 400, { error: 'id is required' });
    }

    return proxyJson(req, res, {
      url: `${apiUrl}/voice-models/${encodeURIComponent(id)}`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Voice delete failed',
    });
  }
}
