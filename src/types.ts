import { GenreProfile } from './services/genreProfiles';

export type ProcessingMode = 'default' | 'vocal_presence';
export type EngineMode = 'FRIENDLY' | 'ADVANCED';
export type PreservationMode = 'preserve' | 'balanced' | 'competitive';

export type HookStatus = 'draft' | 'rendering' | 'ready' | 'failed';
export type VideoStyle = 'Noir' | 'Glitch' | 'Cinematic' | 'Abstract';

export interface VideoScene {
  id: string;
  startTime: number; // Seconds
  endTime: number;
  style: VideoStyle;
  prompt: string;
  reactivity: number; // 0.0 - 1.0
  caption?: string;
}

export interface AnimateArtRequest {
  sourceImageUrl?: string;
  previewUrl?: string;
  songId?: string;
  prompt?: string;
  style?: 'cinematic' | 'abstract' | 'lyric' | 'performance';
  durationSeconds?: number;
}

export interface HookAsset {
  id: string;
  title: string;
  status: HookStatus;
  createdAt: string;
  durationSeconds: number;
  previewUrl?: string;
  imageUrl?: string;
}

export interface AudioMetrics {
  rms: number;
  peak: number;
  crestFactor: number;
  spectralCentroid: number;
  spectralRolloff: number;
  duration: number;
  spectralBalance?: {
    low: number;      // 20-150Hz
    lowMid: number;   // 150-500Hz
    mid: number;      // 500-2kHz
    highMid: number;  // 2-5kHz
    high: number;     // 5kHz+
  };
  lufs?: {
    integrated: number;
    shortTerm: number;
    momentary: number;
    loudnessRange: number;
    truePeak: number;
  };

  // PROFESSIONAL DIAGNOSTICS (NEW)
  advancedMetrics?: {
    // Loudness consistency (how steady is the loudness over time?)
    loudnessConsistency?: number; // 0-100, higher = more consistent
    loudnessVariance?: number;    // dB, variance across track
    loudnessFloor?: number;       // dB, minimum loudness point
    loudnessPeaks?: number;       // count of brief loud moments

    // Frequency-specific dynamics
    dynamicsPerBand?: {
      subBass: number;          // 20-60Hz
      bass: number;             // 60-250Hz
      lowMid: number;           // 250-500Hz
      mid: number;              // 500-2kHz
      highMid: number;          // 2-5kHz
      presence: number;         // 5-8kHz
      brilliance: number;       // 8-16kHz
    };

    // Phase & Stereo quality
    monoCompatibility?: number;   // 0-100, how well it works in mono
    phaseCoherence?: number;      // 0-100, phase stability
    stereoWidth?: number;         // 0-100, perceived stereo width
    stereoImbalance?: number;     // dB, L-R level difference

    // Transient characteristics
    transientSharpness?: number;  // 0-100, attack sharpness
    transientSustain?: number;    // 0-100, sustain quality
    transientDecay?: number;      // 0-100, decay smoothness
    transientCount?: number;      // estimated number of transients

    // Distortion & clipping
    clippingProbability?: number; // 0-100, likelihood of clipping on playback
    harmonicDistortion?: number;  // dB, estimated distortion level
    intermodulationDistortion?: number; // dB, IMD level

    // Frequency masking
    maskingIndex?: number;        // 0-100, how much frequency masking
    maskingFrequencies?: number[]; // frequencies being masked

    // Platform predictions
    platformPredictions?: {
      spotify?: string;          // "Loud" | "Normal" | "Quiet"
      appleMusic?: string;
      youtube?: string;
      earbuds?: string;          // "Thin" | "Balanced" | "Boomy"
      headphones?: string;
      carSpeakers?: string;
    };
  };
}

