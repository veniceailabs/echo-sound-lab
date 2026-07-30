import { GoogleGenAI } from '@google/genai';
import {
  getAnimateArtConfig,
  getDspConfig,
  getGeminiConfig,
  getIntegrationFlags,
  getSunoConfig,
  getSystemHealthSnapshot,
  getVoiceConfig,
} from '../_lib/env.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { handleOptions, parseMultipartForm, proxyJson, readJsonBody, readRawBody, sendJson, setCors } from '../_lib/http.js';
import { signManifestPayload } from '../_lib/manifest-signing.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { consumeExecutionNonce, createExecutionSession } from '../_lib/security-session.js';
import {
  createCheckoutSession,
  verifyWebhookSignature,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleChargeSucceeded,
  getSubscriptionStatus,
  getStripeConfig,
} from '../_lib/stripe.js';
import {
  generateAuthUrl,
  exchangeAuthCode,
  uploadRelease,
  getReleaseStatus,
  getPlatforms,
  getDistroKidConfig,
} from '../_lib/distrokid.js';

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
  if (Array.isArray(value)) {
    return value
      .flatMap((segment) => String(segment).split('/'))
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value) {
    return value
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
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
  const { enableSunoIntegration } = getIntegrationFlags();
  if (!enableSunoIntegration) {
    return sendJson(res, 403, { error: 'Suno integration is disabled' });
  }
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
  const { enableSunoIntegration } = getIntegrationFlags();
  if (!enableSunoIntegration) {
    return sendJson(res, 403, { error: 'Suno integration is disabled' });
  }
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
  const { enableSunoIntegration } = getIntegrationFlags();
  if (!enableSunoIntegration) {
    return sendJson(res, 403, { error: 'Suno integration is disabled' });
  }
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
  const { enableSunoIntegration } = getIntegrationFlags();
  if (!enableSunoIntegration) {
    return sendJson(res, 403, { error: 'Suno integration is disabled' });
  }
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
  const { enablePremiumVoice } = getIntegrationFlags();
  if (!enablePremiumVoice) {
    return sendJson(res, 403, { error: 'Premium voice integration is disabled' });
  }
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
  const { enablePremiumVoice } = getIntegrationFlags();
  if (!enablePremiumVoice) {
    return sendJson(res, 403, { error: 'Premium voice integration is disabled' });
  }
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
  const { enableAnimateArt } = getIntegrationFlags();
  if (!enableAnimateArt) {
    return sendJson(res, 403, { error: 'Animate Art integration is disabled' });
  }
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

// ── DSP / Grammy Master handlers ─────────────────────────────────────────────

async function handleDspHealth(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const { apiUrl, configured } = getDspConfig();
  if (!configured) return sendJson(res, 200, { status: 'browser-only', configured: false });
  try {
    const upstream = await fetch(`${apiUrl}/health`, { method: 'GET' });
    const payload = await upstream.json().catch(() => ({}));
    return sendJson(res, upstream.status, { ...payload, configured: true });
  } catch {
    return sendJson(res, 503, { status: 'unreachable', configured: true });
  }
}

async function handleDspMaster(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const { apiUrl, configured } = getDspConfig();
  if (!configured) return sendJson(res, 503, { error: 'Python DSP backend not configured', hint: 'Set PYTHON_BACKEND_URL env var' });

  const raw = await readRawBody(req);
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  const upstream = await fetch(`${apiUrl}/api/dsp/master`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: raw,
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return sendJson(res, upstream.status, { error: err.detail || err.error || 'DSP master failed' });
  }

  // Return binary WAV or JSON depending on what the backend sends
  const respContentType = upstream.headers.get('content-type') || '';
  if (respContentType.includes('audio/') || respContentType.includes('application/octet-stream')) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
    return;
  }

  const payload = await upstream.json().catch(() => ({ ok: true }));
  return sendJson(res, 200, payload);
}

