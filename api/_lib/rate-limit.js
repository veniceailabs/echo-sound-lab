const MAX_KEYS = 50000;

function getStore() {
  if (!globalThis.__eslRateLimitStore) {
    globalThis.__eslRateLimitStore = new Map();
  }
  return globalThis.__eslRateLimitStore;
}

function pruneExpired(store, now) {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const store = getStore();
  pruneExpired(store, now);

  if (store.size > MAX_KEYS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)[0];
    if (oldest) store.delete(oldest[0]);
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  store.set(key, current);
  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}
