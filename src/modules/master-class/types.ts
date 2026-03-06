/**
 * MASTER CLASS MODULE - TYPE DEFINITIONS
 *
 * Sprint 1: Skeleton
 * Core types for the Master Class educational module
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

/**
 * Represents a single musical note with frequency and note name
 */
export interface Note {
  frequency: number;      // Hz
  note: string;          // C4, D#5, etc.
  octave: number;        // 0-8
  confidence: number;    // 0-1, how confident we are this is the right note
}

/**
 * MIDI note data for visualization and playback
 */
export interface MidiData {
  noteNumber: number;    // 0-127
  note: string;         // C4, D#5, etc.
  frequency: number;    // Hz
  velocity: number;     // 0-127 (how loud)
  startTime: number;    // ms from start of track
  duration: number;     // ms
  channel: number;      // MIDI channel (0-15)
}

/**
 * Represents analyzed content of a single instrument stem
 */
export interface StemAnalysis {
  stemType: 'vocals' | 'drums' | 'bass' | 'other';
  frequency: number[];           // Array of dominant frequencies over time
  notes: Note[];                 // Transcribed notes
  midiData: MidiData[];         // MIDI representation for sheet music
  midiBase64?: string;          // Encoded MIDI data (for playback)
  tablatureData?: TabLine[];    // Guitar/bass tablature if applicable
  intensity: number[];          // 0-1 values over time (for volume envelope)
  spectrogramData?: SpectrogramFrame[]; // Frequency domain data for visualization
}

/**
 * Represents a line of guitar/bass tablature
 */
export interface TabLine {
  string: number;     // String number (0-5 for guitar)
  frets: (number | null)[]; // Fret numbers (-1 = muted, null = rest)
  timings: number[];  // Timing in ms for each note
}

/**
 * Frame of spectrogram data for visual analysis
 */
export interface SpectrogramFrame {
  timestamp: number;           // ms from start
  frequencies: number[];       // Hz bins
  magnitudes: number[];        // Amplitude for each bin (0-1)
  dominantFrequency: number;   // Most prominent frequency in this frame
}

/**
 * Metadata about the analyzed audio
 */
export interface AudioMetadata {
  title: string;
  duration: number;      // ms
  sampleRate: number;    // Hz
  tempo: number;         // BPM
  timeSignature: {
    numerator: number;   // 4 in 4/4
    denominator: number; // 4 in 4/4
  };
  key: string;          // C major, A minor, etc.
  chordProgression: Chord[];
}

/**
 * A chord at a specific timestamp
 */
export interface Chord {
  timestamp: number;    // ms from start
  name: string;        // C major, Am7, etc.
  root: string;       // C, A, etc.
  type: string;       // major, minor, dom7, maj7, etc.
  confidence: number; // 0-1
}

/**
 * Visualization configuration for the lesson view
 */
export interface LessonVisualization {
  waveform: WaveformData;
  pianoRoll: PianoRollData;
  spectrogram: SpectrogramData;
  score: MusicSheetData;
}

/**
 * Waveform display data
 */
export interface WaveformData {
  samples: number[];    // -1 to 1
  peaks: number[];      // Peak values per bin for zoom efficiency
  rms: number[];        // RMS energy per frame
}

/**
 * Piano roll (MIDI visualization)
 */
export interface PianoRollData {
  notes: Array<{
    pitch: number;      // 0-127 MIDI note number
    startTime: number;  // ms
    duration: number;   // ms
    velocity: number;   // 0-127
  }>;
  gridSize: number;    // ms per grid square
  ticksPerBeat: number;
}

/**
 * Spectrogram (frequency domain visualization)
 */
export interface SpectrogramData {
  frames: SpectrogramFrame[];
  freqMin: number;      // Hz
  freqMax: number;      // Hz
  timeResolution: number; // ms per frame
}

/**
 * Music sheet (score) data
 */
export interface MusicSheetData {
  clef: 'treble' | 'bass' | 'alto';
  staffLines: number;  // Usually 5
  notes: Array<{
    pitch: string;     // C4, D#5, etc.
    duration: string;  // whole, half, quarter, eighth, etc.
    startBeat: number;
  }>;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  key: string;        // C major, A minor, etc.
}

/**
 * Complete lesson object - the output of AcademyAudioEngine
 * This is what gets displayed in LessonView, NOT sent to user as audio
 */
export interface LessonObject {
  // Metadata
  id: string;                          // Unique identifier
  title: string;                       // Song title
  createdAt: number;                  // Timestamp
  duration: number;                   // ms

  // Audio metadata
  audioMetadata: AudioMetadata;