export interface ProcessingConfig {
  inputTrimDb?: number;
  outputTrimDb?: number;
  mode?: ProcessingMode;
  targetGainDb?: number;
  eq?: EQSettings;
  compression?: Partial<CompressionPreset>;
  limiter?: LimiterConfig;
  gateExpander?: GateExpanderConfig;
  truePeakLimiter?: TruePeakLimiterConfig;
  clipper?: ClipperConfig;
  saturation?: SaturationConfig;
  stereoWidener?: StereoWidenerConfig;
  multibandCompression?: MultibandCompressionConfig;
  motionReverb?: ReverbConfig;
  delay?: DelayConfig;
  transientShaper?: TransientShaperConfig;
  stereoImager?: StereoImagerConfig;
  deEsser?: DeEsserConfig;
  dynamicEq?: DynamicEQConfig;
  colorFilter?: ColorFilterType;
  pitch?: PitchCorrectionConfig;
}

export type LiveProcessingConfig = Omit<ProcessingConfig, 'targetGainDb' | 'compression' | 'stereoWidener' | 'limiter'> & {
    compression?: Partial<CompressionPreset>;
    stereoWidener?: StereoWidenerConfig;
    limiter?: LimiterConfig;
};

export type PitchKey =
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type PitchScale = 'major' | 'minor' | 'chromatic';

export interface PitchCorrectionConfig {
  enabled: boolean;
  mode: 'chromatic' | 'scale';
  key?: PitchKey | null;
  scale?: PitchScale | null;
  retuneSpeed: number; // 0-100 (lower = faster)
  humanize: number; // 0-100
  strength: number; // 0-100
  formantPreserve: boolean;
}

export interface CompressionPreset {
  id?: string;
  name?: string;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeupGain?: number;
}

export interface LimiterConfig {
  threshold: number; 
  release: number;   
  ratio: number;
  attack?: number; 
}

export interface SaturationConfig {
  type: 'tape' | 'tube' | 'digital' | 'density' | 'console' | 'spiral' | 'channel' | 'totape' | 'purestdrive';
  amount: number;
  mix?: number;
  // Optional grit bed for silent passages (0-1 intensity).
  analogFloor?: number;
}

export interface GateExpanderConfig {
  enabled: boolean;
  threshold: number; // dB
  ratio: number; // >1 = downward expansion
  attack: number; // seconds
  release: number; // seconds
  range: number; // max attenuation in dB
}

export interface TruePeakLimiterConfig {
  enabled: boolean;
  ceiling: number; // dBFS
  oversampleFactor?: number;
}

export interface ClipperConfig {
  enabled: boolean;
  threshold: number; // dBFS
  softness: number; // 0-1
}

export interface StereoWidenerConfig {
  amount: number; 
  crossover: number; 
}

export interface MultibandCompressionConfig {
    low: Partial<CompressionPreset>;
    mid: Partial<CompressionPreset>; 
    high: Partial<CompressionPreset>;
    crossovers: [number, number]; 
}

export interface ReverbConfig {
  mix: number; 
  decay: number; 
  preDelay: number; 
  motion?: {
      bpm: number;
      depth: number; 
  };
  duckingAmount?: number;
}

export interface DelayConfig {
  time: number; 
  feedback: number; 
  mix: number; 
}

export interface TransientShaperConfig {
    attack: number; 
    sustain: number; 
    mix: number; 
}

export interface StereoImagerConfig {
    lowWidth: number; 
    midWidth: number; 
    highWidth: number; 
    crossovers: [number, number];
    vocalShield?: {
      enabled: boolean;
      lowHz?: number;
      highHz?: number;
      reduction?: number; // 0-1
    };
}

export interface DeEsserConfig {
    frequency: number; 
    threshold: number; 
    amount: number; 
}

export interface DynamicEQBand {
    id: string; 
    frequency: number;
    gain: number;
    q: number;
    threshold: number;
    attack: number; 
    release: number; 
    type: 'peaking' | 'lowshelf' | 'highshelf';
    mode: 'compress' | 'expand'; 
    enabled: boolean; 
}

export type DynamicEQConfig = DynamicEQBand[];

export type SSCConfidenceLevel = 'certain' | 'derived' | 'heuristic';
export type SSCActionability = 'none';