async function handleDspVocalChain(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const { apiUrl, configured } = getDspConfig();
  if (!configured) return sendJson(res, 503, { error: 'Python DSP backend not configured', hint: 'Set PYTHON_BACKEND_URL env var' });

  const raw = await readRawBody(req);
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  const upstream = await fetch(`${apiUrl}/api/vocal/chain`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: raw,
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return sendJson(res, upstream.status, { error: err.detail || err.error || 'Vocal chain failed' });
  }

  const respContentType = upstream.headers.get('content-type') || '';
  if (respContentType.includes('audio/') || respContentType.includes('application/octet-stream')) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
    return;
  }

  const payload = await upstream.json().catch(() => ({ ok: true }));
  return sendJson(res, 200, payload);
}

async function handleDspMixTracks(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const { apiUrl, configured } = getDspConfig();
  if (!configured) return sendJson(res, 503, { error: 'Python DSP backend not configured', hint: 'Set PYTHON_BACKEND_URL env var' });

  const raw = await readRawBody(req);
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  const upstream = await fetch(`${apiUrl}/api/mix/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: raw,
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return sendJson(res, upstream.status, { error: err.detail || err.error || 'Mix tracks failed' });
  }

  const respContentType = upstream.headers.get('content-type') || '';
  if (respContentType.includes('audio/') || respContentType.includes('application/octet-stream')) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
    return;
  }

  const payload = await upstream.json().catch(() => ({ ok: true }));
  return sendJson(res, 200, payload);
}

// ── Stripe / Monetization handlers ──────────────────────────────────────────

async function handleStripeCheckout(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getStripeConfig();
  if (!configured) {
    return sendJson(res, 503, {
      error: 'Stripe not configured',
      hint: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars',
    });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `stripe:checkout:${auth.actorFingerprint}`,
    limit: 30,
    windowMs: 60_000,
  }), async (auth) => {
    const body = await readJsonBody(req);
    const { tier } = body;

    if (!tier || !['artist', 'engineer', 'studio'].includes(tier)) {
      return sendJson(res, 400, { error: 'Invalid tier. Must be: artist, engineer, or studio' });
    }

    try {
      const origin = req.headers.origin || 'https://echo-sound-lab.vercel.app';
      const session = await createCheckoutSession(tier, {
        userEmail: auth.userEmail || `user-${auth.actorFingerprint}@echo-sound-lab.local`,
        userId: auth.actorFingerprint,
        successUrl: `${origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/subscription-canceled`,
      });

      return sendJson(res, 200, session);
    } catch (err) {
      console.error('Stripe checkout error:', err);
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to create checkout session' });
    }
  });
}

async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getStripeConfig();
  if (!configured) {
    return sendJson(res, 503, { error: 'Stripe not configured' });
  }

  try {
    const signature = req.headers['stripe-signature'];
    const rawBody = await readRawBody(req);

    if (!signature) {
      return sendJson(res, 400, { error: 'Missing stripe-signature header' });
    }

    const event = verifyWebhookSignature(rawBody, signature);

    // Process webhook events
    let result;
    switch (event.type) {
      case 'customer.subscription.created':
        result = await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(event.data.object);
        break;
      case 'charge.succeeded':
        result = await handleChargeSucceeded(event.data.object);
        break;
      default:
        // Unhandled event type — acknowledge it but don't process
        result = { eventType: event.type, processed: false };
    }

    // Log webhook event (could be stored in database)
    console.log('Stripe webhook processed:', {
      eventId: event.id,
      type: event.type,
      result,
    });

    // Always return 200 to acknowledge receipt
    return sendJson(res, 200, { received: true, eventId: event.id });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    // Still return 200 but log error — Stripe will retry on 4xx/5xx
    if (err instanceof Error && err.message.includes('signature')) {
      return sendJson(res, 400, { error: 'Webhook signature verification failed' });
    }
    return sendJson(res, 200, { received: true, error: err instanceof Error ? err.message : 'Error processing webhook' });
  }
}

async function handleStripeStatus(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getStripeConfig();
  if (!configured) {
    return sendJson(res, 503, { error: 'Stripe not configured' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `stripe:status:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      // In a real app, you'd look up the customer ID from your database
      // For now, return a placeholder
      return sendJson(res, 200, {
        status: 'free',
        tier: 'free',
        message: 'No active subscription. Use /api/proxy/stripe/checkout to upgrade.',
      });
    } catch (err) {
      console.error('Stripe status error:', err);
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to get subscription status' });
    }
  });
}

