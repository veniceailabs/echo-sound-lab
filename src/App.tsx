import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AudioMetrics, ProcessingConfig, Suggestion, EchoReport, RevisionEntry, ReferenceTrack, MixSignature, GeneratedSong, Stem, EQSettings, DynamicEQConfig, EngineMode, ProcessingAction, SSCScan, PreservationMode, CohesionTrackReport, BatchState, ProcessingPreset } from './types';
import { audioEngine } from './services/audioEngine';
import { audioPerceptionLayer } from './services/audioPerceptionLayer';
import { mixAnalysisService } from './services/mixAnalysis';
import { listeningPassService } from './services/listeningPassService';
import { reasonAboutListeningPass } from './services/geminiService';
import { calculateLoudnessRange } from './services/dsp/analysisUtils';
import { generateStressStem } from './services/debug/stressTestEngine';
import { CohesionEngine, deriveCohesionTrackReportFromMetrics } from './services/cohesionEngine';
import { batchMasterService } from './services/batchMasterService';
import { presetManager } from './services/presetManager';

// NEW: Refactored pipeline
import { AudioSessionProvider, useAudioSession } from './context/AudioSessionContext';
import { audioProcessingPipeline } from './services/audioProcessingPipeline';
import { qualityAssurance, QualityVerdictInfo } from './services/qualityAssurance';
import { FEATURE_FLAGS } from './config/featureFlags';
import { SAFE_TEST_CONFIG } from './services/testConfig';
import { actionsToConfig } from './services/processingActionUtils';
import { loadFullStudioSuite, FullStudioStatus } from './services/fullStudioSuite';
import Visualizer from './components/Visualizer';
import ChatInterface from './components/ChatInterface';
import { ProcessingPanel } from './components/ProcessingPanel';
import AnalysisPanel from './components/AnalysisPanel';
const MultiStemWorkspace = React.lazy(() => import('./components/MultiStemWorkspace'));
const AIStudio = React.lazy(() => import('./components/AIStudio'));
const VideoEngine = React.lazy(() => import('./components/VideoEngine'));
import { EchoReportPanel } from './components/EchoReportPanel';
import { ListeningPassCard } from './components/ListeningPassCard';
import { FeedbackButton } from './components/SharedComponents';
import { storageService } from './services/storageService';
import { runSafeAsync } from './utils/safeAsync';
import { saveEQSettings, saveDynamicEQSettings } from './utils/eqPersistence';
import SettingsPanel from './components/SettingsPanel';
import { i18nService } from './services/i18nService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useRecorder } from './hooks/useRecorder';
import AudioDeviceSelector from './components/AudioDeviceSelector';
import ProjectTimelineView from './components/ProjectTimelineView';
import CollaborationPanel from './components/CollaborationPanel';
import RenderQueuePanel, { RenderQueueJobView, RenderQueueFormat } from './components/RenderQueuePanel';
import OnboardingProfileSelector, { OnboardingProfile } from './components/OnboardingProfileSelector';

// NEW: Import enhanced features
import { EnhancedControlPanel } from './components/EnhancedControlPanel';
import { PhaseCorrelationMeter, StereoFieldMeter, LUFSMeter } from './components/AdvancedMeters';
import { historyManager } from './services/historyManager';
import { sessionManager, SessionState } from './services/sessionManager';
import { DiagnosticsOverlay, useDiagnosticsToggle } from './components/DiagnosticsOverlay';
import { SSCOverlay } from './components/SSCOverlay';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { FloatingControls } from './components/FloatingControls';
import { HistoryTimeline } from './components/HistoryTimeline';
import { HistoryEntry } from './types';
import { useViewport } from './context/ViewportContext';
import { debugTelemetryService } from './services/debugTelemetryService';
import { useAudioContextState } from './hooks/useAudioContextState';
import { AudioResumeGuard } from './components/AudioResumeGuard';
import { useBuildUpdateNotifier } from './hooks/useBuildUpdateNotifier';
import { encoderService } from './services/encoderService';

// V.E.N.U.M. - Viral Emergent Network Utility Matrix
import { generateEchoReportCard, ShareableCard, GenerateEchoReportCardOptions } from './services/venumEngine';
import { ShareableCardModal, NudgeBanner } from './components/ShareableCardModal';

// Notification System
import { NotificationManager, NotificationType } from './components/Notification';

// Capability System - Phase 2.2.4 React Integration
import { CapabilityProvider, useCapabilityCheck, useGuardedAction } from './hooks';
import { CapabilityACCModal } from './components/CapabilityACCModal';
import { CapabilityAuthority, type ProcessIdentity } from './services/CapabilityAuthority';
import { Capability } from './services/capabilities';
import { createCreativeMixingPreset } from './services/capabilityPresets';

// Phase 2: APL ProposalPanel UI
import { APLProposalPanel } from './components/APL/APLProposalPanel';
import { APLProposal } from './echo-sound-lab/apl/proposal-engine';
import { generateMockProposals } from './utils/mockAPLProposals';

// Phase 4: ExecutionService (Main Process Integration)
// ExecutionBridge is called directly from ProposalCard
// ExecutionService is a singleton on the main process
import { executionService } from './services/ExecutionService';
import { stemSeparationService } from './services/stemSeparationService';

// Day 3: APL Real Analysis (replaces mock proposals)
import { aplAnalysisService } from './services/APLAnalysisService';

// ===== GHOST SYSTEM (Self-Demonstrating Mode) =====
import { VirtualCursor, DemoDashboard } from './components/demo';
import { getDemoDirector } from './services/demo/DemoDirector';
import { HIP_HOP_MASTER_SCENARIO, POP_MASTER_SCENARIO, QUICK_TOUR_SCENARIO } from './services/demo/HipHopMasterScenario';

// ===== PHASE 5: ADVERSARIAL HARDENING =====
import { DailyProving } from './action-authority/compliance/DailyProving';
import { GhostUser } from './services/demo/GhostUser';
import { MerkleAuditLog } from './action-authority/audit/MerkleAuditLog';

// ===== PHASE 3: HYBRID BRIDGE =====
import { BridgeTest } from './components/BridgeTest';

declare var process: { env: Record<string, string | undefined> };
declare global {
  interface Window {
    runESLDiagnostic?: () => Promise<void>;
  }
}

const ENGINE_MODE_KEY = 'echo.engineMode.v1';
const FRIENDLY_TOUR_KEY = 'echo.friendlyTourSeen.v1';
const ONBOARDING_PROFILE_KEY = 'echo.onboardingProfile.v1';
const MODE_LABELS: Record<'SINGLE' | 'MULTI' | 'AI_STUDIO' | 'VIDEO', string> = {
  SINGLE: 'Single Track',
  MULTI: 'Stems',
  AI_STUDIO: 'AI Studio',
  VIDEO: 'SFS Video Engine',
};
const ENGINEER_TEMPLATE_PRESET_IDS = [
  'preset-engineer-rian-lewis',
  'preset-engineer-dr-dre',
  'preset-engineer-mixedbyali',
  'preset-engineer-40',
];
const ENGINEER_TEMPLATE_NOTES: Record<string, { signature: string; focus: string; chain: string }> = {
  'preset-engineer-rian-lewis': {
    signature: 'Vocal polish with clean low-mid management and smooth air.',
    focus: 'Best for melodic vocals, pop rap hooks, and clarity-first records.',
    chain: 'Subtractive EQ -> vocal-forward compression -> de-essing -> light tube glue.'
  },
  'preset-engineer-dr-dre': {
    signature: 'West Coast punch with grounded lows and controlled transients.',
    focus: 'Best for hard drums, deep 808s, and full-range rap production.',
    chain: 'Low-end contour EQ -> transient control -> tape harmonics -> ceiling-safe limiting.'
  },
  'preset-engineer-mixedbyali': {
    signature: 'Modern vocal front, controlled subs, competitive loudness without wash.',
    focus: 'Best for contemporary hip-hop, trap vocals, and streaming-first releases.',
    chain: 'Pocket EQ -> fast vocal compression -> subtle de-ess -> width polish -> limiter.'
  },
  'preset-engineer-40': {
    signature: 'Ambient depth, intimate vocal center, and clean low-end restraint.',
    focus: 'Best for moody rap, melodic late-night records, and spacious minimalist production.',
    chain: 'Low-end carve -> soft glue compression -> airy top lift -> controlled width -> safety ceiling.'
  }
};
type FriendlyJourneyStep = 'upload' | 'analyze' | 'mix' | 'master' | 'video';
type FriendlyWizardProgress = {
  analyzed: boolean;
  mixed: boolean;
  mastered: boolean;
  videoOpened: boolean;
};
type BlockedMixRecovery = {
  actions: ProcessingAction[];
  reason: string;
  source: 'preservation' | 'quality';
  createdAt: number;
};
type RestoreMode = 'SINGLE' | 'MULTI' | 'AI_STUDIO' | 'VIDEO';

// Initialize Capability Authority (Phase 2.2.4)
const processIdentity: ProcessIdentity = {
  appId: 'com.echo-sound-lab.app',
  pid: typeof window !== 'undefined' ? Math.random() * 1000000 : 0,
  launchTimestamp: Date.now()
};

const capabilityAuthority = new CapabilityAuthority(
  'session-' + Date.now(),
  () => Date.now(),
  processIdentity
);

// Grant initial capabilities (CREATIVE_MIXING preset: full mixing with exports requiring ACC)
const creativeMixingPreset = createCreativeMixingPreset('com.echo-sound-lab.app', 14400000); // 4 hours
creativeMixingPreset.grants.forEach(grant => capabilityAuthority.grant(grant));

