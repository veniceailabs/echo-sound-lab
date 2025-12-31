import React, { useState } from 'react';
import { ProcessingPreset, ProcessingConfig, HistoryEntry, BatchProcessingJob, EQSettings, DynamicEQConfig } from '../types';
import { presetManager } from '../services/presetManager';
import { historyManager } from '../services/historyManager';
import { batchProcessor } from '../services/batchProcessor';
import { autoMasteringService } from '../services/autoMastering';
import { referenceMatchingService } from '../services/referenceMatching';
import { audioEngine } from '../services/audioEngine';
import { localPluginService } from '../services/localPluginService';
import { FULL_STUDIO_WAM_CHAIN, FULL_STUDIO_LOCAL_CHAIN, loadFullStudioSuite, clearFullStudioSuite, getFullStudioState } from '../services/fullStudioSuite';
import { WAMPluginRack } from './WAMPluginRack';
import { LocalPluginRack } from './LocalPluginRack';
import { ChannelEQPanel } from './ChannelEQPanel';
import { ParametricEQPanel } from './ParametricEQPanel';

interface EnhancedControlPanelProps {
    onConfigApply: (config: ProcessingConfig) => void;
    onPluginChange?: () => void;
    currentConfig: ProcessingConfig;
    eqSettings?: EQSettings;
    setEqSettings?: (settings: EQSettings) => void;
    dynamicEq?: DynamicEQConfig;
    setDynamicEq?: (config: DynamicEQConfig) => void;
}

