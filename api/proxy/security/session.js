import { createExecutionSession } from '../../_lib/security-session.js';
import { handleOptions, sendJson } from '../../_lib/http.js';
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
      key: `security:session:${auth.actorFingerprint}`,
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

    const session = createExecutionSession(auth.actorId, auth.actorFingerprint);
    return sendJson(res, 200, session);
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to create execution session',
    });
  }
}
