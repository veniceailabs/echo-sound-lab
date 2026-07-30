import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Stem } from '../types';
import { audioEngine } from '../services/audioEngine';
import { analyzeStemMix } from '../services/geminiService';
import { glassCard, glowButton, secondaryButton, sectionHeader, gradientDivider, cn } from '../utils/secondLightStyles';
import { useAudioContextState } from '../hooks/useAudioContextState';
import { AudioResumeGuard } from './AudioResumeGuard';
import { debugTelemetryService } from '../services/debugTelemetryService';
import { downloadAudioWithManifest } from '../services/audioExportService';
import { acknowledgeCoreRecovery, autosaveCoreSession, recoverCoreSession } from '../services/coreApi';
import {
    buildProofTrainerSessionManifestFromTracks,
    type ProofTrainerCompLane,
    type ProofTrainerCompLaneCandidate,
    type ProofTrainerCompSegment,
    type ProofTrainerDecodedTrack,
    type ProofTrainerSessionManifest,
    type ProofTrainerTrackKind,
} from '../services/sessionAlignmentService';
import {
    classifySessionFiles,
    getStemTypeForImportedTrack,
    type SessionImportPackageGraph,
} from '../services/sessionImportService';
import { SessionPackageTree } from './SessionPackageTree';

interface StemState {
    muted: boolean;
    solo: boolean;
    gain: number; // 0-2 (1 = unity)
    pan: number;  // -1 to 1
}

interface MultiStemWorkspaceProps {
    initialStems?: Stem[];
}

interface CompSegmentAdjustment {
    startDeltaMs: number;
    endDeltaMs: number;
}

interface TimelineTrackTrimAdjustment {
    trimStartDeltaMs: number;
    trimEndDeltaMs: number;
}

interface TimelineTrackSplitMarker {
    splitPointsMs: number[];
}

const CORE_MULTI_STEM_SESSION_JOB_ID = 'multi-stem-current';
const COMP_SEGMENT_NUDGE_MS = 10;
const MIN_COMP_SEGMENT_DURATION_MS = 20;

const STEM_KEYS = ['vocals', 'drums', 'bass', 'other'] as const;

const normalizeStemKey = (stem: Stem): (typeof STEM_KEYS)[number] => {
    const raw = String(stem.type || stem.name || '').toLowerCase();
    if (raw.includes('voc') || raw.includes('lead')) return 'vocals';
    if (raw.includes('drum') || raw.includes('beat') || raw.includes('perc')) return 'drums';
    if (raw.includes('bass')) return 'bass';
    return 'other';
};

const inferAlignmentKind = (stem: Stem): ProofTrainerTrackKind => {
    const raw = String(stem.type || stem.name || '').toLowerCase();
    if (raw.includes('ref') || raw.includes('master') || raw.includes('mix') || raw.includes('final')) return 'reference';
    if (raw.includes('beat') || raw.includes('drum') || raw.includes('perc') || raw.includes('instrumental')) return 'beat';
    if (raw.includes('voc') || raw.includes('lead') || raw.includes('verse') || raw.includes('hook')) return 'vocal';
    return 'other';
};

const inferAlignmentRole = (stem: Stem): string => {
    const raw = String(stem.type || stem.name || '').toLowerCase();
    if (raw.includes('lead') || raw.includes('verse') || raw.includes('hook')) return 'lead';
    if (raw.includes('double') || raw.includes('dbl')) return 'double';
    if (raw.includes('adlib')) return 'adlib';
    if (raw.includes('harmony')) return 'harmony';
    if (raw.includes('ref') || raw.includes('master') || raw.includes('mix') || raw.includes('final')) return 'reference';
    if (raw.includes('beat') || raw.includes('drum') || raw.includes('perc')) return 'beat';
    if (raw.includes('bass')) return 'bass';
    return normalizeStemKey(stem) === 'vocals' ? 'support' : 'other';
};

const gainToDb = (gain: number): number => {
    if (!Number.isFinite(gain) || gain <= 0) return -60;
    return 20 * Math.log10(Math.max(gain, 1e-6));
};

const buildMixState = (stems: Stem[], stemStates: Record<string, StemState>) => {
    const mixState: Record<string, { volume_db: number; pan: number; mute: boolean; solo: boolean }> = {
        vocals: { volume_db: 0, pan: 0, mute: false, solo: false },
        drums: { volume_db: 0, pan: 0, mute: false, solo: false },
        bass: { volume_db: 0, pan: 0, mute: false, solo: false },
        other: { volume_db: 0, pan: 0, mute: false, solo: false },
    };

    stems.forEach((stem) => {
        const state = stemStates[stem.id] || { muted: false, solo: false, gain: 1, pan: 0 };
        const key = normalizeStemKey(stem);
        mixState[key] = {
            volume_db: gainToDb(state.gain),
            pan: Math.min(1, Math.max(-1, state.pan)),
            mute: Boolean(state.muted),
            solo: Boolean(state.solo),
        };
    });

    return mixState;
};

const COMP_WAVEFORM_WIDTH = 220;
const COMP_WAVEFORM_HEIGHT = 34;
const TIMELINE_RULER_STEP_MS = 5000;
const TIMELINE_TRACK_SNAP_MS = 50;
const TIMELINE_TRACK_SLIP_MS = 50;
const TRANSIENT_BLOCK_SIZE = 1024;
const TRANSIENT_MIN_RMS = 0.01;
const TRANSIENT_MIN_RISE_RATIO = 1.65;
const TRANSIENT_SNAP_WINDOW_MS = 35;
const COMP_KEYBOARD_NUDGE_MS = 5;
const TIMELINE_MIN_TRIM_DURATION_MS = 25;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const drawCompWaveform = (
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer,
    sliceStartMs: number,
    sliceEndMs: number,
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const renderWidth = width / dpr;
    const renderHeight = height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(dpr, dpr);

    const mid = renderHeight / 2;
    const channel = buffer.getChannelData(0);
    const sampleCount = Math.max(1, channel.length);
    const clampRatio = (value: number) => Math.max(0, Math.min(1, value));
    const startRatio = clampRatio(sliceStartMs / Math.max(1, buffer.duration * 1000));
    const endRatio = clampRatio(sliceEndMs / Math.max(1, buffer.duration * 1000));
    const sliceLeft = Math.min(startRatio, endRatio) * renderWidth;
    const sliceRight = Math.max(startRatio, endRatio) * renderWidth;
    const samplesPerPixel = Math.max(1, Math.floor(sampleCount / renderWidth));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    for (let x = 0; x < renderWidth; x += 1) {
        const start = Math.floor((x / renderWidth) * sampleCount);
        const end = Math.min(sampleCount, start + samplesPerPixel);
        let peak = 0;
        for (let i = start; i < end; i += 1) {
            peak = Math.max(peak, Math.abs(channel[i] ?? 0));
        }
        const bar = Math.max(1, peak * mid * 0.9);
        const inSlice = x >= sliceLeft && x <= sliceRight;
        ctx.fillStyle = inSlice ? 'rgba(34, 211, 238, 0.8)' : 'rgba(148, 163, 184, 0.28)';
        ctx.fillRect(x, mid - bar, 1, bar * 2);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(0, 0, sliceLeft, renderHeight);
    ctx.fillRect(sliceRight, 0, renderWidth - sliceRight, renderHeight);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sliceLeft, 0);
    ctx.lineTo(sliceLeft, renderHeight);
    ctx.moveTo(sliceRight, 0);
    ctx.lineTo(sliceRight, renderHeight);
    ctx.stroke();
};

const analyzeTransientPoints = (buffer: AudioBuffer): number[] => {
    const data = buffer.getChannelData(0);
    const blockCount = Math.max(3, Math.ceil(data.length / TRANSIENT_BLOCK_SIZE));
    const envelope: number[] = [];

    for (let block = 0; block < blockCount; block += 1) {
        const start = block * TRANSIENT_BLOCK_SIZE;
        const end = Math.min(data.length, start + TRANSIENT_BLOCK_SIZE);
        let sumSquares = 0;
        let count = 0;
        for (let i = start; i < end; i += 1) {
            const sample = data[i] ?? 0;
            sumSquares += sample * sample;
            count += 1;
        }
        envelope.push(count > 0 ? Math.sqrt(sumSquares / count) : 0);
    }

    const sorted = [...envelope].sort((left, right) => left - right);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] ?? 0 : 0;
    const threshold = Math.max(TRANSIENT_MIN_RMS, median * 1.5);
    const points: number[] = [];

    for (let index = 1; index < envelope.length - 1; index += 1) {
        const current = envelope[index] ?? 0;
        const previous = envelope[index - 1] ?? 0;
        const next = envelope[index + 1] ?? 0;
        if (current < threshold) continue;
        if (current < previous * TRANSIENT_MIN_RISE_RATIO) continue;
        if (current < next * 0.95) continue;
        points.push(((index * TRANSIENT_BLOCK_SIZE) / buffer.sampleRate) * 1000);
    }

    return points;
};

const snapToTransient = (targetMs: number, transientPoints: number[]) => {
    if (transientPoints.length === 0) return targetMs;
    let best = targetMs;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of transientPoints) {
        const distance = Math.abs(point - targetMs);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = point;
        }
    }
    return bestDistance <= TRANSIENT_SNAP_WINDOW_MS ? best : targetMs;
};

const CompSegmentWaveformStrip: React.FC<{
    buffer: AudioBuffer;
    segment: ProofTrainerCompSegment;
    onSetStartTargetDelta: (segmentId: string, deltaMs: number) => void;
    onSetEndTargetDelta: (segmentId: string, deltaMs: number) => void;
}> = ({ buffer, segment, onSetStartTargetDelta, onSetEndTargetDelta }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dragRef = useRef<null | {
        edge: 'start' | 'end';
        startClientX: number;
    }>(null);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [activeEdge, setActiveEdge] = useState<'start' | 'end'>('start');
    const transientPoints = useMemo(() => analyzeTransientPoints(buffer), [buffer]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const drawWidth = COMP_WAVEFORM_WIDTH;
        const drawHeight = COMP_WAVEFORM_HEIGHT;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(drawWidth * dpr);
        canvas.height = Math.floor(drawHeight * dpr);
        canvas.style.width = `${drawWidth}px`;
        canvas.style.height = `${drawHeight}px`;
        drawCompWaveform(canvas, buffer, segment.comp_start_ms, segment.comp_end_ms);
    }, [buffer, segment.comp_end_ms, segment.comp_start_ms]);

    const startDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        event.preventDefault();
        event.stopPropagation();
        canvas.focus();
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = event.clientX - rect.left;
        const startX = (Math.min(segment.comp_start_ms, segment.comp_end_ms) / Math.max(1, buffer.duration * 1000)) * rect.width;
        const endX = (Math.max(segment.comp_start_ms, segment.comp_end_ms) / Math.max(1, buffer.duration * 1000)) * rect.width;
        const startDist = Math.abs(x - startX);
        const endDist = Math.abs(x - endX);
        const edge = startDist <= endDist ? 'start' : 'end';
        setActiveEdge(edge);
        dragRef.current = {
            edge,
            startClientX: event.clientX,
        };

        const handleMove = (moveEvent: PointerEvent) => {
            const activeCanvas = canvasRef.current;
            const drag = dragRef.current;
            if (!activeCanvas || !drag) return;
            const rect = activeCanvas.getBoundingClientRect();
            if (rect.width <= 0) return;
            const deltaMs = ((moveEvent.clientX - drag.startClientX) / rect.width) * buffer.duration * 1000;
            const minDurationMs = MIN_COMP_SEGMENT_DURATION_MS;

            if (drag.edge === 'start') {
                const nextStart = Math.max(segment.start_ms, Math.min(segment.comp_start_ms + deltaMs, segment.comp_end_ms - minDurationMs));
                const snappedStart = snapEnabled ? snapToTransient(nextStart, transientPoints) : nextStart;
                const clampedStart = Math.max(segment.start_ms, Math.min(snappedStart, segment.comp_end_ms - minDurationMs));
                onSetStartTargetDelta(segment.segment_id, clampedStart - segment.start_ms);
            } else {
                const nextEnd = Math.min(segment.end_ms, Math.max(segment.comp_end_ms + deltaMs, segment.comp_start_ms + minDurationMs));
                const snappedEnd = snapEnabled ? snapToTransient(nextEnd, transientPoints) : nextEnd;
                const clampedEnd = Math.min(segment.end_ms, Math.max(snappedEnd, segment.comp_start_ms + minDurationMs));
                onSetEndTargetDelta(segment.segment_id, clampedEnd - segment.end_ms);
            }
        };

        const endDrag = () => {
            dragRef.current = null;
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    }, [buffer.duration, onSetEndTargetDelta, onSetStartTargetDelta, segment.comp_end_ms, segment.comp_start_ms, segment.end_ms, segment.segment_id, segment.start_ms, snapEnabled, transientPoints]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = (event.shiftKey ? COMP_KEYBOARD_NUDGE_MS * 4 : COMP_KEYBOARD_NUDGE_MS) * (event.key === 'ArrowLeft' ? -1 : 1);
        if (activeEdge === 'start') {
            const nextStart = Math.max(segment.start_ms, Math.min(segment.comp_start_ms + delta, segment.comp_end_ms - MIN_COMP_SEGMENT_DURATION_MS));
            const snappedStart = snapEnabled ? snapToTransient(nextStart, transientPoints) : nextStart;
            const clampedStart = Math.max(segment.start_ms, Math.min(snappedStart, segment.comp_end_ms - MIN_COMP_SEGMENT_DURATION_MS));
            onSetStartTargetDelta(segment.segment_id, clampedStart - segment.start_ms);
        } else {
            const nextEnd = Math.min(segment.end_ms, Math.max(segment.comp_end_ms + delta, segment.comp_start_ms + MIN_COMP_SEGMENT_DURATION_MS));
            const snappedEnd = snapEnabled ? snapToTransient(nextEnd, transientPoints) : nextEnd;
            const clampedEnd = Math.min(segment.end_ms, Math.max(snappedEnd, segment.comp_start_ms + MIN_COMP_SEGMENT_DURATION_MS));
            onSetEndTargetDelta(segment.segment_id, clampedEnd - segment.end_ms);
        }
    }, [activeEdge, onSetEndTargetDelta, onSetStartTargetDelta, segment.comp_end_ms, segment.comp_start_ms, segment.end_ms, segment.segment_id, segment.start_ms, snapEnabled, transientPoints]);

    return (
        <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[9px] text-slate-500">
                <span>{transientPoints.length} transient snap points</span>
                <button
                    type="button"
                    onClick={() => setSnapEnabled((current) => !current)}
                    className={cn(
                        'rounded-full border px-2 py-0.5 font-semibold transition-all',
                        snapEnabled
                            ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100'
                            : 'border-white/10 bg-black/20 text-slate-400'
                    )}
                >
                    {snapEnabled ? 'Snap On' : 'Snap Off'}
                </button>
            </div>
            <canvas
                ref={canvasRef}
                className="rounded-md border border-white/10 cursor-col-resize touch-none outline-none"
                onPointerDown={startDrag}
                onDoubleClick={() => {
                    onSetStartTargetDelta(segment.segment_id, segment.start_ms - segment.start_ms);
                    onSetEndTargetDelta(segment.segment_id, segment.end_ms - segment.end_ms);
                }}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                aria-label={`comp-waveform-${segment.segment_id}`}
                title="Drag either edge, use arrow keys when focused, double-click to reset."
            />
            <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500">
                <span className="text-cyan-100/60">{activeEdge === 'start' ? 'Start edge active' : 'End edge active'}</span>
                <span>Arrow keys nudge focused edge</span>
            </div>
        </div>
    );
};

