import { GoogleGenAI } from '@google/genai';
import { getAnimateArtConfig, getGeminiConfig, getSunoConfig, getVoiceConfig } from '../_lib/env.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { handleOptions, parseMultipartForm, proxyJson, readJsonBody, sendJson } from '../_lib/http.js';
import { signManifestPayload } from '../_lib/manifest-signing.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { consumeExecutionNonce, createExecutionSession } from '../_lib/security-session.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function normalizeTextResponse(result) {
  if (!result) return '';
  if (typeof result.text === 'string') return result.text;
  if (typeof result.outputText === 'string') return result.outputText;
  if (typeof result.response?.text === 'string') return result.response.text;
  if (typeof result.response?.outputText === 'string') return result.response.outputText;
  return '';
}

function stripDataUrl(value) {
  if (typeof value !== 'string') return '';
  const index = value.indexOf(',');
  return value.startsWith('data:') && index >= 0 ? value.slice(index + 1) : value;
}

function isValidManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (!manifest.sessionId || typeof manifest.sessionId !== 'string') return false;
  if (!Number.isFinite(manifest.exportTimestamp)) return false;
  if (!Array.isArray(manifest.entries)) return false;
  return true;
}

function getRouteSegments(req) {
  const value = req.query?.route;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

async function withAuthAndRate(req, res, configFactory, callback) {
  const auth = requireAuthContext(req);
  const rate = checkRateLimit(configFactory(auth));
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return sendJson(res, 429, {
      error: 'Rate limit exceeded',
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }
  return callback(auth);
}

async function handleGemini(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `gemini:generate:${auth.actorFingerprint}`,
    limit: 90,
    windowMs: 60_000,
  }), async () => {
    const body = await readJsonBody(req);
    const { apiKey, defaultModel } = getGeminiConfig();
    const ai = new GoogleGenAI({ apiKey });
    const model = body.model || defaultModel;
    const config = body.config || {};

    if (Array.isArray(body.history) && typeof body.message === 'string') {
      const chat = ai.chats.create({ model, config, history: body.history });
      const result = await chat.sendMessage({ message: body.message });
      return sendJson(res, 200, { text: normalizeTextResponse(result) });
    }

    if (!body.contents) {
      return sendJson(res, 400, { error: 'contents is required' });
    }

    const result = await ai.models.generateContent({
      model,
      contents: body.contents,
      config,
    });

    return sendJson(res, 200, { text: normalizeTextResponse(result) });
  });
}

async function handleSecuritySession(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `security:session:${auth.actorFingerprint}`,
    limit: 30,
    windowMs: 60_000,
  }), async (auth) => {
    const session = createExecutionSession(auth.actorId, auth.actorFingerprint);
    return sendJson(res, 200, session);
  });
}

async function handleSecurityConsume(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `security:consume:${auth.actorFingerprint}`,
    limit: 240,
    windowMs: 60_000,
  }), async (auth) => {
    const body = await readJsonBody(req);
    const result = consumeExecutionNonce(body.sessionId, body.nonce, auth.actorFingerprint);

    if (!result.ok) {
      return sendJson(res, 409, {
        consumed: false,
        reason: result.reason,
      });
    }

    return sendJson(res, 200, { consumed: true });
  });
}

async function handleSignManifest(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `security:sign-manifest:${auth.actorFingerprint}`,
    limit: 120,
    windowMs: 60_000,
  }), async () => {
    const body = await readJsonBody(req);
    const manifest = body?.manifest;

    if (!isValidManifest(manifest)) {
      return sendJson(res, 400, { error: 'Invalid manifest payload' });
    }

    return sendJson(res, 200, signManifestPayload(manifest));
  });
}

async function handleSunoGenerate(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `suno:generate:${auth.actorFingerprint}`,
    limit: 30,
    windowMs: 60_000,
  }), async () => {
    const body = await readJsonBody(req);
    const { apiKey, baseUrl } = getSunoConfig();
    return proxyJson(req, res, {
      url: `${baseUrl}/v2/generate/audio`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  });
}

async function handleSunoStatus(req, res, songId) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!songId) {
    return sendJson(res, 400, { error: 'songId is required' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `suno:status:${auth.actorFingerprint}`,
    limit: 300,
    windowMs: 60_000,
  }), async () => {
    const { apiKey, baseUrl } = getSunoConfig();
    return proxyJson(req, res, {
      url: `${baseUrl}/v2/generate/audio/${encodeURIComponent(songId)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });
}

async function handleSunoAsset(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `suno:asset:${auth.actorFingerprint}`,
    limit: 40,
    windowMs: 60_000,
  }), async () => {
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
  });
}

async function handleSunoHarmonies(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `suno:harmonies:${auth.actorFingerprint}`,
    limit: 30,
    windowMs: 60_000,
  }), async () => {
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
  });
}

async function handleVoiceModels(req, res) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `voice:index:${auth.actorFingerprint}`,
    limit: 120,
    windowMs: 60_000,
  }), async () => {
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
  });
}

async function handleVoiceModelDelete(req, res, id) {
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `voice:delete:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async () => {
    const { apiUrl, apiKey } = getVoiceConfig();
    return proxyJson(req, res, {
      url: `${apiUrl}/voice-models/${encodeURIComponent(id)}`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });
}

async function handleAnimateArtHooks(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `animate:hooks:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async () => {
    const body = await readJsonBody(req);
    const { apiUrl, apiKey } = getAnimateArtConfig();
    return proxyJson(req, res, {
      url: `${apiUrl}/hooks`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const route = getRouteSegments(req);

  try {
    if (route.length === 1 && route[0] === 'gemini') {
      return await handleGemini(req, res);
    }
    if (route.length === 2 && route[0] === 'security' && route[1] === 'session') {
      return await handleSecuritySession(req, res);
    }
    if (route.length === 2 && route[0] === 'security' && route[1] === 'consume') {
      return await handleSecurityConsume(req, res);
    }
    if (route.length === 2 && route[0] === 'security' && route[1] === 'sign-manifest') {
      return await handleSignManifest(req, res);
    }
    if (route.length === 2 && route[0] === 'suno' && route[1] === 'generate') {
      return await handleSunoGenerate(req, res);
    }
    if (route.length === 3 && route[0] === 'suno' && route[1] === 'generate') {
      return await handleSunoStatus(req, res, route[2]);
    }
    if (route.length === 2 && route[0] === 'suno' && route[1] === 'asset') {
      return await handleSunoAsset(req, res);
    }
    if (route.length === 2 && route[0] === 'suno' && route[1] === 'harmonies') {
      return await handleSunoHarmonies(req, res);
    }
    if (route.length === 1 && route[0] === 'voice-models') {
      return await handleVoiceModels(req, res);
    }
    if (route.length === 2 && route[0] === 'voice-models') {
      return await handleVoiceModelDelete(req, res, route[1]);
    }
    if (route.length === 2 && route[0] === 'animate-art' && route[1] === 'hooks') {
      return await handleAnimateArtHooks(req, res);
    }

    return sendJson(res, 404, { error: 'Route not found', route });
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unhandled API error',
    });
  }
}
