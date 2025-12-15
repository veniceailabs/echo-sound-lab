import { GenreProfile } from './services/genreProfiles';

export type ProcessingMode = 'default' | 'vocal_presence';

export interface AudioMetrics {
  rms: number;
  peak: number;
  crestFactor: number;
  spectralCentroid: number;
  spectralRolloff: number;
  duration: number;
  spectralBalance?: {
    low: number;
    mid: number;
    high: number;
  };
  lufs?: {
    integrated: number;
    shortTerm: number;
    momentary: number;
    loudnessRange: number;
    truePeak: number;
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
}

export type LiveProcessingConfig = Omit<ProcessingConfig, 'targetGainDb' | 'compression' | 'stereoWidener' | 'limiter'> & {
    compression?: Partial<CompressionPreset>;
    stereoWidener?: StereoWidenerConfig;
    limiter?: LimiterConfig;
};

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
    suggestions: Suggestion[];
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

export type EchoVerdict = 'release_ready' | 'refinements_available' | 'needs_work';

export interface EchoReport {
    summary: string;
    explanation: string[];
    recommended_actions: EchoAction[];
    confidence: number;
    verdict: EchoVerdict;
    verdictReason: string;
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
  currentTab?: "Single Track" | "Multi-Stem" | "AI Studio";
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