// ── DistroKid / Distribution handlers ───────────────────────────────────────

async function handleDistroKidAuth(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured, clientId } = getDistroKidConfig();
  if (!configured) {
    return sendJson(res, 503, {
      error: 'DistroKid not configured',
      hint: 'Set DISTROKID_CLIENT_ID and DISTROKID_CLIENT_SECRET env vars',
    });
  }

  try {
    const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/proxy/distrokid/callback`;
    const state = Math.random().toString(36).slice(2);

    // Store state in response headers for client to validate later
    const authUrl = generateAuthUrl(clientId, redirectUri, state);

    return sendJson(res, 200, {
      authUrl,
      state,
      message: 'Redirect user to authUrl to authorize DistroKid access',
    });
  } catch (err) {
    console.error('DistroKid auth error:', err);
    return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to generate auth URL' });
  }
}

async function handleDistroKidCallback(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getDistroKidConfig();
  if (!configured) {
    return sendJson(res, 503, { error: 'DistroKid not configured' });
  }

  try {
    const body = await readJsonBody(req);
    const { code, redirectUri } = body;

    if (!code) {
      return sendJson(res, 400, { error: 'Authorization code required' });
    }

    const tokens = await exchangeAuthCode(
      process.env.DISTROKID_CLIENT_ID,
      process.env.DISTROKID_CLIENT_SECRET,
      code,
      redirectUri
    );

    // In production, store tokens in database keyed to user ID
    return sendJson(res, 200, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      message: 'Store accessToken and refreshToken securely. Access token expires in ' + tokens.expiresIn + 's',
    });
  } catch (err) {
    console.error('DistroKid callback error:', err);
    return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to exchange auth code' });
  }
}

async function handleDistroKidUpload(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getDistroKidConfig();
  if (!configured) {
    return sendJson(res, 503, { error: 'DistroKid not configured' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `distrokid:upload:${auth.actorFingerprint}`,
    limit: 10,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      const body = await readJsonBody(req);
      const { accessToken, title, artistName, audioBuffer, platforms, releaseDate, metadata } = body;

      if (!accessToken) {
        return sendJson(res, 401, {
          error: 'Access token required',
          hint: 'Authorize with DistroKid first via /api/proxy/distrokid/auth',
        });
      }

      if (!title || !artistName || !audioBuffer) {
        return sendJson(res, 400, { error: 'title, artistName, and audioBuffer required' });
      }

      const releaseResult = await uploadRelease(accessToken, {
        title,
        artistName,
        audioBuffer: Buffer.from(audioBuffer, 'base64'),
        platforms: platforms || getPlatforms().map(p => p.id),
        releaseDate,
        metadata,
      });

      return sendJson(res, 200, releaseResult);
    } catch (err) {
      console.error('DistroKid upload error:', err);
      if (err instanceof Error && err.message.includes('401')) {
        return sendJson(res, 401, { error: 'DistroKid token expired or invalid. Re-authenticate.' });
      }
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });
}

async function handleDistroKidStatus(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { configured } = getDistroKidConfig();
  if (!configured) {
    return sendJson(res, 503, { error: 'DistroKid not configured' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `distrokid:status:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      const { accessToken, releaseId } = req.query;

      if (!accessToken || !releaseId) {
        return sendJson(res, 400, { error: 'accessToken and releaseId query params required' });
      }

      const status = await getReleaseStatus(accessToken, releaseId);
      return sendJson(res, 200, status);
    } catch (err) {
      console.error('DistroKid status error:', err);
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to get release status' });
    }
  });
}

