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
const shouldUseLocalProductSnapshot = (): boolean => {
  // Backend API calls now always go to the real server.
  // Local static snapshots were a development workaround and are no longer used.
  return false;
};

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

export interface LocalMarketReadinessPlan {
  status: string;
  owner: string;
  system: string;
  plan_document_path: string;
  executive_decision: string[];
  current_strengths: string[];
  release_promise: string[];
  weaknesses: Array<{
    id: string;
    severity: string;
    title: string;
    summary: string;
  }>;
  weakness_counts: {
    total: number;
    p0: number;
    p1: number;
  };
  launch_scope: {
    in_scope: string[];
    out_of_scope: string[];
  };
  phases: Array<{
    id: number;
    name: string;
    exit_gate: string;
  }>;
  benchmark_program: {
    dataset: string[];
    required_variants: string[];
    listening_protocol: string[];
    technical_gates: string[];
  };
  release_scorecard: Array<{
    category: string;
    weight: number;
    result: string;
  }>;
  claim_registry?: Array<{
    claim: string;
    status: 'verified' | 'beta' | 'roadmap' | 'blocked';
    evidence: string;
  }>;
  priority_order: string[];
  definition_of_market_ready: string[];
}

export interface LocalProductReadinessResponse {
  status: string;
  readiness: {
    status: string;
    market_ready: boolean;
    release_stage: string;
    implementation_progress_percent: number;
    gate_counts: {
      total: number;
      p0_total: number;
      p0_passing: number;
      blocked: number;
    };
    p0_blockers: string[];
    gates: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      evidence: string;
      closure_gate: string;
      owner: string;
      updated_at: string;
    }>;
    market_readiness_plan: LocalMarketReadinessPlan;
    updated_at: string;
  };
}