export interface SSCScanEntry {
  id: string;
  label: string;
  active: boolean;
  reason: string;
  confidenceLevel: SSCConfidenceLevel;
  value?: number | string | boolean | null;
  defaultValue?: number | string | boolean | null;
  bounds?: { min?: number; max?: number; step?: number };
}

export interface SSCUITab {
  id: string;
  label: string;
  active: boolean;
  confidenceLevel: SSCConfidenceLevel;
}

export interface SSCUIScan {
  activeMode: string;
  tabs: SSCUITab[];
}

export interface SSCScan {
  session: {
    id: string;
    timestamp: number;
    mode: 'read-only';
    actionability: SSCActionability;
  };
  processingOrder: string;
  sanitizedConfig: ProcessingConfig;
  processors: SSCScanEntry[];
  controls: SSCScanEntry[];
  noOp: boolean;
  noOpReasons: Array<{ id: string; reason: string; confidenceLevel: SSCConfidenceLevel }>;
  constraints: string[];
  affordances: string[];
  notes: Array<{ level: 'info' | 'warn'; message: string; confidenceLevel: SSCConfidenceLevel }>;
  ui?: SSCUIScan;
}

export type ColorFilterType = 'Dawn Glow' | 'Venice Blue' | 'Jellyfish Warmth' | 'Amber Tape' | 'Noir Filter' | 'Buffalo Snow' | 'None';
export type VeniceColorPreset = 'DawnGlow' | 'VeniceBlue' | 'JellyfishWarmth';

export type EQSettings = EQBand[];

export interface EQBand {
  frequency: number;
  gain: number;
  type: 'lowshelf' | 'peaking' | 'highshelf';
  q?: number;
}

export interface MixSignature {
    tonalBalance: { 
        low: number;    
        lowMid: number; 
        mid: number;    
        highMid: number;
        high: number;   
    };
    stereoWidth: {
        low: number;
        mid: number;
        high: number;
    };
    dynamics: {
        rms: number;
        peak: number;
        crestFactor: number;
    };
    character: {
        brightness: number;
        warmth: number;
    };
}

export interface MixIntent {
    eqAdjustment: EQSettings;
    dynamicProcessing: { 
        thresholdOffset: number; 
        ratio: number;
        makeupGain: number;
    };
    stereoWidthOffset: number; 
    reverbRequest: {
        mix: number;
        type: 'room' | 'hall' | 'plate';
    } | null;
    description: string;
}

export type ExportFormat = "WAV" | "MP3" | "FLAC";

export interface Stem {
  id: string;
  name: string;
  type: string;
  buffer: AudioBuffer;
  metrics: AudioMetrics;
  config: any;
}
export interface Suggestion { id: string; isSelected: boolean; parameters: any; description: string; category: string; }

export type MixReadiness = 'raw_demo' | 'in_progress' | 'pre_master' | 'finished_master';

export interface AnalysisResult {
    metrics: AudioMetrics;
    // NEW: Use unified ProcessingAction instead of Suggestion
    actions: ProcessingAction[];
    // DEPRECATED: Keep for backward compatibility during migration
    suggestions?: Suggestion[];
    genrePrediction?: string;
    frequencyData: any[];
    mixReadiness?: MixReadiness;
}
export interface ChatMessage { id: string; role: 'user' | 'model'; text: string; timestamp: number; }
export enum AppState { 
    IDLE = 'IDLE', 
    LOADING = 'LOADING', 
    ANALYZING = 'ANALYZING', 
    READY = 'READY', 
    PROCESSING = 'PROCESSING', 
    ERROR = 'ERROR' 
}

export interface ProcessingReport {
    originalMetrics: AudioMetrics;
    newMetrics: AudioMetrics;
    appliedProcessing: string[];
}

export interface GapAnalysis {
    referenceMetrics: AudioMetrics;
    explanation: string;
    eqCorrection?: {
        low: number;
        lowMid: number;
        mid: number;
        highMid: number;
        high: number;
    };
}

