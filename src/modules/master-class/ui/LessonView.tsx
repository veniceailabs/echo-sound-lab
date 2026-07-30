/**
 * LESSON VIEW COMPONENT
 *
 * Sprint 1: Skeleton
 * Sprint 2: Integration with Waveform and Spectrogram Canvas
 * Split-screen visualization of lesson content
 *
 * Top half: Video/waveform with scrolling visualizations
 * Bottom half: Sheet music and/or tablature notation
 *
 * Version: 2.0.0 (Sprint 2)
 * Date: January 4, 2026
 */

import React, { useRef, useEffect, useState } from 'react';
import type { LessonObject, MixState, FocusRequest } from '../types';
import { InstrumentToggle } from './InstrumentToggle';
import WaveformCanvas from '../../../components/WaveformCanvas';
import SpectrogramCanvas from '../../../components/SpectrogramCanvas';
import PianoRollCanvas from '../../../components/PianoRollCanvas';
import type { MidiNote } from '../../../components/PianoRollCanvas';
import { stemPlaybackService } from '../../../services/stemPlaybackService';
import { stemSeparationService, type SeparationState } from '../../../services/stemSeparationService';

interface LessonViewProps {
  lessonObject: LessonObject;
  onExportAttempted?: (format: 'PDF' | 'STEMS' | 'MIDI') => void;
  onFocusChange?: (instrument: string) => void;
  autoPlay?: boolean;
  showCoachingTips?: boolean;
}

interface LessonViewState {
  isPlaying: boolean;
  currentTime: number;
  mixState: MixState;
  selectedInstrument?: string;
  showCoachingTips: boolean;
  analyser: AnalyserNode | null;
  pianoRollNotes: MidiNote[];
  separationState?: SeparationState;
  isSeparating: boolean;
  separationProgress: number; // 0-100
  separationError: string | null;
}

/**
 * LessonView - Main interactive lesson component
 *
 * This is the flagship UI for the Master Class module.
 * It displays:
 * 1. Video/waveform playback with synchronized visualization
 * 2. Interactive stem isolation via focus buttons
 * 3. Sheet music/tablature for the focused instrument
 * 4. AI coaching tips and learning paths
 * 5. Export restrictions enforced at the UI level
 */
