import { getSunoConfig } from '../_lib/env.js';
import { handleOptions, parseMultipartForm, readJsonBody, sendJson } from '../_lib/http.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function stripDataUrl(value) {
  if (typeof value !== 'string') return '';
  const index = value.indexOf(',');
  return value.startsWith('data:') && index >= 0 ? value.slice(index + 1) : value;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `suno:asset:${auth.actorFingerprint}`,
      limit: 40,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return sendJson(res, 429, {
        error: 'Rate limit exceeded',
        retryAfterSeconds: rate.retryAfterSeconds,
      });
    }

    const { apiKey, assetUrl } = getSunoConfig();
    const contentType = req.headers['content-type'] || '';
    const formData = new FormData();

    if (contentType.includes('multipart/form-data')) {
      const { files, fields } = await parseMultipartForm(req);
      const uploaded = files[0];
      if (!uploaded) {
        return sendJson(res, 400, { error: 'file is required' });
      }

      formData.append(
        uploaded.fieldName || 'file',
        new Blob([uploaded.buffer], { type: uploaded.contentType }),
        uploaded.filename || 'asset.wav'
      );

      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }
    } else {
      const body = await readJsonBody(req);
      const base64 = stripDataUrl(body.file || body.base64 || body.audio || '');
      if (!base64) {
        return sendJson(res, 400, { error: 'file payload is required' });
      }

      const buffer = Buffer.from(base64, 'base64');
      const filename = body.filename || 'asset.wav';
      const mimeType = body.mimeType || 'audio/wav';
      formData.append('file', new Blob([buffer], { type: mimeType }), filename);
    }

    const upstream = await fetch(assetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const text = await upstream.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: payload?.message || upstream.statusText || 'Asset upload failed',
        details: payload || text || null,
      });
    }

    return sendJson(res, 200, payload || { ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Asset upload failed',
    });
  }
}