  // Individual stems (analyzed, not exportable)
  stems: {
    vocals: StemAnalysis;
    drums: StemAnalysis;
    bass: StemAnalysis;
    other: StemAnalysis;
  };

  // Combined visualizations
  visualizations: LessonVisualization;

  // Learning paths / coaching data
  learningPaths: LearningPath[];

  // Restrictions / governance
  restrictions: LessonRestrictions;

  // Forensic metadata
  metadata: {
    createdBy: string;          // User ID
    stemSeparationModel: string; // Model version used
    analysisVersion: string;    // Analysis algorithm version
    analysisTimeMs: number;     // How long analysis took
    checksum: string;           // For integrity verification
  };
}

/**
 * Defines how a user can interact with this lesson
 */
export interface LessonRestrictions {
  canExportStems: boolean;        // Always false in Master Class mode
  canExportMidi: boolean;         // Can export individual stem MIDI? (likely false)
  canExportPDF: boolean;          // Can export lesson as PDF sheet music? (true)
  canAdjustTempo: boolean;        // Can slow down/speed up playback
  canTranspose: boolean;          // Can change key
  canFocusInstruments: boolean;   // Can solo individual stems
  canAccessCoachFeedback: boolean; // Can see AI coaching tips
  exportRestrictionReason: string; // "Copyright protection - stems exportable to authorized users only"
}

/**
 * A learning path / coaching sequence
 */
export interface LearningPath {
  id: string;
  instrument: 'vocals' | 'drums' | 'bass' | 'other';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: CoachingStep[];
  estimatedDuration: number; // minutes
  description: string;
}

/**
 * Individual coaching step
 */
export interface CoachingStep {
  id: string;
  timestamp: number;           // Where in the song to start this step
  title: string;              // "Learn the bass line", "Nail the snare pattern", etc.
  description: string;
  focus: {
    instrument: 'vocals' | 'drums' | 'bass' | 'other';
    region: {
      startTime: number;
      endTime: number;
    };
  };
  tip: string;                // "Notice the syncopation on the 3rd beat"
  difficulty: number;         // 1-10
  estimatedDuration: number;  // seconds
}

/**
 * Configuration for AcademyAudioEngine
 */
export interface AcademyAudioEngineConfig {
  // Stem separator settings
  stemSeparationModel: string;      // e.g., 'demucs-htdemucs'

  // Analysis settings
  analysisConfig: {
    frequencyResolution: number;    // Hz
    timeResolution: number;         // ms
    enablePitchDetection: boolean;
    enableChordDetection: boolean;
    enableTempoDetection: boolean;
  };

  // Visualization settings
  visualizationConfig: {
    spectrogram: {
      enabled: boolean;
      freqMin: number;              // Hz
      freqMax: number;              // Hz
    };
    pianoRoll: {
      enabled: boolean;
      pixelsPerSemitone: number;
    };
    score: {
      enabled: boolean;
      clef: 'treble' | 'bass' | 'alto';
    };
  };

  // Coaching settings
  coachingConfig: {
    enableAICoaching: boolean;
    coachingLevel: 'beginner' | 'intermediate' | 'advanced';
  };
}

/**
 * Result of AcademyAudioEngine processing
 */
export interface AcademyProcessingResult {
  success: boolean;
  lessonObject?: LessonObject;
  error?: string;
  processingTimeMs: number;
  warnings: string[];
}

/**
 * Request to focus on a specific instrument
 */
export interface FocusRequest {
  instrument: 'vocals' | 'drums' | 'bass' | 'other';
  mixAdjustment: {
    focusedGainDb: number;    // e.g., +6dB
    backgroundGainDb: number; // e.g., -10dB
  };
}

/**
 * Real-time audio mix state
 */
export interface MixState {
  vocals: { gain: number; muted: boolean };
  drums: { gain: number; muted: boolean };
  bass: { gain: number; muted: boolean };
  other: { gain: number; muted: boolean };
  currentFocus?: 'vocals' | 'drums' | 'bass' | 'other'; // Which is focused, if any
}

/**
 * Props for LessonView component
 */
export interface LessonViewProps {
  lessonObject: LessonObject;
  onExportAttempted?: (format: string) => void;
  onFocusChange?: (instrument: string) => void;
  autoPlay?: boolean;
  showCoachingTips?: boolean;
}

/**
 * Props for InstrumentToggle component
 */
export interface InstrumentToggleProps {
  instruments: Array<'vocals' | 'drums' | 'bass' | 'other'>;
  currentFocus?: string;
  onFocusChange: (instrument: string) => void;
  disabled?: boolean;
}
