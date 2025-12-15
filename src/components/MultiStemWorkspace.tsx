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

const MultiStemWorkspace: React.FC<MultiStemWorkspaceProps> = ({ initialStems }) => {
    const [stems, setStems] = useState<Stem[]>(initialStems || []);
    const [stemStates, setStemStates] = useState<Record<string, StemState>>({});
    const [analysis, setAnalysis] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [playingStemId, setPlayingStemId] = useState<string | null>(null);

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

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
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
            setAnalysis(result);
        } catch (err: any) {
            console.error('[MultiStem] Analysis failed:', err);
            alert(`Analysis failed: ${err.message}`);
        }
    };

    return (
        <div className={cn(glassCard, 'p-8 shadow-2xl')}>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className={cn(sectionHeader, 'text-2xl mb-2')}>Stem Workspace</h2>
                    <p className="text-xs text-slate-400">{stems.length} stem{stems.length !== 1 ? 's' : ''} loaded</p>
                </div>
                <label className={cn(glowButton, 'px-6 py-3 cursor-pointer')}>
                    + Add Stems
                    <input type="file" multiple onChange={handleUpload} className="hidden" accept="audio/*" />
                </label>
            </div>
            <div className={gradientDivider} />

            {/* Stem List */}
            {stems.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <p>Drop stems here to start mixing</p>
                </div>
            ) : (
                <div className="space-y-3 mb-6">
                    {stems.map(stem => {
                        const state = stemStates[stem.id] || { muted: false, solo: false, gain: 1, pan: 0 };
                        const isActive = !state.muted && (!hasSolo || state.solo);

                        return (
                            <div key={stem.id} className={cn(
                                'bg-gradient-to-br from-slate-800/50 to-slate-900/70 backdrop-blur-md rounded-2xl p-5 transition-all duration-300 border',
                                isActive ? 'border-slate-700/40 shadow-lg' : 'border-slate-800/30 opacity-50'
                            )}>
                                <div className="flex items-center gap-4">
                                    {/* Stem Name with Rename */}
                                    <div className="flex-1 min-w-0">
                                        {editingName === stem.id ? (
                                            <input
                                                type="text"
                                                defaultValue={stem.name}
                                                onBlur={(e) => renameStem(stem.id, e.target.value || stem.name)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') renameStem(stem.id, e.currentTarget.value || stem.name);
                                                    if (e.key === 'Escape') setEditingName(null);
                                                }}
                                                autoFocus
                                                className="w-full bg-slate-900/80 text-slate-200 px-2 py-1 rounded border border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 text-sm font-medium"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <p className="text-slate-200 font-medium truncate">{stem.name}</p>
                                                <button
                                                    onClick={() => setEditingName(stem.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-cyan-400 transition-all text-xs"
                                                    title="Rename"
                                                >
                                                    ✎
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-500 mt-1">{stem.buffer.duration.toFixed(1)}s</p>
                                    </div>

                                    {/* Per-Stem Play Button */}
                                    <button
                                        onClick={() => playingStemId === stem.id ? stopSingleStem() : playSingleStem(stem.id)}
                                        className={cn(
                                            'w-9 h-9 rounded-xl font-bold text-sm transition-all duration-300 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] active:translate-y-[1px]',
                                            playingStemId === stem.id
                                                ? 'bg-slate-900 text-red-400 hover:text-red-300'
                                                : 'bg-slate-900 text-green-400 hover:text-green-300'
                                        )}
                                        title={playingStemId === stem.id ? 'Stop' : 'Play this stem solo'}
                                    >
                                        {playingStemId === stem.id ? 'STOP' : 'PLAY'}
                                    </button>

                                    {/* Mute/Solo Buttons */}
                                    <button
                                        onClick={() => toggleMute(stem.id)}
                                        className={cn(
                                            'w-9 h-9 rounded-xl font-bold text-xs transition-all duration-300 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] active:translate-y-[1px]',
                                            state.muted
                                                ? 'bg-slate-900 text-red-400 hover:text-red-300'
                                                : 'bg-slate-900 text-slate-400 hover:text-slate-300'
                                        )}
                                        title="Mute"
                                    >
                                        M
                                    </button>
                                    <button
                                        onClick={() => toggleSolo(stem.id)}
                                        className={cn(
                                            'w-9 h-9 rounded-xl font-bold text-xs transition-all duration-300 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] active:translate-y-[1px]',
                                            state.solo
                                                ? 'bg-slate-900 text-yellow-400 hover:text-yellow-300'
                                                : 'bg-slate-900 text-slate-400 hover:text-slate-300'
                                        )}
                                        title="Solo"
                                    >
                                        S
                                    </button>

                                    {/* Gain Slider - Improved */}
                                    <div className="flex items-center gap-3 w-36">
                                        <span className="text-xs text-slate-500 font-medium">Vol</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.01"
                                            value={state.gain}
                                            onChange={(e) => setGain(stem.id, parseFloat(e.target.value))}
                                            className="flex-1 h-2 bg-slate-700/50 rounded-full appearance-none cursor-pointer
                                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br
                                                [&::-webkit-slider-thumb]:from-orange-400 [&::-webkit-slider-thumb]:to-pink-500
                                                [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(249,115,22,0.5)]
                                                [&::-webkit-slider-thumb]:cursor-pointer"
                                        />
                                        <span className="text-xs text-slate-300 font-mono w-10">{(state.gain * 100).toFixed(0)}%</span>
                                    </div>

                                    {/* Pan Slider - Improved */}
                                    <div className="flex items-center gap-3 w-32">
                                        <span className="text-xs text-slate-500 font-medium">Pan</span>
                                        <input
                                            type="range"
                                            min="-1"
                                            max="1"
                                            step="0.01"
                                            value={state.pan}
                                            onChange={(e) => setPan(stem.id, parseFloat(e.target.value))}
                                            className="flex-1 h-2 bg-slate-700/50 rounded-full appearance-none cursor-pointer
                                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br
                                                [&::-webkit-slider-thumb]:from-orange-400 [&::-webkit-slider-thumb]:to-amber-500
                                                [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(251,146,60,0.5)]
                                                [&::-webkit-slider-thumb]:cursor-pointer"
                                        />
                                        <span className="text-xs text-slate-300 font-mono w-7">{state.pan > 0 ? 'R' : state.pan < 0 ? 'L' : 'C'}</span>
                                    </div>

                                    {/* Remove Button */}
                                    <button
                                        onClick={() => removeStem(stem.id)}
                                        className="w-9 h-9 rounded-xl bg-slate-900 text-slate-400 hover:text-red-400 transition-all duration-300 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] active:translate-y-[1px]"
                                        title="Remove stem"
                                    >
                                        ×
                                    </button>
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
                        className={`px-6 py-2 rounded-xl font-bold transition-all shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] ${
                            isPlaying ? 'bg-slate-900 text-red-400 hover:text-red-300' : 'bg-slate-900 text-green-400 hover:text-green-300'
                        }`}
                    >
                        {isPlaying ? 'Stop' : 'Play Mix'}
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
                                {analysis.conflicts.map((conflict: string, idx: number) => (
                                    <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                        <p className="text-sm text-slate-300">{conflict}</p>
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
                                                        {suggestion.suggestedVolumeDb && (
                                                            <span className="text-xs text-slate-400 font-mono">
                                                                Vol: {suggestion.suggestedVolumeDb > 0 ? '+' : ''}{suggestion.suggestedVolumeDb.toFixed(1)} dB
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-300 leading-relaxed mb-2">{suggestion.reasoning}</p>
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
                                {analysis.masterSuggestions.map((suggestion: string, idx: number) => (
                                    <div key={idx} className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3">
                                        <p className="text-sm text-slate-300">{suggestion}</p>
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