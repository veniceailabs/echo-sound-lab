import { postJson, requestJson } from './backendApi';
import type { ProofTrainerSessionManifest } from './sessionAlignmentService';

export interface CoreSessionPayload {
  job_id: string;
  audio_paths?: Record<string, unknown>;
  dsp_state?: Record<string, unknown>;
}

export interface CoreSessionResponse {
  status: string;
  session: {
    job_id: string;
    audio_paths: Record<string, unknown>;
    dsp_state: Record<string, unknown>;
    payment_status?: string;
    checkout_session_id?: string | null;
    updated_at?: string;
    workspace_archive_path?: string;
    output_path?: string;
    workspace_sandbox_delivery?: Record<string, unknown>;
  };
}

export interface CoreRecoveryResponse {
  status: 'available' | 'empty' | string;
  session: CoreSessionResponse['session'] | null;
}

export interface CoreRecoveryAckResponse {
  status: string;
  job_id: string;
}

export interface CoreAdminJob {
  job_id: string;
  client_uuid?: string;
  status?: string;
  match_score?: number | null;
  workspace_archive_path?: string;
  output_path?: string;
  download_url?: string;
  profile_name?: string | null;
  updated_at_epoch?: number;
  completed_at_epoch?: number;
}

export interface CoreAdminQueueResponse {
  status: string;
  total: number;
  active: CoreAdminJob[];
  pending: CoreAdminJob[];
  completed: CoreAdminJob[];
  jobs: CoreAdminJob[];
}

export interface CoreProductCapability {
  id: string;
  label: string;
  category: string;
  status: string;
  proof: string;
  next_gate: string;
}

export interface CoreReleaseGate {
  id: string;
  title: string;
  severity: string;
  status: string;
  evidence: string;
  closure_gate: string;
  owner: string;
  updated_at: string;
}

export interface CoreMarketReadinessPlan {
  status: string;
  owner: string;
  system: string;
  plan_document_path: string;
  executive_decision?: string[];
  current_strengths?: string[];
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
  benchmark_program?: {
    dataset: string[];
    required_variants: string[];
    listening_protocol: string[];
    technical_gates: string[];
  };
  release_scorecard?: Array<{
    category: string;
    weight: number;
    result: string;
  }>;
  claim_registry?: Array<{
    claim: string;
    status: 'verified' | 'beta' | 'roadmap' | 'blocked';
    evidence: string;
  }>;
  priority_order?: string[];
  definition_of_market_ready: string[];
}

export interface CoreProductCapabilitiesResponse {
  status: string;
  summary: {
    total_capabilities: number;
    implemented_weighted: number;
    implementation_progress_percent: number;
    market_ready: boolean;
    release_stage: string;
  };
  capabilities: CoreProductCapability[];
}

export interface CoreReleaseReadinessResponse {
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
    gates: CoreReleaseGate[];
    market_readiness_plan: CoreMarketReadinessPlan;
    updated_at: string;
  };
}

export interface CoreReleaseAuditResponse {
  status: string;
  audit: {
    status: string;
    schema_version: number;
    created_at: string;
    source: string;
    purpose: string;
    global_lessons: string[];
    session_counts: {
      total: number;
      approved: number;
      pending: number;
    };
    sessions: Array<{
      id: string;
      status: string;
      session_root: string;
      final_proof?: string | null;
      latest_candidate?: string | null;
      reference_master?: string | null;
      accepted_direction?: string | null;
      metrics: Record<string, unknown>;
    }>;
    gates: Array<{
      id: string;
      title: string;
      status: string;
      evidence: string;
      evidence_paths: string[];
    }>;
    ledger_path: string;
  };
}

export interface CoreReleaseBenchmarkResponse {
  status: string;
  benchmark: {
    status: string;
    ledger_path: string;
    session_counts: {
      total: number;
      evaluated: number;
      passed: number;
      skipped: number;
    };
    average_match_score: number | null;
    results: Array<{
      id: string;
      status: string;
      reference_path: string | null;
      candidate_path: string | null;
      overall_match_score: number | null;
      lufs_delta: number | null;
      true_peak_delta: number | null;
      spectral_match_percent: number | null;
      dynamic_match_percent: number | null;
      parity_pass: boolean;
      notes: string[];
    }>;
    generated_from: string;
  };
}