export const EnhancedControlPanel: React.FC<EnhancedControlPanelProps> = ({
    onConfigApply,
    onPluginChange,
    currentConfig,
    eqSettings,
    setEqSettings,
    dynamicEq,
    setDynamicEq
}) => {
    const [activeTab, setActiveTab] = useState<'plugins' | 'presets' | 'tools' | 'history'>('plugins');
    const [activePluginTab, setActivePluginTab] = useState<'channel-eq' | 'parametric-eq' | 'local' | 'wam'>('channel-eq');
    const [activeToolTab, setActiveToolTab] = useState<'auto-master' | 'reference' | 'batch' | 'studio'>('auto-master');

    return (
        <div className="bg-slate-900 rounded-3xl p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Advanced Tools</h2>

            {/* Main Tab Navigation */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
                {(['plugins', 'presets', 'tools', 'history'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                            activeTab === tab
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        {tab === 'plugins' && '🎚️ Plugins'}
                        {tab === 'presets' && 'Presets'}
                        {tab === 'tools' && '⚙️ Tools'}
                        {tab === 'history' && 'History'}
                    </button>
                ))}
            </div>

            {/* Sub-tab Navigation for Plugins */}
            {activeTab === 'plugins' && (
                <div className="flex gap-2 mb-4 border-b border-slate-700 pb-3">
                    {(['channel-eq', 'parametric-eq', 'local', 'wam'] as const).map(subTab => (
                        <button
                            key={subTab}
                            onClick={() => setActivePluginTab(subTab)}
                            className={`px-3 py-1.5 text-sm rounded transition-all ${
                                activePluginTab === subTab
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            {subTab === 'channel-eq' && 'Channel EQ'}
                            {subTab === 'parametric-eq' && 'Parametric EQ'}
                            {subTab === 'local' && 'Local FX'}
                            {subTab === 'wam' && 'WAM Plugins'}
                        </button>
                    ))}
                </div>
            )}

            {/* Sub-tab Navigation for Tools */}
            {activeTab === 'tools' && (
                <div className="flex gap-2 mb-4 border-b border-slate-700 pb-3">
                    {(['auto-master', 'reference', 'batch', 'studio'] as const).map(subTab => (
                        <button
                            key={subTab}
                            onClick={() => setActiveToolTab(subTab)}
                            className={`px-3 py-1.5 text-sm rounded transition-all ${
                                activeToolTab === subTab
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            {subTab === 'auto-master' && 'Auto Master'}
                            {subTab === 'reference' && 'Reference Match'}
                            {subTab === 'batch' && 'Batch Process'}
                            {subTab === 'studio' && 'Full Studio'}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab Content */}
            <div className="min-h-[300px]">
                {/* Plugins Tab */}
                {activeTab === 'plugins' && activePluginTab === 'channel-eq' && eqSettings && setEqSettings && (
                    <ChannelEQPanel
                        eqSettings={eqSettings}
                        onEQChange={setEqSettings}
                    />
                )}
                {activeTab === 'plugins' && activePluginTab === 'parametric-eq' && dynamicEq && setDynamicEq && (
                    <ParametricEQPanel
                        dynamicEq={dynamicEq}
                        onDynamicEQChange={setDynamicEq}
                    />
                )}
                {activeTab === 'plugins' && activePluginTab === 'local' && (
                    <LocalPluginRack onPluginChange={onPluginChange} />
                )}
                {activeTab === 'plugins' && activePluginTab === 'wam' && (
                    <WAMPluginRack onPluginChange={onPluginChange} />
                )}

                {/* Presets Tab */}
                {activeTab === 'presets' && <PresetManager onConfigApply={onConfigApply} />}

                {/* Tools Tab */}
                {activeTab === 'tools' && activeToolTab === 'auto-master' && <AutoMasterPanel onConfigApply={onConfigApply} />}
                {activeTab === 'tools' && activeToolTab === 'reference' && <ReferenceMatchPanel onConfigApply={onConfigApply} />}
                {activeTab === 'tools' && activeToolTab === 'batch' && <BatchProcessPanel currentConfig={currentConfig} />}
                {activeTab === 'tools' && activeToolTab === 'studio' && (
                    <FullStudioPanel
                        onPluginChange={onPluginChange}
                        currentConfig={currentConfig}
                        onConfigApply={onConfigApply}
                    />
                )}

                {/* History Tab */}
                {activeTab === 'history' && <HistoryPanel onConfigApply={onConfigApply} />}
            </div>
        </div>
    );
};

/* Preset Manager Component */
const PresetManager: React.FC<{ onConfigApply: (config: ProcessingConfig) => void }> = ({ onConfigApply }) => {
    const [presets, setPresets] = useState<ProcessingPreset[]>(presetManager.getAllPresets());
    const [selectedGenre, setSelectedGenre] = useState<string>('All');
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    const genres = ['All', 'General', 'Pop', 'Hip-Hop', 'Electronic', 'Rock', 'Vocal', 'Broadcast'];

    const filteredPresets = selectedGenre === 'All'
        ? presets
        : presets.filter(p => p.genre === selectedGenre);

    const handleApplyPreset = (preset: ProcessingPreset) => {
        onConfigApply(preset.config);
    };

    return (
        <div className="space-y-4">
            {/* Genre Filter */}
            <div className="flex gap-2 flex-wrap">
                {genres.map(genre => (
                    <button
                        key={genre}
                        onClick={() => setSelectedGenre(genre)}
                        className={`px-3 py-1 rounded text-sm transition-all ${
                            selectedGenre === genre
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        {genre}
                    </button>
                ))}
            </div>

            {/* Preset List */}
            <div className="grid gap-3 max-h-[400px] overflow-y-auto">
                {filteredPresets.map(preset => (
                    <div
                        key={preset.id}
                        className="bg-slate-800 rounded-lg p-4 hover:bg-slate-750 transition-all cursor-pointer group"
                        onClick={() => handleApplyPreset(preset)}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">
                                    {preset.name}
                                </h3>
                                {preset.genre && (
                                    <span className="text-xs text-slate-400">{preset.genre}</span>
                                )}
                            </div>
                            {presetManager.isBuiltinPreset(preset.id) && (
                                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                                    Built-in
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-400">{preset.description}</p>
                    </div>
                ))}
            </div>

            {filteredPresets.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                    No presets found for {selectedGenre}
                </div>
            )}
        </div>
    );
};

/* Auto Master Panel */
const AutoMasterPanel: React.FC<{ onConfigApply: (config: ProcessingConfig) => void }> = ({ onConfigApply }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [targetLoudness, setTargetLoudness] = useState(-14);

    const handleAutoMaster = async () => {
        const buffer = audioEngine.getBuffer();
        if (!buffer) {
            alert('Please load an audio file first');
            return;
        }

        setIsAnalyzing(true);
        try {
            const autoResult = await autoMasteringService.autoMaster(buffer, targetLoudness, true);
            setResult(autoResult);
        } catch (error) {
            console.error('Auto-mastering failed:', error);
            alert('Auto-mastering failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = () => {
        if (result) {
            onConfigApply(result.config);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Target Loudness</h3>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Target LUFS</span>
                        <span className="text-white font-bold">{targetLoudness} LUFS</span>
                    </div>
                    <input
                        type="range"
                        min="-23"
                        max="-8"
                        step="0.5"
                        value={targetLoudness}
                        onChange={(e) => setTargetLoudness(parseFloat(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Broadcast (-23)</span>
                        <span>Spotify (-14)</span>
                        <span>Loud (-8)</span>
                    </div>
                </div>
            </div>

            <button
                onClick={handleAutoMaster}
                disabled={isAnalyzing}
                className="w-full bg-slate-900 text-orange-400 font-bold py-3 rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50 uppercase tracking-wider text-xs"
            >
                {isAnalyzing ? 'Analyzing...' : 'Analyze & Generate Settings'}
            </button>

            {result && (
                <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-white">Detected: {result.genre}</h3>
                            <p className="text-xs text-slate-400">Confidence: {(result.confidence * 100).toFixed(0)}%</p>
                        </div>
                        <button
                            onClick={handleApply}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-all"
                        >
                            Apply Settings
                        </button>
                    </div>
                    <p className="text-sm text-slate-300">{result.analysis}</p>
                </div>
            )}
        </div>
    );
};

/* Reference Match Panel */
const ReferenceMatchPanel: React.FC<{ onConfigApply: (config: ProcessingConfig) => void }> = ({ onConfigApply }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const currentBuffer = audioEngine.getBuffer();
        if (!currentBuffer) {
            alert('Please load your audio first');
            return;
        }

        setIsAnalyzing(true);
        try {
            const refBuffer = await audioEngine.decodeFile(file);
            const matchResult = await referenceMatchingService.analyzeReference(refBuffer, currentBuffer);
            setResult(matchResult);
        } catch (error) {
            console.error('Reference matching failed:', error);
            alert('Reference matching failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = () => {
        if (result) {
            onConfigApply(result.suggestedConfig);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Upload Reference Track</h3>
                <p className="text-sm text-slate-400 mb-3">
                    Upload a professional track to match its characteristics
                </p>
                <label className="block w-full bg-orange-500 text-white text-center py-3 rounded-lg cursor-pointer hover:bg-orange-600 transition-all">
                    Choose Reference File
                    <input
                        type="file"
                        accept="audio/*"
                        onChange={handleReferenceUpload}
                        className="hidden"
                    />
                </label>
            </div>

            {isAnalyzing && (
                <div className="text-center text-slate-400 py-8">
                    Analyzing reference track...
                </div>
            )}

            {result && (
                <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-white">Match: {result.matchPercentage}%</h3>
                            <p className="text-xs text-slate-400">Similarity to reference</p>
                        </div>
                        <button
                            onClick={handleApply}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-all"
                        >
                            Apply Match Settings
                        </button>
                    </div>

                    <div className="space-y-2 text-sm">
                        <p className="text-slate-300">{result.analysis.tonalDifference}</p>
                        <p className="text-slate-300">{result.analysis.dynamicsDifference}</p>
                        <p className="text-slate-300">{result.analysis.loudnessDifference}</p>
                    </div>

                    {result.analysis.recommendations.length > 0 && (
                        <div className="border-t border-slate-700 pt-3">
                            <p className="text-xs font-semibold text-slate-400 mb-2">Recommendations:</p>
                            <ul className="text-xs text-slate-300 space-y-1">
                                {result.analysis.recommendations.map((rec: string, i: number) => (
                                    <li key={i}>• {rec}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/* Batch Process Panel */
const BatchProcessPanel: React.FC<{ currentConfig: ProcessingConfig }> = ({ currentConfig }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentFile, setCurrentFile] = useState('');
    const [job, setJob] = useState<BatchProcessingJob | null>(null);

    const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleProcessBatch = async () => {
        if (files.length === 0) {
            alert('Please select files to process');
            return;
        }

        setIsProcessing(true);
        const result = await batchProcessor.processBatch(
            files,
            currentConfig,
            'WAV',
            (prog, file) => {
                setProgress(prog);
                setCurrentFile(file);
            },
            (completedJob) => {
                setJob(completedJob);
                setIsProcessing(false);
            }
        );
    };

    const handleDownload = async () => {
        if (job) {
            await batchProcessor.downloadResults(job);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Select Audio Files</h3>
                <label className="block w-full bg-orange-500 text-white text-center py-3 rounded-lg cursor-pointer hover:bg-orange-600 transition-all">
                    Choose Files
                    <input
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={handleFilesUpload}
                        className="hidden"
                    />
                </label>
                {files.length > 0 && (
                    <p className="text-sm text-slate-400 mt-2">
                        {files.length} file(s) selected
                    </p>
                )}
            </div>

            {files.length > 0 && !isProcessing && !job && (
                <button
                    onClick={handleProcessBatch}
                    className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 transition-all"
                >
                    Process {files.length} File(s)
                </button>
            )}

            {isProcessing && (
                <div className="bg-slate-800 rounded-lg p-4">
                    <div className="mb-2">
                        <p className="text-sm text-white mb-1">Processing: {currentFile}</p>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">{progress.toFixed(0)}% complete</p>
                </div>
            )}

            {job && (
                <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                    <h3 className="font-semibold text-white">Batch Complete</h3>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="bg-slate-700 rounded p-2 text-center">
                            <p className="text-slate-400 text-xs">Total</p>
                            <p className="text-white font-bold">{job.results.length}</p>
                        </div>
                        <div className="bg-green-500/20 rounded p-2 text-center">
                            <p className="text-green-400 text-xs">Success</p>
                            <p className="text-white font-bold">
                                {job.results.filter(r => r.success).length}
                            </p>
                        </div>
                        <div className="bg-red-500/20 rounded p-2 text-center">
                            <p className="text-red-400 text-xs">Failed</p>
                            <p className="text-white font-bold">
                                {job.results.filter(r => !r.success).length}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDownload}
                        className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-all"
                    >
                        Download Results
                    </button>
                </div>
            )}
        </div>
    );
};

/* Full Studio Panel */
const FullStudioPanel: React.FC<{
    onPluginChange?: () => void;
    currentConfig: ProcessingConfig;
    onConfigApply: (config: ProcessingConfig) => void;
}> = ({ onPluginChange, currentConfig, onConfigApply }) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [errors, setErrors] = useState<string[]>([]);
    const [loadedWam, setLoadedWam] = useState<string[]>(() => audioEngine.getWAMPluginChain());
    const [loadedLocal, setLoadedLocal] = useState<string[]>(() => {
        const instances = localPluginService.getActiveInstances();
        return Array.from(new Set(instances.map(instance => instance.pluginId)));
    });
    const defaultPitchConfig = {
        enabled: false,
        mode: 'chromatic' as const,
        key: null as string | null,
        scale: null as string | null,
        strength: 15,
        retuneSpeed: 70,
        humanize: 80,
        formantPreserve: true,
    };
    const pitchConfig = { ...defaultPitchConfig, ...(currentConfig.pitch ?? {}) };
    const defaultGateConfig = {
        enabled: false,
        threshold: -45,
        ratio: 2,
        attack: 0.01,
        release: 0.08,
        range: 12,
    };
    const gateConfig = { ...defaultGateConfig, ...(currentConfig.gateExpander ?? {}) };
    const defaultTruePeakConfig = {
        enabled: false,
        ceiling: -1,
        oversampleFactor: 4,
    };
    const truePeakConfig = { ...defaultTruePeakConfig, ...(currentConfig.truePeakLimiter ?? {}) };
    const defaultClipperConfig = {
        enabled: false,
        threshold: -1,
        softness: 0.3,
    };
    const clipperConfig = { ...defaultClipperConfig, ...(currentConfig.clipper ?? {}) };

    const refreshLoaded = () => {
        const state = getFullStudioState();
        setLoadedWam(state.loadedWam);
        setLoadedLocal(state.loadedLocal);
    };

    const getWamName = (pluginId: string) => {
        return audioEngine.getAvailableWAMPlugins().find(plugin => plugin.id === pluginId)?.name ?? pluginId;
    };

    const getLocalName = (pluginId: string) => {
        return localPluginService.getPluginDefinition(pluginId)?.name ?? pluginId;
    };

    const handleEnableSuite = async () => {
        setStatus('loading');
        setErrors([]);

        const result = await loadFullStudioSuite();
        refreshLoaded();
        onPluginChange?.();

        const friendlyErrors = result.errors.map((error) => {
            if (error.includes('local FX')) {
                const pluginId = error.split(':').pop()?.trim() || error;
                return `Failed to load local FX: ${getLocalName(pluginId)}`;
            }
            if (error.includes('WAM')) {
                const pluginId = error.split(':').pop()?.trim() || error;
                return `Failed to load WAM: ${getWamName(pluginId)}`;
            }
            return error;
        });

        setErrors(friendlyErrors);
        setStatus(result.status);
    };

    const handleClearSuite = async () => {
        setStatus('loading');
        setErrors([]);

        const result = await clearFullStudioSuite();
        refreshLoaded();
        onPluginChange?.();

        setErrors(result.errors);
        setStatus(result.status);
    };

    const suiteLoaded = FULL_STUDIO_WAM_CHAIN.every(id => loadedWam.includes(id))
        && FULL_STUDIO_LOCAL_CHAIN.every(id => loadedLocal.includes(id));

    return (
        <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">Full Studio Suite</h3>
                <p className="text-sm text-slate-400">
                    Loads the Echo Sound Lab plugin chain for full-session mixing.
                </p>
            </div>

            <div className="grid gap-3">
                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">WAM Chain</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${suiteLoaded ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {suiteLoaded ? 'Ready' : 'Idle'}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {FULL_STUDIO_WAM_CHAIN.map((pluginId) => (
                            <div key={pluginId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-200">{getWamName(pluginId)}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                    loadedWam.includes(pluginId)
                                        ? 'text-orange-300 border-orange-500/40 bg-orange-500/10'
                                        : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                                }`}>
                                    {loadedWam.includes(pluginId) ? 'Loaded' : 'Off'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Local FX</span>
                    </div>
                    <div className="space-y-2">
                        {FULL_STUDIO_LOCAL_CHAIN.map((pluginId) => (
                            <div key={pluginId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-200">{getLocalName(pluginId)}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                    loadedLocal.includes(pluginId)
                                        ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
                                        : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                                }`}>
                                    {loadedLocal.includes(pluginId) ? 'Loaded' : 'Off'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 space-y-4">
                <div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-slate-200">Vocal Tune</h4>
                            <p className="text-xs text-slate-500">Optional pitch stabilization (manual only).</p>
                        </div>
                        <button
                            onClick={() => {
                                onConfigApply({
                                    ...currentConfig,
                                    pitch: { ...pitchConfig, enabled: !pitchConfig.enabled }
                                });
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                                pitchConfig.enabled
                                    ? 'text-orange-300 border-orange-500/40 bg-orange-500/10'
                                    : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                            }`}
                        >
                            {pitchConfig.enabled ? 'Enabled' : 'Off'}
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                        Enabling Vocal Tune alters performance character. Use intentionally.
                    </p>
                </div>

                {pitchConfig.enabled && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Mode</label>
                                <select
                                    value={pitchConfig.mode}
                                    onChange={(e) => {
                                        const mode = e.target.value as 'chromatic' | 'scale';
                                        onConfigApply({
                                            ...currentConfig,
                                            pitch: { ...pitchConfig, mode }
                                        });
                                    }}
                                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700"
                                >
                                    <option value="chromatic">Chromatic</option>
                                    <option value="scale">Key / Scale</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Formant Preserve</label>
                                <button
                                    onClick={() => {
                                        onConfigApply({
                                            ...currentConfig,
                                            pitch: { ...pitchConfig, formantPreserve: !pitchConfig.formantPreserve }
                                        });
                                    }}
                                    className={`w-full px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                                        pitchConfig.formantPreserve
                                            ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                            : 'text-slate-400 border-slate-700/50 bg-slate-900/50'
                                    }`}
                                >
                                    {pitchConfig.formantPreserve ? 'On' : 'Off'}
                                </button>
                            </div>
                        </div>

                        {pitchConfig.mode === 'scale' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500">Key</label>
                                    <select
                                        value={pitchConfig.key ?? 'C'}
                                        onChange={(e) => {
                                            onConfigApply({
                                                ...currentConfig,
                                                pitch: { ...pitchConfig, key: e.target.value }
                                            });
                                        }}
                                        className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700"
                                    >
                                        {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(key => (
                                            <option key={key} value={key}>{key}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500">Scale</label>
                                    <select
                                        value={pitchConfig.scale ?? 'major'}
                                        onChange={(e) => {
                                            onConfigApply({
                                                ...currentConfig,
                                                pitch: { ...pitchConfig, scale: e.target.value }
                                            });
                                        }}
                                        className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700"
                                    >
                                        <option value="major">Major</option>
                                        <option value="minor">Minor</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'strength', label: 'Strength', value: pitchConfig.strength },
                                { id: 'retuneSpeed', label: 'Retune', value: pitchConfig.retuneSpeed },
                                { id: 'humanize', label: 'Humanize', value: pitchConfig.humanize },
                            ].map(item => (
                                <div key={item.id} className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</label>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={item.value}
                                        onChange={(e) => {
                                            const nextValue = Number(e.target.value);
                                            onConfigApply({
                                                ...currentConfig,
                                                pitch: { ...pitchConfig, [item.id]: nextValue }
                                            });
                                        }}
                                        className="w-full accent-orange-500"
                                    />
                                    <div className="text-[10px] text-slate-400 text-center">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-200">Mastering Safety</h4>
                        <p className="text-xs text-slate-500">Cleanup + headroom protection.</p>
                    </div>
                </div>

                <div className="grid gap-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">Gate / Expander</span>
                        <button
                            onClick={() => {
                                onConfigApply({
                                    ...currentConfig,
                                    gateExpander: { ...gateConfig, enabled: !gateConfig.enabled }
                                });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                gateConfig.enabled
                                    ? 'text-orange-300 border-orange-500/40 bg-orange-500/10'
                                    : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                            }`}
                        >
                            {gateConfig.enabled ? 'On' : 'Off'}
                        </button>
                    </div>
                    {gateConfig.enabled && (
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'threshold', label: 'Threshold', min: -80, max: -20, step: 1, value: gateConfig.threshold },
                                { id: 'range', label: 'Range', min: 6, max: 24, step: 1, value: gateConfig.range },
                            ].map(item => (
                                <div key={item.id} className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</label>
                                    <input
                                        type="range"
                                        min={item.min}
                                        max={item.max}
                                        step={item.step}
                                        value={item.value}
                                        onChange={(e) => {
                                            const nextValue = Number(e.target.value);
                                            onConfigApply({
                                                ...currentConfig,
                                                gateExpander: { ...gateConfig, [item.id]: nextValue }
                                            });
                                        }}
                                        className="w-full accent-orange-500"
                                    />
                                    <div className="text-[10px] text-slate-400 text-center">{item.value}dB</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid gap-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">True-Peak Limiter</span>
                        <button
                            onClick={() => {
                                onConfigApply({
                                    ...currentConfig,
                                    truePeakLimiter: { ...truePeakConfig, enabled: !truePeakConfig.enabled }
                                });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                truePeakConfig.enabled
                                    ? 'text-orange-300 border-orange-500/40 bg-orange-500/10'
                                    : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                            }`}
                        >
                            {truePeakConfig.enabled ? 'On' : 'Off'}
                        </button>
                    </div>
                    {truePeakConfig.enabled && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Ceiling</label>
                                <input
                                    type="range"
                                    min={-3}
                                    max={0}
                                    step={0.1}
                                    value={truePeakConfig.ceiling}
                                    onChange={(e) => {
                                        const nextValue = Number(e.target.value);
                                        onConfigApply({
                                            ...currentConfig,
                                            truePeakLimiter: { ...truePeakConfig, ceiling: nextValue }
                                        });
                                    }}
                                    className="w-full accent-orange-500"
                                />
                                <div className="text-[10px] text-slate-400 text-center">{truePeakConfig.ceiling.toFixed(1)}dB</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Oversample</label>
                                <select
                                    value={truePeakConfig.oversampleFactor}
                                    onChange={(e) => {
                                        const nextValue = Number(e.target.value);
                                        onConfigApply({
                                            ...currentConfig,
                                            truePeakLimiter: { ...truePeakConfig, oversampleFactor: nextValue }
                                        });
                                    }}
                                    className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700"
                                >
                                    {[2, 4, 8].map(factor => (
                                        <option key={factor} value={factor}>{factor}x</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-200">Soft Clipper</span>
                        <button
                            onClick={() => {
                                onConfigApply({
                                    ...currentConfig,
                                    clipper: { ...clipperConfig, enabled: !clipperConfig.enabled }
                                });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                clipperConfig.enabled
                                    ? 'text-orange-300 border-orange-500/40 bg-orange-500/10'
                                    : 'text-slate-500 border-slate-700/50 bg-slate-900/50'
                            }`}
                        >
                            {clipperConfig.enabled ? 'On' : 'Off'}
                        </button>
                    </div>
                    {clipperConfig.enabled && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Threshold</label>
                                <input
                                    type="range"
                                    min={-6}
                                    max={0}
                                    step={0.1}
                                    value={clipperConfig.threshold}
                                    onChange={(e) => {
                                        const nextValue = Number(e.target.value);
                                        onConfigApply({
                                            ...currentConfig,
                                            clipper: { ...clipperConfig, threshold: nextValue }
                                        });
                                    }}
                                    className="w-full accent-orange-500"
                                />
                                <div className="text-[10px] text-slate-400 text-center">{clipperConfig.threshold.toFixed(1)}dB</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">Softness</label>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={clipperConfig.softness}
                                    onChange={(e) => {
                                        const nextValue = Number(e.target.value);
                                        onConfigApply({
                                            ...currentConfig,
                                            clipper: { ...clipperConfig, softness: nextValue }
                                        });
                                    }}
                                    className="w-full accent-orange-500"
                                />
                                <div className="text-[10px] text-slate-400 text-center">{clipperConfig.softness.toFixed(2)}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleEnableSuite}
                    disabled={status === 'loading'}
                    className="flex-1 bg-slate-900 text-orange-400 font-bold py-3 rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50 uppercase tracking-wider text-xs"
                >
                    {status === 'loading' ? 'Loading Suite...' : suiteLoaded ? 'Reload Full Studio' : 'Enable Full Studio'}
                </button>
                <button
                    onClick={handleClearSuite}
                    disabled={status === 'loading' && !suiteLoaded}
                    className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:text-white hover:bg-slate-700 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                    Clear Suite
                </button>
            </div>

            {status === 'ready' && (
                <div className="text-xs text-emerald-400 text-center uppercase tracking-wider font-semibold">
                    Full Studio suite is active
                </div>
            )}

            {errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 text-xs space-y-1">
                    <div className="font-bold uppercase tracking-wider">Load Issues</div>
                    {errors.map((error, index) => (
                        <div key={index}>{error}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* History Panel */
const HistoryPanel: React.FC<{ onConfigApply: (config: ProcessingConfig) => void }> = ({ onConfigApply }) => {
    const [timeline, setTimeline] = useState(historyManager.getTimeline());

    const handleUndo = () => {
        const entry = historyManager.undo();
        if (entry) {
            onConfigApply(entry.config);
            setTimeline(historyManager.getTimeline());
        }
    };

    const handleRedo = () => {
        const entry = historyManager.redo();
        if (entry) {
            onConfigApply(entry.config);
            setTimeline(historyManager.getTimeline());
        }
    };

    const handleJumpTo = (id: string) => {
        const entry = historyManager.jumpToEntry(id);
        if (entry) {
            onConfigApply(entry.config);
            setTimeline(historyManager.getTimeline());
        }
    };

    return (
        <div className="space-y-4">
            {/* Undo/Redo Buttons */}
            <div className="flex gap-2">
                <button
                    onClick={handleUndo}
                    disabled={!historyManager.canUndo()}
                    className="flex-1 bg-slate-800 text-white py-2 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    ← Undo
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!historyManager.canRedo()}
                    className="flex-1 bg-slate-800 text-white py-2 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    Redo →
                </button>
            </div>

            {/* Timeline */}
            <div className="bg-slate-800 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                <h3 className="font-semibold text-white mb-3">History Timeline</h3>
                {timeline.length === 0 ? (
                    <p className="text-sm text-slate-400">No history yet</p>
                ) : (
                    <div className="space-y-2">
                        {timeline.reverse().map(({ entry, isCurrent, isAccessible }) => (
                            <div
                                key={entry.id}
                                onClick={() => isAccessible && handleJumpTo(entry.id)}
                                className={`p-3 rounded-lg cursor-pointer transition-all ${
                                    isCurrent
                                        ? 'bg-orange-500 text-white'
                                        : isAccessible
                                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                        : 'bg-slate-900 text-slate-500 opacity-50 cursor-not-allowed'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-semibold">{entry.description}</p>
                                        <p className="text-xs opacity-75">
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                        </p>
                                    </div>
                                    {isCurrent && (
                                        <span className="text-xs bg-white/20 px-2 py-1 rounded">Current</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
