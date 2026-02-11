import React, { useState, useEffect } from 'react';
import { VoiceModel, GeneratedSong, HookAsset, AnimateArtRequest } from '../types';
import { voiceEngineService } from '../services/voiceEngineService';
import { useRecorder } from '../hooks/useRecorder';
import { animateArtService } from '../services/animateArtService';
import { glassCard, glowButton, secondaryButton, sectionHeader, gradientDivider, cn } from '../utils/secondLightStyles';
import SongGenerationWizard from './SongGenerationWizard';

interface AIStudioProps {
    onSongGenerated?: (song: GeneratedSong) => void;
    onSongOpenSingleTrack?: (song: GeneratedSong) => void;
}

const AIStudio: React.FC<AIStudioProps> = ({ onSongGenerated, onSongOpenSingleTrack }) => {
    const [view, setView] = useState<'library' | 'training' | 'generate'>('library');
    const [models, setModels] = useState<VoiceModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<VoiceModel | null>(null);
    const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
    const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null);
    const [hooks, setHooks] = useState<HookAsset[]>([]);
    const [hookStyle, setHookStyle] = useState<AnimateArtRequest['style']>('cinematic');
    const [hookDuration, setHookDuration] = useState<number>(12);
    const [hookPrompt, setHookPrompt] = useState<string>('');
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        loadModels();
        setHooks(animateArtService.getHooks());
    }, []);

    const loadModels = async () => {
        const loaded = await voiceEngineService.getVoiceModels();
        setModels(loaded);
    };

    useEffect(() => {
        return () => {
            if (coverArtUrl) {
                URL.revokeObjectURL(coverArtUrl);
            }
        };
    }, [coverArtUrl]);

    const handleCoverArtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (coverArtUrl) {
            URL.revokeObjectURL(coverArtUrl);
        }
        setCoverArtFile(file);
        setCoverArtUrl(URL.createObjectURL(file));
    };

    const handleAnimateArt = async () => {
        if (!coverArtUrl) {
            alert('Upload cover art before animating.');
            return;
        }
        setIsAnimating(true);
        const request: AnimateArtRequest = {
            sourceImageUrl: coverArtUrl,
            durationSeconds: hookDuration,
            style: hookStyle,
            prompt: hookPrompt || undefined,
        };
        try {
            const newHooks = await animateArtService.generateHooks(request, 2);
            setHooks(prev => [...newHooks, ...prev]);
        } finally {
            setIsAnimating(false);
        }
    };

    const handleTrainingComplete = async (samples: string[], name: string, persona?: string) => {
        await voiceEngineService.trainVoiceModel(samples, name, persona);
        await loadModels();
        setView('library');
    };

    const handleGenerationComplete = (song: GeneratedSong) => {
        setView('library');
        if (onSongGenerated) {
            onSongGenerated(song);
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className={cn(glassCard, 'p-6')}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>AI Studio</h2>
                        <p className="text-sm text-slate-400">
                            Voice-first local production suite. Record vocals, choose a style, and build songs on-device.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['library', 'training', 'generate'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setView(tab)}
                                className={cn(
                                    'px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all',
                                    view === tab
                                        ? 'bg-orange-500 text-white border border-orange-400/50 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-blue-300 hover:border-blue-400/40'
                                )}
                            >
                                {tab === 'library' && 'Voice Library'}
                                {tab === 'training' && 'Clone Voice'}
                                {tab === 'generate' && 'Generate'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={cn(gradientDivider, 'mt-6')} />
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        {
                            title: 'Clone Voice',
                            description: 'Train a model from clean vocal samples and define a vocal persona.',
                            accent: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
                        },
                        {
                            title: 'Build Song Locally',
                            description: 'Generate a full song from your recorded/uploaded voice without external APIs.',
                            accent: 'from-sky-500/20 to-blue-500/10 border-sky-500/30',
                        },
                        {
                            title: 'Finish & Export',
                            description: 'Refine stems, mix, and export a ready-to-release master.',
                            accent: 'from-white/10 to-slate-200/10 border-white/20',
                        },
                    ].map((item) => (
                        <div
                            key={item.title}
                            className={`rounded-2xl border p-4 bg-gradient-to-br ${item.accent}`}
                        >
                            <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-xs text-slate-400">{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>
            {view === 'library' && (
                <VoiceModelLibrary
                    models={models}
                    selectedModel={selectedModel}
                    onSelectModel={(id) => setSelectedModel(models.find(m => m.id === id) || null)}
                    onTrainNew={() => setView('training')}
                    onGenerateSong={() => setView('generate')}
                />
            )}
            {view === 'training' && (
                <VoiceTrainingWizard
                    onComplete={handleTrainingComplete}
                    onCancel={() => setView('library')}
                />
            )}
            {view === 'generate' && (
                <SongGenerationWizard
                    voiceModels={models}
                    onComplete={handleGenerationComplete}
                    onOpenSingleTrack={onSongOpenSingleTrack}
                    onCancel={() => setView('library')}
                />
            )}
            <div className={cn(glassCard, 'p-6')}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">Animate Art and Hooks</h3>
                        <p className="text-sm text-slate-400">
                            Turn cover art into hook-ready visuals for your community to remix.
                        </p>
                    </div>
                    <button
                        onClick={handleAnimateArt}
                        disabled={isAnimating}
                        className={cn(
                            glowButton,
                            'px-6 py-3 text-sm',
                            isAnimating && 'opacity-60 cursor-not-allowed'
                        )}
                    >
                        {isAnimating ? 'Animating...' : 'Animate Art'}
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <label className="block bg-slate-900/60 rounded-2xl border border-slate-700/40 p-4 cursor-pointer hover:border-orange-500/40 transition-all">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cover Art</span>
                            <span className="text-[10px] text-orange-300 uppercase tracking-wider">Upload</span>
                        </div>
                        <div className="mt-4 h-36 rounded-xl border border-dashed border-slate-700/60 bg-slate-950/60 flex items-center justify-center overflow-hidden">
                            {coverArtUrl ? (
                                <img src={coverArtUrl} alt={coverArtFile?.name || 'Cover art'} className="w-full h-full object-cover" />
                            ) : (
                                <div className="text-center text-slate-500 text-xs">
                                    Drop PNG/JPG
                                </div>
                            )}
                        </div>
                        <input type="file" accept="image/*" onChange={handleCoverArtUpload} className="hidden" />
                    </label>

                    <div className="bg-slate-900/60 rounded-2xl border border-slate-700/40 p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hook Controls</span>
                            <span className="text-[10px] text-sky-300 uppercase tracking-wider">Friendly</span>
                        </div>
                        <div className="mt-4 space-y-4">
                            <div>
                                <div className="text-xs text-slate-400 mb-2">Style</div>
                                <div className="flex flex-wrap gap-2">
                                    {(['cinematic', 'abstract', 'lyric', 'performance'] as const).map(style => (
                                        <button
                                            key={style}
                                            onClick={() => setHookStyle(style)}
                                            className={cn(
                                                'px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider transition-all border',
                                                hookStyle === style
                                                    ? 'bg-orange-500/20 text-orange-200 border-orange-500/40'
                                                    : 'bg-slate-900/60 text-slate-400 border-slate-700/40 hover:text-slate-200'
                                            )}
                                        >
                                            {style}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span>Duration</span>
                                    <span className="text-slate-200">{hookDuration}s</span>
                                </div>
                                <input
                                    type="range"
                                    min={6}
                                    max={18}
                                    step={1}
                                    value={hookDuration}
                                    onChange={(e) => setHookDuration(parseFloat(e.target.value))}
                                    className="w-full mt-2"
                                />
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 mb-2">Prompt</div>
                                <input
                                    type="text"
                                    value={hookPrompt}
                                    onChange={(e) => setHookPrompt(e.target.value)}
                                    placeholder="Warm neon, cinematic zoom, rhythmic cuts"
                                    className="w-full bg-slate-950/70 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/60 rounded-2xl border border-slate-700/40 p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hooks</span>
                            <span className="text-[10px] text-orange-300 uppercase tracking-wider">{hooks.length} ready</span>
                        </div>
                        <div className="mt-4 space-y-3 max-h-44 overflow-y-auto pr-1">
                            {hooks.length === 0 ? (
                                <div className="text-xs text-slate-500 text-center py-8">
                                    No hooks yet. Animate art to generate.
                                </div>
                            ) : (
                                hooks.map(hook => (
                                    <div key={hook.id} className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-700/50 rounded-xl px-3 py-2">
                                        <div>
                                            <div className="text-xs text-slate-200 font-semibold">{hook.title}</div>
                                            <div className="text-[10px] text-slate-500">{hook.durationSeconds}s • {hook.status}</div>
                                        </div>
                                        <button className="text-[10px] uppercase tracking-wider text-sky-300 border border-sky-500/30 px-2 py-1 rounded-full">
                                            Preview
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Voice Model Library - ElevenLabs style
const VoiceModelLibrary: React.FC<{
    models: VoiceModel[];
    selectedModel: VoiceModel | null;
    onSelectModel: (id: string) => void;
    onTrainNew: () => void;
    onGenerateSong: () => void;
}> = ({ models, selectedModel, onSelectModel, onTrainNew, onGenerateSong }) => {
    return (
        <div className={cn(glassCard, 'p-8')}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>Voice Library</h2>
                    <p className="text-sm text-slate-400">Train custom voice models for AI-powered vocal generation</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onGenerateSong}
                        disabled={models.length === 0}
                        className={cn(
                            glowButton,
                            'px-6 py-3 text-base',
                            models.length === 0 && 'opacity-50 cursor-not-allowed'
                        )}
                        title={models.length === 0 ? 'Create a voice model to generate a song' : 'Generate a song'}
                    >
                        Generate Song
                    </button>
                    <button onClick={onTrainNew} className={cn(secondaryButton, 'px-6 py-3 text-base')}>
                        + Create Voice Model
                    </button>
                </div>
            </div>

            <div className={gradientDivider} />

            {/* Voice Models Grid */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {models.length === 0 ? (
                    <div className="col-span-full text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-blue-500/15 flex items-center justify-center border border-orange-500/30">
                            <span className="text-4xl">🎙️</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-300 mb-2">No voice models yet</h3>
                        <p className="text-sm text-slate-500 mb-6">Create your first voice model to get started</p>
                        <button onClick={onTrainNew} className={cn(secondaryButton, 'px-6 py-3')}>
                            Create Voice Model
                        </button>
                    </div>
                ) : (
                    models.map((model) => (
                        <div
                            key={model.id}
                            onClick={() => onSelectModel(model.id)}
                            className={cn(
                                'bg-gradient-to-br from-slate-800/50 to-slate-900/70 backdrop-blur-md rounded-2xl p-6 cursor-pointer transition-all duration-300 border',
                                selectedModel?.id === model.id
                                    ? 'border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.2)]'
                                    : 'border-slate-700/30 hover:border-slate-600/50'
                            )}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center shadow-lg">
                                        <span className="text-2xl">🎙️</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-lg">{model.name}</h3>
                                        <p className="text-xs text-slate-400">
                                            {new Date(model.trainedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Samples</span>
                                    <span className="text-slate-300 font-mono">{model.samples.length}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">API Voice ID</span>
                                    <span className="text-slate-300 font-mono truncate max-w-[150px]">{model.apiVoiceId}</span>
                                </div>
                            </div>

                            {selectedModel?.id === model.id && (
                                <div className="mt-4 pt-4 border-t border-slate-700/30">
                                    <button className={cn(secondaryButton, 'w-full py-2 text-sm')}>
                                        Generate with this voice
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// Voice Training Wizard - ElevenLabs style
const VOICE_PERSONAS = [
    { value: 'smooth-rnb', label: 'Smooth R&B Singer', description: 'Sultry, emotional, with rich vocal runs' },
    { value: 'aggressive-rapper', label: 'Aggressive Rapper', description: 'Bold, confident, hard-hitting delivery' },
    { value: 'pop-diva', label: 'Pop Diva', description: 'Bright, powerful, catchy vocal style' },
    { value: 'rock-vocalist', label: 'Rock Vocalist', description: 'Raw, gritty, passionate energy' },
    { value: 'indie-crooner', label: 'Indie Crooner', description: 'Intimate, soft, artistic expression' },
    { value: 'country-storyteller', label: 'Country Storyteller', description: 'Warm, twangy, heartfelt narrative' },
    { value: 'edm-vocalist', label: 'EDM Vocalist', description: 'Energetic, soaring, festival-ready' }
];

const VoiceTrainingWizard: React.FC<{
    onComplete: (samples: string[], name: string, persona?: string) => void;
    onCancel: () => void;
}> = ({ onComplete, onCancel }) => {
    const { startRecording, stopRecording, resetRecording, recordingState, audioUrl, audioBlob, error } = useRecorder();
    const [name, setName] = useState('');
    const [persona, setPersona] = useState('');
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const handleNext = () => {
        if (step === 1 && name) setStep(2);
        if (step === 2 && audioBlob) setStep(3);
    };

    const handleFinish = async () => {
        if (!audioBlob || !name) return;
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
            onComplete([reader.result as string], name, persona || undefined);
        };
    };

    const getStepColor = (s: number) => {
        if (s < step) return 'bg-green-500';
        if (s === step) return 'bg-cyan-500';
        return 'bg-slate-700';
    };

    return (
        <div className={cn(glassCard, 'p-8 max-w-3xl mx-auto')}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>Create Voice Model</h2>
                    <p className="text-sm text-slate-400">Train a custom voice in 3 simple steps</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
                    ✕
                </button>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-4 mb-8">
                {[1, 2, 3].map((s) => (
                    <React.Fragment key={s}>
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                'w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300',
                                getStepColor(s),
                                s === step && 'shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                            )}>
                                {s < step ? '•' : s}
                            </div>
                            <span className={cn('text-sm font-medium', s === step ? 'text-cyan-400' : 'text-slate-400')}>
                                {s === 1 ? 'Name' : s === 2 ? 'Record' : 'Confirm'}
                            </span>
                        </div>
                        {s < 3 && <div className="flex-1 h-0.5 bg-slate-700" />}
                    </React.Fragment>
                ))}
            </div>

            <div className={gradientDivider} />

            {/* Step Content */}
            <div className="mt-8">
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">
                                Voice Model Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., My Studio Voice"
                                className="w-full bg-slate-900/70 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                autoFocus
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                Choose a memorable name for your voice model
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">
                                Voice Persona (Optional)
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {VOICE_PERSONAS.map((p) => (
                                    <button
                                        key={p.value}
                                        onClick={() => setPersona(p.value === persona ? '' : p.value)}
                                        className={cn(
                                            'p-4 rounded-xl border transition-all duration-300 text-left',
                                                persona === p.value
                                                ? 'bg-orange-500/20 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                                : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600/50'
                                        )}
                                    >
                                        <div className="mb-2">
                                            <div className="text-sm font-bold text-white">{p.label}</div>
                                        </div>
                                        <div className="text-xs text-slate-400">{p.description}</div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                Select a character style that matches your voice (helps AI understand vocal characteristics)
                            </p>
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={!name}
                            className={cn(glowButton, 'w-full py-4 text-base disabled:opacity-40 disabled:grayscale')}
                        >
                            Next: Record Sample
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        {/* Recording Interface */}
                        <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-700/30 text-center">
                            {recordingState === 'idle' && (
                                <div className="space-y-6">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.25)]">
                                        <span className="text-4xl">🎙️</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-2">Ready to Record</h3>
                                        <p className="text-sm text-slate-400">
                                            Record at least 10 seconds of clear speech for best results
                                        </p>
                                    </div>
                                    <button
                                        onClick={startRecording}
                                        className="bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-400 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-2xl shadow-[0_0_25px_rgba(59,130,246,0.35)] hover:shadow-[0_0_35px_rgba(59,130,246,0.5)] transition-all duration-300"
                                    >
                                        Start Recording
                                    </button>
                                </div>
                            )}

                            {recordingState === 'recording' && (
                                <div className="space-y-6">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-red-500 flex items-center justify-center animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.6)]">
                                        <div className="w-6 h-6 rounded-full bg-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-red-400 mb-2">Recording...</h3>
                                        <p className="text-sm text-slate-400">
                                            Speak clearly into your microphone
                                        </p>
                                    </div>
                                    <button
                                        onClick={stopRecording}
                                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300"
                                    >
                                        Stop Recording
                                    </button>
                                </div>
                            )}

                            {recordingState === 'stopped' && audioUrl && (
                                <div className="space-y-6">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-green-400 mb-2">Recording Complete</h3>
                                        <p className="text-sm text-slate-400 mb-4">
                                            Listen to your recording below
                                        </p>
                                        <audio
                                            src={audioUrl}
                                            controls
                                            className="w-full max-w-md mx-auto rounded-xl"
                                        />
                                    </div>
                                    <div className="flex gap-3 justify-center">
                                        <button
                                            onClick={resetRecording}
                                            className={cn(secondaryButton, 'px-6 py-3')}
                                        >
                                            Re-record
                                        </button>
                                        <button
                                            onClick={handleNext}
                                            className={cn(glowButton, 'px-6 py-3')}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error Display */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 backdrop-blur-sm">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-red-400 text-sm">!</span>
                                    </div>
                                    <div>
                                        <p className="text-red-400 text-sm font-bold mb-1">Microphone Error</p>
                                        <p className="text-red-300/90 text-xs leading-relaxed">{error.message}</p>
                                        {error.type === 'permission_denied' && (
                                            <div className="mt-3 text-xs text-red-300/70">
                                                <p className="font-bold mb-1">How to fix:</p>
                                                <ol className="list-decimal list-inside space-y-1">
                                                    <li>Click the lock icon in your browser's address bar</li>
                                                    <li>Find "Microphone" permissions</li>
                                                    <li>Set to "Allow" and refresh the page</li>
                                                </ol>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6">
                        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/30 space-y-4">
                            <h3 className="text-lg font-bold text-white">Confirm Details</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400 text-sm">Model Name</span>
                                    <span className="text-white font-medium">{name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400 text-sm">Recording</span>
                                    <span className="text-green-400 font-medium">Ready</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(2)}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleFinish}
                                className={cn(glowButton, 'flex-1 py-4')}
                            >
                                Create Voice Model
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIStudio;
