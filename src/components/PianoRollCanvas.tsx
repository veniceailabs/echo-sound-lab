/**
 * PIANO ROLL CANVAS COMPONENT
 *
 * Sprint 2B: The Lesson
 * MIDI note visualization with real-time playhead sync
 *
 * Features:
 * - Y-axis: Pitch (88 keys, A0 to C8)
 * - X-axis: Time
 * - Playhead: Current playback position
 * - Highlighting: Active notes in real-time
 * - Color coding: Per-instrument color schemes
 * - Educational: Shows note names and octaves
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * MIDI Note interface
 */
export interface MidiNote {
  pitch: number;              // 0-127 (C-1 to G9)
  startTime: number;          // In seconds
  endTime: number;            // In seconds
  velocity: number;           // 0-127
  stemId?: 'vocals' | 'drums' | 'bass' | 'other';
}

/**
 * Stem color configuration
 */
const STEM_COLORS: Record<string, { fill: string; stroke: string; highlight: string }> = {
  vocals: {
    fill: '#ef4444',      // Red
    stroke: '#dc2626',
    highlight: '#fca5a5', // Light red
  },
  drums: {
    fill: '#eab308',      // Yellow
    stroke: '#ca8a04',
    highlight: '#facc15',  // Light yellow
  },
  bass: {
    fill: '#3b82f6',      // Blue
    stroke: '#1d4ed8',
    highlight: '#93c5fd',  // Light blue
  },
  other: {
    fill: '#10b981',      // Green
    stroke: '#059669',
    highlight: '#6ee7b7',  // Light green
  },
};

/**
 * Piano key frequencies and names
 */
const PIANO_NOTES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/**
 * Get note name from MIDI pitch
 */
