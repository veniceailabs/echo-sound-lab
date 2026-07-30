/**
 * MASTER CLASS MODULE - MAIN EXPORTS
 *
 * Sprint 1: Skeleton
 * Central export point for all Master Class components and services
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

// Type Exports
export type {
  Note,
  MidiData,
  StemAnalysis,
  TabLine,
  SpectrogramFrame,
  AudioMetadata,
  Chord,
  LessonVisualization,
  WaveformData,
  PianoRollData,
  SpectrogramData,
  MusicSheetData,
  LessonObject,
  LessonRestrictions,
  LearningPath,
  CoachingStep,
  AcademyAudioEngineConfig,
  AcademyProcessingResult,
  FocusRequest,
  MixState,
  LessonViewProps,
  InstrumentToggleProps,
} from './types';

// Engine Exports
export { AcademyAudioEngine, academyAudioEngineInstance } from './engine/AcademyAudioEngine';
export { NoteTranscriptionService, noteTranscription } from './engine/NoteTranscriptionService';

// Sprint 2: Import from main services (visualization and playback)
export { fftAnalyzer } from '../../services/fftAnalyzer';
export { audioPlaybackService } from '../../services/audioPlaybackService';
export type { PlaybackState, PlaybackCallbacks } from '../../services/audioPlaybackService';
export { stemPlaybackService } from '../../services/stemPlaybackService';
export type { PlaybackState as StemPlaybackState, StemVolumes, FocusSettings } from '../../services/stemPlaybackService';

// UI Component Exports
export { LessonView } from './ui/LessonView';
export { InstrumentToggle } from './ui/InstrumentToggle';

// Safety/Policy Exports
export {
  ExportRestrictionManager,
  EXPORT_RESTRICTION_POLICY,
  EXPORT_RESTRICTION_SEMANTIC_RULE,
  initializeExportRestrictionPolicy,
  type ExportFormat,
  type ExportRequest,
} from './safety/ExportRestriction';

// Convenience factory function
export function createMasterClassModule() {
  return {
    engine: academyAudioEngineInstance,
    noteTranscription: NoteTranscriptionService,
    exportManager: ExportRestrictionManager,
    components: {
      LessonView,
      InstrumentToggle,
    },
  };
}