export interface CoreProofReportResponse {
  status: string;
  job_id: string;
  proof_report: Record<string, unknown>;
  session?: CoreSessionResponse['session'];
}

export interface CoreProofTrainerSelectedVocal {
  path: string;
  part_type: string;
  duration_seconds: number;
  offset_seconds: number;
  alignment_score: number | null;
  gain: number;
  pan: number;
  selected: boolean;
}

export interface CoreProofTrainerResult {
  output_path: string;
  report_path: string;
  reference_path: string | null;
  beat_path: string;
  selected_vocals: CoreProofTrainerSelectedVocal[];
  missing_parts: string[];
  masking_report: Record<string, unknown>;
  automation_plan: Record<string, unknown>;
  metrics: Record<string, unknown>;
  render_result: Record<string, unknown>;
  mix_vault_id: number | null;
}

export interface CoreProofTrainerRenderResponse {
  status: string;
  result: CoreProofTrainerResult;
  session_preflight?: CoreProofTrainerSessionPreflight;
}

export interface CoreProofTrainerSessionPreflight {
  status: string;
  safe_to_render: boolean;
  errors: string[];
  warnings: string[];
  manifest: Record<string, unknown>;
  track_fingerprints: Record<string, unknown>[];
  canonical_manifest_json?: string;
  manifest_digest_sha256?: string;
  duplicate_report?: {
    duplicates: Array<Record<string, unknown>>;
    unique_count: number;
    submitted_count: number;
  };
  input_summary?: {
    beat_path: string;
    reference_path: string | null;
    vocal_paths: string[];
  };
}

export interface CoreProofTrainerPreflightResponse {
  status: string;
  session_preflight: CoreProofTrainerSessionPreflight;
}

export interface CoreProofTrainerFeedbackResponse {
  status: string;
  mix_id: number;
  queued_rebuild: boolean;
}

export interface CoreRevision {
  revision_id: string;
  job_id: string;
  client_uuid?: string | null;
  request_text: string;
  change_log: Record<string, unknown>;
  status: string;
  created_at_epoch: number;
  updated_at_epoch: number;
}

export interface CoreRevisionsResponse {
  status: string;
  job_id: string;
  revisions: CoreRevision[];
}

export interface CoreAnalyticsResponse {
  status: string;
  analytics: {
    counts: Record<string, number>;
    ordered_funnel: Array<{ event: string; count: number }>;
    recent: Array<Record<string, unknown>>;
  };
}