function getMidiNoteName(pitch: number): string {
  const noteIndex = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${PIANO_NOTES[noteIndex]}${octave}`;
}

interface PianoRollCanvasProps {
  notes?: MidiNote[];
  currentTime?: number;         // In seconds
  duration?: number;            // In seconds
  height?: number;
  timelineHeight?: number;
  pixelsPerSecond?: number;
  showNoteLabels?: boolean;
  showPianoKeys?: boolean;
  interactive?: boolean;
  onNoteClick?: (note: MidiNote) => void;
}

/**
 * PianoRollCanvas Component
 *
 * Displays MIDI notes in a piano roll grid with real-time playhead.
 * Educational visualization for learning music theory.
 */
export const PianoRollCanvas: React.FC<PianoRollCanvasProps> = ({
  notes = [],
  currentTime = 0,
  duration = 0,
  height = 300,
  timelineHeight = 40,
  pixelsPerSecond = 100,
  showNoteLabels = true,
  showPianoKeys = true,
  interactive = true,
  onNoteClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(800);
  const [hoveredNote, setHoveredNote] = useState<MidiNote | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Piano roll dimensions
  const pianoKeyWidth = showPianoKeys ? 60 : 0;
  const contentWidth = canvasWidth - pianoKeyWidth;
  const noteHeight = height / 88; // 88 piano keys
  const scrollWidth = contentWidth;

  // Update canvas width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  /**
   * Draw the piano roll
   */
  const drawPianoRoll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalWidth = canvasWidth;
    const totalHeight = height + timelineHeight;

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw timeline at top
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, totalWidth, timelineHeight);

    // Draw time markers
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';

    const timeStep = Math.ceil(duration / 10); // Divide into ~10 sections
    for (let t = 0; t <= duration; t += timeStep) {
      const x = pianoKeyWidth + (t / duration) * contentWidth;
      if (x >= pianoKeyWidth && x < canvasWidth) {
        // Draw time marker
        ctx.fillStyle = '#475569';
        ctx.fillRect(x, 0, 1, timelineHeight);

        // Draw time label
        const minutes = Math.floor(t / 60);
        const seconds = Math.floor(t % 60);
        const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 4, timelineHeight - 6);
      }
    }

    // Draw piano keys if enabled
    if (showPianoKeys) {
      drawPianoKeys(ctx, pianoKeyWidth, timelineHeight, height, noteHeight);
    }

    // Draw grid and notes
    ctx.save();
    ctx.translate(pianoKeyWidth, timelineHeight);
    ctx.clipRect(0, 0, contentWidth, height);

    // Draw horizontal grid lines (one per semitone)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let pitch = 0; pitch < 128; pitch++) {
      const y = (127 - pitch) * noteHeight;
      if (y >= 0 && y <= height) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(contentWidth, y);
        ctx.stroke();
      }
    }

    // Draw vertical grid lines (beats)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    const beatStep = 60 / 120; // Assume 120 BPM for now
    for (let t = 0; t <= duration; t += beatStep) {
      const x = (t / duration) * contentWidth;
      if (x >= 0 && x <= contentWidth) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Draw notes
    for (const note of notes) {
      drawNote(ctx, note, currentTime, contentWidth, height, noteHeight);
    }

    // Draw playhead (red line at currentTime)
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * contentWidth;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    ctx.restore();
  }, [notes, currentTime, duration, canvasWidth, height, pianoKeyWidth, contentWidth, noteHeight, timelineHeight, showPianoKeys]);

  /**
   * Draw individual note
   */
  const drawNote = (
    ctx: CanvasRenderingContext2D,
    note: MidiNote,
    currentTime: number,
    contentWidth: number,
    contentHeight: number,
    noteHeight: number
  ) => {
    if (!duration || duration === 0) return;

    // Calculate position and dimensions
    const startX = (note.startTime / duration) * contentWidth;
    const endX = (note.endTime / duration) * contentWidth;
    const width = Math.max(2, endX - startX); // Minimum 2px width

    const y = (127 - note.pitch) * noteHeight;

    // Skip if note is outside visible area
    if (endX < 0 || startX > contentWidth || y < 0 || y > contentHeight) {
      return;
    }

    // Check if note is currently active
    const isActive = currentTime >= note.startTime && currentTime < note.endTime;
    const isHovered = hoveredNote === note;

    // Get stem color
    const stemId = note.stemId || 'other';
    const colors = STEM_COLORS[stemId] || STEM_COLORS.other;
    const fillColor = isActive ? colors.highlight : colors.fill;

    // Draw note rectangle
    ctx.fillStyle = fillColor;
    ctx.fillRect(startX, y, width, noteHeight - 1);

    // Draw note border
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(startX, y, width, noteHeight - 1);

    // Draw note velocity indicator (brightness based on velocity)
    if (note.velocity > 0) {
      const opacity = note.velocity / 127;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.3})`;
      ctx.fillRect(startX, y, width, noteHeight - 1);
    }

    // Draw note label if note is wide enough and labels enabled
    if (showNoteLabels && width > 30 && noteHeight > 12) {
      const noteName = getMidiNoteName(note.pitch);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(noteName, startX + width / 2, y + noteHeight / 2);
    }
  };

  /**
   * Draw piano keys on the left
   */
  const drawPianoKeys = (
    ctx: CanvasRenderingContext2D,
    keyWidth: number,
    timelineHeight: number,
    contentHeight: number,
    noteHeight: number
  ) => {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, timelineHeight, keyWidth, contentHeight);

    // White and black key pattern
    for (let pitch = 0; pitch < 128; pitch++) {
      const noteName = PIANO_NOTES[pitch % 12];
      const isBlackKey = noteName.includes('#');
      const y = timelineHeight + (127 - pitch) * noteHeight;

      // Draw key background
      if (isBlackKey) {
        ctx.fillStyle = '#0f172a';
      } else {
        ctx.fillStyle = '#334155';
      }
      ctx.fillRect(0, y, keyWidth, noteHeight);

      // Draw key border
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0, y, keyWidth, noteHeight);

      // Draw note label for natural notes
      if (!isBlackKey && noteHeight > 20) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteName, keyWidth / 2, y + noteHeight / 2);
      }
    }
  };

  /**
   * Handle mouse move for note hovering
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !canvasRef.current) {
      setHoveredNote(null);
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - pianoKeyWidth;
    const y = e.clientY - rect.top - timelineHeight;

    // Check which note is under cursor
    let found: MidiNote | null = null;
    for (const note of notes) {
      if (duration === 0) break;

      const startX = (note.startTime / duration) * contentWidth;
      const endX = (note.endTime / duration) * contentWidth;
      const noteY = (127 - note.pitch) * noteHeight;

      if (
        x >= startX &&
        x <= endX &&
        y >= noteY &&
        y <= noteY + noteHeight
      ) {
        found = note;
        break;
      }
    }

    setHoveredNote(found);
  };

  /**
   * Handle note click
   */
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNote && onNoteClick) {
      onNoteClick(hoveredNote);
    }
  };

  /**
   * Animation loop
   */
  useEffect(() => {
    const animate = () => {
      drawPianoRoll();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawPianoRoll]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/30"
      style={{ height: `${height + timelineHeight + 20}px` }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={height + timelineHeight}
        style={{
          display: 'block',
          width: '100%',
          height: height + timelineHeight,
          cursor: hoveredNote ? 'pointer' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNote(null)}
        onClick={handleClick}
        title={`Piano Roll • ${notes.length} notes • Time: ${currentTime.toFixed(2)}s`}
      />
      <div className="px-2 py-1 text-xs text-slate-500 flex justify-between">
        <span>Piano Roll</span>
        <span>{notes.length} notes • {currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
      </div>
    </div>
  );
};

export default PianoRollCanvas;
