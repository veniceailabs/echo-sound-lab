type DebugErrorKind = 'window.error' | 'window.unhandledrejection' | 'react.errorboundary' | 'custom';

export type DebugErrorEntry = {
  ts: number;
  kind: DebugErrorKind;
  message: string;
  name?: string;
  stack?: string;
  href?: string;
  ua?: string;
  extra?: Record<string, unknown>;
};

export type DebugAudioContextInfo = {
  updatedAt: number;
  state: string;
  sampleRate?: number;
};

const LS_ERRORS_KEY = 'esl.debug.errors.v1';
const LS_CTX_KEY = 'esl.debug.audioContexts.v1';
const MAX_ERRORS = 10;

let installed = false;
let cachedContexts: Record<string, DebugAudioContextInfo> = {};

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function loadErrors(): DebugErrorEntry[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeJsonParse<DebugErrorEntry[]>(window.localStorage.getItem(LS_ERRORS_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

function saveErrors(next: DebugErrorEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_ERRORS_KEY, JSON.stringify(next.slice(-MAX_ERRORS)));
  } catch {
    // ignore storage quota / private mode failures
  }
}

function loadContexts(): Record<string, DebugAudioContextInfo> {
  if (typeof window === 'undefined') return {};
  const parsed = safeJsonParse<Record<string, DebugAudioContextInfo>>(window.localStorage.getItem(LS_CTX_KEY));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function saveContexts(next: Record<string, DebugAudioContextInfo>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_CTX_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export const debugTelemetryService = {
  installGlobalErrorHandlers() {
    if (installed) return;
    if (typeof window === 'undefined') return;
    installed = true;

    // hydrate cached contexts from last session (helps when a tester opens Settings before visiting a workspace)
    cachedContexts = loadContexts();

    window.addEventListener('error', (event) => {
      try {
        const err = (event as ErrorEvent).error as Error | undefined;
        debugTelemetryService.recordError('window.error', err ?? new Error((event as ErrorEvent).message || 'Unknown error'), {
          filename: (event as ErrorEvent).filename,
          lineno: (event as ErrorEvent).lineno,
          colno: (event as ErrorEvent).colno,
        });
      } catch {
        // ignore
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = (event as PromiseRejectionEvent).reason;
        const err = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
        debugTelemetryService.recordError('window.unhandledrejection', err);
      } catch {
        // ignore
      }
    });
  },

  recordError(kind: DebugErrorKind, error: Error, extra?: Record<string, unknown>) {
    if (typeof window === 'undefined') return;
    const entry: DebugErrorEntry = {
      ts: Date.now(),
      kind,
      message: error.message || String(error),
      name: error.name,
      stack: error.stack,
      href: window.location?.href,
      ua: navigator?.userAgent,
      extra,
    };
    const current = loadErrors();
    const next = [...current, entry].slice(-MAX_ERRORS);
    saveErrors(next);
  },

  getRecentErrors(): DebugErrorEntry[] {
    return loadErrors();
  },

  clearErrors() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(LS_ERRORS_KEY);
    } catch {
      // ignore
    }
  },

  setAudioContextInfo(scope: 'single' | 'multistem' | string, info: Omit<DebugAudioContextInfo, 'updatedAt'>) {
    const next: DebugAudioContextInfo = { ...info, updatedAt: Date.now() };
    cachedContexts = { ...(cachedContexts || {}), [scope]: next };
    saveContexts(cachedContexts);
  },

  getAudioContextInfo(): Record<string, DebugAudioContextInfo> {
    if (!cachedContexts || Object.keys(cachedContexts).length === 0) {
      cachedContexts = loadContexts();
    }
    return { ...(cachedContexts || {}) };
  },
};