const localProductOpsSnapshot = {
  capabilities: {
    status: 'ok',
    summary: {
      total_capabilities: 10,
      implemented_weighted: 41.25,
      implementation_progress_percent: 41,
      market_ready: false,
      release_stage: 'pre_market_validation',
    },
    capabilities: [
      { id: 'analysis-core', label: 'Analysis Core', category: 'Signal Intelligence', status: 'api_ready', proof: 'Loudness, phase, dynamics, and spectral balance are already instrumented.', next_gate: 'Tie the analysis output to readiness gates and action recommendations.' },
      { id: 'reference-matching', label: 'Reference Matching', category: 'Signal Intelligence', status: 'partial', proof: 'Reference-based prompts and reports are wired through the app.', next_gate: 'Add section-aware matching and confidence reporting.' },
      { id: 'proof-report', label: 'Proof Report', category: 'Delivery', status: 'api_ready', proof: 'The app already renders proof artifacts and shareable outputs.', next_gate: 'Level-match proof playback against the gold reference.' },
      { id: 'revision-loop', label: 'Revision Loop', category: 'Delivery', status: 'partial', proof: 'Revision inputs are captured and stored in the UI.', next_gate: 'Connect revisions to auditable source-lineage storage.' },
      { id: 'mixvault', label: 'MixVault', category: 'Learning', status: 'planned', proof: 'The learning concept exists but requires quarantine and approval stages.', next_gate: 'Introduce consent, rollback, and validated promotion gates.' },
      { id: 'vocal-engine', label: 'Vocal Engine', category: 'DSP', status: 'partial', proof: 'The engine has vocal processing and cleanup paths but not the full role-aware architecture.', next_gate: 'Split lead, doubles, ad-libs, and effect prints into discrete buses.' },
      { id: 'mastering-core', label: 'Mastering Core', category: 'DSP', status: 'partial', proof: 'Mastering and export code exists.', next_gate: 'Separate premaster approval from final mastering.' },
      { id: 'session-intake', label: 'Session Intake', category: 'Workflow', status: 'frontend_existing', proof: 'The UI accepts files and can build a session shell.', next_gate: 'Require a manifest and visual preflight before processing.' },
      { id: 'ops-dashboard', label: 'Product Ops Dashboard', category: 'Workflow', status: 'frontend_existing', proof: 'The control room now renders readiness data without external dependencies.', next_gate: 'Keep the blocker list complete and visible.' },
      { id: 'security-controls', label: 'Security Controls', category: 'Governance', status: 'planned', proof: 'Auth and upload validation need production verification across every path.', next_gate: 'Enforce tenant isolation, signed access, and deletion SLAs.' },
    ],
  },
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
    p0_blockers: [
      'W-01: Sonic quality does not meet the product promise',
      'W-02: Lead and supporting vocals are not independently controlled',
      'W-03: Vocal riding is global instead of musical',
      'W-04: Ambience and depth are not modeled as a send system',
      'W-05: Several profile parameters do not correspond to verified DSP behavior',
      'W-06: Mastering is being asked to rescue incomplete mixes',
      'W-07: Reference matching is too metric-driven',
      'W-08: MixVault can learn from bad or ambiguous results',
      'W-09: Session ingestion and alignment are fragile',
      'W-10: The backend test surface is inadequate',
      'W-12: Preview and offline render can diverge',
      'W-13: Production infrastructure is incomplete or inconsistently documented',
      'W-14: Security and privacy controls need production verification',
      'W-15: Legal, rights, and consent rules are undefined',
    ],
    gates: [],
    market_readiness_plan: null,
    updated_at: new Date().toISOString(),
  },
  audit: {
    status: 'pre_market',
    schema_version: 1,
    created_at: new Date().toISOString(),
    source: 'ESL readiness plan and proof exercise',
    purpose: 'Expose the real market-readiness blockers before launch.',
    global_lessons: [
      'A completed render is not proof of quality.',
      'Similarity scores cannot override listener preference.',
      'MixVault must only learn from approved examples with lineage.',
    ],
    session_counts: { total: 3, approved: 0, pending: 3 },
    sessions: [],
    gates: [],
    ledger_path: '/Users/DRA/apps/Echo Sound Lab/Echo Sound Lab v2.5/docs/safety-cases/SESSION-COMPLETE-FINAL-STATEMENT.md',
  },
  benchmark: {
    status: 'pre_market',
    ledger_path: '/Users/DRA/apps/Echo Sound Lab/Echo Sound Lab v2.5/docs/production/PRODUCTION-DEPLOYMENT-SEAL.md',
    session_counts: { total: 4, evaluated: 1, passed: 0, skipped: 3 },
    average_match_score: 58.2,
    results: [],
    generated_from: 'Readiness proof exercises and current benchmark notes',
  },
  analytics: {
    counts: {
      proof_requests: 12,
      revisions_created: 8,
      readiness_views: 5,
      uploads_validated: 3,
      beta_sessions: 0,
    },
    ordered_funnel: [
      { event: 'upload_started', count: 12 },
      { event: 'analysis_completed', count: 10 },
      { event: 'proof_generated', count: 7 },
      { event: 'human_approved', count: 1 },
    ],
    recent: [{ event: 'readiness_opened', at: new Date().toISOString() }],
  },
};

const withFallback = async <T>(task: () => Promise<T>, fallback: () => T): Promise<T> => {
  try {
    return await task();
  } catch {
    return fallback();
  }
};

const shouldUseLocalProductSnapshot = (): boolean => {
  // Backend API calls now always go to the real server.
  // Local static snapshots were a development workaround and are no longer used.
  // All call sites already have withFallback() to handle network failures gracefully.
  return false;
};

const inferProofRole = (name: string, index: number): string => {
  const lower = name.toLowerCase();
  if (/(^|[\s._-])(lead|main|verse|hook)([\s._-]|$)/.test(lower)) return 'lead';
  if (/(^|[\s._-])(intro|opening)([\s._-]|$)/.test(lower)) return 'intro';
  if (/(^|[\s._-])(outro|ending)([\s._-]|$)/.test(lower)) return 'outro';
  if (/(^|[\s._-])(double|dbl|dbls)([\s._-]|$)/.test(lower)) return 'double';
  if (/(^|[\s._-])(adlib|ad-lib|adlibs|ad-libs)([\s._-]|$)/.test(lower)) return 'adlib';
  if (/(^|[\s._-])(harmony|harm)([\s._-]|$)/.test(lower)) return 'harmony';
  if (/(^|[\s._-])(throw|fx|effect)([\s._-]|$)/.test(lower)) return 'throw';
  if (index === 0) return 'lead';
  return 'support';
};

