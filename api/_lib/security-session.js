import crypto from 'node:crypto';

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_COUNT = 5000;

function getStore() {
  if (!globalThis.__eslExecutionSessionStore) {
    globalThis.__eslExecutionSessionStore = new Map();
  }
  return globalThis.__eslExecutionSessionStore;
}

function pruneExpiredSessions(store, now = Date.now()) {
  for (const [sessionId, session] of store.entries()) {
    if (session.expiresAt <= now) {
      store.delete(sessionId);
    }
  }
}

export function createExecutionSession(actorId = 'anonymous', actorFingerprint = '') {
  const store = getStore();
  pruneExpiredSessions(store);

  if (store.size >= MAX_SESSION_COUNT) {
    const oldest = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) {
      store.delete(oldest[0]);
    }
  }

  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const sessionSecret = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + SESSION_TTL_MS;

  store.set(sessionId, {
    sessionId,
    actorId,
    actorFingerprint,
    sessionSecret,
    createdAt: now,
    expiresAt,
    consumedNonces: new Set(),
  });

  return {
    sessionId,
    sessionSecret,
    expiresAt,
    signatureVersion: 'hmac-sha256-v1',
  };
}

export function consumeExecutionNonce(sessionId, nonce, actorFingerprint = '') {
  if (!sessionId || !nonce) {
    return { ok: false, reason: 'missing_session_or_nonce' };
  }

  const store = getStore();
  pruneExpiredSessions(store);

  const session = store.get(sessionId);
  if (!session) {
    return { ok: false, reason: 'session_not_found_or_expired' };
  }

  if (session.actorFingerprint && actorFingerprint && session.actorFingerprint !== actorFingerprint) {
    return { ok: false, reason: 'actor_mismatch' };
  }

  if (session.consumedNonces.has(nonce)) {
    return { ok: false, reason: 'nonce_replay_detected' };
  }

  session.consumedNonces.add(nonce);
  return { ok: true };
}
