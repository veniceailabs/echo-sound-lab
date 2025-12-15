import React, { useState } from 'react';
import { ProcessingPreset, ProcessingConfig, HistoryEntry, BatchProcessingJob } from '../types';
import { presetManager } from '../services/presetManager';
import { historyManager } from '../services/historyManager';
import { batchProcessor } from '../services/batchProcessor';
import { autoMasteringService } from '../services/autoMastering';
import { referenceMatchingService } from '../services/referenceMatching';
import { audioEngine } from '../services/audioEngine';
import { WAMPluginRack } from './WAMPluginRack';

interface EnhancedControlPanelProps {
    onConfigApply: (config: ProcessingConfig) => void;
    currentConfig: ProcessingConfig;
}

export const EnhancedControlPanel: React.FC<EnhancedControlPanelProps> = ({ onConfigApply, currentConfig }) => {
    const [activeTab, setActiveTab] = useState<'presets' | 'auto-master' | 'reference' | 'batch' | 'history' | 'plugins'>('presets');

    return (
        <div className="bg-slate-900 rounded-3xl p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Advanced Tools</h2>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
                {(['presets', 'auto-master', 'reference', 'batch', 'history', 'plugins'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                            activeTab === tab
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        {tab === 'presets' && 'Presets'}
                        {tab === 'auto-master' && 'Auto Master'}
                        {tab === 'reference' && 'Reference Match'}
                        {tab === 'batch' && 'Batch Process'}
                        {tab === 'history' && 'History'}
                        {tab === 'plugins' && 'Plugins (WAM)'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[300px]">
                {activeTab === 'presets' && <PresetManager onConfigApply={onConfigApply} />}
                {activeTab === 'auto-master' && <AutoMasterPanel onConfigApply={onConfigApply} />}
                {activeTab === 'reference' && <ReferenceMatchPanel onConfigApply={onConfigApply} />}
                {activeTab === 'batch' && <BatchProcessPanel currentConfig={currentConfig} />}
                {activeTab === 'history' && <HistoryPanel onConfigApply={onConfigApply} />}
                {activeTab === 'plugins' && <WAMPluginRack />}
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