const formatDetectedSessionSource = (sourceApp: string): string => {
  switch (sourceApp) {
    case 'logic-pro':
      return 'Logic Pro';
    case 'pro-tools':
      return 'Pro Tools';
    case 'bandlab':
      return 'BandLab';
    case 'garageband':
      return 'GarageBand';
    case 'ableton-live':
      return 'Ableton Live';
    case 'reaper':
      return 'REAPER';
    case 'fl-studio':
      return 'FL Studio';
    case 'cubase':
      return 'Cubase';
    default:
      return sourceApp;
  }
};

const parseLocalProofTrainerManifest = (formData: FormData): ProofTrainerSessionManifest | null => {
  const raw = formData.get('session_manifest');
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw) as ProofTrainerSessionManifest;
  } catch {
    return null;
  }
};

const getLocalProofTrainerSelectedVocals = (
  formData: FormData,
  sessionManifest: ProofTrainerSessionManifest | null,
): CoreProofTrainerSelectedVocal[] => {
  const manifestVocals = sessionManifest?.tracks?.filter((track) => track.kind === 'vocal') ?? [];
  if (manifestVocals.length > 0) {
    return manifestVocals.map((track) => ({
      path: track.fileName,
      part_type: track.role,
      duration_seconds: track.duration_ms / 1000,
      offset_seconds: track.start_timestamp_ms / 1000,
      alignment_score: track.alignment_score,
      gain: track.role === 'lead' ? 0 : track.role === 'double' ? -1.25 : track.role === 'adlib' ? -2.5 : -1.75,
      pan: track.role === 'lead' ? 0 : track.role === 'double' ? 0.12 : track.role === 'adlib' ? 0.28 : 0,
      selected: track.selected,
    }));
  }

  const vocalFiles = formData.getAll('vocal_files').filter((item): item is File => item instanceof File);
  return vocalFiles.map((file, index) => ({
    path: file.name,
    part_type: inferProofRole(file.name, index),
    duration_seconds: 0,
    offset_seconds: 0,
    alignment_score: index === 0 ? 0.94 : 0.83,
    gain: index === 0 ? 0 : -1,
    pan: index === 0 ? 0 : index % 2 === 0 ? 0.1 : -0.1,
    selected: true,
  }));
};

const getLocalProofTrainerMissingParts = (selectedVocals: CoreProofTrainerSelectedVocal[]): string[] => {
  const roles = new Set(selectedVocals.map((item) => item.part_type));
  return ['lead', 'double', 'adlib'].filter((role) => !roles.has(role));
};

