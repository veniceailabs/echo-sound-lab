import { GoogleGenAI } from '@google/genai';
import { getGeminiConfig } from '../_lib/env.js';
import { handleOptions, readJsonBody, sendJson } from '../_lib/http.js';
import { AuthError, requireAuthContext } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

function normalizeTextResponse(result) {
  if (!result) return '';
  if (typeof result.text === 'string') return result.text;
  if (typeof result.outputText === 'string') return result.outputText;
  if (typeof result.response?.text === 'string') return result.response.text;
  if (typeof result.response?.outputText === 'string') return result.response.outputText;
  return '';
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = requireAuthContext(req);
    const rate = checkRateLimit({
      key: `gemini:generate:${auth.actorFingerprint}`,
      limit: 90,
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
    const { apiKey, defaultModel } = getGeminiConfig();
    const ai = new GoogleGenAI({ apiKey });

    const model = body.model || defaultModel;
    const config = body.config || {};

    if (Array.isArray(body.history) && typeof body.message === 'string') {
      const chat = ai.chats.create({
        model,
        config,
        history: body.history,
      });
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
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Gemini request failed',
    });
  }
}