async function handleDistroKidPlatforms(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const platforms = getPlatforms();
    return sendJson(res, 200, { platforms });
  } catch (err) {
    console.error('DistroKid platforms error:', err);
    return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to get platforms' });
  }
}

// ── Collaboration / Real-Time handlers ──────────────────────────────────────

// In-memory collaboration store (use Redis in production)
const collabProjects = new Map(); // projectId → {collaborators, versions, comments}

async function handleCollabInvite(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `collab:invite:${auth.actorFingerprint}`,
    limit: 20,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      const body = await readJsonBody(req);
      const { projectId, email, role } = body;

      if (!projectId || !email || !role) {
        return sendJson(res, 400, { error: 'projectId, email, and role required' });
      }

      // In production, send email invite here
      // For now, return success and let frontend handle it
      const invite = {
        id: Math.random().toString(36).slice(2),
        projectId,
        invitedEmail: email,
        role,
        invitedBy: auth.actorFingerprint,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending',
      };

      return sendJson(res, 200, {
        invite,
        message: 'Invite sent. Share this project link to complete onboarding.',
      });
    } catch (err) {
      console.error('Collab invite error:', err);
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to send invite' });
    }
  });
}

async function handleCollabCollaborators(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `collab:collaborators:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      const projectId = req.query.projectId;
      if (!projectId) {
        return sendJson(res, 400, { error: 'projectId query param required' });
      }

      // Get collaborators from in-memory store (or database in production)
      const project = collabProjects.get(projectId) || {
        collaborators: [
          {
            userId: auth.actorFingerprint,
            name: 'You',
            email: 'user@echo-sound-lab.local',
            role: 'owner',
            color: '#4ECDC4',
            lastActive: new Date(),
          },
        ],
      };

      return sendJson(res, 200, project.collaborators);
    } catch (err) {
      console.error('Collab collaborators error:', err);
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to get collaborators' });
    }
  });
}

async function handleCollabVersions(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `collab:versions:${auth.actorFingerprint}`,
    limit: 60,
    windowMs: 60_000,
  }), async (auth) => {
    try {
      const projectId = req.query.projectId;
      if (!projectId) {
        return sendJson(res, 400, { error: 'projectId query param required' });
      }

      const project = collabProjects.get(projectId) || { versions: [] };
      return sendJson(res, 200, project.versions || []);
    } catch (err) {
      console.error('Collab versions error:', err);
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to get versions' });
    }
  });
}

async function handleCollabComments(req, res) {
  if (req.method === 'GET') {
    return withAuthAndRate(req, res, (auth) => ({
      key: `collab:comments-get:${auth.actorFingerprint}`,
      limit: 60,
      windowMs: 60_000,
    }), async (auth) => {
      try {
        const projectId = req.query.projectId;
        if (!projectId) {
          return sendJson(res, 400, { error: 'projectId query param required' });
        }

        const project = collabProjects.get(projectId) || { comments: [] };
        return sendJson(res, 200, project.comments || []);
      } catch (err) {
        console.error('Collab comments GET error:', err);
        return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to get comments' });
      }
    });
  } else if (req.method === 'POST') {
    return withAuthAndRate(req, res, (auth) => ({
      key: `collab:comments-post:${auth.actorFingerprint}`,
      limit: 30,
      windowMs: 60_000,
    }), async (auth) => {
      try {
        const body = await readJsonBody(req);
        const { projectId, text, mentions } = body;

        if (!projectId || !text) {
          return sendJson(res, 400, { error: 'projectId and text required' });
        }

        if (!collabProjects.has(projectId)) {
          collabProjects.set(projectId, { comments: [], versions: [], collaborators: [] });
        }

        const project = collabProjects.get(projectId);
        const comment = {
          id: Math.random().toString(36).slice(2),
          projectId,
          author: auth.actorFingerprint,
          text,
          timestamp: new Date(),
          resolved: false,
          mentions: mentions || [],
        };

        project.comments.push(comment);
        return sendJson(res, 200, comment);
      } catch (err) {
        console.error('Collab comments POST error:', err);
        return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to post comment' });
      }
    });
  } else {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
}

async function handleCollabServerStatus(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const wsServerUrl = process.env.COLLAB_WS_SERVER || 'ws://localhost:3001';
    return sendJson(res, 200, {
      status: 'available',
      wsServer: wsServerUrl,
      message: 'Real-time collaboration server endpoint',
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to get collaboration server status' });
  }
}

async function handleSystemHealth(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return withAuthAndRate(req, res, (auth) => ({
    key: `system:health:${auth.actorFingerprint}`,
    limit: 120,
    windowMs: 60_000,
  }), async () => {
    return sendJson(res, 200, getSystemHealthSnapshot());
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
    if (route.length === 2 && route[0] === 'system' && route[1] === 'health') {
      return await handleSystemHealth(req, res);
    }
    // DSP / Grammy Master routes — forward to Python backend
    if (route.length === 2 && route[0] === 'dsp' && route[1] === 'health') {
      return await handleDspHealth(req, res);
    }
    if (route.length === 2 && route[0] === 'dsp' && route[1] === 'master') {
      return await handleDspMaster(req, res);
    }
    if (route.length === 2 && route[0] === 'dsp' && route[1] === 'vocal-chain') {
      return await handleDspVocalChain(req, res);
    }
    if (route.length === 2 && route[0] === 'dsp' && route[1] === 'mix-tracks') {
      return await handleDspMixTracks(req, res);
    }
    // Stripe / Monetization routes
    if (route.length === 2 && route[0] === 'stripe' && route[1] === 'checkout') {
      return await handleStripeCheckout(req, res);
    }
    if (route.length === 2 && route[0] === 'stripe' && route[1] === 'webhook') {
      return await handleStripeWebhook(req, res);
    }
    if (route.length === 2 && route[0] === 'stripe' && route[1] === 'status') {
      return await handleStripeStatus(req, res);
    }
    // DistroKid / Distribution routes
    if (route.length === 2 && route[0] === 'distrokid' && route[1] === 'auth') {
      return await handleDistroKidAuth(req, res);
    }
    if (route.length === 2 && route[0] === 'distrokid' && route[1] === 'callback') {
      return await handleDistroKidCallback(req, res);
    }
    if (route.length === 2 && route[0] === 'distrokid' && route[1] === 'upload') {
      return await handleDistroKidUpload(req, res);
    }
    if (route.length === 2 && route[0] === 'distrokid' && route[1] === 'status') {
      return await handleDistroKidStatus(req, res);
    }
    if (route.length === 2 && route[0] === 'distrokid' && route[1] === 'platforms') {
      return await handleDistroKidPlatforms(req, res);
    }
    // Collaboration / Real-Time routes
    if (route.length === 3 && route[0] === 'collab' && route[1] === 'invite') {
      return await handleCollabInvite(req, res);
    }
    if (route.length === 3 && route[0] === 'collab' && route[1] === 'collaborators') {
      return await handleCollabCollaborators(req, res);
    }
    if (route.length === 3 && route[0] === 'collab' && route[1] === 'versions') {
      return await handleCollabVersions(req, res);
    }
    if (route.length === 3 && (route[0] === 'collab' && route[1] === 'comments')) {
      return await handleCollabComments(req, res);
    }
    if (route.length === 2 && route[0] === 'collab' && route[1] === 'server-status') {
      return await handleCollabServerStatus(req, res);
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