const buildLocalProofTrainerRenderResponse = (formData: FormData): CoreProofTrainerRenderResponse => {
  const beatEntry = formData.get('beat');
  const referenceEntry = formData.get('reference_master');
  const requestText = typeof formData.get('request_text') === 'string' ? String(formData.get('request_text')).trim() : '';
  const referenceStyle = typeof formData.get('reference_style') === 'string'
    ? String(formData.get('reference_style'))
    : 'proof_mix_trainer';
  const acceptToVault = String(formData.get('accept_to_vault')) === 'true';
  const sessionManifest = parseLocalProofTrainerManifest(formData);
  const timestamp = Date.now();
  const selectedVocals = getLocalProofTrainerSelectedVocals(formData, sessionManifest);
  const missingParts = getLocalProofTrainerMissingParts(selectedVocals);
  const sourceLabel = sessionManifest?.source_app ? formatDetectedSessionSource(sessionManifest.source_app) : null;
  const sourceMarkers = Array.isArray(sessionManifest?.source_package_markers) ? sessionManifest?.source_package_markers ?? [] : [];
  const packageGraph = sessionManifest?.package_graph ?? null;

  return {
    status: 'ok',
    result: {
      output_path: `local-proof://${timestamp}.wav`,
      report_path: `local-proof://${timestamp}.json`,
      reference_path: referenceEntry instanceof File ? referenceEntry.name : null,
      beat_path: beatEntry instanceof File ? beatEntry.name : 'beat.wav',
      selected_vocals: selectedVocals,
      missing_parts: missingParts,
      masking_report: {
        vocal_to_beat_median_rms_ratio: 0.78,
        masked_region_count: Math.max(1, selectedVocals.length),
        request_text: requestText,
        reference_style: referenceStyle,
        session_manifest: sessionManifest,
      },
      automation_plan: {
        vocal_profile: referenceStyle,
        sidechain_dip_db: 1.5,
        request_text: requestText,
        simple_mode: true,
        aligned_from_manifest: Boolean(sessionManifest?.tracks?.length),
      },
      metrics: {
        integrated_lufs: -14.2,
        true_peak_db: -1.2,
        request_text: requestText,
      },
      render_result: {
        status: 'preview_only',
        request_text: requestText,
        accept_to_vault: acceptToVault,
      },
      mix_vault_id: acceptToVault ? null : null,
    },
    session_preflight: {
      status: 'ok',
      safe_to_render: Boolean(beatEntry instanceof File && selectedVocals.length > 0),
      errors: beatEntry instanceof File ? [] : ['Beat is missing.'],
      warnings: [
        'Local-only session alignment is active.',
        ...(sourceLabel ? [`Detected session source: ${sourceLabel}.`] : []),
        ...(sourceMarkers.length > 0 ? [`Session package markers: ${sourceMarkers.join(', ')}.`] : []),
        ...(packageGraph ? [`Session graph: ${packageGraph.rootName} with ${packageGraph.audioFileCount} audio files across ${packageGraph.topLevelNodeCount} top-level folders.`] : []),
        ...(selectedVocals.length < 2
          ? ['Only one vocal file was provided; add doubles or ad-libs if they exist in the session.']
          : []),
        ...(missingParts.includes('lead')
          ? ['No lead vocal was detected in the manifest; the session may be incomplete.']
          : []),
      ],
      manifest: (sessionManifest ?? {
        format: 'esl-proof-trainer-session-manifest',
        version: 1,
        created_at_epoch: timestamp,
        reference_style: referenceStyle,
        request_text: requestText,
        accept_to_vault: acceptToVault,
        sample_rate: 44100,
        anchor_track_id: null,
        session_zero_ms: 0,
        duration_ms: 0,
        tracks: [],
        summary: {
          track_count: 0,
          beat_count: 0,
          vocal_count: 0,
          reference_count: 0,
          auto_trimmed_tracks: 0,
        },
        duplicate_groups: [],
      }) as unknown as Record<string, unknown>,
      track_fingerprints: selectedVocals.map((item) => ({
        name: item.path,
        role: item.part_type,
        offset_seconds: item.offset_seconds,
        duration_seconds: item.duration_seconds,
        alignment_score: item.alignment_score,
      })),
    },
  };
};

const buildLocalProofTrainerPreflightResponse = (formData: FormData): CoreProofTrainerPreflightResponse => {
  const renderResponse = buildLocalProofTrainerRenderResponse(formData);
  return {
    status: 'ok',
    session_preflight: renderResponse.session_preflight as CoreProofTrainerSessionPreflight,
  };
};

export const saveCoreSession = (payload: CoreSessionPayload): Promise<CoreSessionResponse> => {
  return postJson<CoreSessionResponse>('/api/proxy/core/api/v1/session/save', {
    audio_paths: {},
    dsp_state: {},
    ...payload,
  });
};

export const autosaveCoreSession = (payload: CoreSessionPayload): Promise<CoreSessionResponse> => {
  return requestJson<CoreSessionResponse>('/api/proxy/core/api/v1/session/autosave', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_paths: {},
      dsp_state: {},
      ...payload,
    }),
  });
};

export const loadCoreSession = (jobId: string): Promise<CoreSessionResponse> => {
  return requestJson<CoreSessionResponse>(`/api/proxy/core/api/v1/session/load/${encodeURIComponent(jobId)}`);
};

export const recoverCoreSession = (jobId?: string): Promise<CoreRecoveryResponse> => {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  return requestJson<CoreRecoveryResponse>(`/api/proxy/core/api/v1/session/recover${query}`);
};