const App: React.FC = () => {
  const defaultEqSettings: EQSettings = [
    { frequency: 60, gain: 0, type: 'lowshelf' },      // Sub bass
    { frequency: 250, gain: 0, type: 'peaking' },      // Low-mid
    { frequency: 1000, gain: 0, type: 'peaking' },     // Midrange
    { frequency: 4000, gain: 0, type: 'peaking' },     // Upper-mid
    { frequency: 8000, gain: 0, type: 'peaking' },     // Presence
    { frequency: 12000, gain: 0, type: 'highshelf' },  // Brilliance
  ];
  const defaultDynamicEq: DynamicEQConfig = [
    { id: 'dyn-eq-1', frequency: 200, gain: 0, q: 1, threshold: -20, attack: 0.01, release: 0.1, type: 'peaking', mode: 'compress', enabled: false },
    { id: 'dyn-eq-2', frequency: 800, gain: 0, q: 1, threshold: -20, attack: 0.01, release: 0.1, type: 'peaking', mode: 'compress', enabled: false },
    { id: 'dyn-eq-3', frequency: 4000, gain: 0, q: 1, threshold: -20, attack: 0.01, release: 0.1, type: 'peaking', mode: 'compress', enabled: false },
    { id: 'dyn-eq-4', frequency: 10000, gain: 0, q: 1, threshold: -20, attack: 0.01, release: 0.1, type: 'peaking', mode: 'compress', enabled: false }
  ];
  // Core state
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [activeMode, setActiveMode] = useState<'SINGLE' | 'MULTI' | 'AI_STUDIO' | 'VIDEO'>('SINGLE');
  const [workspaceNonce, setWorkspaceNonce] = useState<Record<'SINGLE' | 'MULTI' | 'AI_STUDIO' | 'VIDEO', number>>({
    SINGLE: 0,
    MULTI: 0,
    AI_STUDIO: 0,
    VIDEO: 0,
  });
  const { isPhone, isTablet } = useViewport();
  const [engineMode, setEngineMode] = useState<EngineMode>(() => {
    try {
      const stored = localStorage.getItem(ENGINE_MODE_KEY);
      if (stored === 'FRIENDLY' || stored === 'ADVANCED') {
        return stored;
      }
    } catch (e) {
      console.warn('[App] Failed to read engine mode from localStorage', e);
    }
    return 'FRIENDLY';
  }); // Stage Architecture: FRIENDLY or ADVANCED
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIntent, setPlayIntent] = useState(false);
  const [currentPlayheadSeconds, setCurrentPlayheadSeconds] = useState(0);
  const safeAreaVars = useMemo(
    () => ({
      '--esl-safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      '--esl-safe-top': 'env(safe-area-inset-top, 0px)',
    } as React.CSSProperties),
    []
  );
  const cornerUiOffsetPx = (isPhone || isTablet) && appState === AppState.READY && activeMode === 'SINGLE' ? 92 : 0;
  const audioContextState = useAudioContextState(typeof window !== 'undefined' ? audioEngine.getAudioContext() : null);

  // Audio analysis state
  const [originalMetrics, setOriginalMetrics] = useState<AudioMetrics | null>(null);
  const [processedMetrics, setProcessedMetrics] = useState<AudioMetrics | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');

  // Reference track state
  const [referenceTrack, setReferenceTrack] = useState<ReferenceTrack | null>(null);
  const [referenceSignature, setReferenceSignature] = useState<MixSignature | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);

  // AI Recommendations state
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<string[]>([]);
  const [applySuggestionsError, setApplySuggestionsError] = useState<string | null>(null);
  const [blockedMixRecovery, setBlockedMixRecovery] = useState<BlockedMixRecovery | null>(null);
  const [isFixingBlockedMix, setIsFixingBlockedMix] = useState(false);

  // Echo Report state
  const [echoReport, setEchoReport] = useState<EchoReport | null>(null);
  const [echoReportStatus, setEchoReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [shadowTelemetry, setShadowTelemetry] = useState<{
    analysisRunId: number;
    classicalScore?: number;
    quantumScore?: number;
    shadowDelta?: number;
    quantumConfidence?: number;
    humanIntentIndex?: number;
    intentCoreActive?: boolean;
  } | null>(null);
  const [preservationMode, setPreservationMode] = useState<PreservationMode>('balanced');
  const [addNextUploadToAlbum, setAddNextUploadToAlbum] = useState(false);
  const [cohesionTracks, setCohesionTracks] = useState<CohesionTrackReport[]>([]);
  const [batchState, setBatchState] = useState<BatchState>(() => batchMasterService.createInitialState(null));
  const [latestEngineVerdict, setLatestEngineVerdict] = useState<'accept' | 'warn' | 'block' | null>(null);
  const [latestEngineVerdictReason, setLatestEngineVerdictReason] = useState<string | null>(null);
  const [latestEngineVerdictRunId, setLatestEngineVerdictRunId] = useState<number | null>(null);
  const analysisRunIdRef = useRef(0);
  const activeVerdictRunIdRef = useRef(0);
  const debugTelemetry = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debugTelemetry') === '1';
  const showLabDebugPanels = (
    typeof window !== 'undefined'
      && (
        new URLSearchParams(window.location.search).get('debugPanels') === '1'
        || new URLSearchParams(window.location.search).get('demoFactory') === '1'
      )
  );
  const [echoActionStatus, setEchoActionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [echoActionError, setEchoActionError] = useState<string | null>(null);

  // Phase 3: LLM Reasoning state
  const [llmGuidance, setLLMGuidance] = useState<any>(null);

  // Phase 4: Listening Pass Card state
  const [listeningPassData, setListeningPassData] = useState<any>(null);

  // Processing state
  const [currentConfig, setCurrentConfig] = useState<ProcessingConfig>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const [isAbComparing, setIsAbComparing] = useState(false);
  const [revisionLog, setRevisionLog] = useState<RevisionEntry[]>([]);
  const [snapshotAId, setSnapshotAId] = useState<string | null>(null);
  const [snapshotBId, setSnapshotBId] = useState<string | null>(null);
  const [snapshotABActive, setSnapshotABActive] = useState(false);
  const [snapshotALabel, setSnapshotALabel] = useState<string | null>(null);
  const [snapshotBLabel, setSnapshotBLabel] = useState<string | null>(null);
  const [hasAppliedChanges, setHasAppliedChanges] = useState(false); // Track if any processing has been applied
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null); // Keep pristine original
  const hasUserInitiatedProcessingRef = useRef(false);
  const autoMixAbortRef = useRef(false);

  // UI state
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionState | null>(null);
  const [restoreTargetMode, setRestoreTargetMode] = useState<RestoreMode>('SINGLE');
  const [showExportSharePrompt, setShowExportSharePrompt] = useState(false);
  const [exportShareCard, setExportShareCard] = useState<ShareableCard | null>(null);
  const [showExportShareModal, setShowExportShareModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);
  const [showEchoChat, setShowEchoChat] = useState(false);
  const [, forceUpdate] = useState({});
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');
  const [networkSettings, setNetworkSettings] = useState({ ssid: 'Echo WiFi', proxy: '', isLocal: true });
  const [showFriendlyTour, setShowFriendlyTour] = useState(false);
  const [friendlyTourStep, setFriendlyTourStep] = useState(0);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile>(() => {
    try {
      const stored = localStorage.getItem(ONBOARDING_PROFILE_KEY);
      if (stored === 'first_song' || stored === 'artist_fast_path' || stored === 'engineer_advanced') {
        return stored;
      }
    } catch (e) {
      console.warn('[App] Failed to read onboarding profile', e);
    }
    return 'first_song';
  });
  const [friendlyWizardProgress, setFriendlyWizardProgress] = useState<FriendlyWizardProgress>({
    analyzed: false,
    mixed: false,
    mastered: false,
    videoOpened: false,
  });
  const [selectedEngineerTemplateId, setSelectedEngineerTemplateId] = useState<string>('preset-engineer-mixedbyali');
  const [engineerTemplateIntent, setEngineerTemplateIntent] = useState<number>(58);
  const [isApplyingEngineerTemplate, setIsApplyingEngineerTemplate] = useState(false);
  const [recordingInputDeviceId, setRecordingInputDeviceId] = useState<string>('');
  const [recordingChannelMode, setRecordingChannelMode] = useState<'mono' | 'stereo'>('mono');
  const {
    startRecording,
    stopRecording,
    resetRecording,
    recordingState,
    audioBlob: recordedAudioBlob,
    audioUrl: recordedAudioUrl,
    error: recorderError,
    inputLevel
  } = useRecorder();
  const [renderQueueJobs, setRenderQueueJobs] = useState<RenderQueueJobView[]>([]);
  const [isRenderQueueBusy, setIsRenderQueueBusy] = useState(false);

  // ===== GHOST SYSTEM STATE =====
  const [showDemoMode, setShowDemoMode] = useState(false);
  const demoDirector = getDemoDirector({
    verbose: true,
    pauseBetweenActions: 200,
    onProgress: (progress) => {
      // Progress updates handled by DemoDashboard
      console.log(`[Demo] ${progress.current}/${progress.total}: ${progress.action}`);
    },
    onError: (error) => {
      console.error('[Demo] Error:', error.message);
    },
    onComplete: () => {
      console.log('[Demo] Completed successfully');
    },
  });

  // Capability System - ACC Modal State (Phase 2.2.4)
  const [showAccModal, setShowAccModal] = useState(false);
  const [accToken, setAccToken] = useState<any>(null);
  const [accReason, setAccReason] = useState('');
  const [accIsLoading, setAccIsLoading] = useState(false);

  // AI Studio / Generated Song state
  const [generatedStems, setGeneratedStems] = useState<Stem[] | null>(null);
  const [stemSplitState, setStemSplitState] = useState<{
    active: boolean;
    progress: number;
    step: 'idle' | 'separating' | 'transcribing' | 'complete';
    mode: 'mock' | 'local-demucs';
    error: string | null;
    confidenceScore: number | null;
    confidenceBand: 'low' | 'medium' | 'high' | null;
    confidenceReason: string | null;
    manualFallbackRecommended: boolean;
  }>({
    active: false,
    progress: 0,
    step: 'idle',
    mode: 'mock',
    error: null,
    confidenceScore: null,
    confidenceBand: null,
    confidenceReason: null,
    manualFallbackRecommended: false
  });

  // Processing Overlay State
  const [showProcessingOverlay, setShowProcessingOverlay] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [isAutoMixing, setIsAutoMixing] = useState(false);
  const [autoMixError, setAutoMixError] = useState<string | null>(null);
  const [autoMixProgress, setAutoMixProgress] = useState<{
    iteration: number;
    maxIterations: number;
    stage: string;
    score?: number;
  } | null>(null);
  const [autoMixMode, setAutoMixMode] = useState<'STANDARD' | 'FULL_STUDIO' | null>(null);
  const [fullStudioStatus, setFullStudioStatus] = useState<FullStudioStatus>('idle');

  // Phase 2: APL ProposalPanel State
  const [aplProposals, setAplProposals] = useState<APLProposal[]>([]);
  const [isAplScanning, setIsAplScanning] = useState(false);

  // ===== PHASE 5: DAILY PROVING STATE =====
  const [systemHealthStatus, setSystemHealthStatus] = useState<'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'CHECKING'>('CHECKING');
  const [lastHealthCertificate, setLastHealthCertificate] = useState<any>(null);
  const [isInLockdown, setIsInLockdown] = useState(false);

  const AUTO_MIX_TARGET_SCORE = 90;
  const AUTO_MIX_MAX_ITERATIONS = 4;
  const appVersion = 'RC 1.0 (Adversarial Hardened)';
  useEffect(() => {
    debugTelemetryService.installGlobalErrorHandlers();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
    if (themeMode === 'light') {
      root.classList.remove('theme-dark');
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
      root.classList.add('theme-dark');
    }
  }, [themeMode]);

  const handleResetToOriginal = useCallback(() => {
    audioEngine.resetToOriginal();
    setHasAppliedChanges(false);
    setSnapshotABActive(false);
    setSnapshotAId(null);
    setSnapshotBId(null);
    setSnapshotALabel(null);
    setSnapshotBLabel(null);
  }, []);
  const pitchTag = currentConfig.pitch?.enabled ? (isAbComparing ? 'Pitch OFF' : 'Pitch ON') : null;
  const abPanelLabel = snapshotABActive
    ? `Listening to ${isAbComparing ? (snapshotALabel || 'Snapshot A') : (snapshotBLabel || 'Snapshot B')}`
    : (!hasAppliedChanges
      ? i18nService.t('ab.noChanges')
      : isAbComparing
        ? `${i18nService.t('ab.original')}${pitchTag ? ` · ${pitchTag}` : ''}`
        : `${i18nService.t('ab.processed')}${pitchTag ? ` · ${pitchTag}` : ''}`);
  const abFloatingLabel = snapshotABActive
    ? (isAbComparing ? 'Snapshot A' : 'Snapshot B')
    : pitchTag ? pitchTag : (isAbComparing ? 'Original' : 'Processed');
  const abDisabled = snapshotABActive ? false : !hasAppliedChanges;
  const friendlyTourSteps = [
    {
      title: 'Upload a Track',
      body: 'Drop a WAV/MP3/AIFF to start. Uploading never changes your audio.',
    },
    {
      title: 'Analyze',
      body: 'Analyze inspects your mix and suggests fixes. Nothing changes until you apply.',
    },
    {
      title: 'Auto Mix',
      body: 'Run a safe one-click pass. You can always A/B and undo.',
    },
    {
      title: 'A/B Listen',
      body: 'Toggle Original vs Processed to confirm the change is real.',
    },
    {
      title: 'Export',
      body: 'Export when it sounds right. You stay in control.',
    },
  ];
  const resetFriendlyWizardProgress = useCallback(() => {
    setFriendlyWizardProgress({
      analyzed: false,
      mixed: false,
      mastered: false,
      videoOpened: false,
    });
  }, []);
  const markFriendlyWizardStepDone = useCallback((step: keyof FriendlyWizardProgress) => {
    setFriendlyWizardProgress((prev) => (prev[step] ? prev : { ...prev, [step]: true }));
  }, []);
  const cloneProcessingAction = useCallback((action: ProcessingAction): ProcessingAction => ({
    ...action,
    bands: action.bands?.map((band) => ({ ...band })),
    params: action.params?.map((param) => ({ ...param })),
    diagnostic: action.diagnostic ? { ...action.diagnostic } : action.diagnostic,
    impactPrediction: action.impactPrediction ? { ...action.impactPrediction } : action.impactPrediction,
  }), []);
  const buildConservativeRecoveryActions = useCallback((actions: ProcessingAction[]): ProcessingAction[] => {
    const softened = actions.map((action) => {
      const next = cloneProcessingAction(action);
      next.isSelected = true;
      next.isEnabled = true;
      next.isApplied = false;

      if (next.refinementType === 'bands' && Array.isArray(next.bands)) {
        next.bands = next.bands.map((band) => ({
          ...band,
          gainDb: band.gainDb >= 0
            ? Number((band.gainDb * 0.6).toFixed(2))
            : Number((band.gainDb * 0.75).toFixed(2)),
          q: typeof band.q === 'number' ? Math.min(Math.max(band.q, 0.5), 1.2) : band.q,
        }));
      }

      if (next.refinementType === 'parameters' && Array.isArray(next.params)) {
        next.params = next.params.map((param) => {
          if (typeof param.value !== 'number') return param;
          const currentValue = param.value;
          if (param.name === 'ratio') {
            return { ...param, value: Number(Math.max(1.15, Math.min(2.4, currentValue * 0.78)).toFixed(2)) };
          }
          if (param.name === 'threshold') {
            if (next.type === 'Limiter') {
              return { ...param, value: Number(Math.max(currentValue, -1.2).toFixed(2)) };
            }
            const liftedThreshold = currentValue + 2;
            const boundedThreshold = Math.min(-8, Math.max(liftedThreshold, -14));
            return { ...param, value: Number(boundedThreshold.toFixed(2)) };
          }
          if (param.name === 'attack') {
            return { ...param, value: Number((currentValue * 1.2).toFixed(4)) };
          }
          if (param.name === 'release') {
            return { ...param, value: Number((currentValue * 1.15).toFixed(4)) };
          }
          if (param.name === 'amount') {
            return { ...param, value: Number((currentValue * 0.58).toFixed(3)) };
          }
          if (param.name === 'mix') {
            return { ...param, value: Number((currentValue * 0.72).toFixed(3)) };
          }
          if (param.name === 'analogFloor') {
            return { ...param, value: Number((currentValue * 0.65).toFixed(3)) };
          }
          if (param.name === 'width' || param.name === 'lowWidth' || param.name === 'midWidth' || param.name === 'highWidth') {
            return { ...param, value: Number((1 + (currentValue - 1) * 0.45).toFixed(3)) };
          }
          if (param.name === 'inputGain') {
            return { ...param, value: Number((currentValue - 0.8).toFixed(2)) };
          }
          return param;
        });
      }

      return next;
    });

    const hasLimiter = softened.some((action) => action.type === 'Limiter');
    if (!hasLimiter) {
      softened.push({
        id: `recovery-limiter-${Date.now()}`,
        label: 'Safety Limiter',
        description: 'Ceiling guard to protect transients and prevent clipping during recovery.',
        type: 'Limiter',
        category: 'Loudness',
        isSelected: true,
        isApplied: false,
        isEnabled: true,
        refinementType: 'parameters',
        params: [
          { name: 'threshold', value: -1.2, type: 'number', min: -6, max: -0.3, step: 0.1, enabledByDefault: true },
          { name: 'release', value: 0.12, type: 'number', min: 0.01, max: 0.4, step: 0.01, enabledByDefault: true },
          { name: 'inputGain', value: -0.4, type: 'number', min: -6, max: 6, step: 0.1, enabledByDefault: true },
        ],
      });
    }

    return softened;
  }, [cloneProcessingAction]);
  const hasRecoverableSessionState = useCallback((session: SessionState | null): session is SessionState => {
    if (!session) return false;
    return (
      !!session.fileName
      || session.activeMode !== 'SINGLE'
      || !!session.hasAppliedChanges
      || (session.appliedSuggestionIds?.length ?? 0) > 0
      || (session.generatedStemSummary?.count ?? 0) > 0
      || (session.cohesionTrackCount ?? 0) > 0
      || !!session.friendlyWizardProgress?.videoOpened
    );
  }, []);

  // Notification System State
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    message: string;
    type: NotificationType;
    duration?: number;
  }>>([]);

  // Helper to show notifications
  const showNotification = useCallback((message: string, type: NotificationType = 'info', duration?: number) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const beginVerdictRun = useCallback(() => {
    activeVerdictRunIdRef.current += 1;
    const runId = activeVerdictRunIdRef.current;
    setLatestEngineVerdictRunId(runId);
    setLatestEngineVerdict(null);
    setLatestEngineVerdictReason(null);
    return runId;
  }, []);

  const syncEngineVerdict = useCallback((verdict: 'accept' | 'warn' | 'block', reason?: string, runId?: number) => {
    const effectiveRunId = runId ?? activeVerdictRunIdRef.current;
    if (effectiveRunId !== activeVerdictRunIdRef.current) {
      return;
    }
    setLatestEngineVerdict(verdict);
    setLatestEngineVerdictReason(reason ?? null);
    setLatestEngineVerdictRunId(effectiveRunId);
    if (verdict === 'block') {
      setEchoReportStatus('error');
    }
  }, []);

  const runDiagnosticStressTest = useCallback(async () => {
    try {
      const verdictRunId = beginVerdictRun();
      console.log('🚀 [Diagnostic] Generating synthetic high-transiency stem...');

      const sampleRate = audioEngine.getSampleRate() || 44100;
      const syntheticBuffer = await generateStressStem(sampleRate);
      const sourceDR = calculateLoudnessRange(syntheticBuffer);
      console.log(`📊 [Diagnostic] Original DR: ${sourceDR.toFixed(2)}dB`);

      const baseMetrics = mixAnalysisService.analyzeStaticMetrics(syntheticBuffer);
      baseMetrics.lufs = {
        integrated: baseMetrics.rms + 3,
        shortTerm: baseMetrics.rms + 3,
        momentary: baseMetrics.rms + 3,
        loudnessRange: baseMetrics.crestFactor,
        truePeak: baseMetrics.peak,
      };

      const { generateProcessingActions, analyzeAudioBuffer } = await import('./services/masteringAnalyzer');
      const report = analyzeAudioBuffer(syntheticBuffer, baseMetrics);
      const actions = generateProcessingActions(baseMetrics).map((action) => ({
        ...action,
        isSelected: true,
      }));

      await audioProcessingPipeline.loadAudio(syntheticBuffer);
      const result = await audioProcessingPipeline.processAudio(actions, { preservationMode: 'competitive' });
      const finalDR = calculateLoudnessRange(result.processedBuffer);
      const drReduction = sourceDR - finalDR;

      console.log(`✅ [Diagnostic] Final DR: ${finalDR.toFixed(2)}dB`);
      console.log(`🛡️ [Diagnostic] DR Reduction: ${drReduction.toFixed(2)}dB`);
      console.log(`🧠 [Diagnostic] HII: ${Math.round(report.humanIntentIndex ?? report.score?.total ?? 0)} | Δ(Q-C): ${(report.shadowDelta ?? 0).toFixed(2)} | confidence: ${(report.quantumConfidence ?? 0).toFixed(3)}`);

      if (result.preservation.blocked) {
        const reason = result.preservation.reason || 'Diagnostic processing blocked by preservation guard.';
        console.warn(`🚫 [Diagnostic] ${reason}`);
        syncEngineVerdict('block', reason, verdictRunId);
      } else if (drReduction <= 2.05) {
        console.log('🌟 [Diagnostic] DOCTRINE VERIFIED: hard ceiling enforced.');
        syncEngineVerdict('accept', 'Diagnostic stress test passed.', verdictRunId);
      } else {
        const reason = `Doctrine breach risk: DR reduction ${drReduction.toFixed(2)}dB > 2.0dB cap`;
        console.error(`🚨 [Diagnostic] ${reason}`);
        syncEngineVerdict('block', reason, verdictRunId);
      }

      // Bind diagnostic result to UI state for immediate A/B inspection.
      setOriginalBuffer(syntheticBuffer);
      setOriginalMetrics(baseMetrics);
      setProcessedMetrics(result.metrics);
      setAnalysisResult({
        metrics: result.metrics,
        suggestions: buildSuggestionsFromActions(actions),
        actions,
        genrePrediction: 'Diagnostic Stress Stem',
        frequencyData: [],
        mixReadiness: 'in_progress',
      });
      setShadowTelemetry({
        analysisRunId: analysisRunIdRef.current,
        classicalScore: report.score?.total,
        quantumScore: report.quantumScore,
        shadowDelta: report.shadowDelta,
        quantumConfidence: report.quantumConfidence,
        humanIntentIndex: report.humanIntentIndex,
        intentCoreActive: report.intentCoreActive,
      });
      audioEngine.setProcessedBuffer(result.processedBuffer);
      audioEngine.enableProcessedSignal();
      setHasAppliedChanges(true);
      setCurrentFileName('Synthetic Stress Stem');
      setAppState(AppState.READY);
      showNotification('Diagnostic stress stem completed. Check console for doctrine logs.', 'info', 3500);
    } catch (error) {
      console.error('🚨 [Diagnostic] Stress test failed:', error);
      showNotification('Diagnostic stress test failed: ' + (error as Error).message, 'error', 4000);
    }
  }, [beginVerdictRun, showNotification, syncEngineVerdict]);

  useEffect(() => {
    window.runESLDiagnostic = runDiagnosticStressTest;
    return () => {
      delete window.runESLDiagnostic;
    };
  }, [runDiagnosticStressTest]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const {
    latestBuild,
    showPrompt: showBuildUpdatePrompt,
    delayUpdatePrompt,
    dismissPrompt: dismissBuildUpdatePrompt,
    updateNow: applyBuildUpdateNow,
  } = useBuildUpdateNotifier();

  const handleDelayBuildUpdate = useCallback(() => {
    delayUpdatePrompt(45);
    showNotification('Update reminder delayed for 45 minutes.', 'info', 2200);
  }, [delayUpdatePrompt, showNotification]);

  const handleApplyBuildUpdate = useCallback(() => {
    applyBuildUpdateNow();
  }, [applyBuildUpdateNow]);

  const dismissFriendlyTour = useCallback(() => {
    setShowFriendlyTour(false);
    try {
      localStorage.setItem(FRIENDLY_TOUR_KEY, 'true');
    } catch (e) {
      console.warn('[App] Failed to persist friendly tour state', e);
    }
  }, []);

  const handleSelectOnboardingProfile = useCallback((profile: OnboardingProfile) => {
    setOnboardingProfile(profile);
    try {
      localStorage.setItem(ONBOARDING_PROFILE_KEY, profile);
    } catch (e) {
      console.warn('[App] Failed to persist onboarding profile', e);
    }

    if (profile === 'engineer_advanced') {
      setEngineMode('ADVANCED');
      setShowFriendlyTour(false);
      showNotification('Engineer Advanced profile enabled.', 'success', 1800);
      return;
    }

    setEngineMode('FRIENDLY');
    if (profile === 'first_song' && appState === AppState.IDLE) {
      setShowFriendlyTour(true);
      setFriendlyTourStep(0);
    }
    showNotification(
      profile === 'artist_fast_path'
        ? 'Artist Fast Path enabled. Guided flow with fewer prompts.'
        : 'First Song profile enabled. Guided walkthrough active.',
      'success',
      2200
    );
  }, [appState, showNotification]);

  const enqueueRenderJob = useCallback((format: RenderQueueFormat) => {
    if (!originalBuffer) {
      showNotification('Load a track first to queue exports.', 'warning', 2600);
      return;
    }

    const job: RenderQueueJobView = {
      id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: currentFileName || 'Untitled Track',
      format,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      blob: null,
    };
    setRenderQueueJobs((prev) => [job, ...prev].slice(0, 8));
    showNotification(`${format} export queued in background.`, 'info', 1800);
  }, [currentFileName, originalBuffer, showNotification]);

  const downloadRenderJob = useCallback((jobId: string) => {
    const job = renderQueueJobs.find((entry) => entry.id === jobId);
    if (!job?.blob) return;
    const url = URL.createObjectURL(job.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name.replace(/[^a-zA-Z0-9-_]+/g, '_')}-${new Date(job.createdAt).getTime()}.${job.format.toLowerCase()}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [renderQueueJobs]);

  useEffect(() => {
    if (isRenderQueueBusy) return;
    const nextJob = renderQueueJobs.find((job) => job.status === 'queued');
    if (!nextJob) return;

    let cancelled = false;
    const run = async () => {
      try {
        setIsRenderQueueBusy(true);
        setRenderQueueJobs((prev) => prev.map((job) => job.id === nextJob.id
          ? { ...job, status: 'rendering', progress: 18 }
          : job));

        const renderedBuffer = await audioEngine.renderProcessedAudio(currentConfig);
        if (cancelled) return;

        setRenderQueueJobs((prev) => prev.map((job) => job.id === nextJob.id
          ? { ...job, status: 'encoding', progress: 70 }
          : job));

        const blob = nextJob.format === 'MP3'
          ? await encoderService.exportAsMp3(renderedBuffer, 320)
          : await encoderService.exportAsWav(renderedBuffer);
        if (cancelled) return;

        setRenderQueueJobs((prev) => prev.map((job) => job.id === nextJob.id
          ? { ...job, status: 'done', progress: 100, blob }
          : job));
        showNotification(`${nextJob.format} render ready for download.`, 'success', 2200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown render error';
        setRenderQueueJobs((prev) => prev.map((job) => job.id === nextJob.id
          ? { ...job, status: 'failed', progress: 100, error: message }
          : job));
        showNotification(`Render queue failed: ${message}`, 'error', 3200);
      } finally {
        if (!cancelled) {
          setIsRenderQueueBusy(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentConfig, isRenderQueueBusy, renderQueueJobs, showNotification]);

  // ===== PHASE 5: DAILY PROVING HEALTH CHECK (on app mount) =====
  useEffect(() => {
    const runHealthCheck = async () => {
      try {
        console.log('[App] Phase 5: Daily Proving health check DISABLED for demo generation...');

        // TEMPORARILY DISABLED for demo recording stability.
        return;

        // Initialize Merkle audit log and Ghost system
        const merkleAuditLog = new MerkleAuditLog('./audit-log.jsonl');
        const ghostUser = new GhostUser();

        // Initialize Daily Proving
        const dailyProving = new DailyProving(merkleAuditLog, ghostUser);

        // Run the daily compliance proof
        const certificate = await dailyProving.runDailyProof();

        // Update state with results
        setLastHealthCertificate(certificate);
        setSystemHealthStatus(certificate.systemStatus);

        if (certificate.systemStatus === 'CRITICAL') {
          setIsInLockdown(true);
          console.error('[App] Phase 5: SYSTEM ENTERED LOCKDOWN MODE');
          showNotification(
            '⚠️ CRITICAL: System integrity check failed. Features disabled.',
            'error',
            0 // Persistent notification
          );
        } else {
          setIsInLockdown(false);
          console.log('[App] Phase 5: System health verified. Status: ' + certificate.systemStatus);
          showNotification(
            '✅ Phase 5 Daily Proof: System integrity VERIFIED',
            'success',
            5000
          );
        }
      } catch (error) {
        console.error('[App] Phase 5 health check failed:', error);
        setSystemHealthStatus('DEGRADED');
        showNotification(
          '⚠️ Daily Proving health check encountered an error',
          'warning',
          5000
        );
      }
    };

    // Run health check on app mount
    runHealthCheck();
  }, [showNotification]);

  // ACC Modal Event Listener (Phase 2.2.4)
  useEffect(() => {
    const handleAccRequired = (event: Event) => {
      const customEvent = event as CustomEvent;
      const request = customEvent.detail;
      setAccToken(request.accToken);
      setAccReason(request.reason);
      setShowAccModal(true);
    };

    window.addEventListener('acc-required', handleAccRequired);
    return () => window.removeEventListener('acc-required', handleAccRequired);
  }, []);

  const handleFriendlyTourNext = useCallback(() => {
    setFriendlyTourStep((prev) => {
      if (prev >= friendlyTourSteps.length - 1) {
        dismissFriendlyTour();
        return prev;
      }
      return prev + 1;
    });
  }, [dismissFriendlyTour, friendlyTourSteps.length]);

  const handleFriendlyTourBack = useCallback(() => {
    setFriendlyTourStep((prev) => Math.max(0, prev - 1));
  }, []);

  // ACC Modal Handlers (Phase 2.2.4)
  const handleAccConfirm = useCallback(async (response: string) => {
    setAccIsLoading(true);
    try {
      // TODO: Validate ACC response and grant capability
      // This is where we'd call CapabilityAccBridge.validateACC()
      console.log('[App] ACC confirmed with response:', response);
      setShowAccModal(false);
      setAccToken(null);
      setAccReason('');
    } catch (err) {
      console.error('[App] ACC validation failed:', err);
      throw err;
    } finally {
      setAccIsLoading(false);
    }
  }, []);

  const handleAccDismiss = useCallback(() => {
    // User dismissed the modal. Action is halted.
    // No auto-resume. User must click button again if they want to retry.
    setShowAccModal(false);
    setAccToken(null);
    setAccReason('');
    setAccIsLoading(false);
  }, []);

  // EQ state (lifted from ProcessingPanel for use in EnhancedControlPanel)
  // DESIGN PRINCIPLE: All defaults bias toward inaudibility, not effect
  // - Channel EQ: All gains at 0dB (no processing by default)
  // - Parametric EQ: Disabled by default (completely inaudible)
  const [eqSettings, setEqSettings] = useState<EQSettings>(defaultEqSettings);
  const [dynamicEq, setDynamicEq] = useState<DynamicEQConfig>(defaultDynamicEq);

  // Diagnostics overlay (~ key toggle)
  const { isVisible: showDiagnostics, setIsVisible: setShowDiagnostics } = useDiagnosticsToggle();
  const [showSSC, setShowSSC] = useState(false);
  const [sscScan, setSscScan] = useState<SSCScan | null>(null);

  const buildSSCScan = useCallback(() => {
    const baseScan = audioEngine.getSSCScan();
    const tabs = [
      { id: 'SINGLE', label: MODE_LABELS.SINGLE, active: activeMode === 'SINGLE', confidenceLevel: 'certain' as const },
      { id: 'MULTI', label: MODE_LABELS.MULTI, active: activeMode === 'MULTI', confidenceLevel: 'certain' as const },
      { id: 'AI_STUDIO', label: MODE_LABELS.AI_STUDIO, active: activeMode === 'AI_STUDIO', confidenceLevel: 'certain' as const },
      { id: 'VIDEO', label: MODE_LABELS.VIDEO, active: activeMode === 'VIDEO', confidenceLevel: 'certain' as const },
    ];
    const activeLabel = tabs.find((tab) => tab.active)?.label || activeMode;
    const scan: SSCScan = {
      ...baseScan,
      ui: {
        activeMode: activeLabel,
        tabs,
      },
    };
    setSscScan(scan);
    return scan;
  }, [activeMode]);

  const handleOpenSSC = useCallback(() => {
    buildSSCScan();
    setShowSSC(true);
  }, [buildSSCScan]);

  const handleRefreshSSC = useCallback(() => {
    buildSSCScan();
  }, [buildSSCScan]);

  const handleCloseSSC = useCallback(() => {
    setShowSSC(false);
  }, []);

  useEffect(() => {
    if (!showSSC) return;
    buildSSCScan();
  }, [showSSC, activeMode, buildSSCScan]);

  useEffect(() => {
    audioEngine.setEngineMode(engineMode);
  }, [engineMode]);

  useEffect(() => {
    try {
      localStorage.setItem(ENGINE_MODE_KEY, engineMode);
    } catch (e) {
      console.warn('[App] Failed to persist engine mode', e);
    }
  }, [engineMode]);

  useEffect(() => {
    if (engineMode !== 'FRIENDLY' || activeMode !== 'SINGLE') {
      setShowFriendlyTour(false);
      return;
    }
    try {
      const seen = localStorage.getItem(FRIENDLY_TOUR_KEY) === 'true';
      if (!seen) {
        setFriendlyTourStep(0);
        setShowFriendlyTour(true);
      }
    } catch (e) {
      console.warn('[App] Failed to read friendly tour state', e);
    }
  }, [engineMode, activeMode]);

  useEffect(() => {
    setFriendlyWizardProgress((prev) => {
      const next: FriendlyWizardProgress = {
        analyzed: prev.analyzed || ((analysisResult?.actions?.length ?? 0) > 0),
        mixed: prev.mixed || hasAppliedChanges || appliedSuggestionIds.length > 0,
        mastered: prev.mastered || (latestEngineVerdict === 'accept' && (hasAppliedChanges || appliedSuggestionIds.length > 0)),
        videoOpened: prev.videoOpened || activeMode === 'VIDEO',
      };
      if (
        next.analyzed === prev.analyzed
        && next.mixed === prev.mixed
        && next.mastered === prev.mastered
        && next.videoOpened === prev.videoOpened
      ) {
        return prev;
      }
      return next;
    });
  }, [analysisResult, hasAppliedChanges, appliedSuggestionIds.length, latestEngineVerdict, activeMode]);

  // Session autosave - check for existing session on mount
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const savedSession = await sessionManager.init();
      if (!isMounted) return;
      if (hasRecoverableSessionState(savedSession)) {
        setPendingSession(savedSession);
        setShowRestoreDialog(true);
      }
    })();

    sessionManager.startAutosave();
    return () => {
      isMounted = false;
      sessionManager.stopAutosave();
    };
  }, [hasRecoverableSessionState]);

  useEffect(() => {
    if (!pendingSession || !showRestoreDialog) return;
    setRestoreTargetMode(pendingSession.activeMode);
  }, [pendingSession, showRestoreDialog]);

  // Language change listener - force re-render when language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      forceUpdate({});
    };
    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  // Keyboard shortcuts for media player controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appState !== AppState.READY) return;

      // Ignore if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          audioEngine.skipForward(10); // Shift+→ = +10s
        } else {
          audioEngine.skipForward(5); // → = +5s
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          audioEngine.skipBackward(10); // Shift+← = -10s
        } else {
          audioEngine.skipBackward(5); // ← = -5s
        }
      } else if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleTogglePlayback(); // Spacebar = play/pause
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, isPlaying]);

  // Update session on config/state changes
  useEffect(() => {
    sessionManager.updateSession({
      fileName: currentFileName || null,
      config: currentConfig,
      isAbComparing,
      playheadSeconds: currentPlayheadSeconds,
      appliedSuggestionIds,
      echoReportSummary: echoReport?.summary || null,
      activeMode,
      revisionLog,
      engineMode,
      preservationMode,
      hasAppliedChanges,
      latestEngineVerdict,
      latestEngineVerdictReason,
      selectedEngineerTemplateId,
      engineerTemplateIntent,
      friendlyWizardProgress,
      generatedStemSummary: generatedStems
        ? {
            count: generatedStems.length,
            names: generatedStems.map((stem) => stem.name).slice(0, 8),
            mode: stemSplitState.mode,
            confidenceScore: stemSplitState.confidenceScore,
            manualFallbackRecommended: stemSplitState.manualFallbackRecommended,
            updatedAt: Date.now(),
          }
        : null,
      cohesionTrackCount: cohesionTracks.length,
      addNextUploadToAlbum,
    });
  }, [
    currentConfig,
    isAbComparing,
    currentPlayheadSeconds,
    appliedSuggestionIds,
    echoReport,
    activeMode,
    appState,
    currentFileName,
    revisionLog,
    engineMode,
    preservationMode,
    hasAppliedChanges,
    latestEngineVerdict,
    latestEngineVerdictReason,
    selectedEngineerTemplateId,
    engineerTemplateIntent,
    friendlyWizardProgress,
    generatedStems,
    stemSplitState.mode,
    stemSplitState.confidenceScore,
    stemSplitState.manualFallbackRecommended,
    cohesionTracks.length,
    addNextUploadToAlbum,
  ]);

  // Helper to run steps with delay for visualization
  const runWithSteps = async (steps: string[], operation: () => Promise<void>) => {
    // 1. Pause Playback to prevent CPU contention/muffled audio
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      handleTogglePlayback(); 
    }

    setProcessingSteps(steps);
    setCurrentStepIndex(0);
    setShowProcessingOverlay(true);

    try {
      // Simulate step progression for UX
      for (let i = 0; i < steps.length - 1; i++) {
        setCurrentStepIndex(i);
        await new Promise(resolve => setTimeout(resolve, 600)); // Minimum visible time per step
      }
      
      // Perform actual operation (this might take time)
      await operation();
      
      // Final step
      setCurrentStepIndex(steps.length - 1);
      await new Promise(resolve => setTimeout(resolve, 800));

    } finally {
      setShowProcessingOverlay(false);
      // Resume playback if it was playing
      if (wasPlaying) {
        handleTogglePlayback();
      }
    }
  };

  const buildSuggestionsFromActions = useCallback((actions: ProcessingAction[]): Suggestion[] => {
    const getParamValue = (params: any[] | undefined, name: string, fallback?: number) => {
      if (!Array.isArray(params)) return fallback;
      const param = params.find(p => p?.name === name);
      return param?.value ?? fallback;
    };

    return actions.map(action => ({
      id: action.id,
      category: action.category || action.type,
      description: action.description,
      isSelected: !!action.isSelected,
      parameters: {
        eq: action.bands || [],
        compression: action.type === 'Compression'
          ? {
              threshold: getParamValue(action.params, 'threshold', -12),
              ratio: getParamValue(action.params, 'ratio', 2),
              attack: getParamValue(action.params, 'attack', 0.02),
              release: getParamValue(action.params, 'release', 0.15)
            }
          : undefined,
        limiter: action.type === 'Limiter'
          ? {
              threshold: getParamValue(action.params, 'threshold', -1),
              release: getParamValue(action.params, 'release', 0.1)
            }
          : undefined,
        inputTrimDb: getParamValue(action.params, 'inputGain', undefined)
      }
    }));
  }, []);

  const buildLegendaryWeightAction = useCallback((
    metrics: AudioMetrics,
    mode: PreservationMode
  ): ProcessingAction => {
    const transientSharpness = metrics.advancedMetrics?.transientSharpness ?? 60;
    const spectral = metrics.spectralBalance;
    const lowEnergy = (spectral?.low ?? 0) + (spectral?.lowMid ?? 0);
    const lowBias = Math.max(0, Math.min(1, (lowEnergy - 0.25) / 0.25));

    const baseAmount = mode === 'preserve' ? 0.055 : mode === 'balanced' ? 0.075 : 0.095;
    const transientGuard = transientSharpness > 70 ? 0.9 : 1.0;
    const amount = Math.max(0.03, Math.min(0.14, (baseAmount + lowBias * 0.02) * transientGuard));

    const baseMix = mode === 'preserve' ? 0.22 : mode === 'balanced' ? 0.27 : 0.32;
    const mix = Math.max(0.16, Math.min(0.38, baseMix + lowBias * 0.03));
    const analogFloor = mode === 'preserve' ? 0.06 : mode === 'balanced' ? 0.09 : 0.12;

    return {
      id: `legendary-weight-${Date.now()}`,
      label: 'Legendary Weight',
      description: 'Adds subtle even-order harmonics for low-end weight and mid warmth while preserving punch.',
      type: 'Saturation',
      category: 'Warmth',
      isSelected: true,
      isApplied: false,
      isEnabled: true,
      refinementType: 'parameters',
      params: [
        { name: 'type', value: 'tube', type: 'enum', enumOptions: ['tube'], enabledByDefault: true },
        { name: 'amount', value: Number(amount.toFixed(3)), min: 0, max: 0.2, step: 0.005, type: 'number', enabledByDefault: true },
        { name: 'mix', value: Number(mix.toFixed(3)), min: 0, max: 1, step: 0.01, type: 'number', enabledByDefault: true },
        { name: 'analogFloor', value: Number(analogFloor.toFixed(3)), min: 0, max: 0.2, step: 0.005, type: 'number', enabledByDefault: true },
      ],
      diagnostic: {
        metric: 'Legendary Weight',
        currentValue: transientSharpness,
        targetValue: 65,
        severity: 'info',
      },
    };
  }, []);

  const withLegendaryWeight = useCallback((
    actions: ProcessingAction[],
    metrics: AudioMetrics,
    mode: PreservationMode
  ): ProcessingAction[] => {
    const filtered = actions.filter((action) => action.type !== 'Saturation');
    return [...filtered, buildLegendaryWeightAction(metrics, mode)];
  }, [buildLegendaryWeightAction]);

  // Handle restore session
  const handleRestoreSession = () => {
    if (pendingSession) {
      const targetMode = restoreTargetMode || pendingSession.activeMode;
      setCurrentConfig(pendingSession.config);
      setIsAbComparing(pendingSession.isAbComparing);
      setCurrentPlayheadSeconds(pendingSession.playheadSeconds);
      setAppliedSuggestionIds(pendingSession.appliedSuggestionIds);
      setActiveMode(targetMode);
      setRevisionLog(pendingSession.revisionLog || []);
      if (pendingSession.engineMode === 'FRIENDLY' || pendingSession.engineMode === 'ADVANCED') {
        setEngineMode(pendingSession.engineMode);
      }
      if (pendingSession.preservationMode) {
        setPreservationMode(pendingSession.preservationMode);
      }
      if (pendingSession.selectedEngineerTemplateId) {
        setSelectedEngineerTemplateId(pendingSession.selectedEngineerTemplateId);
      }
      if (typeof pendingSession.engineerTemplateIntent === 'number' && Number.isFinite(pendingSession.engineerTemplateIntent)) {
        setEngineerTemplateIntent(Math.max(0, Math.min(100, pendingSession.engineerTemplateIntent)));
      }
      const recoveredWizardProgress = pendingSession.friendlyWizardProgress ?? {
        analyzed: pendingSession.appliedSuggestionIds.length > 0 || !!pendingSession.echoReportSummary,
        mixed: pendingSession.appliedSuggestionIds.length > 0,
        mastered: pendingSession.appliedSuggestionIds.length > 0,
        videoOpened: pendingSession.activeMode === 'VIDEO',
      };
      setFriendlyWizardProgress(recoveredWizardProgress);
      if (typeof pendingSession.hasAppliedChanges === 'boolean') {
        setHasAppliedChanges(pendingSession.hasAppliedChanges);
      }
      if (pendingSession.latestEngineVerdict) {
        setLatestEngineVerdict(pendingSession.latestEngineVerdict);
      }
      setLatestEngineVerdictReason(pendingSession.latestEngineVerdictReason ?? null);
      setBlockedMixRecovery(null);
      setIsFixingBlockedMix(false);
      // For MULTI mode, set app state to READY so MultiStemWorkspace displays
      // For SINGLE mode, keep IDLE so user sees upload screen
      if (targetMode !== 'SINGLE') {
        setAppState(AppState.READY);
      }
      // Note: We can't restore the actual audio file, user needs to re-upload
      if (!pendingSession.fileName) {
        showNotification('Workspace state restored. Re-upload audio to continue processing.', 'info', 3400);
      } else {
        showNotification('Session settings restored. Re-upload the track to resume audio processing.', 'info', 3400);
      }
      setShowRestoreDialog(false);
      setPendingSession(null);
      setRestoreTargetMode('SINGLE');
    }
  };

  // Handle dismiss restore
  const handleDismissRestore = async () => {
    await sessionManager.clearSession();
    setShowRestoreDialog(false);
    setPendingSession(null);
    setRestoreTargetMode('SINGLE');
  };

  const startAplSession = () => {
    if (!FEATURE_FLAGS.APL_ENABLED) return;
    const analyser = audioEngine.getAnalyserNode?.();
    const durationSec = audioEngine.getDuration();
    if (!analyser || !durationSec) return;
    audioPerceptionLayer.start({
      analyser,
      sampleRate: audioEngine.getSampleRate(),
      sourceId: currentFileName || 'unknown',
      sourceType: 'file',
      durationSec,
    }, {
      devLogging: FEATURE_FLAGS.APL_LOG_ENABLED,
    });
  };

  const pauseAplSession = () => {
    if (!FEATURE_FLAGS.APL_ENABLED) return;
    audioPerceptionLayer.pause();
  };

  const stopAplSession = () => {
    if (!FEATURE_FLAGS.APL_ENABLED) return;
    audioPerceptionLayer.stop();
  };

  // Phase 3: APL Executor Handlers
  /**
   * Get execution context for gated routing
   * Context includes session info needed for AA Work Order binding
   */
  // Disabled: APLExecutor temporarily disabled
  // const getExecutionContext = (): ExecutionContext => {
  //   return {
  //     id: `session_${currentFileName || 'unknown'}`,
  //     hash: `hash_${Date.now()}`, // In production, this would be the source hash
  //     trackId: currentFileName || 'unknown',
  //     fileName: currentFileName,
  //     appState
  //   };
  // };

  /**
   * Path A: Direct Execution (High Speed)
   * Called from ExecutionService via event bridge
   */
  const handleAplApplyDirect = useCallback(async (proposalId: string) => {
    const proposal = aplProposals.find(p => p.proposalId === proposalId);
    if (!proposal) return;

    console.log('[APL] Direct execution handler invoked:', proposalId);
    showNotification(`Executing ${proposal.action.type}...`, 'info');

    try {
      const result = await executionService.executeDirectly(proposal);
      if (result.success) {
        setAplProposals(prev => prev.filter(p => p.proposalId !== proposalId));
        showNotification(`Executed in ${result.executionTime}ms`, 'success', 3000);
      } else {
        showNotification(`Execution failed: ${result.error}`, 'error', 3000);
      }
    } catch (error) {
      showNotification(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error', 3000);
    }
  }, [aplProposals, showNotification]);

  /**
   * Path B: Gated Execution (High Security)
   * Called from ExecutionService after FSM EXECUTED
   */
  const handleAplAuthorizeGated = useCallback(async (proposalId: string) => {
    const proposal = aplProposals.find(p => p.proposalId === proposalId);
    if (!proposal) return;

    console.log('[APL] Gated execution handler invoked:', proposalId);
    showNotification('Executing gated proposal...', 'info');

    try {
      const result = await executionService.executeGated(proposal);
      if (result.success) {
        setAplProposals(prev => prev.filter(p => p.proposalId !== proposalId));
        showNotification(`Gated execution completed in ${result.executionTime}ms`, 'success', 3000);
      } else {
        showNotification(`Gated execution failed: ${result.error}`, 'error', 3000);
      }
    } catch (error) {
      showNotification(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error', 3000);
    }
  }, [aplProposals, showNotification]);

  // NOTE: APL proposals are now loaded in handleFileUpload using real spectral analysis
  // Mock proposal fallback is still used if analysis fails

  const updateAlbumCohesion = useCallback((tracks: CohesionTrackReport[]) => {
    if (tracks.length < 2) {
      setBatchState(prev => ({
        ...prev,
        profile: null,
        isBatching: false,
      }));
      return;
    }

    try {
      const profile = CohesionEngine.generateProfile(tracks, { name: 'Current Album DNA' });
      setBatchState(prev => ({
        ...prev,
        profile,
      }));
    } catch (error) {
      console.warn('[Cohesion] Failed to generate profile:', error);
    }
  }, []);

  const registerTrackForAlbum = useCallback((nextTrack: CohesionTrackReport) => {
    setCohesionTracks(prev => {
      const withoutDuplicate = prev.filter(track => track.trackName !== nextTrack.trackName);
      const next = [...withoutDuplicate, nextTrack];
      updateAlbumCohesion(next);
      return next;
    });
  }, [updateAlbumCohesion]);

  const handleHarmonizeAlbum = useCallback(() => {
    if (!batchState.profile || cohesionTracks.length < 2) {
      showNotification('Add at least 2 tracks to build an Album DNA profile.', 'info', 2500);
      return;
    }

    const plan = batchMasterService.buildHarmonizePlan(cohesionTracks, batchState.profile, preservationMode);
    setBatchState(prev => ({
      ...prev,
      isBatching: false,
      progress: plan.directives.reduce<Record<string, 'queued' | 'analyzing' | 'applying' | 'done' | 'failed'>>((acc, directive) => {
        acc[directive.trackId] = 'queued';
        return acc;
      }, {}),
    }));
    showNotification(`Harmonize plan ready for ${plan.directives.length} track(s).`, 'success', 2800);
    console.log('[Cohesion] Harmonize plan generated:', plan);
  }, [batchState.profile, cohesionTracks, preservationMode, showNotification]);

  const processSelectedFile = async (file: File): Promise<AudioBuffer | null> => {
    let loadedBuffer: AudioBuffer | null = null;
    if (snapshotABActive) {
      handleClearSnapshotAB();
    }
    stopAplSession();

    // Clear previous proposals before analyzing new file
    setAplProposals([]);

    // Check file size upfront - CRITICAL for Google AI Studio
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File selected: ${file.name}, Size: ${fileSizeMB.toFixed(2)}MB`);

    // Warn for very large files
    if (fileSizeMB > 50) {
      alert(`File is quite large (${fileSizeMB.toFixed(1)}MB). Processing may take some time.`);
    }

    setAppState(AppState.LOADING);
    setCurrentFileName(file.name);
    resetFriendlyWizardProgress();

    // Show loading immediately
    const loadPromise = runSafeAsync(async () => {
      console.log('[1] Starting audio load...');
      const startTime = Date.now();

      // NEW: Decode audio for Listening Pass analysis (Phase 2)
      let listeningPassResult: any = null;
      if (FEATURE_FLAGS.LISTENING_PASS_ENABLED) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const audioContext = new AudioContext();
          const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // Call Listening Pass Service
          listeningPassResult = await listeningPassService.analyzeAudio({
            audioBuffer: decodedBuffer,
            sampleRate: decodedBuffer.sampleRate,
            duration: decodedBuffer.duration,
            metadata: {
              genre: undefined,
              bpm: undefined,
            },
            mode: 'friendly',
          });

          // Store in state for UI rendering (Phase 4)
          setListeningPassData(listeningPassResult.listening_pass);

          // Dev-only logging (guarded by flag)
          if (FEATURE_FLAGS.LISTENING_PASS_LOG_ENABLED) {
            console.log('[Listening Pass Result]', listeningPassResult);
            const timingMs = Date.now() - startTime;
            console.log(`[Listening Pass Timing] ${timingMs}ms`);
          }
        } catch (error) {
          console.error('[Listening Pass Error]', error);
          // Fail gracefully: continue without analysis
          setListeningPassData(null);
        }
      }

      // NEW: Local Reasoning (Phase 3) - No AI needed
      if (FEATURE_FLAGS.LISTENING_PASS_ENABLED && listeningPassResult && FEATURE_FLAGS.LLM_REASONING_ENABLED) {
        try {
          // Use simple rule-based guidance instead of AI
          const llmResult = {
            guidance_text: listeningPassResult.listening_pass.priority_summary?.dominant_tokens?.length > 0
              ? `Detected ${listeningPassResult.listening_pass.priority_summary.dominant_tokens.length} area(s) for improvement`
              : 'No listener concerns detected. Your mix is in great shape.',
            processing: {}
          };

          // Store guidance
          setLLMGuidance(llmResult);

          // Dev logging
          if (FEATURE_FLAGS.LISTENING_PASS_LOG_ENABLED) {
            console.log('[LLM Guidance]', llmResult);
          }
        } catch (error) {
          console.error('[LLM Reasoning Error]', error);
          // Fail gracefully: continue without LLM guidance
          if (FEATURE_FLAGS.LLM_FALLBACK_ON_ERROR) {
            // Use Listening Pass data only
            setLLMGuidance(null);
          } else {
            // Show error
            console.warn('[LLM] Reasoning failed and fallback disabled');
          }
        }
      }

      // Load audio file - this is the slow part for large files
      const buffer = await audioEngine.loadFile(file);
      loadedBuffer = buffer;
      console.log(`[2] Audio loaded in ${Date.now() - startTime}ms`);

      // Quick metrics calculation (very fast)
      const metricsStart = Date.now();
      const metrics = mixAnalysisService.analyzeStaticMetrics(buffer);
      console.log(`[3] Metrics calculated in ${Date.now() - metricsStart}ms`);

      // Quick LUFS estimation (RMS now in dB, add offset for LUFS)
      const estimatedLUFS = metrics.rms + 3;
      metrics.lufs = {
        integrated: estimatedLUFS,
        shortTerm: estimatedLUFS,
        momentary: estimatedLUFS,
        loudnessRange: metrics.crestFactor,
        truePeak: metrics.peak // Already in dBFS from analyzeStaticMetrics
      };

      setOriginalMetrics(metrics);
      setProcessedMetrics(null); // Don't set processed until actual processing happens
      setOriginalBuffer(buffer); // Store pristine original for A/B and reprocessing
      setHasAppliedChanges(false); // Reset on new file
      setShadowTelemetry(null);
      setLatestEngineVerdict(null);
      setLatestEngineVerdictReason(null);
      setApplySuggestionsError(null);
      setBlockedMixRecovery(null);
      setIsFixingBlockedMix(false);
      setCurrentConfig({});
      hasUserInitiatedProcessingRef.current = false;
      setEqSettings(defaultEqSettings);
      setDynamicEq(defaultDynamicEq);

      if (addNextUploadToAlbum) {
        const trackReport = deriveCohesionTrackReportFromMetrics(
          `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file.name.replace(/\.[^/.]+$/, ''),
          metrics,
          shadowTelemetry?.humanIntentIndex
        );
        registerTrackForAlbum(trackReport);
      }

      // Reset analysis state on new file upload
      setListeningPassData(null);
      setLLMGuidance(null);

      // NEW: Add to history
      historyManager.addEntry('upload', `Loaded ${file.name}`, {}, metrics);

      // Show UI with placeholder - user can manually request AI analysis
      setAnalysisResult({
        metrics,
        suggestions: [],
        genrePrediction: 'Ready for Analysis',
        frequencyData: [],
        mixReadiness: 'in_progress'
      });

      // DAY 3: Run real APL analysis (spectral analysis → proposals)
      const aplStart = Date.now();
      try {
        console.log('[APL] Starting spectral analysis...');
        const aplResult = await aplAnalysisService.analyzeFile({
          file,
          trackId: `track_${Date.now()}`,
          trackName: file.name.replace(/\.[^/.]+$/, ''),
          sessionId: `session_${Date.now()}`
        });

        if (aplResult.success && aplResult.proposals.length > 0) {
          console.log(`[APL] Analysis complete in ${Date.now() - aplStart}ms. Generated ${aplResult.proposals.length} proposal(s).`);
          setAplProposals(aplResult.proposals);
          console.log('[APL] Proposals:', aplResult.proposals);
        } else {
          console.log(`[APL] No proposals generated (or analysis failed). Using mock proposals for demonstration.`);
          const mockProposals = generateMockProposals();
          setAplProposals(mockProposals);
        }
      } catch (aplError) {
        console.error('[APL] Analysis failed, falling back to mock proposals:', aplError);
        const mockProposals = generateMockProposals();
        setAplProposals(mockProposals);
      }

      setAppState(AppState.READY);

      // DON'T auto-load AI recommendations - let user request them manually
      // This prevents timeout in Google AI Studio environment
      setAddNextUploadToAlbum(false);
    });
    await loadPromise;
    return loadedBuffer;
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
    // Allow selecting the same file twice in a row.
    e.target.value = '';
  };

  const handleUseRecordedTake = async () => {
    if (!recordedAudioBlob) {
      showNotification('Record audio first, then load it into Single Track.', 'info', 2600);
      return;
    }
    const mime = recordedAudioBlob.type || 'audio/webm';
    const extension = mime.includes('wav')
      ? 'wav'
      : mime.includes('mp4') || mime.includes('aac')
        ? 'm4a'
        : 'webm';
    const file = new File([recordedAudioBlob], `Echo-Recording-${Date.now()}.${extension}`, { type: mime });
    await processSelectedFile(file);
    resetRecording();
    showNotification('Recording loaded. You can now analyze and master it.', 'success', 2800);
  };

  const splitBufferToStems = async (
    buffer: AudioBuffer,
    trackNameOverride?: string
  ): Promise<boolean> => {
    if (isPlaying || playIntent) {
      requestStopPlayback();
    }

    const mode: 'mock' | 'local-demucs' = 'mock';
    setStemSplitState({
      active: true,
      progress: 0,
      step: 'separating',
      mode,
      error: null,
      confidenceScore: null,
      confidenceBand: null,
      confidenceReason: null,
      manualFallbackRecommended: false
    });

    try {
      stemSeparationService.initialize(mode);

      const { stems } = await stemSeparationService.processAudioFile(buffer, (state) => {
        setStemSplitState((prev) => ({
          ...prev,
          active: state.isProcessing,
          progress: state.progress,
          step: state.step,
          error: state.error,
        }));
      });

      const splitIdBase = Date.now();
      const trackLabel = trackNameOverride || (currentFileName ? currentFileName.replace(/\.[^/.]+$/, '') : '') || 'Track';
      const separatedStems: Stem[] = [
        {
          id: `split-vocals-${splitIdBase}`,
          name: `${trackLabel} • Vocals`,
          type: 'vocals',
          buffer: stems.vocals,
          metrics: audioEngine.analyzeStaticMetrics(stems.vocals),
          config: { volumeDb: 0, isMuted: false, eq: [], isSoaped: false }
        },
        {
          id: `split-drums-${splitIdBase}`,
          name: `${trackLabel} • Drums`,
          type: 'drums',
          buffer: stems.drums,
          metrics: audioEngine.analyzeStaticMetrics(stems.drums),
          config: { volumeDb: 0, isMuted: false, eq: [] }
        },
        {
          id: `split-bass-${splitIdBase}`,
          name: `${trackLabel} • Bass`,
          type: 'bass',
          buffer: stems.bass,
          metrics: audioEngine.analyzeStaticMetrics(stems.bass),
          config: { volumeDb: 0, isMuted: false, eq: [] }
        },
        {
          id: `split-other-${splitIdBase}`,
          name: `${trackLabel} • Music`,
          type: 'other',
          buffer: stems.other,
          metrics: audioEngine.analyzeStaticMetrics(stems.other),
          config: { volumeDb: 0, isMuted: false, eq: [] }
        }
      ];

      setGeneratedStems(separatedStems);
      setStemSplitState({
        active: false,
        progress: 100,
        step: 'complete',
        mode: stems.metadata.mode === 'local-demucs' ? 'local-demucs' : 'mock',
        error: null,
        confidenceScore: stems.metadata.confidenceScore ?? null,
        confidenceBand: stems.metadata.confidenceBand ?? null,
        confidenceReason: stems.metadata.confidenceReason ?? null,
        manualFallbackRecommended: !!stems.metadata.manualFallbackRecommended
      });
      const confidenceLabel = Number.isFinite(stems.metadata.confidenceScore)
        ? `${Math.round(stems.metadata.confidenceScore)}%`
        : '--';
      showNotification(
        `Stem split ready: ${separatedStems.length} stems created (${confidenceLabel} confidence).`,
        'success',
        2800
      );
      setActiveMode('MULTI');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[App] Stem split failed:', error);
      setStemSplitState({
        active: false,
        progress: 0,
        step: 'idle',
        mode,
        error: message,
        confidenceScore: null,
        confidenceBand: null,
        confidenceReason: null,
        manualFallbackRecommended: true
      });
      showNotification(`Stem split failed: ${message}`, 'error', 3500);
      return false;
    } finally {
      stemSeparationService.dispose();
    }
  };

  const handleUseRecordedTakeToStems = async () => {
    if (!recordedAudioBlob) {
      showNotification('Record audio first, then split it into stems.', 'info', 2600);
      return;
    }
    const mime = recordedAudioBlob.type || 'audio/webm';
    const extension = mime.includes('wav')
      ? 'wav'
      : mime.includes('mp4') || mime.includes('aac')
        ? 'm4a'
        : 'webm';
    const file = new File([recordedAudioBlob], `Echo-Recording-${Date.now()}.${extension}`, { type: mime });
    const loadedBuffer = await processSelectedFile(file);
    if (!loadedBuffer) {
      showNotification('Could not load recording for stem split.', 'error', 3200);
      return;
    }

    const splitOk = await splitBufferToStems(loadedBuffer, file.name.replace(/\.[^/.]+$/, ''));
    if (splitOk) {
      resetRecording();
      showNotification('Recording loaded into Multi-Stem with full stem controls ready.', 'success', 3000);
    }
  };

  // Request AI Analysis manually
  const handleRequestAIAnalysis = async (
    options: { autoSelectAll?: boolean } = {}
  ): Promise<ProcessingAction[]> => {
    if (!analysisResult || !originalMetrics || !currentFileName) return [];

    const analysisRunId = ++analysisRunIdRef.current;
    setShadowTelemetry(null);
    setLatestEngineVerdict(null);
    setLatestEngineVerdictReason(null);

    setAnalysisResult((prev: any) => ({
      ...prev,
      genrePrediction: 'Analyzing...',
      suggestions: []
    }));

    try {
      // NEW: Use advanced analyzer with buffer for professional diagnostics
      const { generateProcessingActions, analyzeAudioBuffer } = await import('./services/masteringAnalyzer')
        .then(m => ({
          generateProcessingActions: m.generateProcessingActions,
          analyzeAudioBuffer: m.analyzeAudioBuffer
        }));

      // NEW: Run advanced analysis (populates advancedMetrics from buffer)
      if (originalBuffer) {
        try {
          const advancedReport = analyzeAudioBuffer(originalBuffer, originalMetrics);
          if (analysisRunId !== analysisRunIdRef.current) {
            return [];
          }
          console.log('[ANALYSIS] Advanced report generated:', {
            actionCount: advancedReport.recommended_actions.length,
            issues: advancedReport.explanation,
            score: advancedReport.score?.total
          });
          setShadowTelemetry({
            analysisRunId,
            classicalScore: advancedReport.score?.total,
            quantumScore: advancedReport.quantumScore,
            shadowDelta: advancedReport.shadowDelta,
            quantumConfidence: advancedReport.quantumConfidence,
            humanIntentIndex: advancedReport.humanIntentIndex,
            intentCoreActive: advancedReport.intentCoreActive
          });
        } catch (advError) {
          console.warn('[ANALYSIS] Advanced analysis had partial failure, continuing:', advError);
        }
      }

      // Generate actions from enriched metrics
      const generatedActions = generateProcessingActions(originalMetrics);
      const actions = options.autoSelectAll
        ? generatedActions.map(action => ({ ...action, isSelected: true }))
        : generatedActions;

      // Genre info from analysis
      const genre = 'Professional';

      // NEW: Convert actions to suggestions for backward compatibility with UI
      const suggestions = buildSuggestionsFromActions(actions);

      setAnalysisResult((prev: any) => ({
        ...prev,
        suggestions,
        actions, // NEW: Store actions for pipeline use
        genrePrediction: genre
      }));
      markFriendlyWizardStepDone('analyzed');
      return actions;
    } catch (error) {
      console.error('AI recommendations failed:', error);
      setAnalysisResult((prev: any) => ({
        ...prev,
        genrePrediction: 'Analysis Failed',
        suggestions: [],
        actions: []
      }));
      return [];
    }
  };

  // Handle reference track upload
  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingReference(true);

    try {
      // Decode the reference audio file
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);

      // Analyze reference track metrics
      const metrics = mixAnalysisService.analyzeStaticMetrics(buffer);

      // Extract mix signature for comparison
      const signature = await mixAnalysisService.extractMixSignature(buffer);

      // Create reference track object
      const refTrack: ReferenceTrack = {
        id: `ref-${Date.now()}`,
        name: file.name,
        buffer,
        metrics,
        signature
      };

      setReferenceTrack(refTrack);
      setReferenceSignature(signature);

      console.log('[Reference] Loaded reference track:', file.name);
      console.log('[Reference] Metrics:', metrics);
      console.log('[Reference] Signature:', signature);

      // Add to history
      historyManager.addEntry('upload', `Loaded reference: ${file.name}`, {}, metrics);
    } catch (error) {
      console.error('Failed to load reference track:', error);
      alert('Failed to load reference track. Please try a different audio file.');
    } finally {
      setIsLoadingReference(false);
    }
  };

  // Clear reference track
  const handleClearReference = () => {
    setReferenceTrack(null);
    setReferenceSignature(null);
  };

  // Toggle AI recommendation selection
  const handleToggleSuggestion = (id: string) => {
    if (blockedMixRecovery) {
      setBlockedMixRecovery(null);
      setIsFixingBlockedMix(false);
    }
    setAnalysisResult((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        // NEW: Toggle in both suggestions (UI) and actions (pipeline)
        suggestions: prev.suggestions.map((s: Suggestion) =>
          s.id === id ? { ...s, isSelected: !s.isSelected } : s
        ),
        actions: (prev.actions || []).map((a: ProcessingAction) =>
          a.id === id ? { ...a, isSelected: !a.isSelected } : a
        )
      };
    });
  };

  // Remove a single applied suggestion and re-render
  const handleRemoveAppliedSuggestion = async (suggestionId: string): Promise<void> => {
    if (!analysisResult || !originalMetrics || !originalBuffer) return;
    const verdictRunId = beginVerdictRun();

    await runWithSteps([
      'Removing Processor',
      'Reconfiguring DSP Chain',
      'Rendering Updated Audio',
      'Analyzing Output'
    ], async () => {
      try {
        // Remove from applied list
        const newAppliedIds = appliedSuggestionIds.filter(id => id !== suggestionId);

        // If no suggestions left, revert to original
        if (newAppliedIds.length === 0) {
          audioEngine.setBuffer(originalBuffer);
          audioEngine.resetToOriginal();
          setAppliedSuggestionIds([]);
          setProcessedMetrics(null); // No processed audio when no processing applied
          setCurrentConfig({});
          showNotification('Reverted to original audio', 'info', 2000);
          return;
        }

        // NEW: Get remaining actions and reprocess from original
        const remainingActions = (analysisResult.actions || []).filter((a: ProcessingAction) =>
          newAppliedIds.includes(a.id) && a.isEnabled
        );

        console.log('[REMOVE SUGGESTION] Reprocessing from original with', remainingActions.length, 'remaining actions');

        // NEW: Load original buffer and reprocess
        await audioProcessingPipeline.loadAudio(originalBuffer);
        const result = await audioProcessingPipeline.reprocessAudio(remainingActions, { preservationMode });
        const newMetrics = result.metrics;

        if (result.preservation.blocked) {
          const humanMsg = 'Hold on a second... We adjusted the volume slightly to keep your drums punchy.';
          syncEngineVerdict('block', humanMsg, verdictRunId);
          setApplySuggestionsError(humanMsg);
          showNotification(humanMsg, 'warning', 5000);
          return;
        }

        // Update audio engine
        audioEngine.setProcessedBuffer(result.processedBuffer);
        audioEngine.enableProcessedSignal();
        setCurrentConfig({});

        setProcessedMetrics(newMetrics);
        setAppliedSuggestionIds(newAppliedIds);
        setBlockedMixRecovery(null);
        setIsFixingBlockedMix(false);

        // Regenerate Echo Report with updated audio
        handleGenerateEchoReport(newMetrics);

        syncEngineVerdict('accept', undefined, verdictRunId);
        showNotification(`Removed processor. Re-rendered audio.`, 'success', 2000);

      } catch (error) {
        console.error('Failed to remove suggestion:', error);
        showNotification('Failed to remove suggestion: ' + (error as Error).message, 'error', 3000);
      }
    });
  };

  // Apply selected AI recommendations
  const handleApplySuggestions = async (
    selectedActionsOverride?: ProcessingAction[],
    options: { preservationModeOverride?: PreservationMode; recoveryPassLabel?: string } = {}
  ): Promise<boolean> => {
    if (!originalMetrics) return false;
    const effectivePreservationMode = options.preservationModeOverride ?? preservationMode;

    // NEW: Get selected actions from the actions array (prioritize, fallback to suggestions)
    const selectedActions = Array.isArray(selectedActionsOverride)
      ? selectedActionsOverride
      : (Array.isArray(analysisResult?.actions)
        ? analysisResult.actions.filter((a: ProcessingAction) => a?.isSelected)
        : []);

    if (selectedActions.length === 0) {
      setApplySuggestionsError('Please select at least one suggestion');
      return false;
    }

    setApplySuggestionsError(null);
    const verdictRunId = beginVerdictRun();

    let applySucceeded = false;
    let qualityBlocked = false;
    let qualityWarned = false;

    await runWithSteps([
      'Suspending Audio Engine',
      'Configuring DSP Chain',
      'Applying EQ & Dynamics',
      'Rendering High-Quality Audio',
      'Analyzing Output'
    ], async () => {
      try {
        console.log('[APPLY SUGGESTIONS] Using new pipeline with', selectedActions.length, 'actions');

        // NEW: Load original buffer to prevent cascading degradation
        if (originalBuffer) {
          await audioProcessingPipeline.loadAudio(originalBuffer);
        }

        // NEW: Process audio using the clean pipeline
        const result = await audioProcessingPipeline.processAudio(selectedActions, { preservationMode: effectivePreservationMode });
        const newMetrics = result.metrics;

        console.log('[APPLY SUGGESTIONS] Processing complete. Metrics:', newMetrics);

        if (result.preservation.blocked) {
          const warningMsg = 'Hold on a second... Punch Protection stepped in so the mix does not get squashed.';
          setApplySuggestionsError(`${warningMsg} Try Fix Blocked Mix for a safer pass.`);
          showNotification(warningMsg, 'warning', 5000);
          setBlockedMixRecovery({
            actions: selectedActions.map(cloneProcessingAction),
            reason: warningMsg,
            source: 'preservation',
            createdAt: Date.now(),
          });
          syncEngineVerdict('block', warningMsg, verdictRunId);
          qualityBlocked = true;
          return;
        }

        // NEW: Check quality using Perceptual Diff
        if (originalMetrics) {
          const qualityVerdict = qualityAssurance.assessProcessingQuality(originalMetrics, newMetrics);

          console.log('\n' + '='.repeat(80));
          console.log('QUALITY ASSURANCE VERDICT');
          console.log('='.repeat(80));
          console.log(qualityAssurance.generateQualityReport(qualityVerdict));
          console.log('='.repeat(80) + '\n');

          if (qualityVerdict.shouldBlock) {
            const topIssues = qualityVerdict.issues.slice(0, 2).join(', ');
            const warningMsg = topIssues
              ? `Processing paused: ${topIssues}.`
              : 'Hold on a second... We noticed a small issue (like clipping), so we paused that move.';
            setApplySuggestionsError(`${warningMsg} Try Fix Blocked Mix for a safer pass.`);
            showNotification(warningMsg, 'warning', 5000);
            console.warn('[QUALITY] Processing blocked - quality verdict:', qualityVerdict);
            setBlockedMixRecovery({
              actions: selectedActions.map(cloneProcessingAction),
              reason: warningMsg,
              source: 'quality',
              createdAt: Date.now(),
            });
            syncEngineVerdict('block', warningMsg, verdictRunId);
            qualityBlocked = true;
            return;
          }

          if (qualityVerdict.uiVerdict === 'warn') {
            const warningMsg = 'We adjusted the volume slightly to keep your drums punchy.';
            syncEngineVerdict('warn', warningMsg, verdictRunId);
            showNotification(`Applied with warning: ${warningMsg}`, 'warning', 3500);
            qualityWarned = true;
          } else {
            syncEngineVerdict('accept', undefined, verdictRunId);
          }
        }

        // Update audio engine and state
        audioEngine.setProcessedBuffer(result.processedBuffer);
        audioEngine.applyProcessingConfig({}); // Config already applied via pipeline
        audioEngine.enableProcessedSignal();

        setProcessedMetrics(newMetrics);
        setHasAppliedChanges(true);
        setBlockedMixRecovery(null);
        setIsFixingBlockedMix(false);
        markFriendlyWizardStepDone('mixed');

        // Track applied suggestions
        const newAppliedIds = selectedActions.map((a: ProcessingAction) => a.id);
        setAppliedSuggestionIds([...appliedSuggestionIds, ...newAppliedIds]);

        // Add to history
        historyManager.addEntry('preset_apply', 'Applied AI recommendations', {}, newMetrics, true);

        // Automatically trigger Echo Report generation after applying suggestions
        handleGenerateEchoReport(newMetrics);

        // Show success notification
        if (!qualityWarned) {
          showNotification(
            options.recoveryPassLabel || `${selectedActions.length} fix${selectedActions.length > 1 ? 'es' : ''} applied successfully`,
            'success',
            2000
          );
        }
        applySucceeded = true;

      } catch (error) {
        console.error('Failed to apply suggestions:', error);
        const errorMsg = 'Failed to apply suggestions: ' + (error as Error).message;
        setApplySuggestionsError(errorMsg);
        setBlockedMixRecovery(null);
        syncEngineVerdict('block', errorMsg, verdictRunId);
        showNotification(errorMsg, 'error', 3000);
      }
    });

    if (qualityBlocked) {
      return false;
    }
    return applySucceeded;
  };

  const handleFixBlockedMix = useCallback(async () => {
    if (!blockedMixRecovery || isFixingBlockedMix) {
      return;
    }
    if (!originalMetrics) {
      showNotification('Upload or reload your track first so recovery can run.', 'warning', 3200);
      return;
    }

    setIsFixingBlockedMix(true);
    try {
      const saferActions = buildConservativeRecoveryActions(blockedMixRecovery.actions);
      const success = await handleApplySuggestions(saferActions, {
        preservationModeOverride: 'preserve',
        recoveryPassLabel: 'Recovery pass applied with punch-safe settings.',
      });

      if (!success) {
        showNotification('Recovery pass stayed blocked. Deselect one loudness-heavy fix and retry.', 'warning', 3600);
      }
    } finally {
      setIsFixingBlockedMix(false);
    }
  }, [
    blockedMixRecovery,
    buildConservativeRecoveryActions,
    handleApplySuggestions,
    isFixingBlockedMix,
    originalMetrics,
    showNotification,
  ]);

  const handleCancelAutoMix = () => {
    autoMixAbortRef.current = true;
    setAutoMixProgress(prev => prev ? { ...prev, stage: 'Stopping' } : prev);
  };

  const handleImproveMyMix = async (): Promise<void> => {
    if (!originalBuffer || !originalMetrics) return;

    let selectedActions: ProcessingAction[] = [];
    const existingActions = Array.isArray(analysisResult?.actions)
      ? analysisResult.actions
      : [];

    if (existingActions.length === 0 || analysisResult?.genrePrediction === 'Ready for Analysis') {
      selectedActions = await handleRequestAIAnalysis({ autoSelectAll: true });
    } else {
      selectedActions = existingActions
        .filter((action: ProcessingAction) => action?.isEnabled !== false && !appliedSuggestionIds.includes(action.id))
        .map((action: ProcessingAction) => ({ ...action, isSelected: true }));

      setAnalysisResult((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          suggestions: (prev.suggestions || []).map((s: Suggestion) =>
            selectedActions.some(action => action.id === s.id) ? { ...s, isSelected: true } : s
          ),
          actions: (prev.actions || []).map((a: ProcessingAction) =>
            selectedActions.some(action => action.id === a.id) ? { ...a, isSelected: true } : a
          ),
        };
      });
    }

    if (selectedActions.length === 0) {
      showNotification('No major issues found. Your mix already sounds strong.', 'info', 2500);
      return;
    }

    const weightedActions = withLegendaryWeight(selectedActions, originalMetrics, preservationMode);

    setAnalysisResult((prev: any) => {
      if (!prev) return prev;
      const weightAction = weightedActions.find((action) => action.type === 'Saturation');
      if (!weightAction) return prev;
      const existingActions = (prev.actions || []).filter((action: ProcessingAction) => action.type !== 'Saturation');
      const nextActions = [...existingActions, weightAction];
      return {
        ...prev,
        actions: nextActions,
        suggestions: buildSuggestionsFromActions(nextActions),
      };
    });

    showNotification('Legendary Weight engaged: adding analog warmth without sacrificing punch.', 'info', 2400);
    await handleApplySuggestions(weightedActions);
  };

  const runAutoMix = async (mode: 'STANDARD' | 'FULL_STUDIO') => {
    if (!originalBuffer || !originalMetrics || isAutoMixing) return;

    setIsAutoMixing(true);
    const verdictRunId = beginVerdictRun();
    setAutoMixMode(mode);
    setAutoMixError(null);
    autoMixAbortRef.current = false;
    hasUserInitiatedProcessingRef.current = true;

    if (mode === 'FULL_STUDIO') {
      setFullStudioStatus('loading');
      const suiteResult = await loadFullStudioSuite();
      setFullStudioStatus(suiteResult.status);

      if (suiteResult.status === 'error') {
        showNotification(suiteResult.errors.join(' ') || 'Full Studio failed to load.', 'error', 3000);
        setIsAutoMixing(false);
        setAutoMixMode(null);
        return;
      }
      setHasAppliedChanges(true);
    }

    try {
      const { analyzeAudioBuffer, analyzeMastering, generateProcessingActions } = await import('./services/masteringAnalyzer');

      let iteration = 0;
      let workingMetrics: AudioMetrics = { ...originalMetrics };
      let workingBuffer: AudioBuffer = originalBuffer;
      const accumulatedActions: ProcessingAction[] = [];
      const actionSignatures = new Set<string>();

      const getActionSignature = (action: ProcessingAction): string => {
        if (action.refinementType === 'bands' && Array.isArray(action.bands)) {
          const bandsSig = action.bands
            .map(b => `${Math.round(b.freqHz)}:${b.gainDb}:${b.q ?? ''}`)
            .join('|');
          return `bands:${action.type}:${bandsSig}`;
        }
        if (action.refinementType === 'parameters' && Array.isArray(action.params)) {
          const paramsSig = action.params.map(p => `${p.name}:${p.value}`).join('|');
          return `params:${action.type}:${paramsSig}`;
        }
        return `misc:${action.type}:${action.label ?? action.description ?? ''}`;
      };

      while (iteration < AUTO_MIX_MAX_ITERATIONS && !autoMixAbortRef.current) {
        iteration += 1;
        setAutoMixProgress({
          iteration,
          maxIterations: AUTO_MIX_MAX_ITERATIONS,
          stage: 'Analyzing'
        });

        let report;
        try {
          report = analyzeAudioBuffer(workingBuffer, workingMetrics);
        } catch (error) {
          console.warn('[AutoMix] Advanced analysis failed, falling back to basic metrics', error);
          report = analyzeMastering(workingMetrics);
        }

        const score = report.score?.total ?? 0;
        setAutoMixProgress({
          iteration,
          maxIterations: AUTO_MIX_MAX_ITERATIONS,
          stage: 'Scoring',
          score
        });

        if (score >= AUTO_MIX_TARGET_SCORE) {
          setEchoReport(report);
          setEchoReportStatus('success');
          break;
        }

        const actions = generateProcessingActions(workingMetrics);
        const newActions = actions.filter(action => {
          const signature = getActionSignature(action);
          if (actionSignatures.has(signature)) return false;
          actionSignatures.add(signature);
          return true;
        });

        if (newActions.length === 0) {
          break;
        }

        newActions.forEach(action => {
          action.isSelected = true;
          action.isApplied = true;
        });
        accumulatedActions.push(...newActions);

        setAutoMixProgress({
          iteration,
          maxIterations: AUTO_MIX_MAX_ITERATIONS,
          stage: 'Applying fixes',
          score
        });

        await audioProcessingPipeline.loadAudio(originalBuffer);
        const result = await audioProcessingPipeline.processAudio(accumulatedActions, { preservationMode });
        if (result.preservation.blocked) {
          const warningMsg = 'Punch Protection stepped in during Smart Polish to keep the groove alive.';
          showNotification(warningMsg, 'warning', 5000);
          syncEngineVerdict('block', warningMsg, verdictRunId);
          accumulatedActions.splice(-newActions.length);
          break;
        }
        const qualityVerdict = qualityAssurance.assessProcessingQuality(workingMetrics, result.metrics);
        if (qualityVerdict.shouldBlock) {
          const warningMsg = 'Hold on a second... We skipped one move to keep your mix solid in mono.';
          showNotification(warningMsg, 'warning', 5000);
          console.warn('[AutoMix] Processing blocked - quality verdict:', qualityVerdict);
          syncEngineVerdict('block', warningMsg, verdictRunId);
          accumulatedActions.splice(-newActions.length);
          break;
        }
        if (qualityVerdict.uiVerdict === 'warn') {
          syncEngineVerdict('warn', 'We skipped the widening to keep your mix sounding solid in mono.', verdictRunId);
        } else {
          syncEngineVerdict('accept', undefined, verdictRunId);
        }

        workingBuffer = result.processedBuffer;
        workingMetrics = result.metrics;

        setProcessedMetrics(result.metrics);
        setHasAppliedChanges(true);

        if (mode === 'STANDARD') {
          audioEngine.setProcessedBuffer(result.processedBuffer);
          audioEngine.enableProcessedSignal();
        }

        setAppliedSuggestionIds(accumulatedActions.map(action => action.id));
        setAnalysisResult(prev => ({
          ...(prev || {
            metrics: result.metrics,
            suggestions: [],
            actions: [],
            frequencyData: [],
            mixReadiness: 'in_progress'
          }),
          metrics: result.metrics,
          actions: accumulatedActions,
          suggestions: buildSuggestionsFromActions(accumulatedActions),
          genrePrediction: `${mode === 'FULL_STUDIO' ? 'Full Studio' : 'Auto Mix'} Pass ${iteration}`
        }));
      }

      const finalConfig = actionsToConfig(accumulatedActions);
      setCurrentConfig(finalConfig);

      if (mode === 'FULL_STUDIO') {
        audioEngine.setProcessedBuffer(null);
        audioEngine.setBuffer(originalBuffer);
        audioEngine.applyProcessingConfig(finalConfig);
        showNotification('Full Studio chain is active.', 'success', 2000);
      }

      if (workingBuffer !== originalBuffer) {
        markFriendlyWizardStepDone('mixed');
        markFriendlyWizardStepDone('mastered');
        handleGenerateEchoReport(workingMetrics);
        showNotification(`${mode === 'FULL_STUDIO' ? 'Full Studio' : 'Auto Mix'} complete: ${iteration} pass${iteration > 1 ? 'es' : ''}`, 'success', 2500);
      } else {
        markFriendlyWizardStepDone('mastered');
        showNotification(`${mode === 'FULL_STUDIO' ? 'Full Studio' : 'Auto Mix'} found no actionable changes`, 'info', 2000);
      }
    } catch (error) {
      console.error('[AutoMix] Failed:', error);
      setAutoMixError((error as Error).message);
      syncEngineVerdict('block', (error as Error).message, verdictRunId);
      showNotification('Auto Mix failed: ' + (error as Error).message, 'error', 3000);
    } finally {
      setIsAutoMixing(false);
      setAutoMixProgress(null);
      autoMixAbortRef.current = false;
      setAutoMixMode(null);
    }
  };

  const handleAutoMix = async () => {
    await runAutoMix('STANDARD');
  };

  const handleFullStudioAutoMix = async () => {
    await runAutoMix('FULL_STUDIO');
  };

  const handleOpenVideoWorkspace = useCallback(() => {
    markFriendlyWizardStepDone('videoOpened');
    setActiveMode('VIDEO');
  }, [markFriendlyWizardStepDone]);

  // Generate Echo Report
  const handleGenerateEchoReport = async (overrideProcessedMetrics?: AudioMetrics) => {
    const metricsToUse = overrideProcessedMetrics || processedMetrics;
    if (!originalMetrics || !metricsToUse) {
      console.warn('Cannot generate Echo Report without metrics');
      return;
    }

    setEchoReportStatus('loading');

    try {
      // Prepare echo metrics for the service
      // Map 3-band tonal balance to 5-band approximate if necessary
      const originalTonal = originalMetrics.spectralBalance || { low: 0.33, mid: 0.33, high: 0.33 };
      const processedTonal = metricsToUse.spectralBalance || { low: 0.33, mid: 0.33, high: 0.33 };

      const echoMetrics = {
        before: {
          tonalBalance: { 
            low: originalTonal.low, 
            lowMid: originalTonal.low * 0.8, // Approximation
            mid: originalTonal.mid, 
            highMid: originalTonal.high * 0.8, // Approximation
            high: originalTonal.high 
          },
          rms: originalMetrics.rms,
          peak: originalMetrics.peak,
          crestFactor: originalMetrics.crestFactor,
          stereoWidth: 1.0 // Default or needs calculation
        },
        after: {
          tonalBalance: {
            low: processedTonal.low,
            lowMid: processedTonal.low * 0.8,
            mid: processedTonal.mid,
            highMid: processedTonal.high * 0.8,
            high: processedTonal.high
          },
          rms: metricsToUse.rms,
          peak: metricsToUse.peak,
          crestFactor: metricsToUse.crestFactor,
          stereoWidth: 1.0
        },
        issues: [] // Will be populated by the service if needed
      };

      // Use local mastering analyzer (no API calls, instant results)
      const { analyzeMastering } = await import('./services/masteringAnalyzer');
      const report = analyzeMastering(metricsToUse);

      setEchoReport(report);
      setEchoReportStatus('success');
    } catch (error) {
      console.error('Echo Report generation failed:', error);
      setEchoReportStatus('error');
    }
  };

  // Apply Echo Report action
  const handleApplyEchoAction = async (action: any): Promise<boolean> => {
    if (snapshotABActive) {
      handleClearSnapshotAB();
    }
    setEchoActionStatus('idle');
    setEchoActionError(null);
    const verdictRunId = beginVerdictRun();
    let success = false;

    await runWithSteps([
      `Applying ${action.type || 'Fix'}...`,
      'Calculating new parameters',
      'Rendering Processed Audio',
      'Analyzing Results'
    ], async () => {
      try {
        // Build config from echo action
        const actionConfig: ProcessingConfig = { ...currentConfig };

        // Parse action parameters and update config
        // CRITICAL FIX: Respect enabledByDefault flags to prevent over-execution
        // This ensures "Apply All" applies only safe defaults, not full-force processing
        if (action.refinementType === 'bands' && action.bands) {
          actionConfig.eq = action.bands
            .filter((band: any) => {
              // BODY PROTECTION: Never cut the body/weight frequencies (150-500Hz)
              // This is critical for mix clarity and warmth
              const isBodyRange = band.freqHz >= 150 && band.freqHz <= 500;
              const isCut = band.gainDb < 0;
              if (isBodyRange && isCut) {
                console.log(`[PROTECTION] Blocking ${band.freqHz}Hz cut - protects mix body`);
                return false; // Skip cuts in body range
              }
              return band.enabledByDefault !== false; // Include all other enabled bands
            })
            .map((band: any) => {
              // RESTRAINT GUARDRAIL: Cap high-frequency cuts to prevent gloss
              // High-freq EQ cuts should never exceed -3dB to avoid over-refinement
              // De-esser handles sibilance control; EQ provides coarse shaping only
              const isHighFreq = band.freqHz >= 5000;
              const isCut = band.gainDb < 0;
              const cappedGain = isHighFreq && isCut
                ? Math.max(band.gainDb, -3) // Cap cuts at -3dB max
                : band.gainDb;

              return {
                frequency: band.freqHz,
                gain: cappedGain,
                type: 'peaking' as any,
                q: 0.7  // Wider Q for more transparent, less peaky boosts/cuts
              };
            });
        }

        if (action.refinementType === 'parameters' && action.params) {
          // Extract parameters from action
          const params: any = {};
          action.params.forEach((p: any) => {
            if (p.enabledByDefault === false) return;
            params[p.name] = p.value;
          });

          // Apply based on action type
          if (action.type === 'Compression' || action.type === 'Dynamics') {
            actionConfig.compression = {
              threshold: params.threshold ?? -12,
              ratio: params.ratio ?? 1.5,
              attack: params.attack ?? 0.010,
              release: params.release ?? 0.100,
              makeupGain: 0
            };
          }

          if (action.type === 'Limiter') {
            actionConfig.limiter = {
              threshold: params.threshold ?? -1.0,
              ratio: 20,
              attack: 0.005,
              release: params.release ?? 0.100
            };
          }

          // Apply input gain if present
          if (params.inputGain !== undefined) {
            actionConfig.inputTrimDb = params.inputGain;
          }
        }

        // Process the audio with the action config
        const processedBuffer = await audioEngine.renderProcessedAudio(actionConfig);
        audioEngine.setProcessedBuffer(processedBuffer);
        audioEngine.applyProcessingConfig(actionConfig);
        audioEngine.enableProcessedSignal(); // Switch to processed audio
        setCurrentConfig(actionConfig);

        // Update metrics
        const newMetrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
        const estimatedLUFS = newMetrics.rms + 3;
        newMetrics.lufs = {
          integrated: estimatedLUFS,
          shortTerm: estimatedLUFS,
          momentary: estimatedLUFS,
          loudnessRange: newMetrics.crestFactor,
          truePeak: newMetrics.peak
        };
        setProcessedMetrics(newMetrics);
        setHasAppliedChanges(true); // Mark changes applied

        // Add to history
        if (originalMetrics) {
          historyManager.addEntry('echo_action', `Applied: ${action.label}`, actionConfig, newMetrics, true);
        }

        // Regenerate Echo Report with updated metrics
        // Pass newMetrics directly to avoid React state timing issues
        handleGenerateEchoReport(newMetrics);

        syncEngineVerdict('accept', undefined, verdictRunId);
        showNotification('Applied Successfully - Score Updated!', 'success', 2000);
        setEchoActionStatus('idle'); // Reset status immediately
        success = true;
      } catch (error) {
        console.error('Failed to apply echo action:', error);
        showNotification('Failed to apply action: ' + (error as Error).message, 'error', 3000);
        setEchoActionStatus('idle');
        setEchoActionError(null);
        success = false;
      }
    });

    return success;
  };

  // Commit changes
  const handleCommit = async (config: ProcessingConfig): Promise<AudioMetrics | null> => {
    if (snapshotABActive) {
      handleClearSnapshotAB();
    }
    setIsCommitting(true);
    const verdictRunId = beginVerdictRun();
    let resultMetrics: AudioMetrics | null = null;

    await runWithSteps([
        'Committing Changes',
        'Rendering Full Resolution Audio',
        'Updating Analysis'
    ], async () => {
        try {
            // Render processed audio with the config
            const processedBuffer = await audioEngine.renderProcessedAudio(config);
            audioEngine.setProcessedBuffer(processedBuffer);
            audioEngine.enableProcessedSignal(); // Switch to processed audio

            // Analyze the processed result
            const newMetrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
            const estimatedLUFS = newMetrics.rms + 3;
            newMetrics.lufs = {
                integrated: estimatedLUFS,
                shortTerm: estimatedLUFS,
                momentary: estimatedLUFS,
                loudnessRange: newMetrics.crestFactor,
                truePeak: newMetrics.peak
            };

            setProcessedMetrics(newMetrics);
            setHasAppliedChanges(true); // Mark changes applied on commit
            syncEngineVerdict('accept', undefined, verdictRunId);

            // Persist EQ settings to localStorage
            saveEQSettings(eqSettings);
            saveDynamicEQSettings(dynamicEq);

            // Add to revision log
            if (originalMetrics) {
                const revision: RevisionEntry = {
                id: `rev-${Date.now()}`,
                timestamp: Date.now(),
                summary: 'Committed processing changes',
                appliedActions: [],
                processingConfig: config,
                beforeMetrics: originalMetrics,
                afterMetrics: newMetrics
                };
                setRevisionLog([...revisionLog, revision]);

                // Add to history
                historyManager.addEntry('commit', 'Committed changes', config, newMetrics, true);
            }

            // Note: Echo Report regeneration skipped on commit
            // Users can click "Refresh Score Card" in the Echo Report panel to see final scores
            console.log('[App] Commit complete - user can refresh Echo Report to see final scores');

            resultMetrics = newMetrics;
        } catch (error) {
            console.error('Commit failed:', error);
        }
    });

    setIsCommitting(false);
    return resultMetrics;
  };

  // Handle config changes from processing panel
  const configChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isCompressionActive = (compression?: ProcessingConfig['compression']) => {
    if (!compression) return false;
    const ratio = compression.ratio ?? 1;
    const makeupGain = compression.makeupGain ?? 0;
    return ratio > 1.01 || makeupGain !== 0;
  };

  const isLimiterActive = (limiter?: ProcessingConfig['limiter']) => {
    if (!limiter) return false;
    const ratio = limiter.ratio ?? 1;
    return ratio > 1.01;
  };

  const isNoOpProcessingConfig = (config: ProcessingConfig) => {
    const hasEq = config.eq?.some(band => band.gain !== 0) ?? false;
    const hasDynamicEq = config.dynamicEq?.some(band => band.enabled) ?? false;
    const hasSaturation = (config.saturation?.amount ?? 0) > 0;
    const hasTransient = config.transientShaper
      ? config.transientShaper.attack !== 0 || config.transientShaper.sustain !== 0 || config.transientShaper.mix !== 1
      : false;
    const hasImager = config.stereoImager
      ? ((config.stereoImager.lowWidth + config.stereoImager.midWidth + config.stereoImager.highWidth) / 3) !== 1
      : false;
    const hasReverb = (config.motionReverb?.mix ?? 0) > 0;
    const hasDeEsser = (config.deEsser?.amount ?? 0) > 0;
    const hasPitch = config.pitch?.enabled ?? false;
    const hasGate = config.gateExpander?.enabled ?? false;
    const hasTruePeak = config.truePeakLimiter?.enabled ?? false;
    const hasClipper = config.clipper?.enabled ?? false;
    const hasInputTrim = config.inputTrimDb !== undefined && config.inputTrimDb !== 0;
    const hasOutputTrim = config.outputTrimDb !== undefined && config.outputTrimDb !== 0;

    return !(
      isCompressionActive(config.compression) ||
      isLimiterActive(config.limiter) ||
      hasEq ||
      hasDynamicEq ||
      hasSaturation ||
      hasTransient ||
      hasImager ||
      hasReverb ||
      hasDeEsser ||
      hasPitch ||
      hasGate ||
      hasTruePeak ||
      hasClipper ||
      hasInputTrim ||
      hasOutputTrim
    );
  };

  const handleConfigChange = (config: ProcessingConfig) => {
    if (snapshotABActive) {
      handleClearSnapshotAB();
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      !hasAppliedChanges &&
      !hasUserInitiatedProcessingRef.current &&
      !isNoOpProcessingConfig(config)
    ) {
      throw new Error('[P0] Processing chain built without user-applied changes');
    }
    setCurrentConfig(config);
    audioEngine.applyProcessingConfig(config);

    if (isNoOpProcessingConfig(config)) {
      if (configChangeTimeoutRef.current) {
        clearTimeout(configChangeTimeoutRef.current);
      }
      audioEngine.setProcessedBuffer(null);
      audioEngine.resetToOriginal();
      setProcessedMetrics(null);
      setHasAppliedChanges(false);
      setIsAbComparing(false);
      return;
    }

    // Debounce the re-render to avoid too many offline renders during rapid slider adjustments
    if (configChangeTimeoutRef.current) {
      clearTimeout(configChangeTimeoutRef.current);
    }

    configChangeTimeoutRef.current = setTimeout(async () => {
      try {
        // Re-render processed audio with new EQ settings for real-time preview
        const processedBuffer = await audioEngine.renderProcessedAudio(config);
        audioEngine.setProcessedBuffer(processedBuffer);
        audioEngine.enableProcessedSignal();
        setHasAppliedChanges(true);
        console.log('[App] Real-time config rendered and applied');
      } catch (error) {
        console.error('[App] Failed to render config changes:', error);
      }
    }, 300); // 300ms debounce for re-rendering
  };

  const handlePluginChange = useCallback(() => {
    hasUserInitiatedProcessingRef.current = true;
    audioEngine.refreshExternalPluginChain();
  }, []);

  // Handle config apply from Enhanced Control Panel
  const handleEnhancedConfigApply = async (config: ProcessingConfig) => {
    setCurrentConfig(config);
    audioEngine.applyProcessingConfig(config);
    if (config.pitch?.enabled && !audioEngine.canPreviewPitchRealtime()) {
      showNotification('Vocal Tune realtime preview disabled due to latency. Offline render will still apply.', 'warning', 4000);
    }

    if (isNoOpProcessingConfig(config)) {
      audioEngine.setProcessedBuffer(null);
      audioEngine.resetToOriginal();
      setProcessedMetrics(null);
      setHasAppliedChanges(false);
      setIsAbComparing(false);
      return;
    }

    // Render processed audio so changes are actually applied
    try {
      console.log('[App] Rendering processed audio for enhanced config...');
      const processedBuffer = await audioEngine.renderProcessedAudio(config);
      audioEngine.setProcessedBuffer(processedBuffer);
      audioEngine.enableProcessedSignal();

      // Update metrics
      const newMetrics = audioEngine.analyzeStaticMetrics(processedBuffer);
      setProcessedMetrics(newMetrics);
      setHasAppliedChanges(true);

      if (originalMetrics) {
        historyManager.addEntry('preset_apply', 'Applied preset/config', config, newMetrics, true);
      }

      console.log('[App] Enhanced config applied and rendered successfully');
    } catch (error) {
      console.error('[App] Failed to render enhanced config:', error);
    }
  };

  const engineerTemplateIntentLabel = useMemo(() => {
    if (engineerTemplateIntent <= 34) return 'Subtle';
    if (engineerTemplateIntent >= 72) return 'Aggressive';
    return 'Balanced';
  }, [engineerTemplateIntent]);

  const buildIntentAdjustedTemplateConfig = useCallback((baseConfig: ProcessingConfig, intent: number): ProcessingConfig => {
    const normalizedIntent = Math.max(0, Math.min(100, intent));
    const scalar = 0.72 + (normalizedIntent / 100) * 0.7; // 0.72 -> 1.42
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const adjusted: ProcessingConfig = {
      ...baseConfig,
      eq: baseConfig.eq?.map((band) => ({
        ...band,
        gain: Number(clamp(band.gain * scalar, -6, 6).toFixed(2)),
      })),
    };

    if (baseConfig.compression) {
      const baseRatio = baseConfig.compression.ratio ?? 2;
      const baseThreshold = baseConfig.compression.threshold ?? -18;
      const baseAttack = baseConfig.compression.attack ?? 0.01;
      const baseRelease = baseConfig.compression.release ?? 0.2;
      const baseMakeup = baseConfig.compression.makeupGain ?? 0;
      adjusted.compression = {
        ...baseConfig.compression,
        ratio: Number(clamp(1 + (baseRatio - 1) * scalar, 1.2, 6).toFixed(2)),
        threshold: Number(clamp(baseThreshold - (scalar - 1) * 2.2, -30, -8).toFixed(2)),
        attack: Number(clamp(baseAttack / (0.95 + (scalar - 1) * 0.25), 0.001, 0.2).toFixed(4)),
        release: Number(clamp(baseRelease * (1 + (scalar - 1) * 0.15), 0.03, 0.6).toFixed(4)),
        makeupGain: Number(clamp(baseMakeup * (0.82 + normalizedIntent / 140), 0, 5).toFixed(2)),
      };
    }

    if (baseConfig.limiter) {
      const baseThreshold = baseConfig.limiter.threshold ?? -1;
      adjusted.limiter = {
        ...baseConfig.limiter,
        threshold: Number(clamp(baseThreshold - (scalar - 1) * 0.45, -2.2, -0.6).toFixed(2)),
      };
    }

    if (baseConfig.saturation) {
      adjusted.saturation = {
        ...baseConfig.saturation,
        amount: Number(clamp(baseConfig.saturation.amount * scalar, 0.03, 0.35).toFixed(3)),
        mix: typeof baseConfig.saturation.mix === 'number'
          ? Number(clamp(baseConfig.saturation.mix * (0.84 + normalizedIntent / 180), 0.12, 0.95).toFixed(3))
          : baseConfig.saturation.mix,
      };
    }

    if (baseConfig.stereoImager) {
      const adjustWidth = (width: number) => Number(clamp(1 + (width - 1) * scalar, 0.95, 1.35).toFixed(3));
      adjusted.stereoImager = {
        ...baseConfig.stereoImager,
        lowWidth: adjustWidth(baseConfig.stereoImager.lowWidth),
        midWidth: adjustWidth(baseConfig.stereoImager.midWidth),
        highWidth: adjustWidth(baseConfig.stereoImager.highWidth),
      };
    }

    if (baseConfig.deEsser) {
      adjusted.deEsser = {
        ...baseConfig.deEsser,
        amount: Number(clamp(baseConfig.deEsser.amount * (0.9 + normalizedIntent / 220), 0.2, 0.95).toFixed(3)),
      };
    }

    if (baseConfig.transientShaper) {
      adjusted.transientShaper = {
        ...baseConfig.transientShaper,
        attack: Number(clamp(baseConfig.transientShaper.attack * (0.88 + normalizedIntent / 180), -1, 1).toFixed(3)),
        sustain: Number(clamp(baseConfig.transientShaper.sustain * (0.9 + normalizedIntent / 220), -1, 1).toFixed(3)),
      };
    }

    return adjusted;
  }, []);

  const handleApplyEngineerTemplate = useCallback(async () => {
    if (!originalBuffer) {
      showNotification('Load or record a track first.', 'warning', 2600);
      return;
    }
    const preset = presetManager.getPresetById(selectedEngineerTemplateId);
    if (!preset) {
      showNotification('Template not found. Refresh and try again.', 'error', 3000);
      return;
    }

    setIsApplyingEngineerTemplate(true);
    try {
      const intentAdjusted = buildIntentAdjustedTemplateConfig(preset.config, engineerTemplateIntent);
      await handleEnhancedConfigApply(intentAdjusted);
      showNotification(`${preset.name} template applied (${engineerTemplateIntentLabel} intent).`, 'success', 2600);
    } catch (error) {
      console.error('[App] Failed to apply engineer template:', error);
      showNotification('Template apply failed. Please try again.', 'error', 3000);
    } finally {
      setIsApplyingEngineerTemplate(false);
    }
  }, [
    buildIntentAdjustedTemplateConfig,
    engineerTemplateIntent,
    engineerTemplateIntentLabel,
    handleEnhancedConfigApply,
    originalBuffer,
    selectedEngineerTemplateId,
    showNotification,
  ]);

  // Playback controls
  const requestStartPlayback = useCallback(async () => {
    setPlayIntent(true);
    try {
      await audioEngine.play();
      setIsPlaying(true);
      setPlayIntent(false);
      startAplSession();
    } catch (error) {
      setIsPlaying(false);
      // Keep intent true: user asked to play, but iOS/Safari may require a tap to resume.
      console.warn('[App] Playback start blocked or failed', error);
    }
  }, [startAplSession]);

  const requestStopPlayback = useCallback(() => {
    setPlayIntent(false);
    setIsPlaying(false);
    audioEngine.pause();
    pauseAplSession();
  }, [pauseAplSession]);

  const handleTogglePlayback = useCallback(() => {
    if (isPlaying || playIntent) {
      requestStopPlayback();
      return;
    }
    void requestStartPlayback();
  }, [isPlaying, playIntent, requestStartPlayback, requestStopPlayback]);

  // iOS/mobile hardening: avoid "UI says playing but audio is dead" after backgrounding or tab switches.
  const wasPlayingBeforeHideRef = useRef(false);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        wasPlayingBeforeHideRef.current = isPlaying;
        if (isPlaying || playIntent) {
          requestStopPlayback();
        }
        return;
      }

      // On return: only prompt for resume if user was actually playing and the context isn't running.
      if (wasPlayingBeforeHideRef.current) {
        wasPlayingBeforeHideRef.current = false;
        const state = String(audioEngine.getAudioContext().state);
        if (state !== 'running') {
          setPlayIntent(true);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isPlaying, playIntent, requestStopPlayback]);

  useEffect(() => {
    const running = String(audioContextState) === 'running';
    if (isPlaying && !running) {
      console.warn('[App] AudioContext suspended while playing; stopping transport to keep UI truthful.');
      audioEngine.pause();
      pauseAplSession();
      setIsPlaying(false);
      setPlayIntent(true);
    }
  }, [audioContextState, isPlaying, pauseAplSession]);

  useEffect(() => {
    // Persist last known AudioContext state for debug copying.
    debugTelemetryService.setAudioContextInfo('single', {
      state: String(audioContextState),
      sampleRate: audioEngine.getAudioContext().sampleRate,
    });
  }, [audioContextState]);

  const copyDebugInfo = useCallback(async () => {
    const snapshot = {
      ts: new Date().toISOString(),
      appVersion,
      href: typeof window !== 'undefined' ? window.location.href : 'n/a',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      viewport: typeof window !== 'undefined'
        ? {
            w: window.innerWidth,
            h: window.innerHeight,
            dpr: window.devicePixelRatio,
          }
        : null,
      state: {
        appState,
        activeMode,
        engineMode,
        currentFileName,
        hasAppliedChanges,
        isAbComparing,
        isPlaying,
        playIntent,
      },
      audioContexts: debugTelemetryService.getAudioContextInfo(),
      recentErrors: debugTelemetryService.getRecentErrors(),
    };

    const text = JSON.stringify(snapshot, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Debug info copied to clipboard', 'success', 2500);
      return;
    } catch (err) {
      // Fallback for older browsers / insecure contexts.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification('Debug info copied to clipboard', 'success', 2500);
      } catch (fallbackErr) {
        console.warn('[App] Failed to copy debug info', err, fallbackErr);
        showNotification('Unable to copy debug info on this device. Try a different browser.', 'warning', 3500);
      }
    }
  }, [
    activeMode,
    appState,
    appVersion,
    currentFileName,
    engineMode,
    hasAppliedChanges,
    isAbComparing,
    isPlaying,
    playIntent,
    showNotification,
  ]);

  // A/B bypass toggle - only works if changes have been applied
  const handleToggleAB = () => {
    if (snapshotABActive) {
      const newBypassState = !isAbComparing;
      setIsAbComparing(newBypassState);
      audioEngine.setBypass(newBypassState);
      return;
    }
    if (!hasAppliedChanges) return; // Don't allow A/B until changes applied
    const newBypassState = !isAbComparing;
    setIsAbComparing(newBypassState);
    audioEngine.setBypass(newBypassState);
  };

  // Play raw original audio with zero processing
  const handlePlayRawAudio = () => {
    if (!originalBuffer) return;
    if (snapshotABActive) {
      handleClearSnapshotAB();
    }
    audioEngine.resetToOriginal();
    setIsPlaying(false);
    setPlayIntent(false);
    setIsAbComparing(false);
    void requestStartPlayback();
  };

  // Track Delete + Reset - returns to upload state
  const handleDeleteTrack = async () => {
    if (!confirm('Delete current track and start over? All unsaved changes will be lost.')) return;

    // Stop playback
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
      pauseAplSession();
    }

    if (snapshotABActive) {
      handleClearSnapshotAB();
    }

    // Clear all audio buffers
    audioEngine.setBuffer(null);
    audioEngine.setProcessedBuffer(null);
    stopAplSession();

    // Reset all state
    setAppState(AppState.IDLE);
    setCurrentFileName('');
    setOriginalMetrics(null);
    setProcessedMetrics(null);
    setAnalysisResult(null);
    setOriginalBuffer(null);
    setHasAppliedChanges(false);
    setIsAbComparing(false);
    setCurrentConfig({});
    setAppliedSuggestionIds([]);
    setApplySuggestionsError(null);
    setEchoReport(null);
    setEchoReportStatus('idle');
    setShadowTelemetry(null);
    setLatestEngineVerdict(null);
    setLatestEngineVerdictReason(null);
    setBlockedMixRecovery(null);
    setIsFixingBlockedMix(false);
    setReferenceTrack(null);
    setReferenceSignature(null);
    setRevisionLog([]);
    resetFriendlyWizardProgress();

    // Clear autosave
    await sessionManager.clearSession();

    // Clear history
    historyManager.clear();

    console.log('[App] Track deleted, returned to upload state');
  };

  // Logo click handler - returns to home/upload state
  const handleLogoClick = () => {
    // If already on upload screen, do nothing
    if (appState === AppState.IDLE) return;

    // Confirm before returning to home to prevent accidental clicks
    if (!confirm('Return to home? Your current session will be saved and you can restore it.')) return;

    // Stop playback
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
      pauseAplSession();
    }

    if (snapshotABActive) {
      handleClearSnapshotAB();
    }

    // Clear all audio buffers
    audioEngine.setBuffer(null);
    audioEngine.setProcessedBuffer(null);
    stopAplSession();

    // Reset to upload state
    // NOTE: We do NOT clear the session here, so the restore dialog will appear
    setAppState(AppState.IDLE);
    setCurrentFileName('');
    setOriginalMetrics(null);
    setProcessedMetrics(null);
    setAnalysisResult(null);
    setOriginalBuffer(null);
    setHasAppliedChanges(false);
    setIsAbComparing(false);
    setCurrentConfig({});
    setAppliedSuggestionIds([]);
    setApplySuggestionsError(null);
    setEchoReport(null);
    setEchoReportStatus('idle');
    setShadowTelemetry(null);
    setLatestEngineVerdict(null);
    setLatestEngineVerdictReason(null);
    setReferenceTrack(null);
    setReferenceSignature(null);
    setRevisionLog([]);
    resetFriendlyWizardProgress();
    historyManager.clear();

    // Re-check for pending session and show restore dialog
    const savedSession = sessionManager.getSession();
    if (hasRecoverableSessionState(savedSession)) {
      setPendingSession(savedSession);
      setShowRestoreDialog(true);
    }

    console.log('[App] Logo clicked, returned to upload state with session preserved');
  };

  const resolveSnapshotBuffer = async (entry: HistoryEntry): Promise<AudioBuffer | null> => {
    const cached = historyManager.getBufferSnapshot(entry.id);
    if (cached) return cached;
    if (!originalBuffer) return null;

    const buffer = await audioEngine.renderProcessedAudio(entry.config);
    historyManager.setBufferSnapshot(entry.id, buffer);
    return buffer;
  };

  const activateSnapshotAB = async (aId: string, bId: string) => {
    const entries = historyManager.getAllEntries();
    const entryA = entries.find(entry => entry.id === aId);
    const entryB = entries.find(entry => entry.id === bId);
    if (!entryA || !entryB) return;

    const [bufferA, bufferB] = await Promise.all([
      resolveSnapshotBuffer(entryA),
      resolveSnapshotBuffer(entryB)
    ]);

    if (!bufferA || !bufferB) return;

    audioEngine.enableSnapshotAB(bufferA, bufferB);
    setSnapshotABActive(true);
    setIsAbComparing(true);
  };

  const handleClearSnapshotAB = () => {
    if (audioEngine.isSnapshotABActive()) {
      audioEngine.disableSnapshotAB();
    }
    setSnapshotABActive(false);
    setSnapshotAId(null);
    setSnapshotBId(null);
    setSnapshotALabel(null);
    setSnapshotBLabel(null);
    setIsAbComparing(false);
  };

  const handleSetSnapshotA = async (entry: HistoryEntry) => {
    const buffer = await resolveSnapshotBuffer(entry);
    if (!buffer) {
      showNotification('Unable to capture Snapshot A', 'error', 2000);
      return;
    }
    setSnapshotAId(entry.id);
    setSnapshotALabel(entry.description);
    if (snapshotBId && snapshotBId !== entry.id) {
      await activateSnapshotAB(entry.id, snapshotBId);
    }
  };

  const handleSetSnapshotB = async (entry: HistoryEntry) => {
    const buffer = await resolveSnapshotBuffer(entry);
    if (!buffer) {
      showNotification('Unable to capture Snapshot B', 'error', 2000);
      return;
    }
    setSnapshotBId(entry.id);
    setSnapshotBLabel(entry.description);
    if (snapshotAId && snapshotAId !== entry.id) {
      await activateSnapshotAB(snapshotAId, entry.id);
    }
  };

  /**
   * Jump to a specific history entry and restore its state
   */
  const handleJumpToHistoryEntry = async (entry: HistoryEntry) => {
    try {
      if (snapshotABActive) {
        handleClearSnapshotAB();
      }
      console.log('[App] Jumping to history entry:', entry.id, entry.description);

      // Apply the config from the history entry
      setCurrentConfig(entry.config);
      audioEngine.applyProcessingConfig(entry.config);

      // Render processed audio with the historical config
      if (originalBuffer) {
        const processedBuffer = await audioEngine.renderProcessedAudio(entry.config);
        audioEngine.setProcessedBuffer(processedBuffer);
        audioEngine.enableProcessedSignal();

        // Update metrics
        const newMetrics = audioEngine.analyzeStaticMetrics(processedBuffer);
        setProcessedMetrics(newMetrics);
        setHasAppliedChanges(true);
      }

      // Jump in history manager
      historyManager.jumpToEntry(entry.id);

      // Close timeline
      setShowHistoryTimeline(false);

      console.log('[App] Successfully jumped to history entry');
    } catch (error) {
      console.error('[App] Failed to jump to history entry:', error);
      alert('Failed to restore history state. Please try again.');
    }
  };

  /**
   * Handle AI-generated song completion and route to Multi-Stem Workspace
   */
  const handleSongGenerated = async (song: GeneratedSong) => {
    try {
      console.log('[App] Song generated, routing to Multi-Stem Workspace:', song);

      // Create stems from generated song
      const newStems: Stem[] = [
        {
          id: 'ai-vocals',
          name: 'AI Vocals',
          type: 'vocals',
          buffer: song.stems.vocals,
          metrics: audioEngine.analyzeStaticMetrics(song.stems.vocals),
          config: { volumeDb: 0, isMuted: false, eq: [], isSoaped: false }
        },
        {
          id: 'instrumental',
          name: 'Instrumental',
          type: 'other',
          buffer: song.stems.instrumental,
          metrics: audioEngine.analyzeStaticMetrics(song.stems.instrumental),
          config: { volumeDb: -3, isMuted: false, eq: [] }
        }
      ];

      // Set stems for Multi-Stem Workspace
      setGeneratedStems(newStems);

      // Switch to Multi mode
      setActiveMode('MULTI');

      console.log('[App] Successfully routed to Multi-Stem Workspace with', newStems.length, 'stems');
    } catch (error) {
      console.error('[App] Failed to route generated song:', error);
      alert('Failed to load generated song. Please try again.');
    }
  };

  const handleSplitToStems = useCallback(async () => {
    if (!originalBuffer) {
      showNotification('Upload a track first so we can split stems.', 'warning', 3000);
      return;
    }
    await splitBufferToStems(originalBuffer);
  }, [
    originalBuffer,
    showNotification,
    splitBufferToStems
  ]);

  const handleOpenManualStemUpload = useCallback(() => {
    setGeneratedStems([]);
    setActiveMode('MULTI');
    showNotification('Manual stems mode ready. Upload isolated stems for maximum precision.', 'info', 2800);
  }, [showNotification]);

  /**
   * Route generated song directly into Single Track mastering flow.
   */
  const handleSongOpenSingleTrack = async (song: GeneratedSong) => {
    try {
      if (snapshotABActive) {
        handleClearSnapshotAB();
      }
      stopAplSession();
      setAplProposals([]);

      setAppState(AppState.LOADING);
      setActiveMode('SINGLE');
      resetFriendlyWizardProgress();

      audioEngine.setProcessedBuffer(null);
      audioEngine.setBuffer(song.buffer);

      const metrics = mixAnalysisService.analyzeStaticMetrics(song.buffer);
      const estimatedLUFS = metrics.rms + 3;
      metrics.lufs = {
        integrated: estimatedLUFS,
        shortTerm: estimatedLUFS,
        momentary: estimatedLUFS,
        loudnessRange: metrics.crestFactor,
        truePeak: metrics.peak,
      };

      setCurrentFileName(`${song.name}.wav`);
      setOriginalMetrics(metrics);
      setProcessedMetrics(null);
      setOriginalBuffer(song.buffer);
      setHasAppliedChanges(false);
      setShadowTelemetry(null);
      setLatestEngineVerdict(null);
      setLatestEngineVerdictReason(null);
      setApplySuggestionsError(null);
      setBlockedMixRecovery(null);
      setIsFixingBlockedMix(false);
      setCurrentConfig({});
      hasUserInitiatedProcessingRef.current = false;
      setEqSettings(defaultEqSettings);
      setDynamicEq(defaultDynamicEq);
      setListeningPassData(null);
      setLLMGuidance(null);
      setAnalysisResult({
        metrics,
        suggestions: [],
        genrePrediction: 'Ready for Analysis',
        frequencyData: [],
        mixReadiness: 'in_progress'
      });

      historyManager.addEntry('upload', `Loaded AI Studio song: ${song.name}`, {}, metrics);
      setAppState(AppState.READY);
    } catch (error) {
      console.error('[App] Failed to open generated song in single track mode:', error);
      alert('Failed to open generated song in Single Track. Please try again.');
      setAppState(AppState.IDLE);
    }
  };

  // Selected suggestion count (only unapplied)
  const selectedSuggestionCount = analysisResult?.suggestions.filter((s: Suggestion) => s.isSelected && !appliedSuggestionIds.includes(s.id)).length || 0;
  const hasUploadedTrack = appState === AppState.READY && !!originalBuffer;
  const activeFriendlyJourneyStep: FriendlyJourneyStep = !hasUploadedTrack
    ? 'upload'
    : !friendlyWizardProgress.analyzed
      ? 'analyze'
      : !friendlyWizardProgress.mixed
        ? 'mix'
        : !friendlyWizardProgress.mastered
          ? 'master'
          : 'video';
  const friendlyStepIsDone: Record<FriendlyJourneyStep, boolean> = {
    upload: hasUploadedTrack,
    analyze: friendlyWizardProgress.analyzed,
    mix: friendlyWizardProgress.mixed,
    master: friendlyWizardProgress.mastered,
    video: friendlyWizardProgress.videoOpened,
  };
  const busyStepReason = (showProcessingOverlay || isAutoMixing)
    ? 'Wait for current processing to finish.'
    : null;
  const friendlyAnalyzeReason = busyStepReason
    || (activeFriendlyJourneyStep !== 'analyze' ? 'Complete the current step first.' : null);
  const friendlyMixReason = busyStepReason
    || (!friendlyWizardProgress.analyzed ? 'Run Analyze first.' : null)
    || (activeFriendlyJourneyStep !== 'mix' ? 'Complete the current step first.' : null);
  const friendlyMasterReason = busyStepReason
    || (!friendlyWizardProgress.mixed ? 'Run Mix first.' : null)
    || (activeFriendlyJourneyStep !== 'master' ? 'Complete the current step first.' : null);
  const friendlyVideoReason = (!friendlyWizardProgress.mastered ? 'Run Master first.' : null)
    || (activeFriendlyJourneyStep !== 'video' ? 'Complete the current step first.' : null);
  const whatChangedSummary = useMemo(() => {
    if (!originalMetrics || !processedMetrics) return null;
    const beforeLufs = originalMetrics.lufs?.integrated ?? originalMetrics.rms + 3;
    const afterLufs = processedMetrics.lufs?.integrated ?? processedMetrics.rms + 3;
    const loudnessDelta = afterLufs - beforeLufs;
    const peakDelta = processedMetrics.peak - originalMetrics.peak;
    const dynamicDelta = processedMetrics.crestFactor - originalMetrics.crestFactor;
    const direction = (value: number) => (value > 0 ? '+' : '');
    const loudnessText = `${direction(loudnessDelta)}${loudnessDelta.toFixed(1)} dB`;
    const peakText = `${direction(peakDelta)}${peakDelta.toFixed(1)} dB`;
    const dynamicText = `${direction(dynamicDelta)}${dynamicDelta.toFixed(1)} dB`;

    let plainEnglish = 'Processing pass completed with loudness-matched A/B ready.';
    if (Math.abs(loudnessDelta) >= 0.7) {
      plainEnglish = loudnessDelta > 0
        ? 'Your mix got louder while staying under safety limits.'
        : 'Your mix was slightly turned down to protect punch and headroom.';
    }
    if (peakDelta <= -0.5) {
      plainEnglish += ' Peaks were reduced for safer headroom.';
    } else if (peakDelta >= 0.5) {
      plainEnglish += ' Peaks rose, so clipping protection should be checked.';
    }
    if (dynamicDelta <= -0.8) {
      plainEnglish += ' Dynamics tightened for consistency.';
    } else if (dynamicDelta >= 0.8) {
      plainEnglish += ' Dynamics opened up for more movement.';
    }

    return {
      plainEnglish,
      beforeLufs,
      afterLufs,
      loudnessText,
      peakText,
      dynamicText,
    };
  }, [originalMetrics, processedMetrics]);
  const activeChainView = useMemo(() => {
    const scan = audioEngine.getSSCScan();
    const activeProcessors = scan.processors.filter((processor) => processor.active);
    const appliedActions = Array.isArray(analysisResult?.actions)
      ? analysisResult.actions
        .filter((action: ProcessingAction) => appliedSuggestionIds.includes(action.id))
        .map((action: ProcessingAction) => action.label || action.type)
      : [];
    return {
      activeProcessors,
      appliedActions,
    };
  }, [analysisResult, appliedSuggestionIds, currentConfig, engineMode, hasAppliedChanges]);
  const hasAplSidebar = appState === AppState.READY && aplProposals.length > 0;
  const restoreModeCards = useMemo(() => {
    if (!pendingSession) return [];
    const sessionTemplateName = pendingSession.selectedEngineerTemplateId
      ? presetManager.getPresetById(pendingSession.selectedEngineerTemplateId)?.name
      : null;
    const singleRecoverable = !!pendingSession.fileName
      || !!pendingSession.hasAppliedChanges
      || (pendingSession.appliedSuggestionIds?.length ?? 0) > 0;
    const multiRecoverable = (pendingSession.generatedStemSummary?.count ?? 0) > 0
      || (pendingSession.cohesionTrackCount ?? 0) > 0
      || pendingSession.activeMode === 'MULTI';
    const aiRecoverable = pendingSession.activeMode === 'AI_STUDIO'
      || !!sessionTemplateName
      || !!pendingSession.friendlyWizardProgress?.analyzed;
    const videoRecoverable = pendingSession.activeMode === 'VIDEO'
      || !!pendingSession.friendlyWizardProgress?.videoOpened;

    return ([
      {
        mode: 'SINGLE' as RestoreMode,
        title: 'Single Track',
        recoverable: singleRecoverable,
        requiresAudio: true,
        detail: singleRecoverable
          ? `${pendingSession.appliedSuggestionIds.length} fix(es) + ${sessionTemplateName || 'template settings'} @ ${Math.round(pendingSession.engineerTemplateIntent ?? 58)}%`
          : 'No saved mix state yet.',
      },
      {
        mode: 'MULTI' as RestoreMode,
        title: 'Stems',
        recoverable: multiRecoverable,
        requiresAudio: true,
        detail: multiRecoverable
          ? `${pendingSession.generatedStemSummary?.count ?? 0} stem snapshot(s), ${pendingSession.cohesionTrackCount ?? 0} album track(s)${typeof pendingSession.generatedStemSummary?.confidenceScore === 'number' ? ` · ${Math.round(pendingSession.generatedStemSummary.confidenceScore)}% split confidence` : ''}`
          : 'No stem snapshot saved.',
      },
      {
        mode: 'AI_STUDIO' as RestoreMode,
        title: 'AI Studio',
        recoverable: aiRecoverable,
        requiresAudio: false,
        detail: aiRecoverable
          ? 'Studio flow + template preferences ready.'
          : 'No AI Studio progress saved.',
      },
      {
        mode: 'VIDEO' as RestoreMode,
        title: 'SFS Video',
        recoverable: videoRecoverable,
        requiresAudio: false,
        detail: videoRecoverable
          ? 'Last visualizer mode can be reopened.'
          : 'No video workflow progress saved.',
      },
    ]);
  }, [pendingSession]);
  const displayTelemetry = shadowTelemetry
    ? shadowTelemetry
    : (echoReport
      ? {
          analysisRunId: -1,
          classicalScore: echoReport.score?.total,
          quantumScore: echoReport.quantumScore,
          shadowDelta: echoReport.shadowDelta,
          quantumConfidence: echoReport.quantumConfidence,
          humanIntentIndex: echoReport.humanIntentIndex,
          intentCoreActive: echoReport.intentCoreActive
        }
      : null);
  const normalizedCurrentTrackName = currentFileName ? currentFileName.replace(/\.[^/.]+$/, '') : '';
  const engineerTemplateOptions: ProcessingPreset[] = ENGINEER_TEMPLATE_PRESET_IDS
    .map((presetId) => presetManager.getPresetById(presetId))
    .filter((preset): preset is ProcessingPreset => !!preset);
  const selectedEngineerTemplate = engineerTemplateOptions.find((preset) => preset.id === selectedEngineerTemplateId) || null;
  const selectedEngineerTemplateNote = selectedEngineerTemplate
    ? ENGINEER_TEMPLATE_NOTES[selectedEngineerTemplate.id]
    : null;
  const recommendedEngineerTemplateId = useMemo(() => {
    const genre = String(analysisResult?.genrePrediction || '').toLowerCase();
    if (!genre) return null;
    if (genre.includes('ambient') || genre.includes('lofi') || genre.includes('moody') || genre.includes('chill')) {
      return 'preset-engineer-40';
    }
    if (genre.includes('hip-hop') || genre.includes('trap') || genre.includes('rap')) {
      return 'preset-engineer-mixedbyali';
    }
    if (genre.includes('west')) {
      return 'preset-engineer-dr-dre';
    }
    if (genre.includes('pop') || genre.includes('r&b') || genre.includes('vocal') || genre.includes('melodic')) {
      return 'preset-engineer-rian-lewis';
    }
    return null;
  }, [analysisResult?.genrePrediction]);
  const recommendedEngineerTemplate = recommendedEngineerTemplateId
    ? engineerTemplateOptions.find((preset) => preset.id === recommendedEngineerTemplateId) || null
    : null;
  useEffect(() => {
    if (engineerTemplateOptions.length === 0) return;
    const hasCurrent = engineerTemplateOptions.some((preset) => preset.id === selectedEngineerTemplateId);
    if (!hasCurrent) {
      setSelectedEngineerTemplateId(engineerTemplateOptions[0].id);
    }
  }, [engineerTemplateOptions, selectedEngineerTemplateId]);
  const currentTrackMatchScore = (
    batchState.profile && originalMetrics
      ? CohesionEngine.calculateTrackVibeMatch(
          deriveCohesionTrackReportFromMetrics(
            normalizedCurrentTrackName || `current-${Date.now()}`,
            normalizedCurrentTrackName || 'Current Track',
            originalMetrics,
            displayTelemetry?.humanIntentIndex
          ),
          batchState.profile
        )
      : null
  );
  const albumAverageMatch = (
    batchState.profile && cohesionTracks.length > 0
      ? Math.round(
          cohesionTracks.reduce((sum, track) => (
            sum + CohesionEngine.calculateTrackVibeMatch(track, batchState.profile!)
          ), 0) / cohesionTracks.length
        )
      : null
  );

  useEffect(() => {
    if (!normalizedCurrentTrackName || typeof displayTelemetry?.humanIntentIndex !== 'number') return;
    setCohesionTracks(prev => {
      let changed = false;
      const next = prev.map(track => {
        if (track.trackName !== normalizedCurrentTrackName) return track;
        if (track.humanIntentIndex === displayTelemetry.humanIntentIndex) return track;
        changed = true;
        return { ...track, humanIntentIndex: displayTelemetry.humanIntentIndex };
      });
      if (!changed) return prev;
      updateAlbumCohesion(next);
      return next;
    });
  }, [displayTelemetry?.humanIntentIndex, normalizedCurrentTrackName, updateAlbumCohesion]);

  return (
    <CapabilityProvider
      authority={capabilityAuthority}
      appId="com.echo-sound-lab.app"
      processIdentity={processIdentity}
    >
      <div
        className="min-h-screen bg-[#0a0c12] text-slate-300 font-sans flex flex-col pb-24 relative overflow-hidden"
        style={safeAreaVars}
      >

      {/* ===== PHASE 5: LOCKDOWN BANNER ===== */}
      {isInLockdown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            backgroundColor: '#dc3545',
            color: 'white',
            textAlign: 'center',
            padding: '12px 0',
            fontWeight: 'bold',
            zIndex: 10000,
            boxShadow: '0 4px 12px rgba(220, 53, 69, 0.5)',
            animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '16px'
          }}
        >
          <svg
            style={{ width: '20px', height: '20px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          🔒 SYSTEM LOCKDOWN: INTEGRITY CHECK FAILED. EXECUTION DISABLED.
        </div>
      )}

      {/* Spacer for lockdown banner */}
      {isInLockdown && <div style={{ height: '60px' }} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>

      {/* Second Light OS Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0a0c12] to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-900/5 via-transparent to-transparent" />
      </div>

      {/* Processing Overlay */}
      <ProcessingOverlay
        isVisible={showProcessingOverlay}
        steps={processingSteps}
        currentStepIndex={currentStepIndex}
      />

      {/* Virtual Cursor (Ghost System) - Always rendered, z-9999 */}
      <VirtualCursor />

      {/* ===== PHASE 3: HYBRID BRIDGE TEST (debug only) ===== */}
      {showLabDebugPanels && (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm">
          <BridgeTest />
        </div>
      )}

      {/* Second Light OS Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0a0c12] to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-900/5 via-transparent to-transparent" />
      </div>

      {/* System Bar - Second Light OS Style */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-black/90 via-slate-900/90 to-black/90 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Logo - Echo Sound Lab */}
            <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleLogoClick}
              className="group relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 hover:rotate-[-1.5deg] active:scale-95 active:translate-y-[1px]"
              title="Return to Echo Sound Lab"
            >
              <span className="absolute -inset-1 rounded-[18px] bg-gradient-to-br from-amber-500/15 via-orange-400/5 to-amber-700/20 blur-md opacity-60 transition-opacity duration-300 group-hover:opacity-80" />
              <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
              <span className="absolute inset-[3px] rounded-xl bg-[linear-gradient(145deg,#a9642f_0%,#b7723b_45%,#8d4e25_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
              <span className="absolute inset-[3px] rounded-xl bg-[repeating-linear-gradient(35deg,rgba(18,14,10,0.16)_0,rgba(18,14,10,0.16)_1px,rgba(255,255,255,0.015)_1px,rgba(255,255,255,0.015)_3px)] opacity-30" />
              <span className="absolute inset-[3px] rounded-xl bg-[radial-gradient(90%_80%_at_30%_25%,rgba(255,255,255,0.18),transparent_60%)] opacity-60" />
              <svg className="relative w-6 h-6 text-[#2b1c12] drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M7 5h10" />
                <path d="M7 12h7.5" />
                <path d="M7 19h10" />
                <path d="M7 5v14" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm text-white tracking-tight flex items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="font-bold">Echo</span>
                  <span className="font-normal text-slate-600">Sound Lab</span>
                </span>
                <span className="text-slate-600">| |</span>
                <span className="text-slate-400 font-normal -ml-0.5">VENICEAI LABS</span>
              </h1>
              <p className="text-[10px] text-orange-400 font-semibold tracking-widest uppercase mt-1">Second Light OS</p>
            </div>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
            {currentFileName && (
              <div className="hidden md:flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5 border border-white/5">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs text-slate-400 truncate max-w-[120px] sm:max-w-[150px]">{currentFileName}</span>
                <button
                  onClick={handleDeleteTrack}
                  className="ml-2 p-1 rounded hover:bg-red-500/20 transition-colors group"
                  title="Delete track and start over"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
            {appState === AppState.READY && (
              <button
                onClick={() => setShowHistoryTimeline(true)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
                title="View Processing History"
              >
                <svg className="w-5 h-5 text-slate-400 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
              title="Settings"
            >
              <svg className="w-5 h-5 text-slate-400 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleOpenSSC}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
              title="SSC Observe Mode"
            >
              <svg className="w-5 h-5 text-slate-400 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0v4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z" />
              </svg>
            </button>
            {/* Ghost Demo Mode Button */}
            <button
              onClick={() => setShowDemoMode(true)}
              className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-400/50 hover:border-purple-400 transition-all"
              title="Launch autonomous demo (Ghost System)"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-purple-300 hover:text-purple-200">
                <span>🎬</span>
                <span className="hidden sm:inline text-xs">Demo</span>
              </span>
            </button>
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
              <span className="font-semibold text-emerald-300">RC 1.0</span>
              <span className="text-slate-600">|</span>
              <span className="text-orange-300">Net</span>
              <span className="text-slate-400 normal-case tracking-normal">{networkSettings.ssid}</span>
              {networkSettings.proxy && <span className="text-slate-500 normal-case tracking-normal">({networkSettings.proxy})</span>}
            </div>
          </div>
          </div>

          {/* Mode Tabs (scrollable on mobile) */}
          <div className="mt-3 -mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-2 bg-slate-950/80 rounded-2xl p-1.5 border border-slate-800/50 shadow-[inset_2px_2px_4px_#000000,inset_-2px_-2px_4px_#0a0c12] overflow-x-auto no-scrollbar">
              {(['SINGLE', 'MULTI', 'AI_STUDIO', 'VIDEO'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setActiveMode(mode)}
                  data-testid={`mode-tab-${mode.toLowerCase()}`}
                  className={`shrink-0 px-4 sm:px-5 py-2.5 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    activeMode === mode
                      ? 'bg-slate-900 text-orange-400 shadow-[inset_3px_3px_6px_#050710,inset_-3px_-3px_6px_#0f1828] border border-orange-500/30'
                      : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] border border-slate-800/30 hover:border-slate-700/50'
                  }`}
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {showBuildUpdatePrompt && latestBuild && (
        <div className="relative z-40 w-full border-b border-orange-400/20 bg-gradient-to-r from-orange-500/10 via-amber-500/8 to-orange-500/10 backdrop-blur-lg">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300/90">Software Update Ready</p>
              <p className="mt-0.5 text-sm text-slate-100">
                A newer Echo Sound Lab build is available.
                <span className="ml-2 font-mono text-[11px] text-slate-400">{latestBuild.buildId}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Your current session will stay active until you choose to refresh.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleDelayBuildUpdate}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-white/30 hover:text-slate-100"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleApplyBuildUpdate}
                className="rounded-full border border-orange-400/35 bg-orange-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-200 transition-colors hover:bg-orange-400/25"
              >
                Update Now
              </button>
              <button
                type="button"
                onClick={dismissBuildUpdatePrompt}
                className="h-9 w-9 rounded-full border border-white/15 bg-white/5 text-slate-400 transition-colors hover:text-slate-200"
                aria-label="Dismiss update prompt"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Overlay */}
      <DiagnosticsOverlay
        isVisible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />
      <SSCOverlay
        isVisible={showSSC}
        scan={sscScan}
        onClose={handleCloseSSC}
        onRefresh={handleRefreshSSC}
      />

      {/* Session Restore Dialog */}
      {showRestoreDialog && pendingSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-3xl border border-slate-700/50 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828] p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-orange-500/30 flex items-center justify-center shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Restore Session?</h3>
                <p className="text-xs text-slate-500 uppercase tracking-wider">{sessionManager.getTimeSinceLastSave()}</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-5 mb-4 border border-slate-700/30">
              <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-bold">Previous session found:</p>
              <p className="text-orange-400 font-medium truncate mb-2">{pendingSession.fileName || 'Untitled Project State'}</p>
              <p className="text-xs text-slate-400">
                Mode: {pendingSession.activeMode} <span className="text-slate-600">//</span> {pendingSession.appliedSuggestionIds.length} suggestions applied
              </p>
              {pendingSession.generatedStemSummary?.count ? (
                <p className="mt-2 text-xs text-slate-500">
                  Stems snapshot: {pendingSession.generatedStemSummary.count} stem(s) last seen.
                </p>
              ) : null}
            </div>

            <div className="mb-4">
              <p className="mb-2 text-[11px] text-slate-500 uppercase tracking-wider font-bold">Open restored state in:</p>
              <div className="grid grid-cols-2 gap-2">
                {restoreModeCards.map((modeCard) => (
                  <button
                    key={modeCard.mode}
                    type="button"
                    onClick={() => setRestoreTargetMode(modeCard.mode)}
                    disabled={!modeCard.recoverable}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      restoreTargetMode === modeCard.mode
                        ? 'border-orange-400/50 bg-orange-500/10'
                        : 'border-slate-700/40 bg-slate-900/40'
                    } ${
                      modeCard.recoverable
                        ? 'hover:border-orange-300/40'
                        : 'cursor-not-allowed opacity-45'
                    }`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      restoreTargetMode === modeCard.mode ? 'text-orange-300' : 'text-slate-300'
                    }`}>
                      {modeCard.title}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">{modeCard.detail}</p>
                    {modeCard.requiresAudio && modeCard.recoverable ? (
                      <p className="mt-1 text-[10px] text-slate-500">Audio re-upload required.</p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-6 uppercase tracking-wider">
              Project settings across tabs will be restored. Re-upload audio where needed to resume playback/processing.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleDismissRestore}
                className="flex-1 px-5 py-3 bg-slate-800/50 hover:bg-slate-700 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-wider transition-all border border-slate-700/50 hover:border-slate-600 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] active:shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]"
              >
                Start Fresh
              </button>
              <button
                onClick={handleRestoreSession}
                className="flex-1 px-5 py-3 bg-slate-900 text-orange-400 rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] text-xs font-bold uppercase tracking-wider transition-all"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Track Accent Line */}
      {appState === AppState.IDLE && activeMode === 'SINGLE' && (
        <div className="w-full h-[2px] bg-gradient-to-r from-orange-500/80 via-orange-400/60 to-orange-500/80 shadow-[0_0_12px_rgba(249,115,22,0.45)]" />
      )}

      {/* Main Content Area */}
      <main className={`flex-1 p-3 sm:p-6 flex flex-col items-center relative z-10 ${hasAplSidebar ? 'lg:pr-[21rem]' : ''}`}>

      {/* Upload Screen - Second Light OS Glass Card */}
      {appState === AppState.IDLE && activeMode === 'SINGLE' && (
        <div className="mt-10 sm:mt-20 w-full max-w-4xl">
          <section className="mb-12 text-center">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-[-0.04em] text-slate-100 leading-[0.95]">
              Mixes that think. Masters that feel.
            </h1>
            <p className="mt-4 text-base md:text-lg text-slate-400 font-medium">
              Engineered with measurable human intent.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3 md:gap-4 text-[11px] md:text-xs uppercase tracking-[0.22em] text-slate-500">
              <span>Analyze your track.</span>
              <span className="text-slate-700">•</span>
              <span>See the delta.</span>
              <span className="text-slate-700">•</span>
              <span>Master with intent.</span>
            </div>
          </section>

          <div className="mb-5">
            <OnboardingProfileSelector
              value={onboardingProfile}
              onChange={handleSelectOnboardingProfile}
            />
          </div>

          <label className="relative cursor-pointer group block">
            {/* Glass card */}
            <div className="relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-3xl p-7 sm:p-10 md:p-16 border-[0.5px] border-orange-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-orange-500/40 hover:shadow-[inset_4px_4px_12px_rgba(0,0,0,0.6),inset_-2px_-2px_8px_rgba(255,255,255,0.02)] hover:translate-y-[2px] active:shadow-[inset_6px_6px_16px_rgba(0,0,0,0.7),inset_-2px_-2px_6px_rgba(255,255,255,0.01)] active:translate-y-[4px] transition-all duration-200">

            <div className="relative z-10 text-center">
              {/* Icon */}
              <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-6 rounded-2xl bg-slate-900 border border-orange-500/30 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] flex items-center justify-center group-hover:translate-y-[2px] group-active:translate-y-[4px] transition-transform duration-200">
                <svg className="w-10 h-10 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">{i18nService.t('upload.title')}</h2>
              <p className="text-sm text-slate-500">{i18nService.t('upload.description')}</p>

              {/* Supported formats */}
              <div className="mt-6 flex gap-2 justify-center flex-wrap">
                {['WAV', 'MP3', 'FLAC', 'AIFF'].map(fmt => (
                  <span key={fmt} className="text-[10px] px-2 py-1 bg-white/5 rounded text-slate-500 border border-white/5 hover:border-orange-500/40 hover:text-orange-400 transition-all duration-300 cursor-default">{fmt}</span>
                ))}
              </div>
            </div>
          </div>
          <input data-testid="single-upload-input" type="file" onChange={handleFileUpload} className="hidden" accept="audio/*" />
        </label>

        <section className="mt-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">In-App Recording (Beta)</p>
              <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-100">Record into Echo, then mix/master instantly</h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                Logic-style flow: track vocals here, then jump directly into analysis and mastering.
              </p>
            </div>
            <div className="w-full max-w-xl space-y-3">
              <AudioDeviceSelector
                selectedDeviceId={recordingInputDeviceId}
                onSelectDevice={setRecordingInputDeviceId}
                channelMode={recordingChannelMode}
                onChannelModeChange={setRecordingChannelMode}
                inputLevel={inputLevel}
                disabled={recordingState === 'recording'}
              />
              <p className="text-[11px] text-slate-400">
                Supports USB interfaces, wired mics, Bluetooth headsets, and built-in device audio inputs.
              </p>
              <div className="flex gap-2">
                {recordingState !== 'recording' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void startRecording({
                        channelCount: recordingChannelMode === 'stereo' ? 2 : 1,
                        deviceId: recordingInputDeviceId || undefined
                      })
                    }
                    className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    Record Track
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex-1 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    Stop Recording
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetRecording}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-white/30 hover:text-slate-100"
                >
                  Reset
                </button>
              </div>
              {recordingState === 'stopped' && recordedAudioBlob && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleUseRecordedTake()}
                    className="w-full rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/20"
                  >
                    Load Into Single Track
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUseRecordedTakeToStems()}
                    className="w-full rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/15"
                  >
                    Load Into Multi-Stem
                  </button>
                </div>
              )}
            </div>
          </div>
          {recordedAudioUrl && recordingState === 'stopped' && (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
              <audio controls src={recordedAudioUrl} className="w-full" />
            </div>
          )}
          {recorderError && (
            <p className="mt-3 text-xs text-rose-300">{recorderError.message}</p>
          )}
        </section>

        <div className="mt-5 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setAddNextUploadToAlbum((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
              addNextUploadToAlbum
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                : 'border-white/15 bg-white/5 text-slate-400 hover:border-orange-400/40 hover:text-orange-300'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${addNextUploadToAlbum ? 'bg-emerald-300' : 'bg-slate-500'}`} />
            Add This Upload To Album
          </button>
        </div>

        <div className="mt-8 flex justify-center">
          <p className="text-xs text-slate-500 tracking-wide">
            Powered by IntentCore™
          </p>
        </div>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Step 01</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">Analyze</h3>
            <p className="mt-2 text-sm text-slate-400">Read loudness, dynamics, spectral balance, and transient behavior in seconds.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Step 02</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">Feel the AI Boost</h3>
            <p className="mt-2 text-sm text-slate-400">See your Match Score and the extra magic the engine can safely add.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Step 03</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">Master with Intent</h3>
            <p className="mt-2 text-sm text-slate-400">Apply only what helps. Quality gates block harmful moves before they touch your final.</p>
          </article>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-6 md:p-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-400/90">Why Echo Sound Lab</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">Intent-Measured Mastering</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                ESL is engineered to preserve dynamics, expose measurable change, and keep artists in control of every meaningful decision.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Telemetry</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-100 break-words">Match Score + AI Boost</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Safety</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-100 break-words">Punch Protection</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Control</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-100 break-words">Artist-Led Decisions</p>
              </div>
            </div>
          </div>
        </section>
      </div>
      )}

      {/* Loading State - Second Light OS */}
      {appState === AppState.LOADING && (
        <div className="mt-20 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl p-12 rounded-3xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-t-amber-500 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-amber-500/10" />
            </div>
            <p className="text-white font-semibold">{i18nService.t('upload.analyzingAudio')}</p>
            <p className="text-slate-500 text-sm mt-1">{i18nService.t('upload.extractingMetrics')}</p>
          </div>
        </div>
      )}

      {/* Main Workspace - Second Light OS */}
      {appState === AppState.READY && activeMode === 'SINGLE' && (
        <div className="w-full max-w-7xl space-y-4 relative z-10">
          {/* Visualizer Module */}
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
            {/* Module Header */}
            <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{i18nService.t('waveform')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePlayRawAudio}
                  disabled={!originalBuffer}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    !originalBuffer
                      ? 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed opacity-50'
                      : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:border-green-500/50'
                  }`}
                >
                  RAW
                </button>
                <button
                  onClick={handleToggleAB}
                  disabled={!hasAppliedChanges}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    !hasAppliedChanges
                      ? 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed opacity-50'
                      : isAbComparing
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/10'
                  }`}
                >
                  {!hasAppliedChanges ? i18nService.t('ab.noChanges') : isAbComparing ? i18nService.t('ab.original') : i18nService.t('ab.processed')}
                </button>
              </div>
            </div>

            {/* Visualizer Content */}
            <div className="p-5 relative">
              <Visualizer
                isPlaying={isPlaying}
                currentTime={currentPlayheadSeconds}
                buffer={isAbComparing ? originalBuffer : audioEngine.getProcessedBuffer() ?? originalBuffer}
                onSeek={(time) => audioEngine.seek(time)}
                onPlayheadUpdate={setCurrentPlayheadSeconds}
              />
              <AudioResumeGuard
                contextState={audioContextState}
                playIntent={playIntent}
                isPlaying={isPlaying}
                onCancel={() => requestStopPlayback()}
                onResume={async () => {
                  // Explicit user gesture recovery (iOS/Safari).
                  try {
                    await audioEngine.getAudioContext().resume();
                  } catch (error) {
                    console.warn('[App] AudioContext.resume() failed', error);
                  }
                  await requestStartPlayback();
                }}
              />
            </div>

            {/* Compact LUFS Stats Bar */}
            <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-bold uppercase">LUFS:</span>
                <span className="font-mono font-bold text-orange-400">{originalMetrics?.lufs?.integrated.toFixed(1) || '--'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-bold uppercase">True Peak:</span>
                <span className="font-mono font-bold text-slate-300">{originalMetrics?.lufs?.truePeak.toFixed(1) || '--'} dBTP</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-bold uppercase">LU Range:</span>
                <span className="font-mono font-bold text-slate-300">{originalMetrics?.lufs?.loudnessRange.toFixed(1) || '--'} LU</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Stem Splitter (Beta)</p>
                <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-100">Generate editable stems from this track</h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">
                  Creates Vocals, Drums, Bass, and Music, then routes straight to Multi-Stem.
                </p>
              </div>
              <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => void handleSplitToStems()}
                  disabled={!originalBuffer || stemSplitState.active}
                  title={!originalBuffer ? 'Upload a track first.' : stemSplitState.active ? 'Stem split is already running.' : 'Split track into stems.'}
                  className="rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                >
                  {stemSplitState.active ? 'Splitting…' : 'Split To Stems'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('MULTI')}
                  disabled={!generatedStems || generatedStems.length === 0}
                  title={!generatedStems || generatedStems.length === 0 ? 'No stems available yet. Split a track first.' : 'Open stems workspace.'}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-slate-500"
                >
                  Open Stems
                </button>
              </div>
            </div>

            {(stemSplitState.active || stemSplitState.error || stemSplitState.step === 'complete') && (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em]">
                  <span className="text-slate-400">
                    {stemSplitState.error
                      ? 'Split Failed'
                      : stemSplitState.step === 'complete'
                        ? 'Split Complete'
                        : stemSplitState.step === 'transcribing'
                          ? 'Analyzing Stems'
                          : 'Separating Audio'}
                  </span>
                  <div className="flex items-center gap-2">
                    {stemSplitState.step === 'complete' && stemSplitState.confidenceBand && (
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em]',
                          stemSplitState.confidenceBand === 'high'
                            ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                            : stemSplitState.confidenceBand === 'medium'
                              ? 'border-amber-400/35 bg-amber-500/10 text-amber-300'
                              : 'border-red-400/35 bg-red-500/10 text-red-300'
                        )}
                      >
                        Confidence {stemSplitState.confidenceScore ?? '--'}%
                      </span>
                    )}
                    <span className="font-mono text-orange-300">{Math.round(stemSplitState.progress)}%</span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500/60 to-orange-300/90 transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, stemSplitState.progress))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {stemSplitState.error
                    ? stemSplitState.error
                    : stemSplitState.step === 'complete'
                      ? `Ready in ${stemSplitState.mode === 'mock' ? 'beta mock' : 'demucs'} mode.`
                      : 'Keep this tab open while split processing finishes.'}
                </p>
                {stemSplitState.step === 'complete' && stemSplitState.confidenceReason && (
                  <p className="mt-1 text-[11px] text-slate-500">{stemSplitState.confidenceReason}</p>
                )}
                {stemSplitState.step === 'complete' && stemSplitState.manualFallbackRecommended && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenManualStemUpload}
                      className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
                    >
                      Use Manual Stems
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Best for release-critical mixes when split confidence is low.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Engineer Templates</p>
                <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-100">Apply mix/master intent in one click</h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">
                  Signature-inspired starting points for non-technical creators.
                </p>
              </div>
              <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-2">
                <select
                  value={selectedEngineerTemplateId}
                  onChange={(event) => setSelectedEngineerTemplateId(event.target.value)}
                  className="rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-orange-400/50"
                >
                  {engineerTemplateOptions.length === 0 && (
                    <option value="">No templates found</option>
                  )}
                  {engineerTemplateOptions.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleApplyEngineerTemplate()}
                  disabled={!originalBuffer || engineerTemplateOptions.length === 0 || isApplyingEngineerTemplate}
                  title={
                    !originalBuffer
                      ? 'Upload or record a track first.'
                      : engineerTemplateOptions.length === 0
                        ? 'No templates available.'
                        : isApplyingEngineerTemplate
                          ? 'Template is applying...'
                          : 'Apply selected engineer template.'
                  }
                  className="rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                >
                  {isApplyingEngineerTemplate ? 'Applying…' : 'Apply Template'}
                </button>
              </div>
            </div>
            {selectedEngineerTemplate && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-400">{selectedEngineerTemplate.description}</p>
                {recommendedEngineerTemplate && (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-emerald-200">
                        Suggested for this track: <span className="font-semibold">{recommendedEngineerTemplate.name}</span>
                      </p>
                      {recommendedEngineerTemplate.id !== selectedEngineerTemplateId && (
                        <button
                          type="button"
                          onClick={() => setSelectedEngineerTemplateId(recommendedEngineerTemplate.id)}
                          className="rounded-md border border-emerald-300/40 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition-colors hover:bg-emerald-500/30"
                        >
                          Use Suggestion
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {selectedEngineerTemplateNote && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Signature</p>
                      <p className="mt-1 text-[11px] text-slate-300">{selectedEngineerTemplateNote.signature}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Best For</p>
                      <p className="mt-1 text-[11px] text-slate-300">{selectedEngineerTemplateNote.focus}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Chain DNA</p>
                      <p className="mt-1 text-[11px] text-slate-300">{selectedEngineerTemplateNote.chain}</p>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Intent Strength</p>
                    <p className="text-[11px] font-semibold text-orange-300">{engineerTemplateIntent}% · {engineerTemplateIntentLabel}</p>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={engineerTemplateIntent}
                    onChange={(event) => setEngineerTemplateIntent(Number(event.target.value))}
                    className="mt-2 w-full accent-orange-400"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Slide left for subtle polish, right for a more aggressive engineer pass.
                  </p>
                </div>
              </div>
            )}
          </div>

          {engineMode === 'FRIENDLY' ? (
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/35 bg-orange-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-orange-200">
                Onboarding: {onboardingProfile === 'first_song' ? 'First Song' : onboardingProfile === 'artist_fast_path' ? 'Artist Fast Path' : 'Engineer Advanced'}
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Creator Journey</p>
              <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-100">Don’t worry about terms. Just follow the path.</h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                Guided flow: Record/Upload {'->'} Analyze {'->'} Mix {'->'} Master {'->'} Video. One active step at a time.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-left text-xs sm:text-sm font-semibold text-emerald-200">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">Step 0</span>
                  Record / Upload
                  <p className="mt-1 text-[11px] text-emerald-300/80">
                    {friendlyStepIsDone.upload ? 'Done' : 'Load a track first.'}
                  </p>
                </div>

                <div className="rounded-xl border border-sky-400/35 bg-sky-500/10 p-2">
                  <button
                    type="button"
                    onClick={() => void handleRequestAIAnalysis({ autoSelectAll: true })}
                    disabled={!!friendlyAnalyzeReason}
                    className="w-full rounded-lg px-2 py-2 text-left text-xs sm:text-sm font-semibold text-sky-200 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-sky-300/90">Step 1</span>
                    Analyze My Song
                  </button>
                  <p className="mt-1 px-2 text-[11px] text-slate-400">{friendlyAnalyzeReason || (friendlyStepIsDone.analyze ? 'Done' : 'Ready now.')}</p>
                </div>

                <div className="rounded-xl border border-orange-400/35 bg-orange-500/10 p-2">
                  <button
                    type="button"
                    onClick={() => void handleApplySuggestions()}
                    disabled={!!friendlyMixReason}
                    className="w-full rounded-lg px-2 py-2 text-left text-xs sm:text-sm font-semibold text-orange-200 transition-colors hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-orange-300/90">Step 2</span>
                    Mix For Me
                  </button>
                  <p className="mt-1 px-2 text-[11px] text-slate-400">{friendlyMixReason || (friendlyStepIsDone.mix ? 'Done' : 'Ready now.')}</p>
                </div>

                <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-2">
                  <button
                    type="button"
                    onClick={() => void handleAutoMix()}
                    disabled={!!friendlyMasterReason}
                    className="w-full rounded-lg px-2 py-2 text-left text-xs sm:text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">Step 3</span>
                    Master My Song
                  </button>
                  <p className="mt-1 px-2 text-[11px] text-slate-400">{friendlyMasterReason || (friendlyStepIsDone.master ? 'Done' : 'Ready now.')}</p>
                </div>

                <div className="rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/10 p-2">
                  <button
                    type="button"
                    onClick={handleOpenVideoWorkspace}
                    disabled={!!friendlyVideoReason}
                    className="w-full rounded-lg px-2 py-2 text-left text-xs sm:text-sm font-semibold text-fuchsia-200 transition-colors hover:bg-fuchsia-500/15 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-fuchsia-300/90">Step 4</span>
                    Open SFS Video
                  </button>
                  <p className="mt-1 px-2 text-[11px] text-slate-400">{friendlyVideoReason || (friendlyStepIsDone.video ? 'Done' : 'Ready now.')}</p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                Current active step: <span className="text-orange-300 uppercase tracking-[0.16em]">{activeFriendlyJourneyStep}</span>
              </p>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Advanced Shortcuts</p>
                  <p className="mt-1 text-sm text-slate-300">Logic-style speed lane: direct action triggers with engineering context.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRequestAIAnalysis({ autoSelectAll: true })}
                    disabled={showProcessingOverlay || isAutoMixing}
                    title={showProcessingOverlay || isAutoMixing ? 'Processing in progress.' : 'Analyze current track.'}
                    className="rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApplySuggestions()}
                    disabled={showProcessingOverlay || isAutoMixing || !analysisResult}
                    title={
                      showProcessingOverlay || isAutoMixing
                        ? 'Processing in progress.'
                        : !analysisResult
                          ? 'Upload and analyze a track first.'
                          : 'Apply selected mix actions.'
                    }
                    className="rounded-lg border border-orange-400/35 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Mix
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAutoMix()}
                    disabled={showProcessingOverlay || isAutoMixing || !analysisResult}
                    title={
                      showProcessingOverlay || isAutoMixing
                        ? 'Processing in progress.'
                        : !analysisResult
                          ? 'Run analysis first.'
                          : 'Run automix/master pass.'
                    }
                    className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Master
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenVideoWorkspace}
                    className="rounded-lg border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-200 transition-colors hover:bg-fuchsia-500/15"
                  >
                    Video
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Disabled actions explain why inline in Friendly mode. Switch back anytime from the mode toggle.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Active Chain</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-100">Exactly what is running now</h3>
                </div>
                <button
                  type="button"
                  onClick={() => void copyDebugInfo()}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-orange-400/40 hover:text-orange-300"
                >
                  Copy Debug
                </button>
              </div>
              {activeChainView.activeProcessors.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {activeChainView.activeProcessors.map((processor) => (
                    <li key={processor.id} className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                      <p className="font-semibold text-slate-200">{processor.label}</p>
                      <p className="text-[11px] text-slate-400">{processor.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
                  No active processors. Signal path is currently raw/neutral.
                </p>
              )}
              <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Applied Actions</p>
                <p className="mt-1 text-sm text-slate-300">
                  {activeChainView.appliedActions.length > 0
                    ? activeChainView.appliedActions.join(' · ')
                    : 'None yet'}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">What Changed</p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">Plain-English before/after with loudness-matched A/B</h3>
              {whatChangedSummary ? (
                <>
                  <p className="mt-3 text-sm text-slate-300">{whatChangedSummary.plainEnglish}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Integrated LUFS</p>
                      <p className="mt-1 text-sm text-slate-200">{whatChangedSummary.beforeLufs.toFixed(1)} {'->'} {whatChangedSummary.afterLufs.toFixed(1)}</p>
                      <p className="text-[11px] text-orange-300">{whatChangedSummary.loudnessText}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Peak Shift</p>
                      <p className="mt-1 text-sm text-slate-200">{whatChangedSummary.peakText}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Dynamics Shift</p>
                      <p className="mt-1 text-sm text-slate-200">{whatChangedSummary.dynamicText}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAB}
                    disabled={abDisabled}
                    className="mt-3 rounded-lg border border-orange-400/40 bg-orange-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-200 transition-colors hover:bg-orange-500/18 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Loudness-Matched A/B
                  </button>
                  {abDisabled && (
                    <p className="mt-1 text-[11px] text-slate-500">Apply a process first to enable A/B.</p>
                  )}
                </>
              ) : (
                <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
                  Process your track once and this panel will explain exactly what changed.
                </p>
              )}
            </div>
          </div>

          <ProjectTimelineView
            trackKey={currentFileName || 'untitled-track'}
            durationSeconds={originalMetrics?.duration || originalBuffer?.duration || 180}
            onSeek={(time) => {
              audioEngine.seek(time);
              setCurrentPlayheadSeconds(time);
            }}
          />

          <CollaborationPanel
            trackName={currentFileName || 'Untitled Track'}
            revisionLog={revisionLog}
          />

          {/* Sonic Analysis - Above Advanced Tools */}
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden p-5">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-slate-200">Sonic Analysis</h2>
              <span className="flex-shrink-0 px-3 py-1 bg-slate-800 rounded-full text-xs font-bold text-orange-500 uppercase tracking-wide border border-slate-700">
                {analysisResult.genrePrediction || 'Unknown Genre'}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <div className="text-xs text-slate-500 uppercase font-bold mb-1">Loudness (RMS)</div>
                <div className="text-lg font-mono font-bold text-slate-200">{originalMetrics!.rms.toFixed(1)} dB</div>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <div className="text-xs text-slate-500 uppercase font-bold mb-1">Dynamic Range</div>
                <div className="text-lg font-mono font-bold text-slate-200">{(originalMetrics!.peak - originalMetrics!.rms).toFixed(1)} dB</div>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <div className="text-xs text-slate-500 uppercase font-bold mb-1">Peak Level</div>
                <div className={`text-lg font-mono font-bold ${originalMetrics!.peak > -0.1 ? 'text-red-500' : 'text-slate-200'}`}>
                  {originalMetrics!.peak.toFixed(1)} dB
                </div>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <div className="text-xs text-slate-500 uppercase font-bold mb-1">Spectral Balance</div>
                <div className="text-lg font-mono font-bold text-slate-200">Balanced</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Album Dashboard</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">Intent-Measured Cohesion</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Build Album DNA by toggling "Add This Upload To Album" before each upload.
                </p>
              </div>
              <button
                type="button"
                onClick={handleHarmonizeAlbum}
                disabled={!batchState.profile || cohesionTracks.length < 2}
                title={!batchState.profile || cohesionTracks.length < 2 ? 'Add at least 2 tracks to build album DNA first.' : 'Harmonize album tone and dynamics.'}
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:text-slate-500"
              >
                Harmonize
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Tracks In Album</p>
                <p className="mt-2 text-2xl font-bold text-slate-100">{cohesionTracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Vibe Match (Current)</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">{currentTrackMatchScore ?? '--'}{typeof currentTrackMatchScore === 'number' ? '%' : ''}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Vibe Match (Album)</p>
                <p className="mt-2 text-2xl font-bold text-orange-300">{albumAverageMatch ?? '--'}{typeof albumAverageMatch === 'number' ? '%' : ''}</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-500">
                <span>Weight</span>
                <span>{batchState.profile ? Math.round(batchState.profile.harmonicWeight * 100) : 65}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={batchState.profile ? Math.round(batchState.profile.harmonicWeight * 100) : 65}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setBatchState(prev => ({
                    ...prev,
                    profile: prev.profile
                      ? { ...prev.profile, harmonicWeight: Math.max(0, Math.min(1, value / 100)) }
                      : prev.profile,
                  }));
                }}
                className="w-full accent-orange-400"
              />
            </div>
          </div>

          {/* Listening Pass Card - Phase 4 */}
          <ListeningPassCard
            listeningPassData={listeningPassData}
            llmGuidance={llmGuidance}
          />

          {/* AI Recommendations Panel - Full Width */}
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
            <AnalysisPanel
              engineMode={engineMode}
              analysisResult={analysisResult}
              onReferenceUpload={handleReferenceUpload}
              referenceMetrics={referenceTrack?.metrics || null}
              referenceTrack={referenceTrack}
              onClearReference={handleClearReference}
              isLoadingReference={isLoadingReference}
              onApplySuggestions={handleApplySuggestions}
              onImproveMyMix={handleImproveMyMix}
              onToggleSuggestion={handleToggleSuggestion}
              appliedSuggestionIds={appliedSuggestionIds}
              isProcessing={showProcessingOverlay}
              applySuggestionsError={applySuggestionsError}
              selectedSuggestionCount={selectedSuggestionCount}
              mixReadiness="in_progress"
              onRequestAIAnalysis={handleRequestAIAnalysis}
              echoReportStatus={echoReportStatus}
              onRemoveAppliedSuggestion={handleRemoveAppliedSuggestion}
              onAutoMix={handleAutoMix}
              onCancelAutoMix={handleCancelAutoMix}
              isAutoMixing={isAutoMixing}
              autoMixProgress={autoMixProgress}
              autoMixError={autoMixError}
              autoMixMode={autoMixMode}
              onFullStudioAutoMix={handleFullStudioAutoMix}
              fullStudioStatus={fullStudioStatus}
              shadowDelta={displayTelemetry?.shadowDelta}
              quantumConfidence={displayTelemetry?.quantumConfidence}
              quantumScore={displayTelemetry?.quantumScore}
              classicalScore={displayTelemetry?.classicalScore}
              humanIntentIndex={displayTelemetry?.humanIntentIndex}
              intentCoreActive={displayTelemetry?.intentCoreActive}
              preservationMode={preservationMode}
              onPreservationModeChange={setPreservationMode}
              engineVerdict={latestEngineVerdict}
              engineVerdictReason={latestEngineVerdictReason}
              onFixBlockedMix={handleFixBlockedMix}
              isFixingBlockedMix={isFixingBlockedMix}
              debugTelemetry={debugTelemetry}
            />
          </div>

          {/* Echo Report Panel */}
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
            <EchoReportPanel
              echoReport={echoReport}
              onApplyEchoAction={handleApplyEchoAction}
              isProcessing={showProcessingOverlay}
              echoActionStatus={echoActionStatus}
              echoActionError={echoActionError}
              revisionLog={revisionLog}
              onRevertRevision={async () => {
                setShowHistoryTimeline(true);
                showNotification('Open History Timeline to revert to a previous state.', 'info', 2600);
              }}
              onShowRevisionLogModal={() => setShowHistoryTimeline(true)}
              echoReportStatus={echoReportStatus}
              onRetryEchoReport={handleGenerateEchoReport}
              onShowSystemCheck={handleOpenSSC}
              onCopyDebugLog={copyDebugInfo}
              referenceTrackName={referenceTrack?.name}
              // V.E.N.U.M. props
              beforeMetrics={originalMetrics}
              afterMetrics={processedMetrics}
              trackName={currentFileName}
              processedConfig={currentConfig}
            />
          </div>

          <RenderQueuePanel
            jobs={renderQueueJobs}
            onQueue={enqueueRenderJob}
            onDownload={downloadRenderJob}
            disabled={!originalBuffer}
          />

          {/* Processing Controls - Below Echo Report */}
          {originalMetrics && (
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
              <ProcessingPanel
                originalMetrics={originalMetrics}
                processedMetrics={processedMetrics}
                onCommit={handleCommit}
                onConfigChange={handleConfigChange}
                onUserInteraction={() => {
                  hasUserInitiatedProcessingRef.current = true;
                }}
                isCommitting={isCommitting}
                echoReport={echoReport}
                onToggleAB={handleToggleAB}
                isAbComparing={isAbComparing}
                isPlaying={isPlaying}
                onTogglePlayback={handleTogglePlayback}
                onExportComplete={() => setShowExportSharePrompt(true)}
                hasAppliedChanges={hasAppliedChanges}
                abLabel={abPanelLabel}
                abDisabled={abDisabled}
                eqSettings={eqSettings}
                setEqSettings={setEqSettings}
                dynamicEq={dynamicEq}
                setDynamicEq={setDynamicEq}
              />
            </div>
          )}

        </div>
      )}

      {/* Multi-Stem Mode */}
      {activeMode === 'MULTI' && (
        <div className="w-full max-w-6xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <ErrorBoundary
            title="Stems workspace hit an error."
            onReset={() => setWorkspaceNonce((p) => ({ ...p, MULTI: p.MULTI + 1 }))}
          >
            <React.Suspense fallback={<div className="p-6 text-slate-400 text-sm">Loading Stems…</div>}>
              <MultiStemWorkspace key={`multi-${workspaceNonce.MULTI}`} initialStems={generatedStems || undefined} />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* AI Studio Mode */}
      {activeMode === 'AI_STUDIO' && (
        <div className="w-full max-w-6xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <ErrorBoundary
            title="AI Studio hit an error."
            onReset={() => setWorkspaceNonce((p) => ({ ...p, AI_STUDIO: p.AI_STUDIO + 1 }))}
          >
            <React.Suspense fallback={<div className="p-6 text-slate-400 text-sm">Loading AI Studio…</div>}>
              <AIStudio
                key={`ai-${workspaceNonce.AI_STUDIO}`}
                onSongGenerated={handleSongGenerated}
                onSongOpenSingleTrack={handleSongOpenSingleTrack}
              />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* Video Engine Mode */}
      {activeMode === 'VIDEO' && (
        <div className="w-full max-w-6xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <ErrorBoundary
            title="Video Engine hit an error."
            onReset={() => setWorkspaceNonce((p) => ({ ...p, VIDEO: p.VIDEO + 1 }))}
          >
            <React.Suspense fallback={<div className="p-6 text-slate-400 text-sm">Loading Video Engine…</div>}>
              <VideoEngine key={`video-${workspaceNonce.VIDEO}`} />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      )}

      </main>

      {showFriendlyTour && (
        <div className="fixed right-6 top-24 z-[90] w-[340px] max-w-[90vw]">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-orange-500/20 rounded-2xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-orange-300 uppercase tracking-wider font-bold">
                Start Here · {friendlyTourStep + 1}/{friendlyTourSteps.length}
              </div>
              <button
                onClick={dismissFriendlyTour}
                className="text-slate-500 hover:text-slate-300 text-xs uppercase tracking-wider font-semibold"
              >
                Skip
              </button>
            </div>
            <h4 className="text-lg font-bold text-white mb-2">
              {friendlyTourSteps[friendlyTourStep]?.title}
            </h4>
            <p className="text-sm text-slate-400 mb-4">
              {friendlyTourSteps[friendlyTourStep]?.body}
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={handleFriendlyTourBack}
                disabled={friendlyTourStep === 0}
                className={`text-xs uppercase tracking-wider font-semibold px-3 py-2 rounded-lg border ${
                  friendlyTourStep === 0
                    ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
                }`}
              >
                Back
              </button>
              <button
                onClick={handleFriendlyTourNext}
                className="text-xs uppercase tracking-wider font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-[0_6px_16px_rgba(249,115,22,0.3)]"
              >
                {friendlyTourStep >= friendlyTourSteps.length - 1 ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FeedbackButton onClick={() => showNotification('Feedback draft opened in your email app.', 'info', 2200)} />

      {/* Mode Switcher - Always Visible */}
      <div
        className="fixed left-6 z-50 flex gap-2 items-center"
        style={{ bottom: `calc(24px + var(--esl-safe-bottom) + ${cornerUiOffsetPx}px)` }}
      >
        <div className="flex gap-3 items-center group/mode-switcher">
          <button
            data-testid="engine-mode-toggle"
            onClick={() => {
              const newMode = engineMode === 'FRIENDLY' ? 'ADVANCED' : 'FRIENDLY';
              setEngineMode(newMode);
            }}
            className={`w-14 h-14 rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] transition-all flex items-center justify-center group relative ${
              engineMode === 'ADVANCED' ? 'bg-slate-900 text-green-500 hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(34,197,94,0.05)]' : 'bg-slate-900 text-blue-400 hover:text-green-400 hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(34,197,94,0.05)]'
            } active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9)] active:translate-y-[1px]`}
          >
            {engineMode === 'FRIENDLY' ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}

            {/* Tooltip on hover */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-3 bg-slate-900/95 backdrop-blur-xl rounded-lg border border-slate-700/50 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 text-left">
              <p className="text-xs text-slate-200 font-medium leading-relaxed">
                {engineMode === 'FRIENDLY' ? (
                  <>
                    <span className="font-bold text-blue-400">Friendly</span>
                    <br />
                    <span className="text-slate-400">Fix problems</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-green-400">Advanced</span>
                    <br />
                    <span className="text-slate-400">Fix + Add effects</span>
                  </>
                )}
              </p>
              {/* Tooltip arrow */}
              <div className="absolute right-full top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900/95 border-l border-t border-slate-700/50 rotate-45" />
            </div>
          </button>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {engineMode === 'FRIENDLY' ? 'Friendly' : 'Advanced'} Mode
          </div>
        </div>

        {/* Advanced Tools Button (next to mode switcher on left) */}
        {appState !== AppState.IDLE && (
          <button
            data-testid="advanced-tools-toggle"
            onClick={() => engineMode === 'ADVANCED' && setShowAdvancedTools(!showAdvancedTools)}
            disabled={engineMode === 'FRIENDLY'}
            className={`w-14 h-14 rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] transition-all flex items-center justify-center group ${
              engineMode === 'FRIENDLY'
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 shadow-none'
                : showAdvancedTools
                ? 'bg-slate-900 text-orange-400 hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(249,115,22,0.06)]'
                : 'bg-slate-900 text-slate-400 hover:text-sky-400 hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(59,130,246,0.05)]'
            } active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9)] active:translate-y-[1px]`}
            title={engineMode === 'FRIENDLY' ? 'Switch to Advanced Mode to access character tools' : 'Advanced Tools'}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        )}

      </div>

      {/* Echo Chat Button - Right side */}
      {appState !== AppState.IDLE && (
        <button
          onClick={() => setShowEchoChat(true)}
          style={{ bottom: `calc(24px + var(--esl-safe-bottom) + ${cornerUiOffsetPx}px)` }}
          className="fixed right-6 z-50 w-14 h-14 bg-slate-900 text-orange-400 rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03),_0_0_20px_rgba(251,146,60,0.03)] hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(251,146,60,0.05)] hover:text-orange-300 active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9)] active:translate-y-[1px] transition-all flex items-center justify-center group"
          title="Open Echo Chat"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Advanced Tools Modal */}
      {showAdvancedTools && (
        <div data-testid="advanced-tools-modal" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-700/50 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828] w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-orange-500/30 flex items-center justify-center shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]">
                  <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Advanced Tools</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Professional controls</p>
                </div>
              </div>
              <button
                data-testid="advanced-tools-close"
                onClick={() => setShowAdvancedTools(false)}
                className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <EnhancedControlPanel
                onConfigApply={handleEnhancedConfigApply}
                onPluginChange={handlePluginChange}
                currentConfig={currentConfig}
                eqSettings={eqSettings}
                setEqSettings={setEqSettings}
                dynamicEq={dynamicEq}
                setDynamicEq={setDynamicEq}
              />
            </div>
          </div>
        </div>
      )}

      {/* Echo Chat Modal */}
      {showEchoChat && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-700/50 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828] w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-orange-500/30 flex items-center justify-center shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]">
                  <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Echo Chat</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Ask me anything</p>
                </div>
              </div>
              <button
                onClick={() => setShowEchoChat(false)}
                className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-hidden">
              <ChatInterface />
            </div>
          </div>
        </div>
      )}

      {/* Floating Controls (Play/Pause/AB) */}
      {appState === AppState.READY && activeMode === 'SINGLE' && (
        <FloatingControls
          isPlaying={isPlaying}
          onTogglePlayback={handleTogglePlayback}
          currentTime={currentPlayheadSeconds}
          duration={originalBuffer?.duration || 0}
          isAbComparing={isAbComparing}
          onToggleAB={handleToggleAB}
          hasAppliedChanges={hasAppliedChanges}
          abLabel={abFloatingLabel}
          abDisabled={abDisabled}
          onSeek={(time) => audioEngine.seek(time)}
        />
      )}

      {/* Floating version badge - Second Light OS */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 backdrop-blur-xl bg-black/60 px-3 py-1.5 rounded-lg text-[10px] text-slate-500 border border-white/5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Second Light OS
      </div>

      {/* V.E.N.U.M. Export Share Prompt */}
      {showExportSharePrompt && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm animate-in slide-in-from-right">
          <NudgeBanner
            text="Master exported! Create a share card to flex your work?"
            actionLabel="Create Card"
            onAction={async () => {
              setShowExportSharePrompt(false);
              if (processedMetrics) {
                try {
                  const options: GenerateEchoReportCardOptions = {
                    trackName: currentFileName || 'Mastered Track',
                    report: echoReport || undefined,
                    beforeMetrics: originalMetrics || undefined,
                    afterMetrics: processedMetrics,
                    lufs: processedMetrics.lufs?.integrated,
                    dynamicRange: processedMetrics.crestFactor,
                    verdict: echoReport?.verdict,
                    improvementPercent: originalMetrics && processedMetrics
                      ? Math.round(Math.abs((processedMetrics.lufs?.integrated || -14) - (originalMetrics.lufs?.integrated || -20)) * 10)
                      : undefined,
                    processedConfig: currentConfig, // Pass currentConfig here
                  };
                  const card = await generateEchoReportCard(options);
                  setExportShareCard(card);
                  setShowExportShareModal(true);
                } catch (err) {
                  console.error('Failed to generate share card:', err);
                }
              }
            }}
            onDismiss={() => setShowExportSharePrompt(false)}
          />
        </div>
      )}

      {/* V.E.N.U.M. Export Share Modal */}
      {showExportShareModal && exportShareCard && (
        <ShareableCardModal
          card={exportShareCard}
          onClose={() => {
            setShowExportShareModal(false); // Corrected: was setShowShareModal
            setExportShareCard(null);
          }}
          nudgeText="Show off those stats!"
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          engineMode={engineMode}
          setEngineMode={setEngineMode}
          onResetToOriginal={handleResetToOriginal}
          appVersion={appVersion}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          networkSettings={networkSettings}
          setNetworkSettings={setNetworkSettings}
          onCopyDebugInfo={copyDebugInfo}
          onClearDebugInfo={() => {
            debugTelemetryService.clearErrors();
            showNotification('Debug log cleared', 'success', 2000);
          }}
        />
      )}

      {/* History Timeline */}
      {showHistoryTimeline && (
        <HistoryTimeline
          isOpen={showHistoryTimeline}
          onClose={() => setShowHistoryTimeline(false)}
          onJumpToEntry={handleJumpToHistoryEntry}
          onSetSnapshotA={handleSetSnapshotA}
          onSetSnapshotB={handleSetSnapshotB}
          snapshotAId={snapshotAId}
          snapshotBId={snapshotBId}
          snapshotALabel={snapshotALabel}
          snapshotBLabel={snapshotBLabel}
          snapshotABActive={snapshotABActive}
          onClearSnapshotAB={handleClearSnapshotAB}
        />
      )}

      {/* Capability ACC Modal (Phase 2.2.4) */}
      <CapabilityACCModal
        isOpen={showAccModal}
        token={accToken}
        reason={accReason}
        onConfirm={handleAccConfirm}
        onDismiss={handleAccDismiss}
        isLoading={accIsLoading}
      />

      {/* Notification System */}
      <NotificationManager
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      {/* Phase 2: APL ProposalPanel - Intelligence Feed Sidebar */}
      {appState === AppState.READY && aplProposals.length > 0 && (
        <APLProposalPanel
          proposals={aplProposals}
          isScanning={isAplScanning}
          onApplyDirect={handleAplApplyDirect}
          onAuthorizeGated={handleAplAuthorizeGated}
        />
      )}

      {/* Demo Dashboard (Ghost System Modal) */}
      {showDemoMode && (
        <DemoDashboard
          onClose={() => setShowDemoMode(false)}
          demoDirector={demoDirector}
        />
      )}

      </div>
    </CapabilityProvider>
  );
};

export default App;
