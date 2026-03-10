import { consumeExecutionNonce } from '../../_lib/security-session.js';
import { handleOptions, readJsonBody, sendJson } from '../../_lib/http.js';
import { AuthError, requireAuthContext } from '../../_lib/auth.js';
import { checkRateLimit } from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `security:consume:${auth.actorFingerprint}`,
      limit: 240,
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
    const result = consumeExecutionNonce(body.sessionId, body.nonce, auth.actorFingerprint);

    if (!result.ok) {
      return sendJson(res, 409, {
        consumed: false,
        reason: result.reason,
      });
    }

    return sendJson(res, 200, { consumed: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to consume nonce',
    });
  }
}