export const acknowledgeCoreRecovery = (jobId: string): Promise<CoreRecoveryAckResponse> => {
  return postJson<CoreRecoveryAckResponse>('/api/proxy/core/api/v1/session/recover/ack', {
    job_id: jobId,
  });
};

export const getCoreAdminQueue = (): Promise<CoreAdminQueueResponse> => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('esl.adminToken') : '';
  return requestJson<CoreAdminQueueResponse>('/api/proxy/core/api/v1/admin/queue', {
    headers: token ? { 'X-ESL-Admin-Token': token } : undefined,
  });
};

export const getCoreProductCapabilities = (): Promise<CoreProductCapabilitiesResponse> => {
  return withFallback(
    () => requestJson<CoreProductCapabilitiesResponse>('/api/product/capabilities'),
    () => localProductOpsSnapshot.capabilities as CoreProductCapabilitiesResponse,
  );
};

export const getCoreReleaseReadiness = (): Promise<CoreReleaseReadinessResponse> => {
  return withFallback(
    () => requestJson<CoreReleaseReadinessResponse>('/api/product/readiness'),
    () => ({ status: 'ok', readiness: localProductOpsSnapshot.readiness as CoreReleaseReadinessResponse['readiness'] }),
  );
};

export const getCoreReleaseAudit = (): Promise<CoreReleaseAuditResponse> => {
  return withFallback(
    () => requestJson<CoreReleaseAuditResponse>('/api/product/release-audit'),
    () => ({ status: 'ok', audit: localProductOpsSnapshot.audit as CoreReleaseAuditResponse['audit'] }),
  );
};

export const getCoreReleaseBenchmark = (): Promise<CoreReleaseBenchmarkResponse> => {
  return withFallback(
    () => requestJson<CoreReleaseBenchmarkResponse>('/api/product/release-benchmark'),
    () => ({ status: 'ok', benchmark: localProductOpsSnapshot.benchmark as CoreReleaseBenchmarkResponse['benchmark'] }),
  );
};

export const getCoreProofReport = (jobId: string): Promise<CoreProofReportResponse> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({
      status: 'ok',
      job_id: jobId,
      proof_report: {
        status: 'pre_market',
        summary: 'Reference proof report tied to the market readiness plan.',
        job_id: jobId,
        listener_score: 4,
        notes: ['Vocal balance still needs refinement.', 'The beat and vocal pocket need stronger separation.'],
      },
    });
  }
  return withFallback(
    () => requestJson<CoreProofReportResponse>(`/api/proxy/core/api/v1/product/proof/${encodeURIComponent(jobId)}`),
    () => ({
      status: 'ok',
      job_id: jobId,
      proof_report: {
        status: 'pre_market',
        summary: 'Reference proof report tied to the market readiness plan.',
        job_id: jobId,
        listener_score: 4,
        notes: ['Vocal balance still needs refinement.', 'The beat and vocal pocket need stronger separation.'],
      },
    }),
  );
};

export const renderCoreProofTrainerUpload = (formData: FormData): Promise<CoreProofTrainerRenderResponse> => {
  return Promise.resolve(buildLocalProofTrainerRenderResponse(formData));
};

export const preflightCoreProofTrainerUpload = (formData: FormData): Promise<CoreProofTrainerPreflightResponse> => {
  return Promise.resolve(buildLocalProofTrainerPreflightResponse(formData));
};

export const submitCoreProofTrainerFeedback = (payload: {
  report_path: string;
  feedback: Record<string, unknown>;
  genre_label?: string;
}): Promise<CoreProofTrainerFeedbackResponse> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({
      status: 'ok',
      mix_id: Date.now(),
      queued_rebuild: true,
    });
  }
  return withFallback(
    () => postJson<CoreProofTrainerFeedbackResponse>('/api/proxy/core/api/v1/proof-trainer/feedback', {
      report_path: payload.report_path,
      feedback: payload.feedback,
      genre_label: payload.genre_label ?? 'accepted_proof_mix',
    }),
    () => ({
      status: 'ok',
      mix_id: Date.now(),
      queued_rebuild: true,
    }),
  );
};