export interface MixAnalysis {
    conflicts: string[];
    stemSuggestions: Array<{
        stemId: string;
        suggestedVolumeDb: number;
        suggestedEq: EQSettings;
        reasoning: string;
        isSelected: boolean;
    }>;
    masterSuggestions: string[];
}

export interface RefinementSuggestion {
    summary: string;
    remainingIssues?: string;
    refinementEQ?: {
        low: number;
        lowMid: number;
        mid: number;
        highMid: number;
        high: number;
    };
}

export interface ProjectSession {
    version: string;
    savedAt: number;
    mode: 'SINGLE' | 'MULTI' | 'AI_STUDIO';
    fileName: string | null;
    originalBuffer64: string | null;
    processedBuffer64: string | null;
    analysisResult: AnalysisResult | null;
    appliedSuggestionIds: string[];
    stems: Stem[];
}

export interface VoiceModel {
    id: string;
    name: string;
    trainedAt: number;
    samples: string[];
    apiVoiceId: string;
    persona?: string; // 'smooth-rnb', 'aggressive-rapper', 'pop-diva', 'rock-vocalist', 'indie-crooner', 'country-storyteller', 'edm-vocalist'
}

export interface ExportRequest {
    buffer: AudioBuffer;
    fileName: string;
    format: ExportFormat;
    sampleRate: number;
}

export interface EncoderResult {
    success: boolean;
    blob?: Blob;
    errorMessage?: string;
}

export interface EchoMetrics {
    before: {
        tonalBalance: { low: number; lowMid: number; mid: number; highMid: number; high: number; };
        rms: number; 
        peak: number; 
        crestFactor: number; 
        stereoWidth: number; 
    };
    after: {
        tonalBalance: { low: number; lowMid: number; mid: number; highMid: number; high: number; };
        rms: number; 
        peak: number; 
        crestFactor: number; 
        stereoWidth: number; 
    };
    issues: string[];
}
export type EchoReportTool = "EQ" | "Dynamics" | "Stereo" | "Saturation" | "Reverb" | "Limiter" | "Multiband Dynamics" | "Transient Shaper" | "De-Esser" | "Dynamic EQ" | "Color Filter" | "Delay" | "Exciter" | "Compression" | "Imaging" | "Transient";

export interface EchoAction {
    id: string;
    label: string;
    description: string;
    type: EchoReportTool;
    refinementType: "bands" | "parameters";
    bands?: {
        freqHz: number;
        gainDb: number;
        q?: number;
        type?: 'peaking' | 'lowshelf' | 'highshelf';
        enabledByDefault: boolean;
    }[];
    params?: {
        name: string;
        value: number | string;
        unit?: string;
        min?: number;
        max?: number;
        step?: number;
        type?: 'number' | 'boolean' | 'enum' | 'string';
        enumOptions?: string[];
        enabledByDefault: boolean;
    }[];
}

/**
 * UNIFIED PROCESSING ACTION
 *
 * Single format that flows through entire pipeline:
 * Analysis → UI → Application → DSP Processing
 *
 * Replaces the lossy EchoAction → Suggestion → ProcessingConfig conversions
 */
export interface ProcessingAction {
    // Identity
    id: string;
    label: string;
    description: string;

    // Classification
    type: EchoReportTool;
    category: string; // 'EQ', 'Compression', 'Limiter', etc.

    // UI State
    isSelected: boolean;
    isApplied: boolean;
    isEnabled: boolean;

    // Diagnostic Info
    diagnostic?: {
        metric: string;           // 'LUFS', 'Peak', 'Dynamic Range', etc.
        currentValue: number;
        targetValue: number;
        severity: 'info' | 'warning' | 'critical';
    };

    // Processing Definition (for DSP)
    refinementType: "bands" | "parameters";

    // For EQ-type actions
    bands?: {
        freqHz: number;
        gainDb: number;
        q?: number;
        type?: 'peaking' | 'lowshelf' | 'highshelf';
        enabledByDefault: boolean;
    }[];

