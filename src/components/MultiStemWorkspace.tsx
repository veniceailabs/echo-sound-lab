import React, { useState, useRef, useEffect } from 'react';
import { Stem } from '../types';
import { audioEngine } from '../services/audioEngine';
import { analyzeStemMix } from '../services/geminiService';
import { glassCard, glowButton, secondaryButton, sectionHeader, gradientDivider, cn } from '../utils/secondLightStyles';

interface StemState {
    muted: boolean;
    solo: boolean;
    gain: number; // 0-2 (1 = unity)
    pan: number;  // -1 to 1
}

interface MultiStemWorkspaceProps {
    initialStems?: Stem[];
}

const meterFromDb = (db: number) => {
    if (!Number.isFinite(db)) return 0;
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
};

const formatAnalysisText = (value: any) => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return value == null ? '' : String(value);
};

const MultiStemWorkspace: React.FC<MultiStemWorkspaceProps> = ({ initialStems }) => {
    const [stems, setStems] = useState<Stem[]>(initialStems || []);
    const [stemStates, setStemStates] = useState<Record<string, StemState>>({});
    const [analysis, setAnalysis] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingNameValue, setEditingNameValue] = useState('');
    const [playingStemId, setPlayingStemId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [stemMetrics, setStemMetrics] = useState<Record<string, { rms: number; peak: number }>>({});

    const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
        audioCtxRef.current = new AudioContext();
        masterGainRef.current = audioCtxRef.current.createGain();
        masterGainRef.current.connect(audioCtxRef.current.destination);
        return () => {
            // Stop all sources before closing context
            Object.values(sourceNodesRef.current).forEach((source: AudioBufferSourceNode) => {
                try { source.stop(); } catch {}
            });
            sourceNodesRef.current = {};
            audioCtxRef.current?.close();
        };
    }, []);

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

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        setIsUploading(true);
        const newStems: Stem[] = [];
        const newStates: Record<string, StemState> = {};

        for (let i = 0; i < files.length; i++) {
            const buffer = await audioEngine.decodeFile(files[i]);
            const id = `stem-${Date.now()}-${i}`;
            newStems.push({
                id, name: files[i].name, type: 'other', buffer,
                metrics: audioEngine.analyzeStaticMetrics(buffer), config: {}
            });
            newStates[id] = { muted: false, solo: false, gain: 1, pan: 0 };
        }
        setStems(prev => [...prev, ...newStems]);
        setStemStates(prev => ({ ...prev, ...newStates }));
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

    const playStems = () => {
        if (!audioCtxRef.current || !masterGainRef.current) return;
        stopStems();

        stems.forEach(stem => {
            const source = audioCtxRef.current!.createBufferSource();
            source.buffer = stem.buffer;

            const gainNode = audioCtxRef.current!.createGain();
            gainNode.gain.value = getEffectiveGain(stem.id);

            const panNode = audioCtxRef.current!.createStereoPanner();
            panNode.pan.value = stemStates[stem.id]?.pan || 0;

            source.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(masterGainRef.current!);

            sourceNodesRef.current[stem.id] = source;
            gainNodesRef.current[stem.id] = gainNode;
            panNodesRef.current[stem.id] = panNode;

            source.start(0);
        });
        setIsPlaying(true);
    };

    const stopStems = () => {
        Object.values(sourceNodesRef.current).forEach((source: AudioBufferSourceNode) => {
            try { source.stop(); } catch {}
        });
        sourceNodesRef.current = {};
        setIsPlaying(false);
    };

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

                source.connect(gain);
                gain.connect(pan);
                pan.connect(masterGain);
                source.start(0);
            });

            const renderedBuffer = await offlineCtx.startRendering();

            // Export using encoder service
            const { encodeToWav, encodeToMp3 } = await import('../services/encoderService');
            const result = format === 'wav'
                ? await encodeToWav(renderedBuffer)
                : await encodeToMp3(renderedBuffer);

            if (result.success && result.blob) {
                const url = URL.createObjectURL(result.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `stem-mix-${Date.now()}.${format}`;
                a.click();
                URL.revokeObjectURL(url);
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

    const playSingleStem = (stemId: string) => {
        if (!audioCtxRef.current) return;
        stopSingleStem(); // Stop any currently playing single stem

        const stem = stems.find(s => s.id === stemId);
        if (!stem) return;

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = stem.buffer;

        const gainNode = audioCtxRef.current.createGain();
        gainNode.gain.value = stemStates[stemId]?.gain || 1;

        const panNode = audioCtxRef.current.createStereoPanner();
        panNode.pan.value = stemStates[stemId]?.pan || 0;

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

        source.start(0);
        setPlayingStemId(stemId);
    };

    const stopSingleStem = () => {
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
    };

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

    const mixDuration = stems.length > 0
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
        <div className={cn(glassCard, 'p-8 shadow-2xl space-y-8')}>
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-2">Multi‑Stem</p>
                    <h2 className="text-2xl font-semibold text-slate-100">Stem Workspace</h2>
                    <p className="text-xs text-slate-500 mt-2">{stems.length} stem{stems.length !== 1 ? 's' : ''} loaded</p>
                </div>
            </div>
            <div className={gradientDivider} />

            {/* Overview */}
            <div className="grid gap-5 md:grid-cols-3">
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">Session Overview</p>
                    <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-semibold text-slate-100">{stems.length}</span>
                        <span className="text-xs text-slate-500">stems loaded</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">{activeStemCount} active · {mixDuration.toFixed(1)}s</p>
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
                                    {isUploading ? 'Loading Stems...' : 'Add Stems'}
                                </div>
                                <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-wider">
                                    WAV • AIFF • FLAC
                                </div>
                            </div>
                        </div>
                        <input type="file" multiple onChange={handleUpload} className="hidden" accept="audio/*" />
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
                                <div className="flex items-start gap-6">
                                    {/* Stem Name with Rename */}
                                    <div className="flex-1 min-w-[220px]">
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
                                                onClick={() => playingStemId === stem.id ? stopSingleStem() : playSingleStem(stem.id)}
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

                                        <div className="flex-1 flex flex-wrap gap-6">
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
                                                {' · '}
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
                <div className="flex flex-wrap gap-3 border-t border-slate-700 pt-4">
                    <button
                        onClick={isPlaying ? stopStems : playStems}
                        className="relative w-14 h-14 flex items-center justify-center group"
                        title={isPlaying ? "Stop playback" : "Play all stems"}
                    >
                        {/* Halo Ring - Blinks when playing */}
                        <div className={`absolute inset-0 rounded-full border border-[#FB923C]/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_-1px_1px_rgba(255,255,255,0.08)] transition-all duration-500 ${
                            isPlaying
                                ? 'animate-[blink_5s_infinite]'
                                : ''
                        }`} />

                        {/* Core Button */}
                        <div className="absolute inset-2 rounded-full bg-[#FB923C] shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,0.2)] group-hover:bg-[#FFA855] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_3px_rgba(0,0,0,0.15),inset_0_-1px_2px_rgba(255,255,255,0.1)] group-hover:scale-[0.98] group-active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] group-active:scale-95 transition-all duration-150 ease-out" />

                        {/* Icon - Morphs between play and pause */}
                        {isPlaying ? (
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
                        className="px-4 py-2 rounded-xl bg-slate-900 text-orange-400 font-bold shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all"
                    >
                        Analyze Mix
                    </button>

                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={() => exportMix('wav')}
                            disabled={isExporting}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 font-medium shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-slate-100 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50"
                        >
                            {isExporting ? '...' : 'Export WAV'}
                        </button>
                        <button
                            onClick={() => exportMix('mp3')}
                            disabled={isExporting}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 font-medium shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-slate-100 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50"
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
