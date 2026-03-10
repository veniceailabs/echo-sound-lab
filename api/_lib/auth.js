import crypto from 'node:crypto';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function extractBearerToken(req) {
  const raw = req.headers.authorization || req.headers.Authorization;
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function sanitizeActorId(input) {
  return String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 64);
}

export class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export function requireAuthContext(req) {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError('Missing bearer token', 401);
  }

  if (token.length < 16) {
    throw new AuthError('Bearer token is too short', 401);
  }

  const actorFingerprint = sha256(token);
  const headerActorId = sanitizeActorId(req.headers['x-esl-actor-id']);
  const actorId = headerActorId || `actor-${actorFingerprint.slice(0, 16)}`;

  return {
    actorId,
    actorFingerprint,
    tokenHash: actorFingerprint,
  };
}
