/**
 * NOTE TRANSCRIPTION SERVICE
 *
 * Sprint 1: Skeleton
 * Converts audio frequencies to MIDI notes and sheet music notation
 *
 * Provides the bridge between raw audio analysis and musical notation.
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import type { Note, MidiData } from '../types';

/**
 * Reference frequency for A4
 */
const A4_FREQUENCY = 440;

/**
 * Note names in one octave (starting from C)
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * MIDI note number for middle C (C4)
 */
const MIDI_C4 = 60;

/**
 * Minimum frequency for pitch detection (Hz)
 */
const MIN_FREQUENCY = 50;

/**
 * Maximum frequency for pitch detection (Hz)
 */
const MAX_FREQUENCY = 2000;

/**
 * NoteTranscriptionService
 *
 * Converts continuous frequency data into discrete musical notes with
 * MIDI representation for visualization and notation.
 *
 * Implements Autocorrelation algorithm for monophonic pitch detection.
 * Perfect for bass and vocal tracks where single voice is dominant.
 */
export class NoteTranscriptionService {
  /**
   * AUTOCORRELATION ALGORITHM for monophonic pitch detection
   *
   * Detects the fundamental frequency of a single voice/instrument.
   * Works excellently for bass and vocals (primary focus modes).
   *
   * Algorithm:
   * 1. Autocorrelate the audio signal with itself
   * 2. Find the first peak after zero lag (fundamental frequency)
   * 3. Return frequency and confidence score
   *
   * @param audioData - Float32Array of audio samples
   * @param sampleRate - Sample rate in Hz
   * @returns Object with frequency (Hz) and confidence (0-1)
   */
  public static detectPitchAutocorrelation(
    audioData: Float32Array,
    sampleRate: number
  ): { frequency: number; confidence: number } {
    // Minimum and maximum lag to search (corresponds to frequency range)
    const minLag = Math.round(sampleRate / MAX_FREQUENCY);
    const maxLag = Math.round(sampleRate / MIN_FREQUENCY);

    // Ensure minimum buffer size for autocorrelation
    if (audioData.length < maxLag * 2) {
      return { frequency: 0, confidence: 0 };
    }

    // Apply window function (Hann window) to reduce spectral leakage
    const windowedData = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (audioData.length - 1));
      windowedData[i] = audioData[i] * window;
    }

    // Calculate RMS to normalize autocorrelation
    let rms = 0;
    for (let i = 0; i < windowedData.length; i++) {
      rms += windowedData[i] * windowedData[i];
    }
    rms = Math.sqrt(rms / windowedData.length);

    // Prevent division by zero
    if (rms < 0.001) {
      return { frequency: 0, confidence: 0 };
    }

    // Compute autocorrelation for relevant lags
    let maxAutocorr = 0;
    let maxLagFrequency = 0;

    for (let lag = minLag; lag < maxLag; lag++) {
      let autocorr = 0;

      // Autocorrelation formula: sum(x[n] * x[n-lag])
      for (let i = lag; i < windowedData.length; i++) {
        autocorr += windowedData[i] * windowedData[i - lag];
      }

      // Normalize autocorrelation
      autocorr /= rms * rms;

      // Track maximum autocorrelation
      if (autocorr > maxAutocorr) {
        maxAutocorr = autocorr;
        maxLagFrequency = lag;
      }
    }

    // Convert lag to frequency
    const frequency = sampleRate / maxLagFrequency;

    // Confidence is the autocorrelation value (0-1)
    // Higher autocorrelation = more periodic = higher confidence
    const confidence = Math.min(1, maxAutocorr);

    // Only return frequency if confidence is reasonably high
    if (confidence < 0.1) {
      return { frequency: 0, confidence: 0 };
    }

    return { frequency, confidence };
  }

  /**
   * Detect pitch over time from an audio buffer
   *
   * Divides audio into frames and detects pitch in each frame.
   * Returns time-series of pitch data for transcription.
   *
   * @param audioBuffer - AudioBuffer from Web Audio API
   * @param frameSize - Samples per frame (default 2048)
   * @param hopSize - Samples between frames (default 512)
   * @returns Array of {time, frequency, confidence} objects
   */
  public static detectPitchOverTime(
    audioBuffer: AudioBuffer,
    frameSize: number = 2048,
    hopSize: number = 512
  ): Array<{ time: number; frequency: number; confidence: number }> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const pitchData: Array<{ time: number; frequency: number; confidence: number }> = [];

    // Process each frame
    for (let offset = 0; offset + frameSize <= channelData.length; offset += hopSize) {
      const frame = new Float32Array(frameSize);
      for (let i = 0; i < frameSize; i++) {
        frame[i] = channelData[offset + i];
      }

      // Detect pitch in this frame
      const { frequency, confidence } = this.detectPitchAutocorrelation(frame, sampleRate);

      // Record time in seconds
      const time = offset / sampleRate;

      // Only record if confidence is above threshold
      if (confidence > 0.1) {
        pitchData.push({ time, frequency, confidence });
      }
    }

    return pitchData;
  }

  /**
   * Transcribe audio buffer to MIDI notes
   *
   * High-level method that detects pitch over time and segments into notes.
   * Perfect for converting stem audio to piano roll data.
   *
   * @param audioBuffer - AudioBuffer from Web Audio API
   * @param minNoteDuration - Minimum note duration in seconds (default 0.05)
   * @returns Array of MIDI note objects for PianoRollCanvas
   */
  public static transcribeAudioBufferToNotes(
    audioBuffer: AudioBuffer,
    minNoteDuration: number = 0.05
  ): Array<{ pitch: number; startTime: number; endTime: number; velocity: number }> {
    // Detect pitch over time
    const pitchData = this.detectPitchOverTime(audioBuffer);

    if (pitchData.length === 0) {
      return [];
    }

    // Convert pitch to MIDI notes
    const notes: Array<{ pitch: number; startTime: number; endTime: number; velocity: number }> = [];
    let currentNote: {
      midiPitch: number;
      startTime: number;
      confidence: number;
    } | null = null;

    for (let i = 0; i < pitchData.length; i++) {
      const { time, frequency, confidence } = pitchData[i];

      // Convert frequency to MIDI pitch
      const midiPitch = Math.round(69 + 12 * Math.log2(frequency / A4_FREQUENCY));

      // Validate MIDI range
      if (midiPitch < 0 || midiPitch > 127) {
        continue;
      }

      if (!currentNote) {
        // Start new note
        currentNote = { midiPitch, startTime: time, confidence };
      } else if (Math.abs(midiPitch - currentNote.midiPitch) <= 1) {
        // Same note (allow 1 semitone variation due to pitch detection jitter)
        currentNote.confidence = Math.max(currentNote.confidence, confidence);
      } else {
        // Note changed - save previous note
        const duration = time - currentNote.startTime;

        if (duration >= minNoteDuration) {
          notes.push({
            pitch: currentNote.midiPitch,
            startTime: currentNote.startTime,
            endTime: time,
            velocity: Math.round(currentNote.confidence * 127),
          });
        }

        // Start new note
        currentNote = { midiPitch, startTime: time, confidence };
      }
    }

    // Save final note
    if (currentNote) {
      const endTime = pitchData[pitchData.length - 1].time;
      const duration = endTime - currentNote.startTime;

      if (duration >= minNoteDuration) {
        notes.push({
          pitch: currentNote.midiPitch,
          startTime: currentNote.startTime,
          endTime,
          velocity: Math.round(currentNote.confidence * 127),
        });
      }
    }

    return notes;
  }

  /**
   * Convert a frequency (Hz) to the nearest musical note
   *
   * @param frequency - Frequency in Hz
   * @param confidence - Pitch detection confidence (0-1)
   * @returns Note object with frequency, name, and octave
   */
  public static frequencyToNote(frequency: number, confidence: number = 1.0): Note {
    if (frequency <= 0) {
      return {
        frequency: 0,
        note: 'REST',
        octave: 0,
        confidence: 0,
      };
    }

    // Calculate MIDI note number from frequency
    // MIDI formula: noteNumber = 69 + 12 * log2(frequency / 440)
    const midiNoteNumber = 69 + 12 * Math.log2(frequency / A4_FREQUENCY);

    // Round to nearest semitone
    const roundedMidiNote = Math.round(midiNoteNumber);

    // Ensure MIDI note is in valid range (0-127)
    if (roundedMidiNote < 0 || roundedMidiNote > 127) {
      return {
        frequency,
        note: 'OUT_OF_RANGE',
        octave: 0,
        confidence: 0,
      };
    }

    // Calculate octave and note within octave
    const octave = Math.floor(roundedMidiNote / 12) - 1;
    const noteIndex = roundedMidiNote % 12;
    const noteName = NOTE_NAMES[noteIndex];

    // Calculate actual frequency of the rounded note
    const actualFrequency = A4_FREQUENCY * Math.pow(2, (roundedMidiNote - 69) / 12);

    return {
      frequency: actualFrequency,
      note: `${noteName}${octave}`,
      octave,
      confidence,
    };
  }

  /**
   * Convert a MIDI note number to a Note object
   *
   * @param midiNoteNumber - MIDI note number (0-127)
   * @returns Note object
   */
  public static midiNumberToNote(midiNoteNumber: number): Note {
    if (midiNoteNumber < 0 || midiNoteNumber > 127) {
      return {
        frequency: 0,
        note: 'INVALID',
        octave: 0,
        confidence: 0,
      };
    }

    const octave = Math.floor(midiNoteNumber / 12) - 1;
    const noteIndex = midiNoteNumber % 12;
    const noteName = NOTE_NAMES[noteIndex];

    // Calculate frequency
    const frequency = A4_FREQUENCY * Math.pow(2, (midiNoteNumber - 69) / 12);

    return {
      frequency,
      note: `${noteName}${octave}`,
      octave,
      confidence: 1.0,
    };
  }

  /**
   * Convert a note name (e.g., "C4") to a MIDI number
   *
   * @param noteName - Note name (e.g., "C4", "D#5")
   * @returns MIDI note number (0-127) or -1 if invalid
   */
  public static noteNameToMidi(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) {
      return -1;
    }

    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = NOTE_NAMES.indexOf(note);

    if (noteIndex === -1) {
      return -1;
    }

    // Calculate MIDI note: (octave + 1) * 12 + noteIndex
    const midiNumber = (octave + 1) * 12 + noteIndex;

    // Validate range
    return midiNumber >= 0 && midiNumber <= 127 ? midiNumber : -1;
  }

  /**
   * Convert frequency array to sequence of notes
   *
   * Segments continuous frequencies into discrete notes based on onset detection.
   *
   * @param frequencies - Array of frequencies over time
   * @param timings - Timing for each frequency (ms)
   * @param confidences - Confidence values for each frequency
   * @returns Array of Note objects with timing
   */
  public static frequenciesSequenceToNotes(
    frequencies: number[],
    timings: number[],
    confidences: number[] = []
  ): Array<Note & { startTime: number; duration: number }> {
    if (frequencies.length === 0) {
      return [];
    }

    const notes: Array<Note & { startTime: number; duration: number }> = [];
    let currentFrequency = frequencies[0];
    let currentConfidence = confidences[0] ?? 0.8;
    let noteStart = timings[0] ?? 0;
    let prevFrequency = currentFrequency;

    const frequencyThreshold = 50; // Hz - threshold for frequency change

    for (let i = 1; i < frequencies.length; i++) {
      const freq = frequencies[i];
      const confidence = confidences[i] ?? 0.8;
      const time = timings[i] ?? i * 23; // Assume 23ms frames if not provided

      // Detect note boundary (significant frequency change or silence)
      const frequencyChange = Math.abs(freq - prevFrequency);
      const isNoteChange = frequencyChange > frequencyThreshold || freq === 0 || prevFrequency === 0;

      if (isNoteChange && currentFrequency > 0) {
        // Add the note that just ended
        const note = this.frequencyToNote(currentFrequency, currentConfidence);
        const duration = time - noteStart;

        if (duration > 0) {
          notes.push({
            ...note,
            startTime: noteStart,
            duration,
          });
        }

        // Start new note
        currentFrequency = freq;
        currentConfidence = confidence;
        noteStart = time;
      }

      prevFrequency = freq;
    }

    // Add final note
    if (currentFrequency > 0) {
      const note = this.frequencyToNote(currentFrequency, currentConfidence);
      const duration = (timings[timings.length - 1] ?? 0) - noteStart + 23;

      if (duration > 0) {
        notes.push({
          ...note,
          startTime: noteStart,
          duration,
        });
      }
    }

    return notes;
  }

  /**
   * Create MIDI data from a sequence of notes
   *
   * Converts note objects into MIDI representation for playback and visualization.
   */
  public static notesToMidiData(notes: Array<Note & { startTime: number; duration: number }>): MidiData[] {
    return notes.map((note) => {
      const midiNumber = this.noteNameToMidi(note.note);

      if (midiNumber === -1) {
        return null as any;
      }

      return {
        noteNumber: midiNumber,
        note: note.note,
        frequency: note.frequency,
        velocity: Math.min(127, Math.max(0, Math.round(note.confidence * 127))),
        startTime: note.startTime,
        duration: note.duration,
        channel: 0,
      };
    }).filter((m) => m !== null);
  }

  /**
   * Convert MIDI data to MIDI file format (base64 encoded)
   *
   * Creates a minimal MIDI file that can be exported and played.
   * Currently a stub - full implementation would require MIDI library.
   */
  public static midiDataToBase64(midiData: MidiData[]): string {
    // TODO: Implement full MIDI file encoding
    // For now, return empty MIDI file marker
    return 'TVRoZAAAAAAGAAEAAgA4AA=='; // Header for empty MIDI file
  }

  /**
   * Detect note onsets in frequency data
   *
   * Returns indices where new notes begin (useful for segmentation)
   */
  public static detectOnsets(
    frequencies: number[],
    timings: number[],
    sensitivityFactor: number = 1.0
  ): number[] {
    if (frequencies.length < 2) {
      return [];
    }

    const onsets: number[] = [];
    const energyThreshold = 100; // Hz difference threshold
    let prevEnergy = 0;

    for (let i = 1; i < frequencies.length; i++) {
      const energy = Math.abs(frequencies[i] - frequencies[i - 1]);

      // Detect sharp increase in frequency change
      if (energy > energyThreshold * sensitivityFactor && prevEnergy < energyThreshold * sensitivityFactor) {
        onsets.push(i);
      }

      prevEnergy = energy;
    }

    return onsets;
  }

  /**
   * Get note duration categories (whole, half, quarter, eighth, etc.)
   */
  public static durationToNotationType(durationMs: number, tempoInBpm: number): string {
    // Calculate beat duration in ms
    const beatDurationMs = (60000 / tempoInBpm);

    // Classify duration
    if (durationMs >= beatDurationMs * 3) return 'whole'; // 4 beats
    if (durationMs >= beatDurationMs * 1.5) return 'half'; // 2 beats
    if (durationMs >= beatDurationMs * 0.75) return 'quarter'; // 1 beat
    if (durationMs >= beatDurationMs * 0.375) return 'eighth'; // 0.5 beat
    if (durationMs >= beatDurationMs * 0.1875) return 'sixteenth'; // 0.25 beat

    return 'rest';
  }

  /**
   * Calculate cents difference between two frequencies
   *
   * Useful for tuning analysis (100 cents = 1 semitone)
   */
  public static frequencyCentsDifference(freq1: number, freq2: number): number {
    if (freq1 <= 0 || freq2 <= 0) {
      return 0;
    }

    return 1200 * Math.log2(freq2 / freq1);
  }

  /**
   * Build note name with accidentals from a MIDI number
   * Respects musical conventions (sharps vs flats based on context)
   */
  public static midiNumberToNoteName(midiNumber: number, useFlats: boolean = false): string {
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;

    // Use flats instead of sharps if requested
    const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const sharpNotes = NOTE_NAMES;

    const notes = useFlats ? flatNotes : sharpNotes;
    return `${notes[noteIndex]}${octave}`;
  }

  /**
   * Guess the key signature from a chord progression
   * Very basic - returns most likely major/minor key
   */
  public static guessKeyFromNotes(notes: Note[]): string {
    if (notes.length === 0) {
      return 'C major';
    }

    // Simple heuristic: find most common note name
    const noteCounts: { [key: string]: number } = {};

    notes.forEach((note) => {
      const baseNote = note.note.replace(/\d+/g, ''); // Remove octave
      noteCounts[baseNote] = (noteCounts[baseNote] ?? 0) + 1;
    });

    const mostCommonNote = Object.entries(noteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'C';

    // Default to major key
    return `${mostCommonNote} major`;
  }
}

/**
 * Convenience exports for common operations
 */
export const noteTranscription = {
  frequencyToNote: NoteTranscriptionService.frequencyToNote,
  midiNumberToNote: NoteTranscriptionService.midiNumberToNote,
  noteNameToMidi: NoteTranscriptionService.noteNameToMidi,
  frequenciesSequenceToNotes: NoteTranscriptionService.frequenciesSequenceToNotes,
  notesToMidiData: NoteTranscriptionService.notesToMidiData,
};
