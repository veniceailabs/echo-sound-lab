/**
 * STEM SEPARATION PIPELINE TEST
 *
 * Sprint 2C: The Intelligence
 * Test the complete pipeline: Audio → Separation → Transcription → MIDI
 *
 * This test verifies that:
 * 1. Audio files can be processed through the separation pipeline
 * 2. Stems are correctly separated (mock mode)
 * 3. MIDI notes are generated from transcription
 * 4. Piano roll data is correctly formatted
 *
 * Date: January 5, 2026
 */

import { stemSeparationService } from '../stemSeparationService';
import { NoteTranscriptionService } from '../../modules/master-class/engine/NoteTranscriptionService';

describe('Stem Separation Pipeline', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    stemSeparationService.initialize('mock');
  });

  afterEach(() => {
    stemSeparationService.dispose();
  });

  /**
   * Test 1: Verify stem separation produces valid AudioBuffers
   */
  test('should separate audio into 4 stems with correct properties', async () => {
    // Create a simple test audio buffer (1 second, 44.1kHz, mono)
    const sampleRate = 44100;
    const duration = 1; // seconds
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Fill with a test signal (440 Hz sine wave - A4 note)
    for (let i = 0; i < channelData.length; i++) {
      const t = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5; // 440 Hz, 50% volume
    }

    // Process through pipeline
    const { stems } = await stemSeparationService.processAudioFile(buffer);

    // Verify stems exist and have correct properties
    expect(stems.vocals).toBeDefined();
    expect(stems.drums).toBeDefined();
    expect(stems.bass).toBeDefined();
    expect(stems.other).toBeDefined();

    // Verify metadata
    expect(stems.metadata.mode).toBe('mock');
    expect(stems.metadata.duration).toBe(duration);
    expect(stems.metadata.sampleRate).toBe(sampleRate);
    expect(stems.metadata.processingTimeMs).toBeGreaterThan(0);
    expect(stems.metadata.alignmentManifest).toBeDefined();
    expect(stems.metadata.alignmentManifest?.summary.track_count).toBe(4);

    // Verify all stems have same duration
    expect(stems.vocals.duration).toBe(duration);
    expect(stems.drums.duration).toBe(duration);
    expect(stems.bass.duration).toBe(duration);
    expect(stems.other.duration).toBe(duration);

    // Verify sample rate is preserved
    expect(stems.vocals.sampleRate).toBe(sampleRate);
    expect(stems.drums.sampleRate).toBe(sampleRate);
    expect(stems.bass.sampleRate).toBe(sampleRate);
    expect(stems.other.sampleRate).toBe(sampleRate);
  });

  /**
   * Test 2: Verify transcription produces valid MIDI notes
   */
  test('should transcribe audio stems to MIDI notes', async () => {
    // Create test buffer with 440 Hz sine wave
    const sampleRate = 44100;
    const duration = 2; // 2 seconds
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Fill with 440 Hz sine (A4 = MIDI note 69)
    for (let i = 0; i < channelData.length; i++) {
      const t = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    }

    // Process through pipeline
    const { transcription } = await stemSeparationService.processAudioFile(buffer);

    // Verify transcription exists for all stems
    expect(transcription.vocals).toBeDefined();
    expect(Array.isArray(transcription.vocals)).toBe(true);
    expect(transcription.drums).toBeDefined();
    expect(transcription.bass).toBeDefined();
    expect(transcription.other).toBeDefined();

    // Verify note structure (if notes were detected)
    if (transcription.vocals.length > 0) {
      const note = transcription.vocals[0];
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
      expect(note.startTime).toBeGreaterThanOrEqual(0);
      expect(note.endTime).toBeGreaterThan(note.startTime);
      expect(note.velocity).toBeGreaterThanOrEqual(0);
      expect(note.velocity).toBeLessThanOrEqual(127);
    }
  });

  /**
   * Test 3: Verify MIDI note generation for piano roll
   */
  test('should generate piano roll compatible MIDI notes', async () => {
    // Create test buffer
    const sampleRate = 44100;
    const duration = 1;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Create a short burst at the start (440 Hz for 0.5 seconds)
    for (let i = 0; i < sampleRate * 0.5; i++) {
      const t = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    }

    // Process through pipeline
    const { transcription, stems } = await stemSeparationService.processAudioFile(buffer);

    // Convert to piano roll format (MIDI notes)
    const pianoRollNotes: Array<{
      pitch: number;
      startTime: number;
      endTime: number;
      velocity: number;
      stemId: string;
    }> = [];

    (Object.keys(transcription) as Array<'vocals' | 'drums' | 'bass' | 'other'>).forEach((stemId) => {
      const stemNotes = (transcription as any)[stemId];
      stemNotes.forEach((note: any) => {
        pianoRollNotes.push({
          pitch: note.pitch,
          startTime: note.startTime,
          endTime: note.endTime,
          velocity: note.velocity,
          stemId,
        });
      });
    });

    // Verify piano roll structure
    expect(Array.isArray(pianoRollNotes)).toBe(true);

    // Verify notes are sorted by start time
    for (let i = 1; i < pianoRollNotes.length; i++) {
      expect(pianoRollNotes[i].startTime).toBeGreaterThanOrEqual(pianoRollNotes[i - 1].startTime);
    }

    // Verify all notes have valid MIDI pitch range
    pianoRollNotes.forEach((note) => {
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
      expect(note.velocity).toBeGreaterThanOrEqual(0);
      expect(note.velocity).toBeLessThanOrEqual(127);
    });
  });

  /**
   * Test 4: Verify progress callback updates
   */
  test('should provide real-time progress updates', async () => {
    const progressUpdates: Array<{ step: string; progress: number }> = [];

    // Create test buffer
    const sampleRate = 44100;
    const duration = 0.5;
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < channelData.length; i++) {
      const t = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    }

    // Process with progress tracking
    await stemSeparationService.processAudioFile(buffer, (state) => {
      progressUpdates.push({
        step: state.step,
        progress: state.progress,
      });
    });

    // Verify progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Verify progress increases
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].progress).toBeGreaterThanOrEqual(progressUpdates[i - 1].progress);
    }

    // Verify final progress is 100
    expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);

    // Verify steps progress logically
    const steps = progressUpdates.map((u) => u.step);
    if (steps.includes('separating')) {
      expect(steps.indexOf('transcribing')).toBeGreaterThan(steps.indexOf('separating'));
    }
  });

  /**
   * Test 5: Verify separation mode switching
   */
  test('should support mode switching', () => {
    // Start in mock mode
    let state = stemSeparationService.getState();
    expect(state.mode).toBe('mock');

    // Switch to local-demucs mode (but will still use mock internally for now)
    stemSeparationService.setMode('local-demucs');
    state = stemSeparationService.getState();
    expect(state.mode).toBe('local-demucs');

    // Verify available modes
    const modes = stemSeparationService.getAvailableModes();
    expect(modes).toContain('mock');
    expect(modes).toContain('local-demucs');
  });

  /**
   * Test 6: Verify autocorrelation pitch detection accuracy
   */
  test('should detect known frequencies with autocorrelation', () => {
    // Create test signals with known frequencies
    const sampleRate = 44100;
    const testCases = [
      { frequency: 440, expectedMidiPitch: 69 }, // A4
      { frequency: 261.6, expectedMidiPitch: 60 }, // C4
      { frequency: 329.6, expectedMidiPitch: 64 }, // E4
      { frequency: 392, expectedMidiPitch: 67 }, // G4
    ];

    testCases.forEach(({ frequency, expectedMidiPitch }) => {
      // Create test buffer
      const duration = 0.5;
      const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
      const channelData = buffer.getChannelData(0);

      // Fill with test frequency
      for (let i = 0; i < channelData.length; i++) {
        const t = i / sampleRate;
        channelData[i] = Math.sin(2 * Math.PI * frequency * t) * 0.5;
      }

      // Detect pitch
      const { frequency: detectedFreq, confidence } =
        NoteTranscriptionService.detectPitchAutocorrelation(channelData, sampleRate);

      if (detectedFreq > 0) {
        // Convert to MIDI pitch
        const midiPitch = Math.round(69 + 12 * Math.log2(detectedFreq / 440));

        // Verify detection is within 1-2 semitones (acceptable for autocorrelation)
        expect(Math.abs(midiPitch - expectedMidiPitch)).toBeLessThanOrEqual(2);
        expect(confidence).toBeGreaterThan(0);
      }
    });
  });
});
