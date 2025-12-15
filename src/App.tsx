import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AudioMetrics, ProcessingConfig, Suggestion, EchoReport, RevisionEntry, ReferenceTrack, MixSignature, GeneratedSong, Stem } from './types';
import { audioEngine } from './services/audioEngine';
import { mixAnalysisService } from './services/mixAnalysis';
import Visualizer from './components/Visualizer';
import ChatInterface from './components/ChatInterface';
import { ProcessingPanel } from './components/ProcessingPanel';
import AnalysisPanel from './components/AnalysisPanel';
import MultiStemWorkspace from './components/MultiStemWorkspace';
import AIStudio from './components/AIStudio';
import { EchoReportPanel } from './components/EchoReportPanel';
import { FeedbackButton } from './components/SharedComponents';
import { storageService } from './services/storageService';
import { runSafeAsync } from './utils/safeAsync';
import SettingsPanel from './components/SettingsPanel';
import { i18nService } from './services/i18nService';

// NEW: Import enhanced features
import { EnhancedControlPanel } from './components/EnhancedControlPanel';
import { PhaseCorrelationMeter, StereoFieldMeter, LUFSMeter } from './components/AdvancedMeters';
import { historyManager } from './services/historyManager';
import { sessionManager, SessionState } from './services/sessionManager';
import { DiagnosticsOverlay, useDiagnosticsToggle } from './components/DiagnosticsOverlay';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { FloatingControls } from './components/FloatingControls';
import { HistoryTimeline } from './components/HistoryTimeline';
import { HistoryEntry } from './types';

// V.E.N.U.M. - Viral Emergent Network Utility Matrix
import { generateEchoReportCard, ShareableCard, GenerateEchoReportCardOptions } from './services/venumEngine';
import { ShareableCardModal, NudgeBanner } from './components/ShareableCardModal';

// Notification System
import { NotificationManager, NotificationType } from './components/Notification';

declare var process: { env: Record<string, string | undefined> };