    // For compression/dynamics-type actions
    params?: {
        name: string;
        value: number | string;
        unit?: string;
        min?: number;
        max?: number;
        step?: number;
        type?: 'number' | 'boolean' | 'enum' | 'string';
        enumOptions?: string[];
        enabledByDefault: boolean;
    }[];

    // Metrics impact prediction
    impactPrediction?: {
        estimatedLufsChange: number;
        estimatedPeakChange: number;
        estimatedCrestFactorChange: number;
    };
}

export type EchoVerdict = 'release_ready' | 'refinements_available' | 'needs_work';

export interface EchoReport {
    summary: string;
    explanation: string[];
    recommended_actions: EchoAction[];
    confidence: number;
    verdict: EchoVerdict;
    verdictReason: string;
    // Shadow telemetry (advisory only, no DSP authority)
    // quantumScore: 0-100 score from QuantumKernel shadow pass
    // shadowDelta: delta in points, where Δ = quantumScore - classicalScore
    // quantumConfidence: normalized 0-1 confidence for displaying telemetry
    quantumScore?: number;
    shadowDelta?: number;
    quantumConfidence?: number;
    // IntentCore authoritative score (HII) according to confidence gate.
    humanIntentIndex?: number;
    intentCoreActive?: boolean;
    analysisId?: string;
    score?: {
        total: number;
        recordingQuality: number;
        stemQuality: number;
        genreAccuracy: number;
        vocalBeatRelationship: number;
        creativeExcellence: number;
    };
    improvements?: string[];
}

export interface RefinementModalState {
    action: EchoAction;
    isOpen: boolean;
}

export interface RevisionEntry {
  id: string;
  timestamp: number;
  summary: string;
  appliedActions: EchoAction[];
  processingConfig: ProcessingConfig;
  beforeMetrics: AudioMetrics;
  afterMetrics: AudioMetrics;
}

export type RevisionLog = RevisionEntry[];

export interface FeedbackPayload {
  type: "Bug" | "Mix Quality" | "UX / Design" | "Feature Request" | "Other";
  message: string;
  userEmail?: string;
  includeTechnicalDetails: boolean;
  currentTab?: "Single Track" | "Stems" | "AI Studio" | "SFS Video Engine";
  trackName?: string | null;
  echoSummarySnippet?: string;
  aiRecommendationsApplied?: boolean;
  rmsBefore?: number | null;
  rmsAfter?: number | null;
  peakBefore?: number | null;
  peakAfter?: number | null;
  timestampIso: string;
}

export type AsyncStatusSetter = (value: boolean) => void;
export type AsyncErrorSetter = (value: string | null) => void;

export interface EchoSessionSnapshot {
  trackId: string | null;
  trackName: string | null;
  createdAt: string; 
  updatedAt: string; 

  processingConfig: ProcessingConfig | null;
  lastEchoReport: EchoReport | null;
  lastAnalysisMetrics?: EchoMetrics | null;
  originalMetrics?: AudioMetrics | null; 
  originalBuffer64?: string | null; 
  processedBuffer64?: string | null; 

  isAbComparing: boolean;
  lastPlayheadSeconds: number;

  revisionCount?: number;
  notes?: string; 
  revisionLog?: RevisionLog; 
  appliedSuggestionIds?: string[]; 
  analysisResult?: AnalysisResult | null; 
}

export interface TestChecklistState {
  aiRecsRun: boolean;
  echoReportRun: boolean;
  echoActionApplied: boolean;
  commitAndExportDone: boolean;
  promptToMixRun: boolean; 
  aiStudioVisited: boolean; 
  lastUpdatedAt: string; 
}

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
}

export interface ProcessingPreset {
  id: string;
  name: string;
  description: string;
  genre?: string;
  createdAt: number;
  config: ProcessingConfig;
  thumbnail?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  action: 'upload' | 'process' | 'commit' | 'echo_action' | 'preset_apply' | 'manual_adjust';
  description: string;
  config: ProcessingConfig;
  metrics: AudioMetrics;
  bufferSnapshot?: string;
}