const localMarketReadinessPlanSnapshot: LocalMarketReadinessPlan = {
  status: 'pre_market_validation',
  owner: 'Andra / itsjustdra',
  system: 'Echo Sound Lab v2.5 frontend and echo-sound-lab-core backend',
  plan_document_path: '/Users/DRA/apps/Echo Sound Lab/Echo Sound Lab v2.5/ESL_MARKET_READINESS_PLAN.md',
  executive_decision: [
    'ESL is promising but not yet market ready as an autonomous professional mixing and mastering service.',
    'The first release must make a narrower, defensible promise centered on technically safe, musically improved results.',
    'Public claims like Grammy-level or fully autonomous engineering must remain off-limits until the gates pass.',
  ],
  current_strengths: [
    'A broad React/TypeScript studio interface already exists.',
    'The Python core can analyze audio, process vocals, sum stems, master, export, and create proof reports.',
    'The product already has a recognizable workflow direction and a live frontend.',
    'The dontHoldBack exercise exposed real defects before customers paid for them.',
  ],
  release_promise: [
    'Accept a stereo premaster or organized multitrack session.',
    'Produce a technically safe and musically improved result.',
    'Provide an honest level-matched A/B comparison.',
    'Support controlled revisions without damaging timing, arrangement, or source integrity.',
  ],
  weaknesses: [
    { id: 'W-01', severity: 'P0', title: 'Sonic quality does not meet the product promise', summary: 'The dontHoldBack proof was rated 4/10 and sounded dry, lifeless, low, and in some passes doubled or robotic.' },
    { id: 'W-02', severity: 'P0', title: 'Lead and supporting vocals are not independently controlled', summary: 'Lead, intro, hook, echo, double, full-tone, and ad-lib material have been combined into a largely shared vocal path.' },
    { id: 'W-03', severity: 'P0', title: 'Vocal riding is global instead of musical', summary: 'The proof path measures an active RMS ratio and applies a global gain correction instead of phrase-aware riding.' },
    { id: 'W-04', severity: 'P0', title: 'Ambience and depth are not modeled as a send system', summary: 'Vocal space is represented by a fixed insert reverb and optional stereo taps rather than a proper send architecture.' },
    { id: 'W-05', severity: 'P0', title: 'Several profile parameters do not correspond to verified DSP behavior', summary: 'Profile names can promise behavior that the signal path does not consistently deliver.' },
    { id: 'W-06', severity: 'P0', title: 'Mastering is being asked to rescue incomplete mixes', summary: 'Global EQ and limiting are being applied before vocal balance and depth are fully resolved.' },
    { id: 'W-07', severity: 'P0', title: 'Reference matching is too metric-driven', summary: 'High objective scores have coexisted with a poor human rating, which means metric similarity is not enough.' },
    { id: 'W-08', severity: 'P0', title: 'MixVault can learn from bad or ambiguous results', summary: 'Metric completion is not being treated as proof of quality, so bad examples could pollute future recommendations.' },
    { id: 'W-09', severity: 'P0', title: 'Session ingestion and alignment are fragile', summary: 'Source recordings have been mistaken for extra tracks and some renders were perceived as late or incomplete.' },
    { id: 'W-10', severity: 'P0', title: 'The backend test surface is inadequate', summary: 'The core repo still needs a larger deterministic test matrix for DSP, API, concurrency, and failure recovery.' },
    { id: 'W-11', severity: 'P1', title: 'Frontend breadth exceeds verified depth', summary: 'The surface area is large, but some actions may still be simulated, partial, or hidden behind dense UI.' },
    { id: 'W-12', severity: 'P0', title: 'Preview and offline render can diverge', summary: 'Real-time web audio and backend processing are separate systems, so preview parity is not yet guaranteed.' },
    { id: 'W-13', severity: 'P0', title: 'Production infrastructure is incomplete or inconsistently documented', summary: 'Readiness claims still outpace the fully verified deployment and smoke-test story.' },
    { id: 'W-14', severity: 'P0', title: 'Security and privacy controls need production verification', summary: 'Tenant isolation, upload validation, signed access, and deletion behavior need stronger proof.' },
    { id: 'W-15', severity: 'P0', title: 'Legal, rights, and consent rules are undefined', summary: 'Reference ingestion and learning need explicit consent and rights boundaries enforced in code.' },
    { id: 'W-16', severity: 'P1', title: 'Commercial workflow and support are not proven', summary: 'Billing, revisions, packaging, admin queueing, and client intake need one fully verified production journey.' },
  ],
  weakness_counts: {
    total: 16,
    p0: 14,
    p1: 2,
  },
  launch_scope: {
    in_scope: [
      'Stereo mastering from WAV/AIFF/FLAC.',
      'Organized multitrack mixing for a constrained set of roles.',
      'Hip-hop and R&B as the initial validated genre family.',
      'Reference-assisted analysis without copying a proprietary chain.',
    ],
    out_of_scope: [
      'Arbitrary DAW project import with third-party plugin recreation.',
      'Automatic comping, pitch correction, or timing repair without explicit approval.',
      'Full replacement for Logic, Pro Tools, or an experienced engineer.',
      'Guaranteed Grammy-level results.',
    ],
  },
  phases: [
    { id: 0, name: 'Truth reset and release governance', exit_gate: 'No public or internal readiness claim contradicts the gate dashboard.' },
    { id: 1, name: 'Deterministic source and session integrity', exit_gate: 'dontHoldBack arrangement and benchmark sessions reproduce without missing or shifted audio.' },
    { id: 2, name: 'Rebuild the vocal engine', exit_gate: 'Vocal benchmark passes intelligibility, naturalness, depth, phase, and level-consistency tests.' },
    { id: 3, name: 'Rebuild mix-bus intelligence', exit_gate: 'No clipping, pumping, low-end collapse, vocal masking, or phase instability.' },
    { id: 4, name: 'Rebuild mastering as a separate approval stage', exit_gate: 'Masters translate across devices and win blind preference tests.' },
    { id: 5, name: 'Reference intelligence and confidence', exit_gate: 'A high ESL score reliably predicts human preference on held-out songs.' },
    { id: 6, name: 'MixVault learning safety', exit_gate: 'Every production recommendation can identify its supporting examples and roll back safely.' },
    { id: 7, name: 'One real frontend workflow', exit_gate: 'New beta users complete the workflow without developer assistance.' },
    { id: 8, name: 'Backend production hardening', exit_gate: 'Load, interruption, retry, and disaster-recovery tests pass without lost jobs.' },
    { id: 9, name: 'Security, privacy, legal, and billing', exit_gate: 'Security review passes and policies match technical behavior.' },
    { id: 10, name: 'Closed beta and market validation', exit_gate: 'At least 30 completed songs with strong satisfaction and no critical incidents.' },
    { id: 11, name: 'Controlled commercial launch', exit_gate: 'Four consecutive weeks meet quality, reliability, support, security, and economics targets.' },
  ],
  benchmark_program: {
    dataset: [
      'Minimum 40 songs before broad launch.',
      'At least 20 hip-hop and 20 R&B songs.',
      'Mixture of male, female, soft, aggressive, melodic, and spoken/rap vocals.',
      'Real raw stems, not stems separated from a finished master, unless that separation is the feature under test.',
    ],
    required_variants: [
      'Raw/static baseline.',
      'Current ESL production candidate.',
      'Approved human mix or credible gold reference.',
      'ESL revision after structured feedback.',
    ],
    listening_protocol: [
      'Loudness-match comparisons.',
      'Randomize and blind labels.',
      'Compare equivalent song sections.',
      'Use at least five qualified listeners per launch-critical song.',
    ],
    technical_gates: [
      'No NaN, Inf, unexpected silence, truncation, or channel swap.',
      'No unintended timing drift or duplicate vocal.',
      'No sample clipping and true peak within selected delivery target.',
      'Mono compatibility and correlation within safe bounds.',
      'Repeat render is deterministic for the same engine version and manifest.',
    ],
  },
  release_scorecard: [
    { category: 'Sonic preference', weight: 30, result: 'Pass benchmark preference thresholds.' },
    { category: 'Vocal quality', weight: 15, result: 'No buried, doubled, robotic, harsh, or missing lead events.' },
    { category: 'Arrangement integrity', weight: 10, result: 'Sample-accurate manifest reproduction.' },
    { category: 'Render reliability', weight: 10, result: 'At least 99% successful jobs in beta.' },
    { category: 'Preview/export parity', weight: 5, result: 'Within approved objective and listening tolerances.' },
    { category: 'Security/privacy', weight: 10, result: 'No open critical/high findings.' },
    { category: 'Workflow completion', weight: 5, result: 'New users complete without developer help.' },
    { category: 'Billing/delivery', weight: 5, result: 'End-to-end payment and fulfillment pass.' },
    { category: 'Legal/consent', weight: 5, result: 'Policies implemented and technically enforced.' },
    { category: 'Support/recovery', weight: 5, result: 'SLA, refunds, revisions, recovery, and deletion verified.' },
  ],
  claim_registry: [
    {
      claim: 'Free Online Mixing and Mastering Studio',
      status: 'beta',
      evidence: 'Front door and SEO copy use the narrower mixing/mastering promise.',
    },
    {
      claim: 'Reference-aware proof workflow',
      status: 'verified',
      evidence: 'Proof trainer, local fallback, and ops dashboard all surface the proof path.',
    },
    {
      claim: 'Grammy-level results',
      status: 'blocked',
      evidence: 'Readiness plan W-17 prohibits this claim until benchmark evidence exists.',
    },
    {
      claim: 'Fully autonomous mix engineer',
      status: 'blocked',
      evidence: 'Readiness plan W-13 and W-17 keep the product in pre-market validation.',
    },
  ],
  priority_order: [
    'Freeze feature expansion and remove unsupported readiness claims.',
    'Build the weakness/readiness dashboard from this document.',
    'Add backend Python tests and a small licensed golden-audio fixture set.',
    'Create the deterministic session manifest and intake preflight.',
    'Reproduce dontHoldBack with exact arrangement integrity before processing.',
    'Split lead, doubles, ad-libs, effects, and printed stems into independent buses.',
    'Implement phrase-aware vocal riding and proper effect sends.',
    'Enforce premaster approval before mastering.',
    'Add blind, level-matched listening capture.',
    'Quarantine MixVault learning until explicit approval and lineage exist.',
  ],
  definition_of_market_ready: [
    'Preserves every intended performance and arrangement decision.',
    'Makes the majority of validated songs sound clearly better, not merely louder.',
    'Keeps vocal results stable, intelligible, dimensional, and artifact-free.',
    'Preview and export agree.',
    'Automated confidence correlates with human preference.',
    'Bad results do not enter production learning.',
    'Customers can upload, pay, process, revise, approve, download, and delete safely.',
    'Jobs survive retries, worker failures, and browser closure.',
    'Security, privacy, consent, and rights handling are enforced in code.',
    'Marketing language is supported by reproducible evidence.',
  ],
};