export const LessonView: React.FC<LessonViewProps> = ({
  lessonObject,
  onExportAttempted,
  onFocusChange,
  autoPlay = false,
  showCoachingTips = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<LessonViewState>({
    isPlaying: autoPlay,
    currentTime: 0,
    mixState: {
      vocals: { gain: 0, muted: false },
      drums: { gain: 0, muted: false },
      bass: { gain: 0, muted: false },
      other: { gain: 0, muted: false },
    },
    showCoachingTips: showCoachingTips,
    analyser: null,
    pianoRollNotes: [],
    isSeparating: false,
    separationProgress: 0,
    separationError: null,
  });

  /**
   * Initialize stem playback and separation services
   */
  useEffect(() => {
    let isMounted = true;

    try {
      // Initialize the multi-stem playback service
      stemPlaybackService.initialize();

      // Get the analyser node for visualization
      const analyser = stemPlaybackService.getAnalyser();
      setState((prev) => ({
        ...prev,
        analyser,
      }));

      void (async () => {
        const separationState = await stemSeparationService.initialize('local-demucs');
        if (!isMounted) {
          return;
        }

        setState((prev) => ({
          ...prev,
          separationState,
          isSeparating: separationState.isProcessing,
          separationProgress: separationState.progress,
          separationError: separationState.error,
        }));
      })();

      // Listen to playback state changes
      stemPlaybackService.onStateChange((playbackState) => {
        setState((prev) => ({
          ...prev,
          isPlaying: playbackState.isPlaying,
          currentTime: playbackState.currentTime,
        }));
      });

      // Handle playback errors
      stemPlaybackService.onError((error) => {
        console.error('[LessonView] Playback error:', error);
      });

      // Handle playback end
      stemPlaybackService.onEnded(() => {
        console.log('[LessonView] Playback ended');
      });

      return () => {
        isMounted = false;
        stemPlaybackService.dispose();
        stemSeparationService.dispose();
      };
    } catch (error) {
      console.error('[LessonView] Failed to initialize services:', error);
    }
  }, []);

  /**
   * Handle play/pause toggle
   */
  const handlePlayPause = () => {
    if (state.isPlaying) {
      stemPlaybackService.pause();
    } else {
      stemPlaybackService.play();
    }
  };

  /**
   * Load lesson data and populate visualizations
   * When lesson loads: Extract MIDI notes from analyzed stems
   */
  useEffect(() => {
    if (lessonObject.id) {
      console.log(`[LessonView] Loading lesson: ${lessonObject.title}`);

      try {
        // Extract MIDI notes from analyzed stems and visualization data
        const pianoRollNotes: MidiNote[] = [];

        // Method 1: Use pre-analyzed visualization data from lesson object
        if (lessonObject.visualizations?.pianoRoll?.notes) {
          lessonObject.visualizations.pianoRoll.notes.forEach((note) => {
            pianoRollNotes.push({
              pitch: note.pitch,
              startTime: note.startTime / 1000, // Convert ms to seconds
              endTime: (note.startTime + note.duration) / 1000,
              velocity: note.velocity,
              stemId: 'vocals', // Default stem (would need stem info in PianoRollData)
            });
          });
        }

        // Method 2: If visualization data is sparse, generate from MIDI data
        if (pianoRollNotes.length === 0) {
          (Object.keys(lessonObject.stems) as Array<'vocals' | 'drums' | 'bass' | 'other'>).forEach(
            (stemId) => {
              const stem = lessonObject.stems[stemId];
              if (stem.midiData) {
                stem.midiData.forEach((midiNote) => {
                  pianoRollNotes.push({
                    pitch: midiNote.noteNumber,
                    startTime: midiNote.startTime / 1000, // Convert ms to seconds
                    endTime: (midiNote.startTime + midiNote.duration) / 1000,
                    velocity: midiNote.velocity,
                    stemId,
                  });
                });
              }
            }
          );
        }

        // Method 3: Fallback to generating example notes if no data available
        if (pianoRollNotes.length === 0) {
          const exampleNotes = generateExampleNotes(lessonObject.duration / 1000);
          pianoRollNotes.push(...exampleNotes);
        }

        // Sort by start time for efficient rendering
        pianoRollNotes.sort((a, b) => a.startTime - b.startTime);

        setState((prev) => ({
          ...prev,
          pianoRollNotes,
          isSeparating: false,
          separationProgress: 100,
        }));

        console.log(
          `[LessonView] Loaded lesson with ${pianoRollNotes.length} MIDI notes`,
          `Key: ${lessonObject.audioMetadata.key}, Tempo: ${lessonObject.audioMetadata.tempo} BPM`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[LessonView] Error loading lesson:', errorMsg);
        setState((prev) => ({
          ...prev,
          isSeparating: false,
          separationError: errorMsg,
        }));
      }
    }
  }, [lessonObject.id]);

  /**
   * Handle instrument focus change
   * Applies focus mode to stem mixer
   */
  const handleFocusChange = (instrument: string) => {
    if (instrument === 'all') {
      // Reset to neutral mix
      stemPlaybackService.resetFocus();

      setState((prev) => ({
        ...prev,
        mixState: {
          vocals: { gain: 0, muted: false },
          drums: { gain: 0, muted: false },
          bass: { gain: 0, muted: false },
          other: { gain: 0, muted: false },
        },
        selectedInstrument: undefined,
      }));
    } else {
      // Apply focus to selected instrument
      // Focus stem at 1.0x, other stems at 0.1x (ghost mode)
      stemPlaybackService.setFocus(
        instrument as 'vocals' | 'drums' | 'bass' | 'other',
        1.0,   // Focus gain
        0.1    // Ghost gain (reduced volume for context)
      );

      const newMixState: MixState = {
        vocals: { gain: 0, muted: false },
        drums: { gain: 0, muted: false },
        bass: { gain: 0, muted: false },
        other: { gain: 0, muted: false },
      };

      // Update mix state display
      (newMixState as any)[instrument].gain = 6; // +6dB
      Object.keys(newMixState).forEach((key) => {
        if (key !== instrument && key !== 'currentFocus') {
          (newMixState as any)[key].gain = -10; // -10dB
        }
      });
      (newMixState as any).currentFocus = instrument;

      setState((prev) => ({
        ...prev,
        mixState: newMixState,
        selectedInstrument: instrument,
      }));
    }

    onFocusChange?.(instrument);
  };

  /**
   * Handle export attempts - enforce restrictions
   */
  const handleExport = (format: 'PDF' | 'STEMS' | 'MIDI') => {
    // Check restrictions before allowing export
    if (format === 'STEMS' && !lessonObject.restrictions.canExportStems) {
      console.warn(
        '[LessonView] Export blocked:',
        lessonObject.restrictions.exportRestrictionReason
      );
      alert(
        `Cannot export stems:\n\n${lessonObject.restrictions.exportRestrictionReason}\n\nYou can export the lesson as a PDF to share your progress.`
      );
      return;
    }

    if (format === 'MIDI' && !lessonObject.restrictions.canExportMidi) {
      console.warn('[LessonView] MIDI export blocked');
      alert('MIDI export is not available for this lesson. Try exporting as PDF instead.');
      return;
    }

    if (format === 'PDF' && !lessonObject.restrictions.canExportPDF) {
      console.warn('[LessonView] PDF export blocked');
      alert('PDF export is not available for this lesson.');
      return;
    }

    // Log the export attempt
    console.log('[LessonView:EXPORT_ATTEMPTED]', {
      lessonId: lessonObject.id,
      format,
      timestamp: Date.now(),
      selectedInstrument: state.selectedInstrument,
    });

    onExportAttempted?.(format);
  };

  /**
   * Format time for display
   */
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    return `${minutes}:${displaySeconds.toString().padStart(2, '0')}`;
  };

  /**
   * Generate example MIDI notes for demo/testing
   * In production, this will come from pitch detection or MIDI import
   */
  const generateExampleNotes = (duration: number): MidiNote[] => {
    const notes: MidiNote[] = [];
    const stems: Array<'vocals' | 'drums' | 'bass' | 'other'> = ['vocals', 'drums', 'bass', 'other'];

    // Generate example notes across the duration
    for (const stem of stems) {
      const startPitch = stem === 'vocals' ? 60 : stem === 'bass' ? 36 : stem === 'drums' ? 60 : 50;
      let currentTime = 0;
      const beatLength = 0.5; // Half second per beat

      while (currentTime < duration) {
        const noteDuration = beatLength;
        notes.push({
          pitch: startPitch + Math.floor(Math.random() * 12),
          startTime: currentTime,
          endTime: Math.min(currentTime + noteDuration, duration),
          velocity: 80 + Math.floor(Math.random() * 47),
          stemId: stem,
        });

        currentTime += beatLength;
      }
    }

    return notes;
  };

  const separationBanner = state.separationState
    ? {
        backgroundColor:
          state.separationState.availability === 'ready'
            ? '#173526'
            : state.separationState.availability === 'checking'
              ? '#2b2b2b'
              : '#3a2b12',
        borderColor:
          state.separationState.availability === 'ready'
            ? '#2f7d57'
            : state.separationState.availability === 'checking'
              ? '#555'
              : '#a46a00',
        label:
          state.separationState.availability === 'ready'
            ? 'Real Demucs Ready'
            : state.separationState.availability === 'checking'
              ? 'Checking Bridge'
              : 'Demo Fallback Active',
        message:
          state.separationState.availability === 'fallback'
            ? state.separationState.fallbackReason || state.separationState.statusMessage
            : state.separationState.statusMessage,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="lesson-view-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* HEADER: Lesson Title & Metadata */}
      <div
        className="lesson-header"
        style={{
          padding: '16px 24px',
          backgroundColor: '#0d0d0d',
          borderBottom: '1px solid #333',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
          {lessonObject.title}
        </h1>
        <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#999' }}>
          Key: {lessonObject.audioMetadata.key} • Tempo: {lessonObject.audioMetadata.tempo} BPM •
          Duration: {formatTime(lessonObject.duration)}
        </p>
        {separationBanner && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              backgroundColor: separationBanner.backgroundColor,
              border: `1px solid ${separationBanner.borderColor}`,
              borderRadius: '6px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {separationBanner.label}
            </div>
            <div style={{ fontSize: '13px', color: '#d9d9d9', marginTop: '4px' }}>
              {separationBanner.message}
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT: Split View */}
      <div
        className="lesson-main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* TOP HALF: Waveform/Video Visualization */}
        <div
          className="lesson-waveform-section"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#222',
            borderBottom: '1px solid #333',
            padding: '16px',
            minHeight: '200px',
          }}
        >
          <div
            className="waveform-canvas"
            style={{
              flex: 1,
              marginBottom: '16px',
            }}
          >
            <WaveformCanvas
              audioBuffer={undefined}
              currentTime={state.currentTime}
              duration={lessonObject.duration / 1000}
              onSeek={(timeSeconds) => {
                // TODO: Integrate with actual audio playback
                console.log('Seek to:', timeSeconds);
              }}
              colors={{
                background: '#0f172a',
                waveform: '#3b82f6',
                peaks: '#f97316',
                playhead: '#ef4444',
                grid: '#1e293b',
              }}
              height={100}
              showGrid={true}
              showPeaks={true}
              interactive={true}
            />
          </div>

          {/* Playback Controls */}
          <div
            className="playback-controls"
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <button
              onClick={handlePlayPause}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {state.isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>

            <div
              className="time-display"
              style={{
                fontSize: '14px',
                color: '#999',
              }}
            >
              {formatTime(state.currentTime)} / {formatTime(lessonObject.duration)}
            </div>

            <div
              className="progress-bar"
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: '#333',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>

        {/* BOTTOM HALF: Score/Tablature & Controls */}
        <div
          className="lesson-score-section"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1a1a1a',
            padding: '16px',
            minHeight: '200px',
            overflow: 'auto',
          }}
        >
          {/* Instrument Focus Controls */}
          <div
            className="focus-controls"
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#222',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>
              Focus Instrument
            </div>
            <InstrumentToggle
              instruments={['vocals', 'drums', 'bass', 'other']}
              currentFocus={state.selectedInstrument}
              onFocusChange={handleFocusChange}
            />
            {state.selectedInstrument && (
              <button
                onClick={() => handleFocusChange('all')}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  backgroundColor: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✕ Reset to All
              </button>
            )}
          </div>

          {/* Spectrogram Canvas - Sprint 2 */}
          <div
            style={{
              marginBottom: '16px',
            }}
          >
            <SpectrogramCanvas
              analyser={state.analyser || undefined}
              sampleRate={44100}
              currentTime={state.currentTime}
              duration={lessonObject.duration / 1000}
              isPlaying={state.isPlaying}
              height={120}
              freqMin={20}
              freqMax={20000}
              colorScheme="viridis"
              showGrid={true}
              interactive={false}
            />
          </div>

          {/* Piano Roll Canvas - Sprint 2B */}
          <div
            style={{
              marginBottom: '16px',
            }}
          >
            <PianoRollCanvas
              notes={state.pianoRollNotes}
              currentTime={state.currentTime}
              duration={lessonObject.duration / 1000}
              height={250}
              timelineHeight={40}
              pixelsPerSecond={100}
              showNoteLabels={true}
              showPianoKeys={true}
              interactive={true}
              onNoteClick={(note) => {
                console.log(`[LessonView] Note clicked:`, note);
                // TODO: Navigate to note in music theory UI
              }}
            />
          </div>

          {/* Score/Tablature Display */}
          <div
            className="score-canvas"
            style={{
              flex: 1,
              backgroundColor: '#111',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '16px',
              marginBottom: '16px',
              overflow: 'auto',
            }}
          >
            <div style={{ textAlign: 'center', color: '#666' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎼</div>
              <div>Score/Tablature visualization goes here</div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>
                {state.selectedInstrument ? `Showing: ${state.selectedInstrument.toUpperCase()}` : 'Select an instrument to view sheet music'}
              </div>
            </div>
          </div>

          {/* Coaching Tips (if enabled) */}
          {state.showCoachingTips && lessonObject.learningPaths.length > 0 && (
            <div
              className="coaching-section"
              style={{
                backgroundColor: '#1d3b2e',
                border: '1px solid #2a5a46',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#7ec69f', fontWeight: 600, marginBottom: '8px' }}>
                💡 AI Coaching Tip
              </div>
              <div style={{ fontSize: '14px', color: '#b8e6d5', lineHeight: '1.5' }}>
                {state.selectedInstrument
                  ? `Learn to play the ${state.selectedInstrument}. Start slow, then increase tempo.`
                  : 'Select an instrument and focus on it to see personalized coaching tips.'}
              </div>
            </div>
          )}

          {/* Export Options */}
          <div
            className="export-controls"
            style={{
              display: 'flex',
              gap: '12px',
            }}
          >
            <button
              onClick={() => handleExport('PDF')}
              disabled={!lessonObject.restrictions.canExportPDF}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: lessonObject.restrictions.canExportPDF ? '#28a745' : '#555',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: lessonObject.restrictions.canExportPDF ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                opacity: lessonObject.restrictions.canExportPDF ? 1 : 0.6,
              }}
            >
              📄 Export as PDF
            </button>

            <button
              onClick={() => handleExport('STEMS')}
              disabled={!lessonObject.restrictions.canExportStems}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: lessonObject.restrictions.canExportStems ? '#007bff' : '#555',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: lessonObject.restrictions.canExportStems ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                opacity: lessonObject.restrictions.canExportStems ? 1 : 0.6,
              }}
            >
              🎚 Export Stems
            </button>

            <button
              onClick={() => handleExport('MIDI')}
              disabled={!lessonObject.restrictions.canExportMidi}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: lessonObject.restrictions.canExportMidi ? '#6f42c1' : '#555',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: lessonObject.restrictions.canExportMidi ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                opacity: lessonObject.restrictions.canExportMidi ? 1 : 0.6,
              }}
            >
              🎹 Export MIDI
            </button>
          </div>

          {/* Restriction Notice */}
          <div
            style={{
              marginTop: '12px',
              padding: '10px',
              backgroundColor: '#2a2a2a',
              borderLeft: '3px solid #ff9800',
              fontSize: '12px',
              color: '#ccc',
            }}
          >
            <strong>Note:</strong> {lessonObject.restrictions.exportRestrictionReason}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonView;