export interface ReferenceTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  metrics: AudioMetrics;
  signature: any;
}

export type MidSideMode = 'stereo' | 'mid' | 'side' | 'mid-side';

export interface BatchProcessingJob {
  id: string;
  files: File[];
  config: ProcessingConfig;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  results: Array<{
    filename: string;
    success: boolean;
    outputBlob?: Blob;
    error?: string;
  }>;
}

export interface CohesionTrackReport {
  id: string;
  trackName: string;
  lufs: number;
  tonalCentroid: [number, number, number];
  harmonicWeight: number;
  stereoWidth: number;
  transientDensity: number;
  humanIntentIndex?: number;
}

export interface AlbumCohesionProfile {
  id: string;
  name: string;
  targetLoudness: number;      // Average LUFS across selected tracks
  tonalCentroid: [number, number, number]; // Low, Mid, High
  harmonicWeight: number;      // Target saturation baseline
  stereoAnchor: number;        // Width anchor
  transientTarget: number;     // Punch anchor
  tracks: string[];            // Track IDs in this batch
}

export interface BatchState {
  isBatching: boolean;
  profile: AlbumCohesionProfile | null;
  progress: Record<string, 'queued' | 'analyzing' | 'applying' | 'done' | 'failed'>;
}

export interface GenerateEchoReportCardOptions {
  trackName: string;
  report?: EchoReport;
  // NEW: Import GenreProfile type from its definition file
  genreProfile?: GenreProfile | null;
  beforeMetrics?: AudioMetrics;
  afterMetrics?: AudioMetrics;
  // Fallback options
  lufs?: number;
  dynamicRange?: number;
  stereoWidth?: number;
  verdict?: string;
  genre?: string;
  improvementPercent?: number;
  processedConfig?: ProcessingConfig; // Add processed config to options
}

// Suno AI Integration Types
export interface SunoGenerationRequest {
  prompt: string;
  lyrics?: string;
  style: string; // 'hip-hop', 'r&b', 'pop', 'electronic', 'rock', 'indie', 'country'
  voiceModelId?: string;
  instrumental?: boolean;
  duration?: number;
  styleTags?: string; // Free-form style description
  weirdness?: number; // 0-100% experimental texture
  styleInfluence?: number; // 0-100% adherence to style description
  referenceAudioUrl?: string;
  voiceSampleUrl?: string;
  coverMode?: 'reference' | 'cover' | 'remix';
}

export interface SunoGenerationResponse {
  songId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  estimatedTime?: number;
  error?: string;
}

export interface GeneratedSong {
  id: string;
  name: string;
  buffer: AudioBuffer;
  stems: {
    vocals: AudioBuffer;
    instrumental: AudioBuffer;
  };
  metadata: {
    prompt: string;
    style: string;
    voiceModelId: string;
    generatedAt: number;
  };
}

export interface RateLimitState {
  date: string; // YYYY-MM-DD format
  count: number;
  limit: number;
}

export interface GenerationCache {
  hash: string;
  songId: string;
  createdAt: number;
  ttl: number; // Time-to-live in milliseconds
}

// ============================================================================
// PHASE 3: LLM REASONING TYPES
// ============================================================================

export interface LLMReasoningInput {
  // Listening Pass data (read-only, no modification)
  listeningPass: {
    version: string;
    analysis_confidence: number;
    tokens: any[]; // Array of Token objects
    priority_summary: {
      highest_stage_triggered: number;
      dominant_tokens: string[];
      recommended_focus: string | null;
      conflicts: string[];
    };
  };

  // Mode selection (Friendly Mode only in Phase 3)
  mode: 'friendly';

  // Optional context (reserved for Phase 4+)
  userContext?: {
    genre?: string;
    bpm?: number;
  };
}

export interface LLMGuidanceOutput {
  // Primary output: Human-readable guidance text
  guidance_text: string;

  // Metadata for logging/debugging
  processing: {
    tokens_read: number;
    confidence_level: number;
    mode: string;
    dominant_token: string | null;
  };
}
