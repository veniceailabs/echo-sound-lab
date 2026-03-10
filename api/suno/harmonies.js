import { getSunoConfig } from '../_lib/env.js';
import { handleOptions, proxyJson, readJsonBody, sendJson } from '../_lib/http.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `suno:harmonies:${auth.actorFingerprint}`,
      limit: 30,
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
    const { apiKey, baseUrl } = getSunoConfig();

    return proxyJson(req, res, {
      url: `${baseUrl}/harmonies`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Harmony request failed',
    });
  }
}
