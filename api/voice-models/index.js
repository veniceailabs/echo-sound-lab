import { getVoiceConfig } from '../_lib/env.js';
import { handleOptions, proxyJson, readJsonBody, sendJson } from '../_lib/http.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (!['GET', 'POST'].includes(req.method || '')) {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `voice:index:${auth.actorFingerprint}`,
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

    const { apiUrl, apiKey } = getVoiceConfig();
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;

    return proxyJson(req, res, {
      url: `${apiUrl}/voice-models`,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Voice API request failed',
    });
  }
}
