import { requireAuthContext, AuthError } from '../../_lib/auth.js';
import { handleOptions, readJsonBody, sendJson } from '../../_lib/http.js';
import { signManifestPayload } from '../../_lib/manifest-signing.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const body = await readJsonBody(req);
    const manifest = body?.manifest;

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return sendJson(res, 400, { error: 'Manifest payload is required' });
    }

    const signed = signManifestPayload({
      ...manifest,
      signer: auth.actorId,
    });

    return sendJson(res, 200, signed);
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode || 401, { error: error.message });
    }

    return sendJson(res, 500, {
      error: 'Manifest signing failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