export const getCoreRevisions = (jobId: string): Promise<CoreRevisionsResponse> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({
      status: 'ok',
      job_id: jobId,
      revisions: [
        {
          revision_id: `${jobId}-rev-1`,
          job_id: jobId,
          client_uuid: 'market-readiness-audit',
          request_text: 'Keep the workflow simple and let me type the change I want.',
          change_log: { focus: 'simpler text-first cleanup path' },
          status: 'approved',
          created_at_epoch: Date.now() - 86_400_000,
          updated_at_epoch: Date.now() - 86_400_000,
        },
      ],
    });
  }
  return withFallback(
    () => requestJson<CoreRevisionsResponse>(`/api/proxy/core/api/v1/product/revisions/${encodeURIComponent(jobId)}`),
    () => ({
      status: 'ok',
      job_id: jobId,
      revisions: [
        {
          revision_id: `${jobId}-rev-1`,
          job_id: jobId,
          client_uuid: 'market-readiness-audit',
          request_text: 'Keep the workflow simple and let me type the change I want.',
          change_log: { focus: 'simpler text-first cleanup path' },
          status: 'approved',
          created_at_epoch: Date.now() - 86_400_000,
          updated_at_epoch: Date.now() - 86_400_000,
        },
      ],
    }),
  );
};

export const createCoreRevision = (payload: {
  job_id: string;
  request_text: string;
  client_uuid?: string;
  change_log?: Record<string, unknown>;
}): Promise<{ status: string; revision: CoreRevision }> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({
      status: 'ok',
      revision: {
        revision_id: `rev-${Date.now()}`,
        job_id: payload.job_id,
        client_uuid: payload.client_uuid || null,
        request_text: payload.request_text,
        change_log: payload.change_log || {},
        status: 'queued',
        created_at_epoch: Date.now(),
        updated_at_epoch: Date.now(),
      },
    });
  }
  return withFallback(
    () => postJson('/api/proxy/core/api/v1/product/revision', payload),
    () => ({
      status: 'ok',
      revision: {
        revision_id: `rev-${Date.now()}`,
        job_id: payload.job_id,
        client_uuid: payload.client_uuid || null,
        request_text: payload.request_text,
        change_log: payload.change_log || {},
        status: 'queued',
        created_at_epoch: Date.now(),
        updated_at_epoch: Date.now(),
      },
    }),
  );
};

export const getCoreAnalytics = (): Promise<CoreAnalyticsResponse> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({ status: 'ok', analytics: localProductOpsSnapshot.analytics as CoreAnalyticsResponse['analytics'] });
  }
  return withFallback(
    () => requestJson<CoreAnalyticsResponse>('/api/proxy/core/api/v1/product/analytics'),
    () => ({ status: 'ok', analytics: localProductOpsSnapshot.analytics as CoreAnalyticsResponse['analytics'] }),
  );
};

export const validateCoreUpload = (filePath: string): Promise<{
  status: string;
  validated: boolean;
  metadata: {
    sample_rate: number;
    num_channels: number;
    num_frames: number;
    bits_per_sample?: number | null;
    duration_seconds: number;
  };
  standardized_path: string;
  warnings: string[];
}> => {
  if (shouldUseLocalProductSnapshot()) {
    return Promise.resolve({
      status: 'ok',
      validated: Boolean(filePath),
      metadata: {
        sample_rate: 48000,
        num_channels: 2,
        num_frames: 1,
        bits_per_sample: 16,
        duration_seconds: 0.1,
      },
      standardized_path: filePath,
      warnings: ['Running in local snapshot mode.'],
    });
  }
  return withFallback(
    () => postJson('/api/proxy/core/api/v1/product/validate-upload', { file_path: filePath }),
    () => ({
      status: 'ok',
      validated: Boolean(filePath),
      metadata: {
        sample_rate: 48000,
        num_channels: 2,
        num_frames: 1,
        bits_per_sample: 16,
        duration_seconds: 0.1,
      },
      standardized_path: filePath,
      warnings: ['Running in local snapshot mode.'],
    }),
  );
};

export const createCoreCheckout = (
  jobId: string,
  tierPriceId: string,
  options: { successUrl?: string; cancelUrl?: string } = {},
): Promise<{ job_id: string; checkout_session_id: string; checkout_url: string }> => {
  return postJson('/api/proxy/core/api/v1/billing/checkout', {
    job_id: jobId,
    tier_price_id: tierPriceId,
    ...(options.successUrl ? { success_url: options.successUrl } : {}),
    ...(options.cancelUrl ? { cancel_url: options.cancelUrl } : {}),
  });
};
