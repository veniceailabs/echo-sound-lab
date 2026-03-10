export class BackendApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.details = details;
  }
}

const AUTH_STORAGE_KEY = 'esl.authToken';
const AUTH_SUBJECT_KEY = 'esl.authSubject';

const generateLocalAuthToken = (): string => {
  const randomPart = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `esl_local_${randomPart}`;
};

const getAuthToken = (): string => {
  if (typeof window === 'undefined') {
    return process.env.ESL_TEST_AUTH_TOKEN || 'esl_test_auth_token_000000000000';
  }

  const existing = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (existing && existing.length >= 16) {
    return existing;
  }

  const created = generateLocalAuthToken();
  window.localStorage.setItem(AUTH_STORAGE_KEY, created);
  return created;
};

const getActorId = (): string => {
  if (typeof window === 'undefined') {
    return 'server-test-actor';
  }

  const explicit = window.localStorage.getItem(AUTH_SUBJECT_KEY);
  if (explicit && explicit.trim()) {
    return explicit.trim().slice(0, 64);
  }

  const token = getAuthToken();
  return `actor-${token.slice(-16)}`;
};

const getAuthHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getAuthToken()}`,
  'X-ESL-Actor-Id': getActorId(),
});

const withDefaultHeaders = (initHeaders: HeadersInit | undefined, defaults: Record<string, string>): Headers => {
  const headers = new Headers(initHeaders || {});
  for (const [key, value] of Object.entries(defaults)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return headers;
};

const buildError = async (response: Response): Promise<BackendApiError> => {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const details = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');
  const message =
    (typeof details === 'object' && details && 'error' in details && typeof details.error === 'string' && details.error) ||
    (typeof details === 'object' && details && 'message' in details && typeof details.message === 'string' && details.message) ||
    response.statusText ||
    `Request failed with status ${response.status}`;

  return new BackendApiError(message, response.status, details);
};

export const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: withDefaultHeaders(init.headers, getAuthHeaders()),
  });
  if (!response.ok) {
    throw await buildError(response);
  }
  return response.json() as Promise<T>;
};

export const postJson = async <T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> => {
  return requestJson<T>(path, {
    ...init,
    method: init.method || 'POST',
    headers: withDefaultHeaders(init.headers, {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
};

export const authFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
  return fetch(path, {
    ...init,
    headers: withDefaultHeaders(init.headers, getAuthHeaders()),
  });
};