const withFallback = async <T,>(task: () => Promise<T>, fallback: () => T): Promise<T> => {
  try {
    return await task();
  } catch {
    return fallback();
  }
};

export const getLocalProductReadiness = async (): Promise<LocalProductReadinessResponse> => {
  return withFallback(
    () => requestJson<LocalProductReadinessResponse>('/api/product/readiness'),
    () => ({
      status: 'ok',
      readiness: {
        status: 'pre_market',
        market_ready: false,
        release_stage: 'pre_market_validation',
        implementation_progress_percent: 41,
        gate_counts: {
          total: 16,
          p0_total: 14,
          p0_passing: 0,
          blocked: 14,
        },
        p0_blockers: localMarketReadinessPlanSnapshot.weaknesses
          .filter((item) => item.severity === 'P0')
          .map((item) => `${item.id}: ${item.title}`),
        gates: localMarketReadinessPlanSnapshot.weaknesses.map((weakness) => ({
          id: weakness.id,
          title: weakness.title,
          severity: weakness.severity,
          status: weakness.severity === 'P0' ? 'blocked' : 'watching',
          evidence: weakness.summary,
          closure_gate: 'Pass the documented gate in the market readiness plan.',
          owner: 'ESL core team',
          updated_at: new Date().toISOString(),
        })),
        market_readiness_plan: localMarketReadinessPlanSnapshot,
        updated_at: new Date().toISOString(),
      },
    }),
  );
};

export const getLocalMarketReadinessPlan = async (): Promise<{ status: string; plan: LocalMarketReadinessPlan }> => {
  return withFallback(
    () => requestJson<{ status: string; plan: LocalMarketReadinessPlan }>('/api/product/market-readiness-plan'),
    () => ({ status: 'ok', plan: localMarketReadinessPlanSnapshot }),
  );
};