const SessionTimeline: React.FC<{
    manifest: ProofTrainerSessionManifest;
    trackStartOverrides: Record<string, number>;
    trackTrimOverrides: Record<string, TimelineTrackTrimAdjustment>;
    trackSplitMarkers: Record<string, TimelineTrackSplitMarker>;
    onSetTrackStartOverride: (trackId: string, startTimestampMs: number) => void;
    onResetTrackStartOverride: (trackId: string) => void;
    onSetTrackTrimOverride: (trackId: string, trimStartDeltaMs: number, trimEndDeltaMs: number) => void;
    onResetTrackTrimOverride: (trackId: string) => void;
    onSetTrackSplitMarker: (trackId: string, splitAtMs: number) => void;
    onResetTrackSplitMarker: (trackId: string) => void;
}> = ({ manifest, trackStartOverrides, trackTrimOverrides, trackSplitMarkers, onSetTrackStartOverride, onResetTrackStartOverride, onSetTrackTrimOverride, onResetTrackTrimOverride, onSetTrackSplitMarker, onResetTrackSplitMarker }) => {
    const dragStateRef = useRef<null | {
        trackId: string;
        edge: 'move' | 'trim-start' | 'trim-end';
        startClientX: number;
        initialStartMs: number;
        initialTrimStartMs: number;
        initialTrimEndMs: number;
        widthPx: number;
    }>(null);
    const durationMs = Math.max(1, manifest.duration_ms);
    const trackCount = manifest.tracks.length;
    const rulerMarks = [];
    for (let t = 0; t <= durationMs; t += TIMELINE_RULER_STEP_MS) {
        rulerMarks.push(t);
    }

    const formatTime = (valueMs: number) => {
        const totalSeconds = valueMs / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
        return `${minutes}:${seconds}`;
    };

    const startDrag = (event: React.PointerEvent<HTMLDivElement>, trackId: string, initialStartMs: number) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
        dragStateRef.current = {
            trackId,
            edge: 'move',
            startClientX: event.clientX,
            initialStartMs,
            initialTrimStartMs: manifest.tracks.find((track) => track.trackId === trackId)?.trim_start_ms ?? 0,
            initialTrimEndMs: manifest.tracks.find((track) => track.trackId === trackId)?.trim_end_ms ?? 0,
            widthPx: rect.width,
        };
        const handleMove = (moveEvent: PointerEvent) => {
            const drag = dragStateRef.current;
            if (!drag || drag.trackId !== trackId) return;
            if (drag.widthPx <= 0) return;
            const sourceDurationMs = Math.max(1, manifest.tracks.find((item) => item.trackId === trackId)?.duration_ms ?? durationMs);
            const deltaMs = ((moveEvent.clientX - drag.startClientX) / drag.widthPx) * sourceDurationMs;
            const snappedDelta = moveEvent.shiftKey
                ? deltaMs
                : Math.round(deltaMs / TIMELINE_TRACK_SNAP_MS) * TIMELINE_TRACK_SNAP_MS;
            const track = manifest.tracks.find((item) => item.trackId === trackId);
            if (!track) return;
            const trackDurationMs = Math.max(1, track.trim_end_ms - track.trim_start_ms);
            const nextStartMs = clampNumber(drag.initialStartMs + snappedDelta, 0, Math.max(0, durationMs - trackDurationMs));
            onSetTrackStartOverride(trackId, nextStartMs);
        };
        const endDrag = () => {
            dragStateRef.current = null;
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    };

    const startTrimDrag = (event: React.PointerEvent<HTMLButtonElement>, trackId: string, edge: 'trim-start' | 'trim-end') => {
        event.preventDefault();
        event.stopPropagation();
        const track = manifest.tracks.find((item) => item.trackId === trackId);
        if (!track) return;
        const bar = (event.currentTarget.parentElement as HTMLDivElement | null);
        const widthPx = bar?.getBoundingClientRect().width ?? 0;
        dragStateRef.current = {
            trackId,
            edge,
            startClientX: event.clientX,
            initialStartMs: track.start_timestamp_ms,
            initialTrimStartMs: track.trim_start_ms,
            initialTrimEndMs: track.trim_end_ms,
            widthPx,
        };

        const handleMove = (moveEvent: PointerEvent) => {
            const drag = dragStateRef.current;
            if (!drag || drag.trackId !== trackId) return;
            if (drag.widthPx <= 0) return;
            const deltaMs = ((moveEvent.clientX - drag.startClientX) / drag.widthPx) * Math.max(1, drag.initialTrimEndMs - drag.initialTrimStartMs);
            const snappedDelta = moveEvent.shiftKey
                ? deltaMs
                : Math.round(deltaMs / TIMELINE_TRACK_SNAP_MS) * TIMELINE_TRACK_SNAP_MS;
            const track = manifest.tracks.find((item) => item.trackId === trackId);
            if (!track) return;
            const sourceDurationMs = Math.max(1, track.duration_ms);
            const currentStart = drag.initialTrimStartMs;
            const currentEnd = drag.initialTrimEndMs;

            if (drag.edge === 'trim-start') {
                const nextStart = clampNumber(currentStart + snappedDelta, 0, Math.max(0, currentEnd - TIMELINE_MIN_TRIM_DURATION_MS));
                onSetTrackTrimOverride(trackId, nextStart - track.trim_start_ms, trackTrimOverrides[trackId]?.trimEndDeltaMs ?? 0);
            } else {
                const nextEnd = clampNumber(currentEnd + snappedDelta, Math.min(sourceDurationMs, currentStart + TIMELINE_MIN_TRIM_DURATION_MS), sourceDurationMs);
                onSetTrackTrimOverride(trackId, trackTrimOverrides[trackId]?.trimStartDeltaMs ?? 0, nextEnd - track.trim_end_ms);
            }
        };

        const endDrag = () => {
            dragStateRef.current = null;
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, trackId: string, currentStartMs: number) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const track = manifest.tracks.find((item) => item.trackId === trackId);
        if (!track) return;
        const trackDurationMs = Math.max(1, track.trim_end_ms - track.trim_start_ms);
        const step = event.shiftKey ? TIMELINE_TRACK_SNAP_MS * 10 : TIMELINE_TRACK_SNAP_MS;
        const delta = event.key === 'ArrowLeft' ? -step : step;
        const nextStartMs = clampNumber(currentStartMs + delta, 0, Math.max(0, durationMs - trackDurationMs));
        onSetTrackStartOverride(trackId, nextStartMs);
    };

    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-[11px] text-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="font-semibold text-cyan-50">Session layout</div>
                    <div className="text-cyan-100/70">
                        {trackCount} tracks aligned across {formatTime(durationMs)} of local session time.
                    </div>
                </div>
                <div className="text-cyan-100/60">
                    Anchor {manifest.anchor_track_id ?? 'auto'} · zero {manifest.session_zero_ms} ms
                </div>
            </div>

            <div className="mt-3 overflow-x-auto">
                <div className="min-w-[900px] space-y-2">
                    <div className="relative ml-[140px] h-5 rounded-lg border border-white/5 bg-white/[0.02] text-[9px] uppercase tracking-[0.2em] text-slate-500">
                        {rulerMarks.map((mark) => (
                            <div
                                key={mark}
                                className="absolute top-0 bottom-0"
                                style={{ left: `${(mark / durationMs) * 100}%` }}
                            >
                                <span className="absolute left-0 top-0 h-full w-px bg-white/15" />
                                <span className="absolute left-1 top-0.5 text-slate-500">{formatTime(mark)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2">
                        {manifest.tracks.map((track) => {
                            const trimAdjustment = trackTrimOverrides[track.trackId] ?? { trimStartDeltaMs: 0, trimEndDeltaMs: 0 };
                            const trimStartMs = clampNumber(track.trim_start_ms + trimAdjustment.trimStartDeltaMs, 0, track.duration_ms);
                            const trimEndMs = clampNumber(track.trim_end_ms + trimAdjustment.trimEndDeltaMs, trimStartMs + TIMELINE_MIN_TRIM_DURATION_MS, track.duration_ms);
                            const leftPct = (track.start_timestamp_ms / durationMs) * 100;
                            const widthPct = Math.max(0.4, ((trimEndMs - trimStartMs) / durationMs) * 100);
                            const splitPointsMs = (trackSplitMarkers[track.trackId]?.splitPointsMs ?? [])
                                .map((point) => clampNumber(point, track.start_timestamp_ms + trimStartMs, track.start_timestamp_ms + trimEndMs))
                                .filter((point, index, array) => array.indexOf(point) === index)
                                .sort((left, right) => left - right);
                            const splitBoundariesMs = [
                                track.start_timestamp_ms + trimStartMs,
                                ...splitPointsMs,
                                track.start_timestamp_ms + trimEndMs,
                            ];
                            const tone =
                                track.kind === 'reference'
                                    ? 'from-cyan-400/80 to-sky-300/60'
                                    : track.kind === 'beat'
                                        ? 'from-amber-400/80 to-orange-300/60'
                                        : track.kind === 'vocal'
                                            ? 'from-fuchsia-400/80 to-rose-300/60'
                                            : 'from-slate-400/80 to-slate-300/60';
                            return (
                                <div key={track.trackId}>
                                    <div className="flex items-center gap-2">
                                        <div className="w-[130px] shrink-0">
                                            <div className="truncate font-medium text-slate-100">{track.fileName}</div>
                                            <div className="text-[9px] text-slate-500">
                                                {track.kind} · {track.role}
                                            </div>
                                            {trackStartOverrides[track.trackId] !== undefined && (
                                                <div className="text-[9px] text-cyan-100/50">Edited</div>
                                            )}
                                        </div>
                                        <div
                                            className="relative h-8 flex-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 outline-none"
                                            role="slider"
                                            tabIndex={0}
                                            aria-label={`Arrange ${track.fileName}`}
                                            aria-valuemin={0}
                                            aria-valuemax={durationMs}
                                            aria-valuenow={Math.round(track.start_timestamp_ms)}
                                            onPointerDown={(event) => startDrag(event, track.trackId, track.start_timestamp_ms)}
                                            onKeyDown={(event) => handleKeyDown(event, track.trackId, track.start_timestamp_ms)}
                                        >
                                            <div className="absolute inset-y-0 left-0 right-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:10%_100%]" />
                                            {splitBoundariesMs.slice(0, -1).map((segmentStartMs, index) => {
                                                const segmentEndMs = splitBoundariesMs[index + 1] ?? segmentStartMs;
                                                const segmentLeftPct = ((segmentStartMs - track.start_timestamp_ms) / Math.max(1, track.duration_ms)) * 100;
                                                const segmentWidthPct = Math.max(0.2, ((segmentEndMs - segmentStartMs) / Math.max(1, track.duration_ms)) * 100);
                                                const segmentTone = index % 2 === 0 ? tone : 'from-white/20 to-white/10';
                                                return (
                                                    <div
                                                        key={`${track.trackId}-segment-${index}`}
                                                        className={`absolute top-1 h-6 rounded-md bg-gradient-to-r ${segmentTone} shadow-[0_0_18px_rgba(34,211,238,0.12)]`}
                                                        style={{ left: `${leftPct + segmentLeftPct}%`, width: `${segmentWidthPct}%` }}
                                                        title={`${track.fileName} · segment ${index + 1} · ${Math.round(segmentStartMs - track.start_timestamp_ms)} to ${Math.round(segmentEndMs - track.start_timestamp_ms)} ms`}
                                                    />
                                                );
                                            })}
                                            {splitPointsMs.map((splitMarkerMs) => {
                                                const splitPct = ((splitMarkerMs - track.start_timestamp_ms) / Math.max(1, track.duration_ms)) * 100;
                                                return (
                                                    <div
                                                        key={`${track.trackId}-split-${splitMarkerMs}`}
                                                        className="absolute top-1 z-10 h-6 w-px bg-fuchsia-300/90 shadow-[0_0_12px_rgba(232,121,249,0.45)]"
                                                        style={{ left: `${leftPct + splitPct}%` }}
                                                        title={`Split marker at ${Math.round(splitMarkerMs)} ms`}
                                                    />
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onPointerDown={(event) => startTrimDrag(event, track.trackId, 'trim-start')}
                                                className="absolute top-0.5 left-0 z-10 h-7 w-2 -translate-x-1/2 cursor-ew-resize rounded-full bg-cyan-300/80 opacity-90 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                                                title="Trim start"
                                            />
                                            <button
                                                type="button"
                                                onPointerDown={(event) => startTrimDrag(event, track.trackId, 'trim-end')}
                                                className="absolute top-0.5 right-0 z-10 h-7 w-2 translate-x-1/2 cursor-ew-resize rounded-full bg-fuchsia-300/80 opacity-90 shadow-[0_0_12px_rgba(217,70,239,0.35)]"
                                                title="Trim end"
                                            />
                                            {track.anchor && (
                                                <div
                                                    className="absolute top-0.5 h-7 w-px bg-emerald-300/90"
                                                    style={{ left: `${leftPct}%` }}
                                                    title="Anchor track"
                                                />
                                            )}
                                            {track.selected && (
                                                <div
                                                    className="absolute inset-y-0 rounded-md border border-cyan-300/40"
                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                />
                                            )}
                                        </div>
                                        {trackStartOverrides[track.trackId] !== undefined && (
                                            <button
                                                type="button"
                                                onClick={() => onResetTrackStartOverride(track.trackId)}
                                                className="rounded-md border border-cyan-200/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold text-cyan-100 hover:border-cyan-100/40"
                                            >
                                                Reset
                                            </button>
                                        )}
                                        {(trackTrimOverrides[track.trackId]?.trimStartDeltaMs || trackTrimOverrides[track.trackId]?.trimEndDeltaMs) && (
                                            <button
                                                type="button"
                                                onClick={() => onResetTrackTrimOverride(track.trackId)}
                                                className="rounded-md border border-cyan-200/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold text-cyan-100 hover:border-cyan-100/40"
                                            >
                                                Reset Trim
                                            </button>
                                        )}
                                        {(trackSplitMarkers[track.trackId]?.splitPointsMs.length ?? 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => onResetTrackSplitMarker(track.trackId)}
                                                className="rounded-md border border-fuchsia-200/20 bg-fuchsia-400/10 px-2 py-1 text-[9px] font-semibold text-fuchsia-100 hover:border-fuchsia-100/40"
                                            >
                                                Reset Split
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1 pl-[140px]">
                                        <button
                                            type="button"
                                            onClick={() => onSetTrackSplitMarker(
                                                track.trackId,
                                                Math.round(track.start_timestamp_ms + ((trimEndMs - trimStartMs) / 2)),
                                            )}
                                            className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold text-slate-200 hover:border-fuchsia-300/30"
                                        >
                                            Split
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const current = trackTrimOverrides[track.trackId] ?? { trimStartDeltaMs: 0, trimEndDeltaMs: 0 };
                                                onSetTrackTrimOverride(
                                                    track.trackId,
                                                    current.trimStartDeltaMs - TIMELINE_TRACK_SLIP_MS,
                                                    current.trimEndDeltaMs - TIMELINE_TRACK_SLIP_MS,
                                                );
                                            }}
                                            className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold text-slate-200 hover:border-cyan-300/30"
                                        >
                                            Slip -
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const current = trackTrimOverrides[track.trackId] ?? { trimStartDeltaMs: 0, trimEndDeltaMs: 0 };
                                                onSetTrackTrimOverride(
                                                    track.trackId,
                                                    current.trimStartDeltaMs + TIMELINE_TRACK_SLIP_MS,
                                                    current.trimEndDeltaMs + TIMELINE_TRACK_SLIP_MS,
                                                );
                                            }}
                                            className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold text-slate-200 hover:border-cyan-300/30"
                                        >
                                            Slip +
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const meterFromDb = (db: number) => {
    if (!Number.isFinite(db)) return 0;
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
};

const formatAnalysisText = (value: any) => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return value == null ? '' : String(value);
};

const stemToAlignmentTrack = (stem: Stem): ProofTrainerDecodedTrack => ({
    trackId: stem.id,
    fileName: stem.name,
    role: inferAlignmentRole(stem),
    kind: inferAlignmentKind(stem),
    buffer: stem.buffer,
});

const MultiStemWorkspace: React.FC<MultiStemWorkspaceProps> = ({ initialStems }) => {
    const [stems, setStems] = useState<Stem[]>(initialStems || []);
    const [stemStates, setStemStates] = useState<Record<string, StemState>>({});
    const [analysis, setAnalysis] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playIntent, setPlayIntent] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingNameValue, setEditingNameValue] = useState('');
    const [playingStemId, setPlayingStemId] = useState<string | null>(null);
    const [playingCompSegmentId, setPlayingCompSegmentId] = useState<string | null>(null);
    const [compLaneOverrides, setCompLaneOverrides] = useState<Record<string, string>>({});
    const [compSegmentAdjustments, setCompSegmentAdjustments] = useState<Record<string, CompSegmentAdjustment>>({});
    const [timelineTrackStartOverrides, setTimelineTrackStartOverrides] = useState<Record<string, number>>({});
    const [timelineTrackTrimOverrides, setTimelineTrackTrimOverrides] = useState<Record<string, TimelineTrackTrimAdjustment>>({});
    const [timelineTrackSplitMarkers, setTimelineTrackSplitMarkers] = useState<Record<string, TimelineTrackSplitMarker>>({});
    const [isUploading, setIsUploading] = useState(false);
    const [coreSessionRecoveryState, setCoreSessionRecoveryState] = useState<'idle' | 'hydrating' | 'restored' | 'empty' | 'error'>('idle');
    const [coreSessionRecoveryNotes, setCoreSessionRecoveryNotes] = useState<string[]>([]);
    const [stemMetrics, setStemMetrics] = useState<Record<string, { rms: number; peak: number }>>({});
    const [stemAudioContext, setStemAudioContext] = useState<AudioContext | null>(null);
    const [sessionImportWarnings, setSessionImportWarnings] = useState<string[]>([]);
    const [sessionImportSourceSummary, setSessionImportSourceSummary] = useState<{
        sourceApp: string;
        displayName: string;
        confidence: number;
        markers: string[];
    } | null>(null);
    const [sessionImportPackageSummary, setSessionImportPackageSummary] = useState<{
        rootName: string;
        audioFileCount: number;
        topLevelNodeCount: number;
    } | null>(null);
    const [sessionImportPackageGraph, setSessionImportPackageGraph] = useState<SessionImportPackageGraph | null>(null);
    const audioContextState = useAudioContextState(stemAudioContext);
    const pendingPlayActionRef = useRef<null | (() => void)>(null);
    const ghostSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const coreRecoveryHydratedRef = useRef(false);
    const folderInputProps = { webkitdirectory: '', directory: '' } as any;

    const clampValue = clampNumber;
    const isAnyPlaying = useMemo(() => isPlaying || !!playingStemId || !!playingCompSegmentId, [isPlaying, playingStemId, playingCompSegmentId]);
    const wasPlayingBeforeHideRef = useRef(false);

    const Knob: React.FC<{
        label: string;
        value: number;
        min: number;
        max: number;
        step: number;
        displayValue: string;
        onChange: (value: number) => void;
        onReset?: () => void;
        snapToZero?: boolean;
    }> = ({ label, value, min, max, step, displayValue, onChange, onReset, snapToZero }) => {
        const angle = ((value - min) / (max - min)) * 270 - 135;
        const pendingValueRef = useRef<number | null>(null);
        const rafRef = useRef<number | null>(null);
        const bodySelectRef = useRef('');

        const handleRangeChange = (rawValue: string) => {
            const percent = Number(rawValue) / 100;
            let nextValue = clampValue(min + percent * (max - min), min, max);
            if (snapToZero && Math.abs(nextValue) <= step * 2) {
                nextValue = 0;
            }
            onChange(nextValue);
        };

        const scheduleUpdate = (nextValue: number) => {
            pendingValueRef.current = nextValue;
            if (rafRef.current !== null) return;
            rafRef.current = window.requestAnimationFrame(() => {
                const pendingValue = pendingValueRef.current;
                pendingValueRef.current = null;
                rafRef.current = null;
                if (pendingValue === null) return;
                let resolvedValue = clampValue(pendingValue, min, max);
                if (snapToZero && Math.abs(resolvedValue) <= step * 2) {
                    resolvedValue = 0;
                }
                onChange(resolvedValue);
            });
        };

        const startDrag = (startY: number, isTouch = false) => {
            const range = max - min;
            const pixelsPerRange = 260;
            const startValue = value;
            bodySelectRef.current = document.body.style.userSelect;
            document.body.style.userSelect = 'none';

            const handleMouseMove = (event: MouseEvent) => {
                const sensitivity = event.shiftKey ? 0.35 : 1;
                const deltaY = (startY - event.clientY) * sensitivity;
                scheduleUpdate(startValue + (deltaY / pixelsPerRange) * range);
            };

            const handleMouseUp = () => {
                document.body.style.userSelect = bodySelectRef.current;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            const handleTouchMove = (event: TouchEvent) => {
                if (!event.touches.length) return;
                event.preventDefault();
                const touch = event.touches[0];
                const deltaY = startY - touch.clientY;
                scheduleUpdate(startValue + (deltaY / pixelsPerRange) * range);
            };

            const handleTouchEnd = () => {
                document.body.style.userSelect = bodySelectRef.current;
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
                document.removeEventListener('touchcancel', handleTouchEnd);
            };

            if (isTouch) {
                document.addEventListener('touchmove', handleTouchMove, { passive: false });
                document.addEventListener('touchend', handleTouchEnd);
                document.addEventListener('touchcancel', handleTouchEnd);
            } else {
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        };

        const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -step * 4 : step * 4;
            scheduleUpdate(value + delta);
        };
        const normalizedValue = ((value - min) / (max - min)) * 100;

        return (
                <div className="flex flex-col items-center gap-1.5">
                    <div
                        onDoubleClick={onReset}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            startDrag(event.clientY, false);
                    }}
                    onTouchStart={(event) => {
                        const touch = event.touches[0];
                        if (!touch) return;
                        startDrag(touch.clientY, true);
                    }}
                    onWheel={handleWheel}
                    className="relative w-10 h-10 rounded-full border border-slate-700/60 bg-slate-900/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] cursor-ns-resize touch-none select-none"
                    title={`${label} (${displayValue})`}
                >
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.1}
                        value={normalizedValue}
                        onChange={(e) => handleRangeChange(e.target.value)}
                        onInput={(e) => handleRangeChange((e.target as HTMLInputElement).value)}
                        className="sr-only"
                        aria-label={label}
                    />
                    <span
                        className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-full rounded-full bg-orange-400/80"
                        style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
                    />
                    <span className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700/70" />
                    <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-slate-900/40 to-slate-950/80" />
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">{label}</div>
                <div className="text-[9px] font-mono text-slate-400">{displayValue}</div>
            </div>
        );
    };

    // Audio nodes refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceNodesRef = useRef<Record<string, AudioBufferSourceNode>>({});
    const gainNodesRef = useRef<Record<string, GainNode>>({});
    const panNodesRef = useRef<Record<string, StereoPannerNode>>({});
    const masterGainRef = useRef<GainNode | null>(null);

    // Initialize audio context
    useEffect(() => {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = context;
        setStemAudioContext(context);
        masterGainRef.current = audioCtxRef.current.createGain();
        masterGainRef.current.connect(audioCtxRef.current.destination);
        return () => {
            // Stop all sources before closing context
            Object.values(sourceNodesRef.current).forEach((source: AudioBufferSourceNode) => {
                try { source.stop(); } catch {}
            });
            sourceNodesRef.current = {};
            try { audioCtxRef.current?.close(); } catch {}
        };
    }, []);

    const stopEverything = useCallback(() => {
        // stop "all stems" playback
        Object.values(sourceNodesRef.current).forEach((source: AudioBufferSourceNode) => {
            try { source.stop(); } catch {}
        });
        sourceNodesRef.current = {};
        setIsPlaying(false);

        // stop solo stem playback
        setPlayingStemId((prev) => {
            if (!prev) return prev;
            const soloKey = `solo-${prev}`;
            if (sourceNodesRef.current[soloKey]) {
                try { sourceNodesRef.current[soloKey].stop(); } catch {}
                delete sourceNodesRef.current[soloKey];
            }
            return null;
        });

        setPlayingCompSegmentId((prev) => {
            if (!prev) return prev;
            const compKey = `comp-${prev}`;
            if (sourceNodesRef.current[compKey]) {
                try { sourceNodesRef.current[compKey].stop(); } catch {}
                delete sourceNodesRef.current[compKey];
            }
            return null;
        });
    }, []);

    const cancelPlayIntent = useCallback(() => {
        pendingPlayActionRef.current = null;
        setPlayIntent(false);
        stopEverything();
    }, [stopEverything]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.hidden) {
                wasPlayingBeforeHideRef.current = isAnyPlaying;
                cancelPlayIntent();
                return;
            }

            if (wasPlayingBeforeHideRef.current) {
                wasPlayingBeforeHideRef.current = false;
                const state = String(audioCtxRef.current?.state ?? '');
                if (state !== 'running') {
                    setPlayIntent(true);
                }
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [cancelPlayIntent, isAnyPlaying]);

    useEffect(() => {
        const running = String(audioContextState) === 'running';
        if (isAnyPlaying && !running) {
            console.warn('[MultiStem] AudioContext suspended while playing; stopping transport to keep UI truthful.');
            stopEverything();
            // Leave pendingPlayActionRef intact so "Enable Audio" can replay last action.
            setPlayIntent(true);
        }
    }, [audioContextState, isAnyPlaying, stopEverything]);

    useEffect(() => {
        if (!audioCtxRef.current) return;
        debugTelemetryService.setAudioContextInfo('multistem', {
            state: String(audioContextState),
            sampleRate: audioCtxRef.current.sampleRate,
        });
    }, [audioContextState]);

    // Load initial stems if provided
    useEffect(() => {
        if (initialStems && initialStems.length > 0 && stems.length === 0) {
            setStems(initialStems);
            // Initialize stem states
            const newStates: Record<string, StemState> = {};
            initialStems.forEach(stem => {
                newStates[stem.id] = {
                    muted: false,
                    solo: false,
                    gain: 1.0,
                    pan: 0
                };
            });
            setStemStates(newStates);
        }
    }, [initialStems]);

    const computeBufferMetrics = (buffer: AudioBuffer) => {
        const length = buffer.length;
        const step = Math.max(1, Math.floor(length / 60000));
        let sumSquares = 0;
        let peak = 0;
        let samples = 0;
        for (let i = 0; i < length; i += step) {
            let sample = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const value = buffer.getChannelData(ch)[i] ?? 0;
                sample = Math.max(sample, Math.abs(value));
            }
            sumSquares += sample * sample;
            if (sample > peak) peak = sample;
            samples += 1;
        }
        const rms = samples > 0 ? Math.sqrt(sumSquares / samples) : 0;
        return {
            rms: rms === 0 ? -Infinity : 20 * Math.log10(rms),
            peak: peak === 0 ? -Infinity : 20 * Math.log10(peak)
        };
    };

    useEffect(() => {
        const metrics: Record<string, { rms: number; peak: number }> = {};
        stems.forEach(stem => {
            if (stem.buffer) {
                metrics[stem.id] = computeBufferMetrics(stem.buffer);
            }
        });
        setStemMetrics(metrics);
    }, [stems]);

    const alignmentManifest = useMemo(() => {
        if (stems.length === 0) return null;
        return buildProofTrainerSessionManifestFromTracks(
            stems.map(stemToAlignmentTrack),
            {
                referenceStyle: 'multistem_workspace_local',
                requestText: 'Local multi-stem alignment',
                acceptToVault: false,
            },
        );
    }, [stems]);

    const resolvedAlignmentTracks = useMemo(() => {
        if (!alignmentManifest) return [];
        const baseDurationMs = Math.max(1, alignmentManifest.duration_ms);
        return alignmentManifest.tracks.map((track) => {
            const overrideStartMs = timelineTrackStartOverrides[track.trackId];
            const trimOverride = timelineTrackTrimOverrides[track.trackId];
            const trimStartMs = clampValue(
                track.trim_start_ms + (trimOverride?.trimStartDeltaMs ?? 0),
                0,
                Math.max(0, track.duration_ms - TIMELINE_MIN_TRIM_DURATION_MS),
            );
            const trimEndMs = clampValue(
                track.trim_end_ms + (trimOverride?.trimEndDeltaMs ?? 0),
                trimStartMs + TIMELINE_MIN_TRIM_DURATION_MS,
                track.duration_ms,
            );
            const trackDurationMs = Math.max(1, trimEndMs - trimStartMs);
            const resolvedTrack = {
                ...track,
                trim_start_ms: Math.round(trimStartMs),
                trim_end_ms: Math.round(trimEndMs),
            };
            if (!Number.isFinite(overrideStartMs)) return resolvedTrack;
            const resolvedStartMs = clampValue(overrideStartMs, 0, Math.max(0, baseDurationMs - trackDurationMs));
            return {
                ...resolvedTrack,
                start_timestamp_ms: Math.round(resolvedStartMs),
            };
        });
    }, [alignmentManifest, timelineTrackStartOverrides, timelineTrackTrimOverrides]);

    const alignmentTrackById = useMemo(() => {
        return new Map(resolvedAlignmentTracks.map((track) => [track.trackId, track]));
    }, [resolvedAlignmentTracks]);

    const getStemAlignment = useCallback((stemId: string) => alignmentTrackById.get(stemId) ?? null, [alignmentTrackById]);
    const applyCompSegmentAdjustment = useCallback((segment: ProofTrainerCompSegment): ProofTrainerCompSegment => {
        const adjustment = compSegmentAdjustments[segment.segment_id];
        if (!adjustment) return segment;

        const sourceStart = Math.min(segment.start_ms, segment.end_ms);
        const sourceEnd = Math.max(segment.start_ms, segment.end_ms);
        const maxStart = Math.max(sourceStart, sourceEnd - MIN_COMP_SEGMENT_DURATION_MS);
        let compStart = clampValue(segment.comp_start_ms + adjustment.startDeltaMs, sourceStart, maxStart);
        let compEnd = clampValue(segment.comp_end_ms + adjustment.endDeltaMs, compStart + MIN_COMP_SEGMENT_DURATION_MS, sourceEnd);

        if (compEnd - compStart < MIN_COMP_SEGMENT_DURATION_MS) {
            compStart = Math.max(sourceStart, compEnd - MIN_COMP_SEGMENT_DURATION_MS);
            compEnd = Math.min(sourceEnd, compStart + MIN_COMP_SEGMENT_DURATION_MS);
        }

        return {
            ...segment,
            comp_start_ms: Math.round(compStart),
            comp_end_ms: Math.round(compEnd),
            duration_ms: Math.max(MIN_COMP_SEGMENT_DURATION_MS, Math.round(compEnd - compStart)),
        };
    }, [clampValue, compSegmentAdjustments]);
    const resolvedCompLanes = useMemo(() => {
        return (alignmentManifest?.comp_lanes ?? []).map((lane) => {
            const activeCandidateId = compLaneOverrides[lane.lane_id] ?? lane.primary_candidate_id ?? null;
            const activeCandidate = lane.candidates.find((candidate) => candidate.candidate_id === activeCandidateId) ?? lane.candidates[0] ?? null;
            const baseSegments = activeCandidate
                ? [{
                    segment_id: `${lane.lane_id}-active-${activeCandidate.candidate_id}`.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
                    lane_id: lane.lane_id,
                    candidate_id: activeCandidate.candidate_id,
                    track_id: activeCandidate.track_id,
                    file_name: activeCandidate.file_name,
                    section_name: activeCandidate.section_name,
                    lane_role: activeCandidate.lane_role,
                    start_ms: activeCandidate.start_ms,
                    end_ms: activeCandidate.end_ms,
                    duration_ms: activeCandidate.duration_ms,
                    comp_start_ms: activeCandidate.start_ms,
                    comp_end_ms: activeCandidate.end_ms,
                    score: activeCandidate.score,
                }]
                : lane.assembled_segments;
            const assembledSegments = baseSegments.map(applyCompSegmentAdjustment);
            return {
                ...lane,
                activeCandidateId,
                activeCandidate,
                assembled_segments: assembledSegments,
            };
        });
    }, [alignmentManifest, applyCompSegmentAdjustment, compLaneOverrides]);
    const resolvedAlignmentManifest = useMemo(() => {
        if (!alignmentManifest) return null;
        const resolvedDurationMs = resolvedAlignmentTracks.reduce((max, track) => {
            const trackEndMs = track.start_timestamp_ms + Math.max(1, track.trim_end_ms - track.trim_start_ms);
            return Math.max(max, trackEndMs);
        }, alignmentManifest.duration_ms);
        const assembledSegmentCount = resolvedCompLanes.reduce((count, lane) => count + lane.assembled_segments.length, 0);
        return {
            ...alignmentManifest,
            duration_ms: Math.max(alignmentManifest.duration_ms, resolvedDurationMs),
            tracks: resolvedAlignmentTracks,
            comp_lanes: resolvedCompLanes.map(({ activeCandidateId: _activeCandidateId, activeCandidate: _activeCandidate, ...lane }) => lane),
            summary: {
                ...alignmentManifest.summary,
                comp_lane_count: resolvedCompLanes.length,
                candidate_take_count: resolvedCompLanes.reduce((count, lane) => count + lane.candidates.length, 0),
                assembled_segment_count: assembledSegmentCount,
            },
        };
    }, [alignmentManifest, resolvedAlignmentTracks, resolvedCompLanes]);

    useEffect(() => {
        if (coreRecoveryHydratedRef.current) return;
        coreRecoveryHydratedRef.current = true;
        let cancelled = false;

        setCoreSessionRecoveryState('hydrating');
        recoverCoreSession(CORE_MULTI_STEM_SESSION_JOB_ID)
            .then((result) => {
                if (cancelled) return;
                const dspState = result.session?.dsp_state as Record<string, any> | undefined;
                if (result.status !== 'available' || !dspState) {
                    setCoreSessionRecoveryState('empty');
                    setCoreSessionRecoveryNotes(['No stored comp workspace state found for this session.']);
                    return;
                }

                const restoredLaneOverrides = dspState.comp_lane_overrides && typeof dspState.comp_lane_overrides === 'object'
                    ? dspState.comp_lane_overrides as Record<string, string>
                    : null;
                const restoredAdjustments = dspState.comp_segment_adjustments && typeof dspState.comp_segment_adjustments === 'object'
                    ? dspState.comp_segment_adjustments as Record<string, CompSegmentAdjustment>
                    : null;
                const restoredTimelineOverrides = dspState.timeline_track_start_overrides && typeof dspState.timeline_track_start_overrides === 'object'
                    ? dspState.timeline_track_start_overrides as Record<string, number>
                    : null;
                const restoredTimelineTrimOverrides = dspState.timeline_track_trim_overrides && typeof dspState.timeline_track_trim_overrides === 'object'
                    ? dspState.timeline_track_trim_overrides as Record<string, TimelineTrackTrimAdjustment>
                    : null;
                const restoredTimelineSplitMarkers = dspState.timeline_track_split_markers && typeof dspState.timeline_track_split_markers === 'object'
                    ? Object.fromEntries(
                        Object.entries(dspState.timeline_track_split_markers as Record<string, any>).map(([trackId, value]) => {
                            const splitPointsMs = Array.isArray(value?.splitPointsMs)
                                ? value.splitPointsMs.filter((point: unknown) => Number.isFinite(Number(point))).map((point: unknown) => Math.round(Number(point)))
                                : Number.isFinite(Number(value?.splitAtMs))
                                    ? [Math.round(Number(value.splitAtMs))]
                                    : [];
                            return [trackId, { splitPointsMs }];
                        }),
                    ) as Record<string, TimelineTrackSplitMarker>
                    : null;

                if (restoredLaneOverrides) {
                    setCompLaneOverrides(restoredLaneOverrides);
                }
                if (restoredAdjustments) {
                    setCompSegmentAdjustments(restoredAdjustments);
                }
                if (restoredTimelineOverrides) {
                    setTimelineTrackStartOverrides(restoredTimelineOverrides);
                }
                if (restoredTimelineTrimOverrides) {
                    setTimelineTrackTrimOverrides(restoredTimelineTrimOverrides);
                }
                if (restoredTimelineSplitMarkers) {
                    setTimelineTrackSplitMarkers(restoredTimelineSplitMarkers);
                }

                const notes: string[] = [];
                if (restoredLaneOverrides) {
                    notes.push(`Restored ${Object.keys(restoredLaneOverrides).length} lane override${Object.keys(restoredLaneOverrides).length === 1 ? '' : 's'}.`);
                }
                if (restoredAdjustments) {
                    notes.push(`Restored ${Object.keys(restoredAdjustments).length} trimmed slice adjustment${Object.keys(restoredAdjustments).length === 1 ? '' : 's'}.`);
                }
                if (restoredTimelineOverrides) {
                    notes.push(`Restored ${Object.keys(restoredTimelineOverrides).length} arrangement shift${Object.keys(restoredTimelineOverrides).length === 1 ? '' : 's'}.`);
                }
                if (restoredTimelineTrimOverrides) {
                    notes.push(`Restored ${Object.keys(restoredTimelineTrimOverrides).length} arrangement trim${Object.keys(restoredTimelineTrimOverrides).length === 1 ? '' : 's'}.`);
                }
                if (restoredTimelineSplitMarkers) {
                    notes.push(`Restored ${Object.keys(restoredTimelineSplitMarkers).length} split marker${Object.keys(restoredTimelineSplitMarkers).length === 1 ? '' : 's'}.`);
                }
                setCoreSessionRecoveryNotes(notes.length > 0 ? notes : ['Recovered session state had no comp overrides.']);
                setCoreSessionRecoveryState(notes.length > 0 ? 'restored' : 'empty');

                void acknowledgeCoreRecovery(CORE_MULTI_STEM_SESSION_JOB_ID).catch((error) => {
                    console.warn('[MultiStem] Core recovery acknowledgement failed:', error);
                });
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('[MultiStem] Core recovery unavailable:', error);
                setCoreSessionRecoveryState('error');
                setCoreSessionRecoveryNotes(['Core recovery could not be loaded.']);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        setIsUploading(true);
        const imported = classifySessionFiles(Array.from(files) as File[]);
        setSessionImportSourceSummary(
            imported.sourceApp !== 'unknown'
                ? {
                    sourceApp: imported.sourceApp,
                    displayName: imported.sourceDetections[0]?.displayName ?? imported.sourceApp,
                    confidence: imported.sourceDetections[0]?.confidence ?? 0,
                    markers: imported.sourceDetections[0]?.markers ?? [],
                }
                : null,
        );
        setSessionImportPackageSummary(
            imported.packageGraph
                ? {
                    rootName: imported.packageGraph.rootName,
                    audioFileCount: imported.packageGraph.audioFileCount,
                    topLevelNodeCount: imported.packageGraph.topLevelNodeCount,
                }
                : null,
        );
        setSessionImportPackageGraph(imported.packageGraph);
        const newStems: Stem[] = [];
        const newStates: Record<string, StemState> = {};

        for (let i = 0; i < imported.tracks.length; i++) {
            const track = imported.tracks[i];
            const buffer = await audioEngine.decodeFile(track.file as File);
            const id = `stem-${Date.now()}-${i}`;
            newStems.push({
                id,
                name: track.displayName,
                type: getStemTypeForImportedTrack(track.kind, track.role),
                buffer,
                metrics: audioEngine.analyzeStaticMetrics(buffer),
                config: {}
            });
            newStates[id] = { muted: false, solo: false, gain: 1, pan: 0 };
        }
        setStems(prev => [...prev, ...newStems]);
        setStemStates(prev => ({ ...prev, ...newStates }));
        setSessionImportWarnings(imported.warnings);
        setIsUploading(false);
    };

    const beginRename = (stem: Stem) => {
        setEditingName(stem.id);
        setEditingNameValue(stem.name);
    };

    const commitRename = (stem: Stem) => {
        const nextName = editingNameValue.trim() || stem.name;
        renameStem(stem.id, nextName);
        setEditingNameValue('');
    };

    const updateStemState = (id: string, updates: Partial<StemState>) => {
        setStemStates(prev => ({ ...prev, [id]: { ...prev[id], ...updates } }));
    };

    const toggleMute = (id: string) => {
        updateStemState(id, { muted: !stemStates[id]?.muted });
    };

    const toggleSolo = (id: string) => {
        updateStemState(id, { solo: !stemStates[id]?.solo });
    };

    const setGain = (id: string, gain: number) => {
        updateStemState(id, { gain });
        if (gainNodesRef.current[id]) {
            gainNodesRef.current[id].gain.setTargetAtTime(gain, audioCtxRef.current!.currentTime, 0.02);
        }
    };

    const setPan = (id: string, pan: number) => {
        updateStemState(id, { pan });
        if (panNodesRef.current[id]) {
            panNodesRef.current[id].pan.setTargetAtTime(pan, audioCtxRef.current!.currentTime, 0.02);
        }
    };

    // Check if any stem is solo'd
    const hasSolo = Object.values(stemStates).some((s: StemState) => s.solo);

    // Calculate effective gain for a stem
    const getEffectiveGain = (id: string): number => {
        const state = stemStates[id];
        if (!state) return 1;
        if (state.muted) return 0;
        if (hasSolo && !state.solo) return 0;
        return state.gain;
    };

    // Update gains when solo/mute changes
    useEffect(() => {
        stems.forEach(stem => {
            if (gainNodesRef.current[stem.id] && audioCtxRef.current) {
                const effectiveGain = getEffectiveGain(stem.id);
                gainNodesRef.current[stem.id].gain.setTargetAtTime(effectiveGain, audioCtxRef.current.currentTime, 0.02);
            }
        });
    }, [stemStates, stems]);

    useEffect(() => {
        if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
        ghostSaveTimer.current = setTimeout(() => {
            const mix_state = buildMixState(stems, stemStates);
            autosaveCoreSession({
                job_id: CORE_MULTI_STEM_SESSION_JOB_ID,
                audio_paths: {},
                dsp_state: {
                    source: 'MultiStemWorkspace',
                    stemCount: stems.length,
                    mix_state,
                    alignment_manifest: resolvedAlignmentManifest,
                    comp_lane_overrides: compLaneOverrides,
                    comp_segment_adjustments: compSegmentAdjustments,
                    timeline_track_start_overrides: timelineTrackStartOverrides,
                    timeline_track_trim_overrides: timelineTrackTrimOverrides,
                    timeline_track_split_markers: timelineTrackSplitMarkers,
                    stems: stems.map(stem => ({
                        id: stem.id,
                        name: stem.name,
                        type: stem.type,
                        duration: stem.buffer?.duration ?? null,
                        sampleRate: stem.buffer?.sampleRate ?? null,
                        state: stemStates[stem.id] || null,
                    })),
                },
            }).catch((error) => {
                console.warn('[MultiStem] Core ghost autosave failed:', error);
            });
        }, 2000);
        return () => {
            if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
        };
    }, [compLaneOverrides, compSegmentAdjustments, resolvedAlignmentManifest, stemStates, stems, timelineTrackSplitMarkers, timelineTrackStartOverrides, timelineTrackTrimOverrides]);


    const ensureContextRunning = useCallback(async (): Promise<boolean> => {
        const ctx = audioCtxRef.current;
        if (!ctx) return false;
        // Safari/iOS requires a user gesture to resume; call inside click paths and guard UI.
        if (ctx.state === 'running') return true;
        try {
            await ctx.resume();
        } catch (e) {
            console.warn('[MultiStem] AudioContext.resume() failed', e);
        }
        return ctx.state === 'running';
    }, []);

    const playStems = useCallback(() => {
        if (!audioCtxRef.current || !masterGainRef.current) return;
        stopEverything();

        stems.forEach(stem => {
            const source = audioCtxRef.current!.createBufferSource();
            source.buffer = stem.buffer;

            const gainNode = audioCtxRef.current!.createGain();
            gainNode.gain.value = getEffectiveGain(stem.id);

            const panNode = audioCtxRef.current!.createStereoPanner();
            panNode.pan.value = stemStates[stem.id]?.pan || 0;

            const alignment = getStemAlignment(stem.id);
            const startAt = (alignment?.start_timestamp_ms ?? 0) / 1000;
            const offset = (alignment?.trim_start_ms ?? 0) / 1000;
            const duration = alignment ? Math.max(0.01, (alignment.trim_end_ms - alignment.trim_start_ms) / 1000) : undefined;

            source.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(masterGainRef.current!);

            sourceNodesRef.current[stem.id] = source;
            gainNodesRef.current[stem.id] = gainNode;
            panNodesRef.current[stem.id] = panNode;

            source.start(audioCtxRef.current.currentTime + startAt, offset, duration);
        });
        setIsPlaying(true);
    }, [getStemAlignment, stems, stemStates, stopEverything]);

    const stopStems = useCallback(() => {
        stopEverything();
    }, [stopEverything]);

    const exportMix = async (format: 'wav' | 'mp3') => {
        if (stems.length === 0) return;
        setIsExporting(true);

        try {
            // Find longest stem duration
            const maxLength = Math.max(...stems.map(s => s.buffer.length));
            const sampleRate = stems[0].buffer.sampleRate;
            const numChannels = 2;

            // Create offline context for rendering
            const offlineCtx = new OfflineAudioContext(numChannels, maxLength, sampleRate);
            const masterGain = offlineCtx.createGain();
            masterGain.connect(offlineCtx.destination);

            // Add all stems with their current settings
            stems.forEach(stem => {
                const source = offlineCtx.createBufferSource();
                source.buffer = stem.buffer;

                const gain = offlineCtx.createGain();
                gain.gain.value = getEffectiveGain(stem.id);

                const pan = offlineCtx.createStereoPanner();
                pan.pan.value = stemStates[stem.id]?.pan || 0;

                const alignment = getStemAlignment(stem.id);
                const startAt = (alignment?.start_timestamp_ms ?? 0) / 1000;
                const offset = (alignment?.trim_start_ms ?? 0) / 1000;
                const duration = alignment ? Math.max(0.01, (alignment.trim_end_ms - alignment.trim_start_ms) / 1000) : undefined;

                source.connect(gain);
                gain.connect(pan);
                pan.connect(masterGain);
                source.start(offlineCtx.currentTime + startAt, offset, duration);
            });

            const renderedBuffer = await offlineCtx.startRendering();

            // Export using encoder service
            const { encodeToWav, encodeToMp3 } = await import('../services/encoderService');
            const result = format === 'wav'
                ? await encodeToWav(renderedBuffer)
                : await encodeToMp3(renderedBuffer);

            if (result.success && result.blob) {
                const mix_state = buildMixState(stems, stemStates);
                void autosaveCoreSession({
                    job_id: CORE_MULTI_STEM_SESSION_JOB_ID,
                    audio_paths: {
                        exported_format: format,
                    },
                    dsp_state: {
                        source: 'MultiStemWorkspace',
                        export_format: format,
                        stemCount: stems.length,
                        mix_state,
                        alignment_manifest: resolvedAlignmentManifest,
                        comp_lane_overrides: compLaneOverrides,
                        comp_segment_adjustments: compSegmentAdjustments,
                        timeline_track_start_overrides: timelineTrackStartOverrides,
                        timeline_track_trim_overrides: timelineTrackTrimOverrides,
                        timeline_track_split_markers: timelineTrackSplitMarkers,
                    },
                }).catch((error) => {
                    console.warn('[MultiStem] Export autosave failed:', error);
                });
                await downloadAudioWithManifest({
                    audioBlob: result.blob,
                    audioFileName: `stem-mix-${Date.now()}.${format}`,
                });
            }
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const removeStem = (id: string) => {
        // Stop playing stem if it's currently playing
        if (playingStemId === id) {
            stopSingleStem();
        }
        setStems(prev => prev.filter(s => s.id !== id));
        setStemStates(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const renameStem = (id: string, newName: string) => {
        setStems(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
        setEditingName(null);
    };

    const stopSingleStem = useCallback(() => {
        if (playingStemId) {
            const soloKey = `solo-${playingStemId}`;
            if (sourceNodesRef.current[soloKey]) {
                try {
                    sourceNodesRef.current[soloKey].stop();
                } catch {}
                delete sourceNodesRef.current[soloKey];
            }
        }
        setPlayingStemId(null);
    }, [playingStemId]);

    const stopCompSegment = useCallback(() => {
        if (playingCompSegmentId) {
            const compKey = `comp-${playingCompSegmentId}`;
            if (sourceNodesRef.current[compKey]) {
                try {
                    sourceNodesRef.current[compKey].stop();
                } catch {}
                delete sourceNodesRef.current[compKey];
            }
        }
        setPlayingCompSegmentId(null);
    }, [playingCompSegmentId]);

    const playSingleStem = useCallback((stemId: string) => {
        if (!audioCtxRef.current) return;
        stopCompSegment();
        // Internal stop (do not touch playIntent): we are about to start a new stem.
        if (playingStemId) {
            const soloKey = `solo-${playingStemId}`;
            if (sourceNodesRef.current[soloKey]) {
                try { sourceNodesRef.current[soloKey].stop(); } catch {}
                delete sourceNodesRef.current[soloKey];
            }
        }
        setPlayingStemId(null);

        const stem = stems.find(s => s.id === stemId);
        if (!stem) return;

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = stem.buffer;

        const gainNode = audioCtxRef.current.createGain();
        gainNode.gain.value = stemStates[stemId]?.gain || 1;

        const panNode = audioCtxRef.current.createStereoPanner();
        panNode.pan.value = stemStates[stemId]?.pan || 0;

        const alignment = getStemAlignment(stemId);
        const startAt = (alignment?.start_timestamp_ms ?? 0) / 1000;
        const offset = (alignment?.trim_start_ms ?? 0) / 1000;
        const duration = alignment ? Math.max(0.01, (alignment.trim_end_ms - alignment.trim_start_ms) / 1000) : undefined;

        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGainRef.current!);

        // Store single stem playback nodes
        sourceNodesRef.current[`solo-${stemId}`] = source;
        gainNodesRef.current[stemId] = gainNode;
        panNodesRef.current[stemId] = panNode;

        source.onended = () => {
            stopSingleStem();
        };

        source.start(audioCtxRef.current.currentTime + startAt, offset, duration);
        setPlayingStemId(stemId);
    }, [getStemAlignment, playingStemId, stems, stemStates, stopCompSegment, stopSingleStem]);

    const playCompSegment = useCallback((segment: ProofTrainerCompSegment) => {
        if (!audioCtxRef.current) return;
        stopSingleStem();

        if (playingCompSegmentId) {
            const currentKey = `comp-${playingCompSegmentId}`;
            if (sourceNodesRef.current[currentKey]) {
                try { sourceNodesRef.current[currentKey].stop(); } catch {}
                delete sourceNodesRef.current[currentKey];
            }
        }
        setPlayingCompSegmentId(null);

        const stem = stems.find((item) => item.id === segment.track_id);
        const alignment = getStemAlignment(segment.track_id);
        if (!stem || !alignment) return;

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = stem.buffer;

        const gainNode = audioCtxRef.current.createGain();
        gainNode.gain.value = stemStates[segment.track_id]?.gain || 1;

        const panNode = audioCtxRef.current.createStereoPanner();
        panNode.pan.value = stemStates[segment.track_id]?.pan || 0;

        const offset = Math.max(0, (segment.comp_start_ms - alignment.start_timestamp_ms) / 1000);
        const duration = Math.max(0.01, (segment.comp_end_ms - segment.comp_start_ms) / 1000);

        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGainRef.current!);

        const compKey = `comp-${segment.segment_id}`;
        sourceNodesRef.current[compKey] = source;

        source.onended = () => {
            setPlayingCompSegmentId((current) => (current === segment.segment_id ? null : current));
            delete sourceNodesRef.current[compKey];
        };

        source.start(audioCtxRef.current.currentTime, offset, duration);
        setPlayingCompSegmentId(segment.segment_id);
    }, [getStemAlignment, playingCompSegmentId, stems, stemStates, stopSingleStem]);

    const requestPlayAll = useCallback(async () => {
        pendingPlayActionRef.current = () => playStems();
        const running = await ensureContextRunning();
        if (!running) {
            setPlayIntent(true); // show guard (no nag unless user attempted play)
            return;
        }

        setPlayIntent(false);
        playStems();
    }, [ensureContextRunning, playStems]);

    const requestPlayStemSolo = useCallback(async (stemId: string) => {
        pendingPlayActionRef.current = () => playSingleStem(stemId);
        const running = await ensureContextRunning();
        if (!running) {
            setPlayIntent(true);
            return;
        }

        setPlayIntent(false);
        playSingleStem(stemId);
    }, [ensureContextRunning, playSingleStem]);

    const requestPlayCompSegment = useCallback(async (segment: ProofTrainerCompSegment) => {
        pendingPlayActionRef.current = () => playCompSegment(segment);
        const running = await ensureContextRunning();
        if (!running) {
            setPlayIntent(true);
            return;
        }

        setPlayIntent(false);
        playCompSegment(segment);
    }, [ensureContextRunning, playCompSegment]);

    const playCompCandidate = useCallback((candidate: ProofTrainerCompLaneCandidate, lane: ProofTrainerCompLane) => {
        const pseudoSegment: ProofTrainerCompSegment = {
            segment_id: `${lane.lane_id}-candidate-${candidate.candidate_id}`,
            lane_id: lane.lane_id,
            candidate_id: candidate.candidate_id,
            track_id: candidate.track_id,
            file_name: candidate.file_name,
            section_name: candidate.section_name,
            lane_role: candidate.lane_role,
            start_ms: candidate.start_ms,
            end_ms: candidate.end_ms,
            duration_ms: candidate.duration_ms,
            comp_start_ms: candidate.start_ms,
            comp_end_ms: candidate.end_ms,
            score: candidate.score,
        };
        playCompSegment(pseudoSegment);
    }, [playCompSegment]);

    const requestPlayCompCandidate = useCallback(async (candidate: ProofTrainerCompLaneCandidate, lane: ProofTrainerCompLane) => {
        pendingPlayActionRef.current = () => playCompCandidate(candidate, lane);
        const running = await ensureContextRunning();
        if (!running) {
            setPlayIntent(true);
            return;
        }

        setPlayIntent(false);
        playCompCandidate(candidate, lane);
    }, [ensureContextRunning, playCompCandidate]);

    const applyCompLaneOverride = useCallback((laneId: string, candidateId: string) => {
        setCompLaneOverrides((current) => ({
            ...current,
            [laneId]: candidateId,
        }));
    }, []);

    const clearCompLaneOverride = useCallback((laneId: string) => {
        setCompLaneOverrides((current) => {
            const next = { ...current };
            delete next[laneId];
            return next;
        });
    }, []);

    const nudgeCompSegmentAdjustment = useCallback((segmentId: string, edge: 'start' | 'end', deltaMs: number) => {
        setCompSegmentAdjustments((current) => {
            const existing = current[segmentId] ?? { startDeltaMs: 0, endDeltaMs: 0 };
            const next = {
                ...existing,
                startDeltaMs: edge === 'start' ? existing.startDeltaMs + deltaMs : existing.startDeltaMs,
                endDeltaMs: edge === 'end' ? existing.endDeltaMs + deltaMs : existing.endDeltaMs,
            };
            if (next.startDeltaMs === 0 && next.endDeltaMs === 0) {
                const trimmed = { ...current };
                delete trimmed[segmentId];
                return trimmed;
            }
            return {
                ...current,
                [segmentId]: next,
            };
        });
    }, []);

    const setCompSegmentStartTarget = useCallback((segmentId: string, targetDeltaMs: number) => {
        setCompSegmentAdjustments((current) => {
            const existing = current[segmentId] ?? { startDeltaMs: 0, endDeltaMs: 0 };
            return {
                ...current,
                [segmentId]: {
                    ...existing,
                    startDeltaMs: targetDeltaMs,
                },
            };
        });
    }, []);

    const setCompSegmentEndTarget = useCallback((segmentId: string, targetDeltaMs: number) => {
        setCompSegmentAdjustments((current) => {
            const existing = current[segmentId] ?? { startDeltaMs: 0, endDeltaMs: 0 };
            return {
                ...current,
                [segmentId]: {
                    ...existing,
                    endDeltaMs: targetDeltaMs,
                },
            };
        });
    }, []);

    const clearCompSegmentAdjustment = useCallback((segmentId: string) => {
        setCompSegmentAdjustments((current) => {
            if (!current[segmentId]) return current;
            const next = { ...current };
            delete next[segmentId];
            return next;
        });
    }, []);

    const setTimelineTrackStartOverride = useCallback((trackId: string, startTimestampMs: number) => {
        setTimelineTrackStartOverrides((current) => ({
            ...current,
            [trackId]: Math.round(Math.max(0, startTimestampMs)),
        }));
    }, []);

    const clearTimelineTrackStartOverride = useCallback((trackId: string) => {
        setTimelineTrackStartOverrides((current) => {
            if (!(trackId in current)) return current;
            const next = { ...current };
            delete next[trackId];
            return next;
        });
    }, []);

    const setTimelineTrackTrimOverride = useCallback((trackId: string, trimStartDeltaMs: number, trimEndDeltaMs: number) => {
        setTimelineTrackTrimOverrides((current) => ({
            ...current,
            [trackId]: {
                trimStartDeltaMs: Math.round(trimStartDeltaMs),
                trimEndDeltaMs: Math.round(trimEndDeltaMs),
            },
        }));
    }, []);

    const clearTimelineTrackTrimOverride = useCallback((trackId: string) => {
        setTimelineTrackTrimOverrides((current) => {
            if (!(trackId in current)) return current;
            const next = { ...current };
            delete next[trackId];
            return next;
        });
    }, []);

    const setTimelineTrackSplitMarker = useCallback((trackId: string, splitAtMs: number) => {
        setTimelineTrackSplitMarkers((current) => ({
            ...current,
            [trackId]: {
                splitPointsMs: Array.from(
                    new Set([
                        ...((current[trackId]?.splitPointsMs ?? [])),
                        Math.round(Math.max(0, splitAtMs)),
                    ]),
                ).sort((left, right) => left - right),
            },
        }));
    }, []);

    const clearTimelineTrackSplitMarker = useCallback((trackId: string) => {
        setTimelineTrackSplitMarkers((current) => {
            if (!(trackId in current)) return current;
            const next = { ...current };
            delete next[trackId];
            return next;
        });
    }, []);

    const runAnalysis = async () => {
        console.log('[MultiStem] Running analysis on', stems.length, 'stems');
        try {
            const result = await analyzeStemMix(stems);
            console.log('[MultiStem] Analysis complete:', result);
            const normalized = {
                ...result,
                conflicts: Array.isArray(result?.conflicts)
                    ? result.conflicts.map((conflict: any) => formatAnalysisText(conflict?.description ?? conflict))
                    : [],
                stemSuggestions: Array.isArray(result?.stemSuggestions)
                    ? result.stemSuggestions.map((suggestion: any) => ({
                        ...suggestion,
                        reasoning: suggestion?.reasoning ? formatAnalysisText(suggestion.reasoning) : ''
                    }))
                    : [],
                masterSuggestions: Array.isArray(result?.masterSuggestions)
                    ? result.masterSuggestions.map((suggestion: any) => formatAnalysisText(suggestion))
                    : []
            };
            setAnalysis(normalized);
        } catch (err: any) {
            console.error('[MultiStem] Analysis failed:', err);
            alert(`Analysis failed: ${err.message}`);
        }
    };

    const mixDuration = resolvedAlignmentManifest?.duration_ms
        ? resolvedAlignmentManifest.duration_ms / 1000
        : stems.length > 0
            ? Math.max(...stems.map(stem => stem.buffer?.duration ?? 0))
            : 0;
    const activeStemCount = stems.filter(stem => {
        const state = stemStates[stem.id];
        if (!state) return false;
        if (state.muted) return false;
        if (hasSolo && !state.solo) return false;
        return true;
    }).length;
    const balanceTotals = stems.reduce((sum, stem) => {
        const rmsDb = stemMetrics[stem.id]?.rms ?? -Infinity;
        const rmsLinear = Number.isFinite(rmsDb) ? Math.pow(10, rmsDb / 20) : 0;
        return sum + rmsLinear;
    }, 0);

    return (
        <div className={cn(glassCard, 'relative p-4 sm:p-8 shadow-2xl space-y-8')}>
            <AudioResumeGuard
                contextState={audioContextState}
                playIntent={playIntent}
                isPlaying={isAnyPlaying}
                onCancel={cancelPlayIntent}
                onResume={async () => {
                    const running = await ensureContextRunning();
                    if (!running) return;
                    const action = pendingPlayActionRef.current;
                    pendingPlayActionRef.current = null;
                    setPlayIntent(false);
                    action?.();
                }}
            />
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-2">Multi‑Stem</p>
                    <h2 className="text-2xl font-semibold text-slate-100">Stem Workspace</h2>
                    <p className="text-xs text-slate-500 mt-2">{stems.length} stem{stems.length !== 1 ? 's' : ''} loaded</p>
                </div>
            </div>
            <div className={gradientDivider} />

            {coreSessionRecoveryState !== 'idle' && (
                <div className={cn(
                    'rounded-2xl border px-4 py-3 text-[11px]',
                    coreSessionRecoveryState === 'restored'
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                        : coreSessionRecoveryState === 'hydrating'
                            ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
                            : coreSessionRecoveryState === 'empty'
                                ? 'border-slate-400/20 bg-slate-400/10 text-slate-200'
                                : 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                )}>
                    <div className="font-semibold">
                        {coreSessionRecoveryState === 'restored'
                            ? 'Recovered comp workspace state'
                            : coreSessionRecoveryState === 'hydrating'
                                ? 'Recovering comp workspace state'
                                : coreSessionRecoveryState === 'empty'
                                    ? 'No stored comp state found'
                                    : 'Comp workspace recovery failed'}
                    </div>
                    {coreSessionRecoveryNotes.length > 0 && (
                        <div className="mt-1 text-white/80">
                            {coreSessionRecoveryNotes.join(' · ')}
                        </div>
                    )}
                </div>
            )}

            {resolvedAlignmentManifest && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                    <div className="font-semibold">Local alignment engaged</div>
                    <div className="mt-1 text-cyan-100/80">
                        Session zero {resolvedAlignmentManifest.session_zero_ms} ms, anchor {resolvedAlignmentManifest.anchor_track_id ?? 'auto'}.
                        {resolvedAlignmentManifest.summary.track_count} tracks aligned from detected lead-ins.
                    </div>
                    {resolvedCompLanes.length > 0 && (
                        <div className="mt-3 grid gap-3 lg:grid-cols-[0.34fr_0.66fr]">
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-cyan-50">
                                <div className="text-cyan-200/70">Comp reconstruction</div>
                                <div className="mt-2 font-semibold">
                                    {resolvedAlignmentManifest.summary.comp_lane_count} lanes · {resolvedAlignmentManifest.summary.candidate_take_count} candidate takes
                                </div>
                                <div className="mt-1 text-cyan-100/70">
                                    {resolvedAlignmentManifest.summary.assembled_segment_count} assembled slice{resolvedAlignmentManifest.summary.assembled_segment_count === 1 ? '' : 's'} ready for session rebuild.
                                </div>
                            </div>
                            <div className="space-y-2">
                                {resolvedCompLanes.slice(0, 4).map((lane) => (
                                    <div key={lane.lane_id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-slate-200">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="font-semibold text-cyan-50">{lane.section_name} · {lane.lane_role}</div>
                                            <div className="text-cyan-100/70">
                                                {lane.candidates.length} candidates · {lane.assembled_segments.length} chosen
                                            </div>
                                        </div>
                                        {lane.activeCandidate && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2 py-2 text-[10px]">
                                                <span className="font-semibold text-cyan-100">Active take</span>
                                                <span className="text-slate-100">{lane.activeCandidate.file_name}</span>
                                                <span className="text-cyan-100/70">{(lane.activeCandidate.score * 100).toFixed(0)}%</span>
                                                {compLaneOverrides[lane.lane_id] && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearCompLaneOverride(lane.lane_id)}
                                                        className="rounded-md border border-cyan-200/20 bg-black/20 px-2 py-1 text-[9px] font-semibold text-cyan-100 hover:border-cyan-100/40"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-2 space-y-1">
                                            {lane.assembled_segments.slice(0, 2).map((segment) => {
                                                const segmentStem = stems.find((stem) => stem.id === segment.track_id);
                                                return (
                                                    <div key={segment.segment_id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px]">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="font-medium text-slate-100">{segment.file_name}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-slate-400">
                                                                    {segment.comp_start_ms} ms to {segment.comp_end_ms} ms · {(segment.score * 100).toFixed(0)}%
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => playingCompSegmentId === segment.segment_id ? stopCompSegment() : void requestPlayCompSegment(segment)}
                                                                    className={cn(
                                                                        'rounded-md border px-2 py-1 text-[9px] font-semibold transition-all',
                                                                        playingCompSegmentId === segment.segment_id
                                                                            ? 'border-fuchsia-300/50 bg-fuchsia-400/15 text-fuchsia-100'
                                                                            : 'border-white/10 bg-black/20 text-slate-300 hover:border-fuchsia-300/30 hover:text-white'
                                                                    )}
                                                                >
                                                                    {playingCompSegmentId === segment.segment_id ? 'Stop Slice' : 'Audition'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {segmentStem?.buffer && (
                                                            <CompSegmentWaveformStrip
                                                                buffer={segmentStem.buffer}
                                                                segment={segment}
                                                                onSetStartTargetDelta={setCompSegmentStartTarget}
                                                                onSetEndTargetDelta={setCompSegmentEndTarget}
                                                            />
                                                        )}
                                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
                                                            <span className="text-cyan-100/60">Trim</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => nudgeCompSegmentAdjustment(segment.segment_id, 'start', -COMP_SEGMENT_NUDGE_MS)}
                                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-300 hover:border-cyan-300/30"
                                                            >
                                                                Start -10
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => nudgeCompSegmentAdjustment(segment.segment_id, 'start', COMP_SEGMENT_NUDGE_MS)}
                                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-300 hover:border-cyan-300/30"
                                                            >
                                                                Start +10
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => nudgeCompSegmentAdjustment(segment.segment_id, 'end', -COMP_SEGMENT_NUDGE_MS)}
                                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-300 hover:border-cyan-300/30"
                                                            >
                                                                End -10
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => nudgeCompSegmentAdjustment(segment.segment_id, 'end', COMP_SEGMENT_NUDGE_MS)}
                                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-300 hover:border-cyan-300/30"
                                                            >
                                                                End +10
                                                            </button>
                                                            {compSegmentAdjustments[segment.segment_id] && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => clearCompSegmentAdjustment(segment.segment_id)}
                                                                    className="rounded-md border border-cyan-200/20 bg-cyan-400/10 px-2 py-1 font-semibold text-cyan-100 hover:border-cyan-100/40"
                                                                >
                                                                    Reset Trim
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {lane.candidates.slice(0, 3).map((candidate) => {
                                                const isActiveCandidate = lane.activeCandidateId === candidate.candidate_id;
                                                return (
                                                    <div
                                                        key={candidate.candidate_id}
                                                        className={cn(
                                                            'rounded-lg border px-2 py-2 text-[10px] transition-all',
                                                            isActiveCandidate
                                                                ? 'border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100'
                                                                : 'border-white/10 bg-black/20 text-slate-300'
                                                        )}
                                                    >
                                                        <div className="font-semibold">{candidate.file_name}</div>
                                                        <div className="mt-1 text-slate-400">{(candidate.score * 100).toFixed(0)}% · {candidate.section_name}</div>
                                                        <div className="mt-2 flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => applyCompLaneOverride(lane.lane_id, candidate.candidate_id)}
                                                                className={cn(
                                                                    'rounded-md border px-2 py-1 text-[9px] font-semibold',
                                                                    isActiveCandidate
                                                                        ? 'border-fuchsia-200/30 bg-fuchsia-300/15 text-fuchsia-50'
                                                                        : 'border-white/10 bg-white/[0.04] text-slate-200 hover:border-fuchsia-300/30'
                                                                )}
                                                            >
                                                                {isActiveCandidate ? 'Selected' : 'Use Take'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void requestPlayCompCandidate(candidate, lane)}
                                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold text-slate-200 hover:border-cyan-300/30"
                                                            >
                                                                Audition
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {resolvedAlignmentManifest && (
                        <div className="mt-3">
                            <SessionTimeline
                                manifest={resolvedAlignmentManifest}
                                trackStartOverrides={timelineTrackStartOverrides}
                                trackTrimOverrides={timelineTrackTrimOverrides}
                                trackSplitMarkers={timelineTrackSplitMarkers}
                                onSetTrackStartOverride={setTimelineTrackStartOverride}
                                onResetTrackStartOverride={clearTimelineTrackStartOverride}
                                onSetTrackTrimOverride={setTimelineTrackTrimOverride}
                                onResetTrackTrimOverride={clearTimelineTrackTrimOverride}
                                onSetTrackSplitMarker={setTimelineTrackSplitMarker}
                                onResetTrackSplitMarker={clearTimelineTrackSplitMarker}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Overview */}
            <div className="grid gap-5 md:grid-cols-3">
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">Session Overview</p>
                    <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-semibold text-slate-100">{stems.length}</span>
                        <span className="text-xs text-slate-500">stems loaded</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">{activeStemCount} active �{mixDuration.toFixed(1)}s</p>
                </div>
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">Mix Balance</p>
                    <div className="space-y-2">
                        {stems.map(stem => {
                            const rmsDb = stemMetrics[stem.id]?.rms ?? -Infinity;
                            const rmsLinear = Number.isFinite(rmsDb) ? Math.pow(10, rmsDb / 20) : 0;
                            const pct = balanceTotals > 0 ? Math.round((rmsLinear / balanceTotals) * 100) : 0;
                            return (
                                <div key={stem.id} className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 w-20 truncate">{stem.name}</span>
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-orange-500/60 to-orange-400/30" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-slate-600 w-8 text-right">{pct}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">AI Summary</p>
                    {analysis ? (
                        <>
                            <p className="text-sm text-slate-200 mb-2 leading-relaxed">
                                {analysis.conflicts?.length ? 'Potential conflicts detected.' : 'No major conflicts detected.'}
                            </p>
                            <p className="text-xs text-slate-500">
                                {analysis.stemSuggestions?.length || 0} stem suggestions · {analysis.masterSuggestions?.length || 0} master notes
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-slate-500">Run analysis to get AI readout.</p>
                    )}
                </div>
                {(sessionImportWarnings.length > 0 || sessionImportSourceSummary) && (
                    <div className="bg-amber-500/10 rounded-2xl p-5 border border-amber-400/20">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300 mb-2">Import Gate</p>
                        {sessionImportSourceSummary && (
                            <div className="mb-2 text-xs text-cyan-100">
                                <p className="font-semibold">Session source: {sessionImportSourceSummary.displayName} ({sessionImportSourceSummary.confidence}/10)</p>
                                {sessionImportSourceSummary.markers.length > 0 && (
                                    <p className="mt-1 text-cyan-100/80">
                                        Markers: {sessionImportSourceSummary.markers.join(' · ')}
                                    </p>
                                )}
                            </div>
                        )}
                        {sessionImportPackageSummary && (
                            <p className="mb-2 text-xs text-cyan-100/80">
                                Package graph: {sessionImportPackageSummary.rootName} · {sessionImportPackageSummary.audioFileCount} audio files · {sessionImportPackageSummary.topLevelNodeCount} top-level folders
                            </p>
                        )}
                        {sessionImportPackageGraph && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-cyan-50">
                                <SessionPackageTree graph={sessionImportPackageGraph} title="Imported session graph" />
                            </div>
                        )}
                        {sessionImportWarnings.length > 0 ? (
                            <p className="text-xs text-amber-100 leading-relaxed">{sessionImportWarnings.join(' • ')}</p>
                        ) : (
                            <p className="text-xs text-emerald-100 leading-relaxed">Folder structure recognized and imported locally.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Stem List */}
            {stems.length === 0 ? (
                <div className="mt-8">
                    <label className="block cursor-pointer">
                        <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-3xl p-12 border border-sky-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-sky-400/60 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),_0_0_30px_rgba(59,130,246,0.12),_0_0_30px_rgba(249,115,22,0.06)] transition-all duration-300">
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white mb-2">Upload Stems</h3>
                                <p className="text-sm text-slate-500 mb-6">
                                    Drop vocals, drums, bass, and music stems to start a full mix session.
                                </p>
                                <div className={cn(secondaryButton, 'inline-flex items-center gap-2 px-6 py-3 text-sm')}>
                                    {isUploading && (
                                        <span className="w-3 h-3 border-2 border-slate-400/40 border-t-slate-200 rounded-full animate-spin" />
                                    )}
                                    {isUploading ? 'Loading Stems...' : 'Add Stems or Folder'}
                                </div>
                                <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-wider">
                                    WAV · AIFF · FLAC · SESSION FOLDER
                                </div>
                            </div>
                        </div>
                        <input
                            {...folderInputProps}
                            type="file"
                            multiple
                            onChange={handleUpload}
                            className="hidden"
                            accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aiff,.aif,.ogg,.caf,.alac,.json,application/json"
                        />
                    </label>
                </div>
            ) : (
                <div className="space-y-4">
                    {stems.map(stem => {
                        const state = stemStates[stem.id] || { muted: false, solo: false, gain: 1, pan: 0 };
                        const isActive = !state.muted && (!hasSolo || state.solo);
                        const metrics = stemMetrics[stem.id];
                        const rmsDb = metrics?.rms ?? -Infinity;
                        const peakDb = metrics?.peak ?? -Infinity;
                        return (
                            <div key={stem.id} className={cn(
                                'group bg-gradient-to-br from-slate-900/70 to-slate-900/40 backdrop-blur-md rounded-2xl p-6 transition-all duration-300 border',
                                isActive ? 'border-slate-700/40 shadow-lg' : 'border-slate-800/30 opacity-50'
                            )}>
                                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
                                    {/* Stem Name with Rename */}
                                    <div className="w-full md:flex-1 md:min-w-[220px]">
                                        {editingName === stem.id ? (
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={editingNameValue}
                                                    onChange={(e) => setEditingNameValue(e.target.value)}
                                                    onBlur={() => commitRename(stem)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') commitRename(stem);
                                                        if (e.key === 'Escape') {
                                                            setEditingName(null);
                                                            setEditingNameValue('');
                                                        }
                                                    }}
                                                    onFocus={(e) => e.currentTarget.select()}
                                                    placeholder={stem.name}
                                                    autoFocus
                                                    className="w-full bg-slate-950/70 text-slate-400 placeholder:text-slate-500 px-3 py-1 pr-7 rounded border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-slate-600/40 text-xs font-normal"
                                                />
                                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                                                    ✎
                                                </span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => beginRename(stem)}
                                                className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/50 px-2 py-1 text-left text-xs font-normal text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-300"
                                                title="Rename stem"
                                            >
                                                <span className="truncate">{stem.name}</span>
                                                <span className="text-xs text-slate-500 transition-colors group-hover:text-slate-300">✎</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-[2] min-w-0">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => playingStemId === stem.id ? cancelPlayIntent() : void requestPlayStemSolo(stem.id)}
                                                className={cn(
                                                    'relative w-10 h-10 rounded-full border border-slate-700/60 bg-slate-900/80 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] transition-all duration-200 hover:border-orange-400/40 hover:bg-slate-900/90 active:border-slate-500/50 active:bg-slate-950/90 active:shadow-[inset_4px_4px_8px_#04060d]',
                                                    playingStemId === stem.id
                                                        ? 'text-orange-300 border-orange-400/40'
                                                        : 'text-slate-500'
                                                )}
                                                title={playingStemId === stem.id ? 'Stop' : 'Play this stem solo'}
                                                aria-label={playingStemId === stem.id ? 'Stop' : 'Play stem'}
                                            >
                                                <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-slate-900/40 to-slate-950/80" />
                                                {playingStemId === stem.id ? (
                                                    <svg className="relative z-10 w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none">
                                                        <rect x="7.5" y="7.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
                                                    </svg>
                                                ) : (
                                                    <svg className="relative z-10 w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none">
                                                        <path d="M9 7.5v9l7-4.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => toggleMute(stem.id)}
                                                className={cn(
                                                    'relative w-9 h-9 rounded-full border border-slate-700/60 bg-slate-900/80 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] transition-all duration-200 hover:border-orange-400/40 hover:bg-slate-900/90 active:border-slate-500/50 active:bg-slate-950/90 active:shadow-[inset_4px_4px_8px_#04060d]',
                                                    state.muted
                                                        ? 'text-red-300 border-red-400/40'
                                                        : 'text-slate-500'
                                                )}
                                                title="Mute"
                                                aria-pressed={state.muted}
                                                aria-label="Mute stem"
                                            >
                                                <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-slate-900/40 to-slate-950/80" />
                                                <svg className="relative z-10 w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none">
                                                    <path d="M5.5 9h4l4-4v14l-4-4h-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                                                    <path d="M16.5 8.5l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => toggleSolo(stem.id)}
                                                className={cn(
                                                    'relative w-9 h-9 rounded-full border border-slate-700/60 bg-slate-900/80 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] transition-all duration-200 hover:border-orange-400/40 hover:bg-slate-900/90 active:border-slate-500/50 active:bg-slate-950/90 active:shadow-[inset_4px_4px_8px_#04060d]',
                                                    state.solo
                                                        ? 'text-amber-300 border-amber-400/40'
                                                        : 'text-slate-500'
                                                )}
                                                title="Solo"
                                                aria-pressed={state.solo}
                                                aria-label="Solo stem"
                                            >
                                                <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-slate-900/40 to-slate-950/80" />
                                                <svg className="relative z-10 w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="12" r="6.3" stroke="currentColor" strokeWidth="1.6" />
                                                    <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => removeStem(stem.id)}
                                                className="relative w-9 h-9 rounded-full border border-slate-700/60 bg-slate-900/80 text-slate-500 shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] transition-all duration-200 hover:border-orange-400/40 hover:bg-slate-900/90 hover:text-red-300 active:border-slate-500/50 active:bg-slate-950/90 active:shadow-[inset_4px_4px_8px_#04060d]"
                                                title="Remove stem"
                                                aria-label="Remove stem"
                                            >
                                                <span className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-br from-slate-900/40 to-slate-950/80" />
                                                <svg className="relative z-10 w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none">
                                                    <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="flex-1 flex flex-wrap gap-4 sm:gap-6">
                                            <Knob
                                                label="Volume"
                                                value={state.gain}
                                                min={0}
                                                max={2}
                                                step={0.01}
                                                displayValue={`${(state.gain * 100).toFixed(0)}%`}
                                                onChange={(nextValue) => setGain(stem.id, nextValue)}
                                                onReset={() => setGain(stem.id, 1)}
                                            />
                                            <Knob
                                                label="Pan"
                                                value={state.pan}
                                                min={-1}
                                                max={1}
                                                step={0.01}
                                                displayValue={state.pan > 0.01 ? `R${Math.round(state.pan * 100)}` : state.pan < -0.01 ? `L${Math.round(Math.abs(state.pan) * 100)}` : 'C'}
                                                onChange={(nextValue) => setPan(stem.id, nextValue)}
                                                onReset={() => setPan(stem.id, 0)}
                                                snapToZero
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-600 mb-2">
                                            <span>RMS / Peak</span>
                                            <span className="text-slate-500 font-mono">
                                                {Number.isFinite(rmsDb) ? `${rmsDb.toFixed(1)} dB` : '—'}
                                                {' �'}
                                                {Number.isFinite(peakDb) ? `${peakDb.toFixed(1)} dB` : '—'}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] uppercase tracking-wider text-slate-500 w-10">RMS</span>
                                                <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-sky-500/70 to-sky-400/30"
                                                        style={{ width: `${meterFromDb(rmsDb)}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] uppercase tracking-wider text-slate-500 w-10">Peak</span>
                                                <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-orange-500/70 to-orange-400/30"
                                                        style={{ width: `${meterFromDb(peakDb)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60">
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-600 mb-2">
                                            <span>Quick Notes</span>
                                        </div>
                                        <div className="text-xs text-slate-400 space-y-2">
                                            <p>Stem: {stem.name}</p>
                                            <p>Active: {isActive ? 'Yes' : 'Muted/Solo off'}</p>
                                            <p>Pan: {state.pan > 0.01 ? `Right ${Math.round(state.pan * 100)}%` : state.pan < -0.01 ? `Left ${Math.round(Math.abs(state.pan) * 100)}%` : 'Center'}</p>
                                            <p>Gain: {(state.gain * 100).toFixed(0)}%</p>
                                            <p>Length: {stem.buffer.duration.toFixed(1)}s</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Transport & Export Controls */}
            {stems.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 border-t border-slate-700 pt-4">
                    <button
                        onClick={() => isAnyPlaying ? cancelPlayIntent() : void requestPlayAll()}
                        className="relative w-14 h-14 flex items-center justify-center group"
                        title={isAnyPlaying ? "Stop playback" : "Play all stems"}
                    >
                        {/* Halo Ring - Blinks when playing */}
                        <div className={`absolute inset-0 rounded-full border border-[#FB923C]/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_-1px_1px_rgba(255,255,255,0.08)] transition-all duration-500 ${
                            isAnyPlaying
                                ? 'animate-[blink_5s_infinite]'
                                : ''
                        }`} />

                        {/* Core Button */}
                        <div className="absolute inset-2 rounded-full bg-[#FB923C] shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,0.2)] group-hover:bg-[#FFA855] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_3px_rgba(0,0,0,0.15),inset_0_-1px_2px_rgba(255,255,255,0.1)] group-hover:scale-[0.98] group-active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] group-active:scale-95 transition-all duration-150 ease-out" />

                        {/* Icon - Morphs between play and pause */}
                        {isAnyPlaying ? (
                            <svg className="w-5 h-5 fill-slate-900/90 relative z-10 transition-all duration-300" viewBox="0 0 24 24">
                                <rect x="7" y="5" width="3" height="14" rx="1.5" />
                                <rect x="14" y="5" width="3" height="14" rx="1.5" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 fill-slate-900/90 relative z-10 transition-all duration-300" viewBox="0 0 24 24">
                                <path d="M9 6.5v11l9-5.5z" strokeLinejoin="round" strokeLinecap="round" />
                            </svg>
                        )}
                    </button>

                    <button
                        onClick={runAnalysis}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 text-orange-400 font-bold shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all"
                    >
                        Analyze Mix
                    </button>

                    <div className="flex gap-2 sm:ml-auto w-full sm:w-auto">
                        <button
                            onClick={() => exportMix('wav')}
                            disabled={isExporting}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-900 text-slate-300 font-medium shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-slate-100 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50"
                        >
                            {isExporting ? '...' : 'Export WAV'}
                        </button>
                        <button
                            onClick={() => exportMix('mp3')}
                            disabled={isExporting}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-900 text-slate-300 font-medium shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-slate-100 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50"
                        >
                            {isExporting ? '...' : 'Export MP3'}
                        </button>
                    </div>
                </div>
            )}

            {/* Analysis Results */}
            {analysis && (
                <div className="mt-6 bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-[4px_4px_8px_#090e1a,-4px_-4px_8px_#1e293b]">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 ml-1">AI Mix Analysis</h3>

                    {/* Conflicts Section */}
                    {analysis.conflicts && analysis.conflicts.length > 0 && (
                        <div className="mb-5">
                            <h4 className="text-sm font-bold text-red-400 mb-3">
                                DETECTED ISSUES
                            </h4>
                            <div className="space-y-2">
                                {analysis.conflicts.map((conflict: any, idx: number) => (
                                    <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                        <p className="text-sm text-slate-300">
                                            {typeof conflict === 'string'
                                                ? conflict
                                                : typeof conflict?.description === 'string'
                                                    ? conflict.description
                                                    : formatAnalysisText(conflict)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stem Suggestions */}
                    {analysis.stemSuggestions && analysis.stemSuggestions.length > 0 && (
                        <div className="mb-5">
                            <h4 className="text-sm font-bold text-orange-400 mb-3">
                                STEM RECOMMENDATIONS
                            </h4>
                            <div className="space-y-3">
                                {analysis.stemSuggestions.map((suggestion: any, idx: number) => {
                                    const stem = stems.find(s => s.id === suggestion.stemId);
                                    const metrics = stem ? stemMetrics[stem.id] : undefined;
                                    const rmsDb = metrics?.rms ?? -Infinity;
                                    const peakDb = metrics?.peak ?? -Infinity;
                                    const volumeDb = Number(suggestion.suggestedVolumeDb);
                                    const eqValues = suggestion.suggestedEq ? Object.values(suggestion.suggestedEq).map((v: any) => Number(v)) : [];
                                    const maxEqShift = eqValues.length > 0 ? Math.max(...eqValues.map(v => Math.abs(v)).filter(v => Number.isFinite(v))) : 0;
                                    const severity = Math.max(
                                        Number.isFinite(volumeDb) ? Math.abs(volumeDb) : 0,
                                        Number.isFinite(maxEqShift) ? maxEqShift : 0
                                    );
                                    const severityLabel = severity >= 3 ? 'High' : severity >= 1.5 ? 'Medium' : 'Low';
                                    const severityStyle = severity >= 3
                                        ? 'text-red-300 border-red-500/30 bg-red-500/10'
                                        : severity >= 1.5
                                            ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                                            : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
                                    return (
                                        <div key={idx} className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/30 shadow-md">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={suggestion.isSelected}
                                                    onChange={() => {
                                                        // Toggle selection
                                                        setAnalysis((prev: any) => ({
                                                            ...prev,
                                                            stemSuggestions: prev.stemSuggestions.map((s: any, i: number) =>
                                                                i === idx ? { ...s, isSelected: !s.isSelected } : s
                                                            )
                                                        }));
                                                    }}
                                                    className="form-checkbox h-5 w-5 text-orange-500 rounded-lg bg-slate-700 border-slate-600 focus:ring-orange-500 mt-0.5"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-white bg-orange-500 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                                            {stem?.name || `Stem ${idx + 1}`}
                                                        </span>
                                                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${severityStyle}`}>
                                                            {severityLabel}
                                                        </span>
                                                        {suggestion.suggestedVolumeDb !== undefined && suggestion.suggestedVolumeDb !== null && (
                                                            <span className="text-xs text-slate-400 font-mono">
                                                                {(() => {
                                                                    const volumeDb = Number(suggestion.suggestedVolumeDb);
                                                                    if (!Number.isFinite(volumeDb)) {
                                                                        return `Vol: ${suggestion.suggestedVolumeDb}`;
                                                                    }
                                                                    return `Vol: ${volumeDb > 0 ? '+' : ''}${volumeDb.toFixed(1)} dB`;
                                                                })()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-300 leading-relaxed mb-2">
                                                        {suggestion.reasoning ? formatAnalysisText(suggestion.reasoning) : 'Recommendation available.'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                                                        Recommendation: adjust {stem?.name || `Stem ${idx + 1}`} for balance and clarity.
                                                    </p>
                                                    {suggestion.suggestedEq && (
                                                        <div className="mt-2 bg-slate-900/50 rounded-lg p-2">
                                                            <div className="text-[10px] text-slate-500 uppercase mb-1">Suggested EQ</div>
                                                            <div className="flex gap-2 flex-wrap">
                                                                {Object.entries(suggestion.suggestedEq).map(([band, value]: [string, any]) => (
                                                                    <span key={band} className="text-xs font-mono text-cyan-400">
                                                                        {band}: {value > 0 ? '+' : ''}{typeof value === 'number' ? value.toFixed(1) : value}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 w-10">RMS</span>
                                                    <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-sky-500/60 to-sky-400/30"
                                                            style={{ width: `${meterFromDb(rmsDb)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 w-14 text-right">
                                                        {Number.isFinite(rmsDb) ? `${rmsDb.toFixed(1)} dB` : '—'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 w-10">Peak</span>
                                                    <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-orange-500/70 to-orange-400/40"
                                                            style={{ width: `${meterFromDb(peakDb)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 w-14 text-right">
                                                        {Number.isFinite(peakDb) ? `${peakDb.toFixed(1)} dB` : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Master Suggestions */}
                    {analysis.masterSuggestions && analysis.masterSuggestions.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-cyan-400 mb-3">
                                MASTER CHAIN NOTES
                            </h4>
                            <div className="space-y-2">
                                {analysis.masterSuggestions.map((suggestion: any, idx: number) => (
                                    <div key={idx} className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3">
                                        <p className="text-sm text-slate-300">
                                            {formatAnalysisText(suggestion)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Apply Button */}
                    {analysis.stemSuggestions && analysis.stemSuggestions.some((s: any) => s.isSelected) && (
                        <div className="mt-5 pt-5 border-t border-slate-700/50">
                            <button
                                onClick={() => {
                                    // Apply selected suggestions
                                    const selected = analysis.stemSuggestions.filter((s: any) => s.isSelected);
                                    selected.forEach((suggestion: any) => {
                                        const stemId = suggestion.stemId;
                                        if (suggestion.suggestedVolumeDb !== undefined) {
                                            // Convert dB to gain (linear)
                                            const gainMultiplier = Math.pow(10, suggestion.suggestedVolumeDb / 20);
                                            const currentGain = stemStates[stemId]?.gain || 1;
                                            setGain(stemId, currentGain * gainMultiplier);
                                        }
                                    });
                                    alert(`Applied ${selected.length} suggestion(s)`);
                                }}
                                className="w-full bg-slate-900 text-orange-400 font-bold py-3 rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all uppercase tracking-wider text-xs"
                            >
                                Apply {analysis.stemSuggestions.filter((s: any) => s.isSelected).length} Selected Fix{analysis.stemSuggestions.filter((s: any) => s.isSelected).length !== 1 ? 'es' : ''}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MultiStemWorkspace;