const App: React.FC = () => {
  // Core state
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [activeMode, setActiveMode] = useState<'SINGLE' | 'MULTI' | 'AI_STUDIO'>('SINGLE');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayheadSeconds, setCurrentPlayheadSeconds] = useState(0);

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

  // Echo Report state
  const [echoReport, setEchoReport] = useState<EchoReport | null>(null);
  const [echoReportStatus, setEchoReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [echoActionStatus, setEchoActionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [echoActionError, setEchoActionError] = useState<string | null>(null);

  // Processing state
  const [currentConfig, setCurrentConfig] = useState<ProcessingConfig>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const [isAbComparing, setIsAbComparing] = useState(false);
  const [revisionLog, setRevisionLog] = useState<RevisionEntry[]>([]);
  const [hasAppliedChanges, setHasAppliedChanges] = useState(false); // Track if any processing has been applied
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null); // Keep pristine original

  // UI state
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionState | null>(null);
  const [showExportSharePrompt, setShowExportSharePrompt] = useState(false);
  const [exportShareCard, setExportShareCard] = useState<ShareableCard | null>(null);
  const [showExportShareModal, setShowExportShareModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);
  const [showEchoChat, setShowEchoChat] = useState(false);
  const [, forceUpdate] = useState({});

  // AI Studio / Generated Song state
  const [generatedStems, setGeneratedStems] = useState<Stem[] | null>(null);

  // Processing Overlay State
  const [showProcessingOverlay, setShowProcessingOverlay] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

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

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Diagnostics overlay (~ key toggle)
  const { isVisible: showDiagnostics, setIsVisible: setShowDiagnostics } = useDiagnosticsToggle();

  // Session autosave - check for existing session on mount
  useEffect(() => {
    const savedSession = sessionManager.init();
    if (savedSession && savedSession.fileName) {
      setPendingSession(savedSession);
      setShowRestoreDialog(true);
    }
    sessionManager.startAutosave();
    return () => sessionManager.stopAutosave();
  }, []);

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
    if (appState === AppState.READY) {
      sessionManager.updateSession({
        fileName: currentFileName,
        config: currentConfig,
        isAbComparing,
        playheadSeconds: currentPlayheadSeconds,
        appliedSuggestionIds,
        echoReportSummary: echoReport?.summary || null,
        activeMode,
      });
    }
  }, [currentConfig, isAbComparing, currentPlayheadSeconds, appliedSuggestionIds, echoReport, activeMode, appState, currentFileName]);

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

  // Handle restore session
  const handleRestoreSession = () => {
    if (pendingSession) {
      setCurrentConfig(pendingSession.config);
      setIsAbComparing(pendingSession.isAbComparing);
      setCurrentPlayheadSeconds(pendingSession.playheadSeconds);
      setAppliedSuggestionIds(pendingSession.appliedSuggestionIds);
      setActiveMode(pendingSession.activeMode);
      // Note: We can't restore the actual audio file, user needs to re-upload
      setShowRestoreDialog(false);
      setPendingSession(null);
    }
  };

  // Handle dismiss restore
  const handleDismissRestore = () => {
    sessionManager.clearSession();
    setShowRestoreDialog(false);
    setPendingSession(null);
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size upfront - CRITICAL for Google AI Studio
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File selected: ${file.name}, Size: ${fileSizeMB.toFixed(2)}MB`);

    // Warn for very large files
    if (fileSizeMB > 50) {
      alert(`File is quite large (${fileSizeMB.toFixed(1)}MB). Processing may take some time.`);
    }

    setAppState(AppState.LOADING);
    setCurrentFileName(file.name);

    // Show loading immediately
    const loadPromise = runSafeAsync(async () => {
      console.log('[1] Starting audio load...');
      const startTime = Date.now();

      // Load audio file - this is the slow part for large files
      const buffer = await audioEngine.loadFile(file);
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
      setProcessedMetrics(metrics);
      setOriginalBuffer(buffer); // Store pristine original for A/B and reprocessing
      setHasAppliedChanges(false); // Reset on new file

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

      setAppState(AppState.READY);

      // DON'T auto-load AI recommendations - let user request them manually
      // This prevents timeout in Google AI Studio environment
    });
  };

  // Request AI Analysis manually
  const handleRequestAIAnalysis = async () => {
    if (!analysisResult || !originalMetrics || !currentFileName) return;

    setAnalysisResult((prev: any) => ({
      ...prev,
      genrePrediction: 'Analyzing...',
      suggestions: []
    }));

    try {
      const { suggestions, genre } = await import('./services/geminiService')
        .then(m => m.analyzeMixData(originalMetrics, currentFileName, 'in_progress'));

      setAnalysisResult((prev: any) => ({
        ...prev,
        suggestions,
        genrePrediction: genre
      }));
    } catch (error) {
      console.error('AI recommendations failed:', error);
      setAnalysisResult((prev: any) => ({
        ...prev,
        genrePrediction: 'Analysis Failed',
        suggestions: []
      }));
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
    setAnalysisResult((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.map((s: Suggestion) =>
          s.id === id ? { ...s, isSelected: !s.isSelected } : s
        )
      };
    });
  };

  // Apply selected AI recommendations
  const handleApplySuggestions = async (): Promise<boolean> => {
    if (!analysisResult) return false;

    const selectedSuggestions = analysisResult.suggestions.filter((s: Suggestion) => s.isSelected);
    if (selectedSuggestions.length === 0) {
      setApplySuggestionsError('Please select at least one suggestion');
      return false;
    }

    setApplySuggestionsError(null);

    await runWithSteps([
      'Suspending Audio Engine',
      'Configuring DSP Chain',
      'Applying EQ & Dynamics',
      'Rendering High-Quality Audio',
      'Analyzing Output'
    ], async () => {
      try {
        // Build config from selected suggestions
        const config: ProcessingConfig = {};

        selectedSuggestions.forEach((suggestion: Suggestion) => {
          if (suggestion.parameters?.eq) {
            config.eq = suggestion.parameters.eq;
          }
          if (suggestion.parameters?.compression) {
            config.compression = suggestion.parameters.compression;
          }
          if (suggestion.parameters?.limiter) {
            config.limiter = suggestion.parameters.limiter;
          }
        });

        // CRITICAL: Actually process the audio and create new buffer
        const processedBuffer = await audioEngine.renderProcessedAudio(config);
        audioEngine.setBuffer(processedBuffer);

        // Apply configuration for live playback
        audioEngine.applyProcessingConfig(config);
        audioEngine.enableProcessedSignal(); // Switch to processed audio
        setCurrentConfig(config);

        // Analyze the processed audio
        const newMetrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);

        // Quick LUFS estimation for speed (accurate enough for most use cases)
        const estimatedLUFS = newMetrics.rms + 3;
        newMetrics.lufs = {
          integrated: estimatedLUFS,
          shortTerm: estimatedLUFS,
          momentary: estimatedLUFS,
          loudnessRange: newMetrics.crestFactor,
          truePeak: newMetrics.peak
        };

        setProcessedMetrics(newMetrics);
        setHasAppliedChanges(true); // Mark that changes have been applied

        // Track applied suggestions
        const newAppliedIds = selectedSuggestions.map((s: Suggestion) => s.id);
        setAppliedSuggestionIds([...appliedSuggestionIds, ...newAppliedIds]);

        // Add to history
        if (originalMetrics) {
          historyManager.addEntry('preset_apply', 'Applied AI recommendations', config, newMetrics);
        }

        // Automatically trigger Echo Report generation after applying suggestions
        // Pass newMetrics directly to avoid React state timing issues
        handleGenerateEchoReport(newMetrics);

        // Show success notification
        showNotification(`${selectedSuggestions.length} fix${selectedSuggestions.length > 1 ? 'es' : ''} applied successfully`, 'success', 2000);

      } catch (error) {
        console.error('Failed to apply suggestions:', error);
        const errorMsg = 'Failed to apply suggestions: ' + (error as Error).message;
        setApplySuggestionsError(errorMsg);
        showNotification(errorMsg, 'error', 3000);
      }
    });

    return true;
  };

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

      // Call the REAL Echo Report generation service, including reference if available
      const { generateEchoReport } = await import('./services/geminiService');
      const report = await generateEchoReport(echoMetrics, currentConfig, referenceTrack || undefined, referenceSignature || undefined);

      setEchoReport(report);
      setEchoReportStatus('success');
    } catch (error) {
      console.error('Echo Report generation failed:', error);
      setEchoReportStatus('error');
    }
  };

  // Apply Echo Report action
  const handleApplyEchoAction = async (action: any): Promise<boolean> => {
    setEchoActionStatus('idle');
    setEchoActionError(null);
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
        if (action.refinementType === 'eq' && action.bands) {
          actionConfig.eq = action.bands.map((band: any) => ({
            frequency: band.freqHz,
            gain: band.gainDb,
            type: 'peaking' as any,
            q: 1.0
          }));
        }

        if (action.refinementType === 'compression' && action.params) {
          const compressionParams: any = {};
          action.params.forEach((p: any) => {
            if (p.name === 'threshold') compressionParams.threshold = p.value;
            if (p.name === 'ratio') compressionParams.ratio = p.value;
            if (p.name === 'attack') compressionParams.attack = p.value;
            if (p.name === 'release') compressionParams.release = p.value;
          });
          actionConfig.compression = compressionParams;
        }

        // Process the audio with the action config
        const processedBuffer = await audioEngine.renderProcessedAudio(actionConfig);
        audioEngine.setBuffer(processedBuffer);
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
          historyManager.addEntry('echo_action', `Applied: ${action.label}`, actionConfig, newMetrics);
        }

        showNotification('Applied Successfully', 'success', 2000);
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
    setIsCommitting(true);
    let resultMetrics: AudioMetrics | null = null;

    await runWithSteps([
        'Committing Changes',
        'Rendering Full Resolution Audio',
        'Updating Analysis'
    ], async () => {
        try {
            // Render processed audio with the config
            const processedBuffer = await audioEngine.renderProcessedAudio(config);
            audioEngine.setBuffer(processedBuffer);
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
                historyManager.addEntry('commit', 'Committed changes', config, newMetrics);
            }
            resultMetrics = newMetrics;
        } catch (error) {
            console.error('Commit failed:', error);
        }
    });

    setIsCommitting(false);
    return resultMetrics;
  };

  // Handle config changes from processing panel
  const handleConfigChange = (config: ProcessingConfig) => {
    setCurrentConfig(config);
    audioEngine.applyProcessingConfig(config);
  };

  // Handle config apply from Enhanced Control Panel
  const handleEnhancedConfigApply = async (config: ProcessingConfig) => {
    setCurrentConfig(config);
    audioEngine.applyProcessingConfig(config);

    // Render processed audio so changes are actually applied
    try {
      console.log('[App] Rendering processed audio for enhanced config...');
      const processedBuffer = await audioEngine.renderProcessedAudio(config);
      audioEngine.setBuffer(processedBuffer);
      audioEngine.enableProcessedSignal();

      // Update metrics
      const newMetrics = audioEngine.analyzeStaticMetrics(processedBuffer);
      setProcessedMetrics(newMetrics);
      setHasAppliedChanges(true);

      if (originalMetrics) {
        historyManager.addEntry('preset_apply', 'Applied preset/config', config, newMetrics);
      }

      console.log('[App] Enhanced config applied and rendered successfully');
    } catch (error) {
      console.error('[App] Failed to render enhanced config:', error);
    }
  };

  // Playback controls
  const handleTogglePlayback = () => {
    setIsPlaying(!isPlaying);
    if (isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  };

  // A/B bypass toggle - only works if changes have been applied
  const handleToggleAB = () => {
    if (!hasAppliedChanges) return; // Don't allow A/B until changes applied
    const newBypassState = !isAbComparing;
    setIsAbComparing(newBypassState);
    audioEngine.setBypass(newBypassState);
  };

  // Track Delete + Reset - returns to upload state
  const handleDeleteTrack = () => {
    if (!confirm('Delete current track and start over? All unsaved changes will be lost.')) return;

    // Stop playback
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    }

    // Clear all audio buffers
    audioEngine.setBuffer(null as any);

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
    setEchoReport(null);
    setEchoReportStatus('idle');
    setReferenceTrack(null);
    setReferenceSignature(null);
    setRevisionLog([]);

    // Clear autosave
    sessionManager.clearSession();

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
    }

    // Clear all audio buffers
    audioEngine.setBuffer(null as any);

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
    setEchoReport(null);
    setEchoReportStatus('idle');
    setReferenceTrack(null);
    setReferenceSignature(null);
    setRevisionLog([]);
    historyManager.clear();

    // Re-check for pending session and show restore dialog
    const savedSession = sessionManager.loadSession();
    if (savedSession) {
      setPendingSession(savedSession);
      setShowRestoreDialog(true);
    }

    console.log('[App] Logo clicked, returned to upload state with session preserved');
  };

  /**
   * Jump to a specific history entry and restore its state
   */
  const handleJumpToHistoryEntry = async (entry: HistoryEntry) => {
    try {
      console.log('[App] Jumping to history entry:', entry.id, entry.description);

      // Apply the config from the history entry
      setCurrentConfig(entry.config);
      audioEngine.applyProcessingConfig(entry.config);

      // Render processed audio with the historical config
      if (originalBuffer) {
        const processedBuffer = await audioEngine.renderProcessedAudio(entry.config);
        audioEngine.setBuffer(processedBuffer);
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

  // Selected suggestion count
  const selectedSuggestionCount = analysisResult?.suggestions.filter((s: Suggestion) => s.isSelected).length || 0;

  return (
    <div className="min-h-screen bg-[#0a0c12] text-slate-300 font-sans flex flex-col pb-24 relative overflow-hidden">
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

      {/* Second Light OS Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0a0c12] to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-900/5 via-transparent to-transparent" />
      </div>

      {/* System Bar - Second Light OS Style */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-black/90 via-slate-900/90 to-black/90 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogoClick}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center shadow-[0_0_15px_rgba(251,146,60,0.3)] hover:shadow-[0_0_25px_rgba(251,146,60,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Return to home"
            >
              <span className="text-white font-black text-sm">E</span>
            </button>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2"><span className="text-white">Echo</span> <span className="text-slate-400 font-normal">Sound Lab</span> <span className="text-slate-600 text-sm font-normal tracking-widest">||</span> <span className="text-slate-500 text-xs font-normal">VENICEAI LABS</span></h1>
              <p className="text-[10px] text-orange-400/70 font-medium tracking-widest uppercase mt-0.5">Second Light OS</p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-2 bg-slate-950/80 rounded-2xl p-1.5 border border-slate-800/50 shadow-[inset_2px_2px_4px_#000000,inset_-2px_-2px_4px_#0a0c12]">
            {['SINGLE', 'MULTI', 'AI_STUDIO'].map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode as any)}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  activeMode === mode
                    ? 'bg-slate-900 text-orange-400 shadow-[inset_3px_3px_6px_#050710,inset_-3px_-3px_6px_#0f1828] border border-orange-500/30'
                    : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] border border-slate-800/30 hover:border-slate-700/50'
                }`}
              >
                {mode === 'SINGLE' ? i18nService.t('modes.single') : mode === 'MULTI' ? i18nService.t('modes.multi') : i18nService.t('modes.ai')}
              </button>
            ))}
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-4">
            {currentFileName && (
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5 border border-white/5">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs text-slate-400 truncate max-w-[150px]">{currentFileName}</span>
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
            <div className="text-xs text-slate-500 font-mono">v2.5</div>
          </div>
        </div>
      </header>

      {/* Diagnostics Overlay */}
      <DiagnosticsOverlay
        isVisible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
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
              <p className="text-orange-400 font-medium truncate mb-2">{pendingSession.fileName}</p>
              <p className="text-xs text-slate-400">
                Mode: {pendingSession.activeMode} <span className="text-slate-600">//</span> {pendingSession.appliedSuggestionIds.length} suggestions applied
              </p>
            </div>

            <p className="text-xs text-slate-500 mb-6 uppercase tracking-wider">
              Your DSP settings will be restored. You'll need to re-upload the audio file.
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

      {/* Main Content Area */}
      <main className="flex-1 p-6 flex flex-col items-center relative z-10">

      {/* Upload Screen - Second Light OS Glass Card */}
      {appState === AppState.IDLE && (
        <div className="mt-20">
          <label className="relative cursor-pointer group block">
            {/* Glass card */}
            <div className="relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-3xl p-16 border-[0.5px] border-orange-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-orange-500/40 hover:shadow-[inset_4px_4px_12px_rgba(0,0,0,0.6),inset_-2px_-2px_8px_rgba(255,255,255,0.02)] hover:translate-y-[2px] active:shadow-[inset_6px_6px_16px_rgba(0,0,0,0.7),inset_-2px_-2px_6px_rgba(255,255,255,0.01)] active:translate-y-[4px] transition-all duration-200">

            <div className="relative z-10 text-center">
              {/* Icon */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-900 border border-orange-500/30 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] flex items-center justify-center group-hover:translate-y-[2px] group-active:translate-y-[4px] transition-transform duration-200">
                <svg className="w-10 h-10 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">{i18nService.t('upload.title')}</h2>
              <p className="text-sm text-slate-500">{i18nService.t('upload.description')}</p>

              {/* Supported formats */}
              <div className="mt-6 flex gap-2 justify-center">
                {['WAV', 'MP3', 'FLAC', 'AIFF'].map(fmt => (
                  <span key={fmt} className="text-[10px] px-2 py-1 bg-white/5 rounded text-slate-500 border border-white/5 hover:border-orange-500/40 hover:text-orange-400 transition-all duration-300 cursor-default">{fmt}</span>
                ))}
              </div>
            </div>
          </div>
          <input type="file" onChange={handleFileUpload} className="hidden" accept="audio/*" />
        </label>

        {/* Subtle Stats Ticker - Below Upload Card */}
        <div className="mt-11 flex flex-col items-center gap-6">
          {/* Stats */}
          <div className="flex items-center gap-8 animate-in fade-in slide-in-from-left-8 duration-700 delay-1000">
            <div className="text-center">
              <p className="text-2xl font-black text-white/90">Grammy-Level</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Audio Quality</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-black text-white/90">All-in-One</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Studio Suite</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-black text-white/90">Instant</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Results</p>
            </div>
          </div>

          {/* Simple Feature Highlights */}
          <div className="flex items-center gap-6">
            {/* 99 Club Scoring */}
            <div className="relative group/badge flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity duration-300 animate-in fade-in slide-in-from-left-6 delay-1100">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center border border-orange-500/30">
                <span className="text-orange-400 font-black text-[10px]">99</span>
              </div>
              <span className="text-xs text-slate-400">99 Club Scoring</span>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900/95 backdrop-blur-xl rounded-lg border border-orange-500/30 shadow-lg opacity-0 group-hover/badge:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                <p className="text-xs text-slate-300">Grammy-level audio analysis for professional quality</p>
              </div>
            </div>

            {/* AI Studio */}
            <div className="relative group/badge flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity duration-300 animate-in fade-in slide-in-from-left-6 delay-1200">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center border border-purple-400/40">
                <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xs text-slate-400">AI Studio</span>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900/95 backdrop-blur-xl rounded-lg border border-purple-500/30 shadow-lg opacity-0 group-hover/badge:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                <p className="text-xs text-slate-300">AI-powered mastering recommendations and analysis</p>
              </div>
            </div>

            {/* Real-time A/B */}
            <div className="relative group/badge flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity duration-300 animate-in fade-in slide-in-from-left-6 delay-1300">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/30">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <span className="text-xs text-slate-400">Real-time A/B</span>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900/95 backdrop-blur-xl rounded-lg border border-green-500/30 shadow-lg opacity-0 group-hover/badge:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                <p className="text-xs text-slate-300">Compare before and after instantly with one click</p>
              </div>
            </div>
          </div>
        </div>
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
            <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{i18nService.t('waveform')}</span>
              </div>
              <div className="flex items-center gap-2">
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
            <div className="p-5">
              <Visualizer
                isPlaying={isPlaying}
                currentTime={currentPlayheadSeconds}
                onSeek={(time) => audioEngine.seek(time)}
                onPlayheadUpdate={setCurrentPlayheadSeconds}
              />
            </div>

            {/* Compact LUFS Stats Bar */}
            <div className="px-5 pb-4 flex items-center justify-between gap-4 text-xs">
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

          {/* AI Recommendations Panel - Full Width */}
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
            <AnalysisPanel
              analysisResult={analysisResult}
              onReferenceUpload={handleReferenceUpload}
              referenceMetrics={referenceTrack?.metrics || null}
              referenceTrack={referenceTrack}
              onClearReference={handleClearReference}
              isLoadingReference={isLoadingReference}
              onApplySuggestions={handleApplySuggestions}
              onToggleSuggestion={handleToggleSuggestion}
              appliedSuggestionIds={appliedSuggestionIds}
              isProcessing={showProcessingOverlay}
              applySuggestionsError={applySuggestionsError}
              selectedSuggestionCount={selectedSuggestionCount}
              mixReadiness="in_progress"
              onRequestAIAnalysis={handleRequestAIAnalysis}
              echoReportStatus={echoReportStatus}
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
              onRevertRevision={async () => {}}
              onShowRevisionLogModal={() => {}}
              echoReportStatus={echoReportStatus}
              onRetryEchoReport={handleGenerateEchoReport}
              onShowSystemCheck={() => {}}
              onCopyDebugLog={async () => {}}
              referenceTrackName={referenceTrack?.name}
              // V.E.N.U.M. props
              beforeMetrics={originalMetrics}
              afterMetrics={processedMetrics}
              trackName={currentFileName}
              processedConfig={currentConfig}
            />
          </div>

          {/* Processing Controls - Below Echo Report */}
          {originalMetrics && (
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">
              <ProcessingPanel
                originalMetrics={originalMetrics}
                processedMetrics={processedMetrics}
                onCommit={handleCommit}
                onConfigChange={handleConfigChange}
                isCommitting={isCommitting}
                echoReport={echoReport}
                onToggleAB={handleToggleAB}
                isAbComparing={isAbComparing}
                isPlaying={isPlaying}
                onTogglePlayback={handleTogglePlayback}
                onExportComplete={() => setShowExportSharePrompt(true)}
                hasAppliedChanges={hasAppliedChanges}
              />
            </div>
          )}

        </div>
      )}

      {/* Multi-Stem Mode */}
      {activeMode === 'MULTI' && (
        <div className="w-full max-w-6xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <MultiStemWorkspace initialStems={generatedStems || undefined} />
        </div>
      )}

      {/* AI Studio Mode */}
      {activeMode === 'AI_STUDIO' && (
        <div className="w-full max-w-6xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <AIStudio onSongGenerated={handleSongGenerated} />
        </div>
      )}

      </main>

      <FeedbackButton onClick={() => {}} />

      {/* Floating Buttons */}
      {appState === AppState.READY && (
        <>
          {/* Advanced Tools Button */}
          <button
            onClick={() => setShowAdvancedTools(!showAdvancedTools)}
            className={`fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(168,85,247,0.25)] active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9)] active:translate-y-[1px] transition-all flex items-center justify-center group ${
              showAdvancedTools ? 'bg-slate-900 text-purple-400' : 'bg-slate-900 text-slate-400 hover:text-purple-400'
            }`}
            title="Advanced Tools"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          {/* Echo Chat Button */}
          <button
            onClick={() => setShowEchoChat(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-slate-900 text-orange-400 rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03),_0_0_20px_rgba(251,146,60,0.15)] hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(251,146,60,0.25)] hover:text-orange-300 active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9)] active:translate-y-[1px] transition-all flex items-center justify-center group"
            title="Open Echo Chat"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        </>
      )}

      {/* Advanced Tools Modal */}
      {showAdvancedTools && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-700/50 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828] w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-purple-500/30 flex items-center justify-center shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]">
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Advanced Tools</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Professional controls</p>
                </div>
              </div>
              <button
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
                currentConfig={currentConfig}
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
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {/* History Timeline */}
      {showHistoryTimeline && (
        <HistoryTimeline
          isOpen={showHistoryTimeline}
          onClose={() => setShowHistoryTimeline(false)}
          onJumpToEntry={handleJumpToHistoryEntry}
        />
      )}

      {/* Notification System */}
      <NotificationManager
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
};

export default App;