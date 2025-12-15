import React, { useState, useEffect } from 'react';
import { VoiceModel, GeneratedSong } from '../types';
import { voiceEngineService } from '../services/voiceEngineService';
import { sunoApiService } from '../services/sunoApiService';
import { fxMatchingEngine } from '../services/fxMatchingEngine';
import { generateSongLyrics } from '../services/geminiService';
import { useRecorder } from '../hooks/useRecorder';
import { glassCard, glowButton, secondaryButton, sectionHeader, gradientDivider, cn } from '../utils/secondLightStyles';

interface SongGenerationWizardProps {
    voiceModels: VoiceModel[];
    onComplete: (generatedSong: GeneratedSong) => void;
    onCancel: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const MUSIC_STYLES = [
    { value: 'hip-hop', label: 'Hip-Hop', description: 'Beats, rap, trap' },
    { value: 'r&b', label: 'R&B', description: 'Smooth, soulful vocals' },
    { value: 'pop', label: 'Pop', description: 'Catchy, mainstream' },
    { value: 'electronic', label: 'Electronic', description: 'EDM, synth, house' },
    { value: 'rock', label: 'Rock', description: 'Guitars, drums, energy' },
    { value: 'indie', label: 'Indie', description: 'Alternative, experimental' },
    { value: 'country', label: 'Country', description: 'Acoustic, storytelling' }
];

const SongGenerationWizard: React.FC<SongGenerationWizardProps> = ({ voiceModels, onComplete, onCancel }) => {
    const [step, setStep] = useState<Step>(1);
    const [selectedModel, setSelectedModel] = useState<VoiceModel | null>(null);
    const [lyrics, setLyrics] = useState('');
    const [prompt, setPrompt] = useState('');
    const [style, setStyle] = useState('hip-hop');
    const [styleTags, setStyleTags] = useState('');
    const [weirdness, setWeirdness] = useState(50);
    const [styleInfluence, setStyleInfluence] = useState(50);
    const [isInstrumental, setIsInstrumental] = useState(false);
    const [beatFile, setBeatFile] = useState<File | null>(null);
    const [beatBuffer, setBeatBuffer] = useState<AudioBuffer | null>(null);
    const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
    const [voiceInputFile, setVoiceInputFile] = useState<File | null>(null);
    const [voiceInputBlob, setVoiceInputBlob] = useState<Blob | null>(null);
    const [isRecordingVoice, setIsRecordingVoice] = useState(false);
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [referenceBuffer, setReferenceBuffer] = useState<AudioBuffer | null>(null);
    const [fxAnalysis, setFxAnalysis] = useState<any>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [useHybrid, setUseHybrid] = useState(false);
    const [harmoniesType, setHarmoniesType] = useState<'harmonies' | 'doubles'>('harmonies');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationStatus, setGenerationStatus] = useState('');
    const [previewSong, setPreviewSong] = useState<GeneratedSong | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { startRecording, stopRecording, resetRecording, recordingState, audioUrl, audioBlob, error: recorderError } = useRecorder();

    // Update voiceInputBlob when recording finishes
    useEffect(() => {
        if (recordingState === 'stopped' && audioBlob && isRecordingVoice) {
            setVoiceInputBlob(audioBlob);
            setIsRecordingVoice(false);
        }
    }, [recordingState, audioBlob, isRecordingVoice]);

    const rateLimit = sunoApiService.checkRateLimit();

    useEffect(() => {
        if (recorderError) {
            setError(recorderError.message);
        }
    }, [recorderError]);

    // Update voiceInputBlob when recording finishes
    useEffect(() => {
        if (recordingState === 'stopped' && audioBlob && isRecordingVoice) {
            setVoiceInputBlob(audioBlob);
            setIsRecordingVoice(false);
        }
    }, [recordingState, audioBlob, isRecordingVoice]);

    const handleNext = () => {
        setError(null);
        if (step === 1 && selectedModel) setStep(2);
        else if (step === 2 && (lyrics || isInstrumental)) setStep(3);
        else if (step === 3) setStep(4); // Reference is optional
        else if (step === 4) setStep(5); // Hybrid is optional
    };

    const handleBack = () => {
        setError(null);
        if (step > 1) setStep((step - 1) as Step);
    };

    const handleSkip = () => {
        setError(null);
        if (step === 3) {
            setReferenceFile(null);
            setReferenceBuffer(null);
            setFxAnalysis(null);
            setStep(4);
        } else if (step === 4) {
            setUseHybrid(false);
            resetRecording();
            setStep(5);
        }
    };

    const handleBeatUpload = async (file: File) => {
        setBeatFile(file);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);
            setBeatBuffer(buffer);
        } catch (err: any) {
            setError(`Failed to load beat: ${err.message}`);
        }
    };

    const handleGenerateLyrics = async () => {
        console.log('[Wizard] Generate lyrics clicked! Style:', style);
        setIsGeneratingLyrics(true);
        setError(null);

        try {
            // Use Gemini AI to generate original lyrics
            console.log('[Wizard] Calling generateSongLyrics...');
            const generatedLyrics = await generateSongLyrics(style, prompt || undefined);
            console.log('[Wizard] Lyrics received, length:', generatedLyrics.length);
            setLyrics(generatedLyrics);
        } catch (err: any) {
            console.error('[Wizard] Lyric generation error:', err);
            setError(`Failed to generate lyrics: ${err.message}`);
        } finally {
            setIsGeneratingLyrics(false);
        }
    };

    const handleReferenceUpload = async (file: File) => {
        setReferenceFile(file);
        setIsAnalyzing(true);
        setFxAnalysis(null);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);
            setReferenceBuffer(buffer);

            // Analyze FX
            const analysis = await fxMatchingEngine.matchReference(buffer);
            setFxAnalysis(analysis);
        } catch (err: any) {
            setError(`Failed to analyze reference track: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedModel && !isInstrumental) {
            setError('Please select a voice model');
            return;
        }

        if (!rateLimit.allowed) {
            setError(`Daily limit reached. Resets at ${rateLimit.resetAt.toLocaleTimeString()}`);
            return;
        }

        setIsGenerating(true);
        setError(null);
        setGenerationProgress(0);
        setGenerationStatus('Initializing generation...');

        try {
            // Generate song with options
            const options: any = {};
            if (referenceBuffer) {
                options.referenceTrack = referenceBuffer;
            }
            if (useHybrid && audioBlob) {
                options.userVocals = audioBlob;
                options.generateHarmonies = harmoniesType === 'harmonies';
            }
            if (isInstrumental) {
                options.instrumental = true;
                if (beatBuffer) {
                    options.sourceBeat = beatBuffer;
                }
            }
            if (styleTags) {
                options.styleTags = styleTags;
                options.weirdness = weirdness;
                options.styleInfluence = styleInfluence;
            }
            if (voiceInputFile || voiceInputBlob) {
                options.voiceInput = voiceInputBlob || voiceInputFile;
            }

            const generatedSong = await voiceEngineService.generateSong(
                selectedModel,
                lyrics || 'Instrumental track',
                style,
                options
            );

            setGenerationStatus('Complete!');
            setGenerationProgress(100);
            setPreviewSong(generatedSong);
        } catch (err: any) {
            setError(err.message || 'Generation failed. Please try again.');
            setIsGenerating(false);
            setGenerationProgress(0);
        }
    };

    const handleRouteToWorkspace = () => {
        if (previewSong) {
            onComplete(previewSong);
        }
    };

    const handleRegenerate = () => {
        setPreviewSong(null);
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus('');
    };

    const getStepColor = (s: number) => {
        if (s < step) return 'bg-green-500';
        if (s === step) return 'bg-cyan-500';
        return 'bg-slate-700';
    };

    return (
        <div className={cn(glassCard, 'p-8 max-w-4xl mx-auto')}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>Generate Song</h2>
                    <p className="text-sm text-slate-400">Create AI-generated music with your cloned voice</p>
                </div>
                <div className="flex items-center gap-4">
                    {/* Credit Badge */}
                    <div className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold',
                        rateLimit.remaining > 5 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    )}>
                        {rateLimit.remaining}/{rateLimit.limit} remaining today
                    </div>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors text-2xl">
                        ✕
                    </button>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-3 mb-8">
                {[1, 2, 3, 4, 5].map((s) => (
                    <React.Fragment key={s}>
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                'w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 text-sm',
                                getStepColor(s),
                                s === step && 'shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                            )}>
                                {s < step ? '✓' : s}
                            </div>
                            <span className={cn('text-xs font-medium hidden md:block', s === step ? 'text-cyan-400' : 'text-slate-400')}>
                                {s === 1 ? 'Voice' : s === 2 ? 'Lyrics' : s === 3 ? 'Reference' : s === 4 ? 'Hybrid' : 'Generate'}
                            </span>
                        </div>
                        {s < 5 && <div className="flex-1 h-0.5 bg-slate-700" />}
                    </React.Fragment>
                ))}
            </div>

            <div className={gradientDivider} />

            {/* Step Content */}
            <div className="mt-8">
                {/* Step 1: Voice Model Selection */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Select Voice Model</h3>
                            <p className="text-sm text-slate-400 mb-6">Choose which voice to use for your AI-generated song</p>
                        </div>

                        {voiceModels.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
                                    <span className="text-4xl">MIC</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-300 mb-2">No voice models yet</h3>
                                <p className="text-sm text-slate-500">Train a voice model first to generate songs</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {voiceModels.map((model) => (
                                    <div
                                        key={model.id}
                                        onClick={() => setSelectedModel(model)}
                                        className={cn(
                                            'bg-gradient-to-br from-slate-800/50 to-slate-900/70 rounded-2xl p-5 cursor-pointer transition-all duration-300 border',
                                            selectedModel?.id === model.id
                                                ? 'border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.2)]'
                                                : 'border-slate-700/30 hover:border-slate-600/50'
                                        )}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                                                <span className="text-2xl">MIC</span>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white">{model.name}</h3>
                                                <p className="text-xs text-slate-400">
                                                    {new Date(model.trainedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {model.samples.length} sample{model.samples.length !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={handleNext}
                            disabled={!selectedModel}
                            className={cn(glowButton, 'w-full py-4 text-base disabled:opacity-40 disabled:grayscale')}
                        >
                            Next: Enter Lyrics
                        </button>
                    </div>
                )}

                {/* Step 2: Lyrics & Style Input */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Lyrics & Style</h3>
                            <p className="text-sm text-slate-400 mb-6">Describe the song you want to create</p>
                        </div>

                        {/* Instrumental Mode Toggle */}
                        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-5">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isInstrumental}
                                    onChange={(e) => {
                                        setIsInstrumental(e.target.checked);
                                        if (e.target.checked) setLyrics('');
                                    }}
                                    className="w-5 h-5 rounded border-purple-600 bg-slate-800 checked:bg-purple-500"
                                />
                                <div>
                                    <span className="text-white font-bold">Instrumental Remix Mode</span>
                                    <p className="text-xs text-purple-300/80 mt-1">
                                        Upload a beat to create a completely new AI-generated instrumental (like Suno's remix feature)
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* Beat Upload for Instrumental Mode */}
                        {isInstrumental && (
                            <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/30">
                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                    Upload Beat to Remix
                                </label>
                                {!beatFile ? (
                                    <label className="block cursor-pointer">
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={(e) => e.target.files && handleBeatUpload(e.target.files[0])}
                                            className="hidden"
                                        />
                                        <div className="text-center py-6 border-2 border-dashed border-purple-500/30 rounded-xl hover:border-purple-500/50 transition-colors">
                                            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
                                                <span className="text-2xl"></span>
                                            </div>
                                            <p className="text-white font-medium mb-1">Upload Beat</p>
                                            <p className="text-xs text-slate-400">AI will create a new instrumental inspired by this beat</p>
                                        </div>
                                    </label>
                                ) : (
                                    <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                <span className="text-xl">✓</span>
                                            </div>
                                            <div>
                                                <p className="text-white font-medium">{beatFile.name}</p>
                                                <p className="text-xs text-slate-400">
                                                    {(beatFile.size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setBeatFile(null);
                                                setBeatBuffer(null);
                                            }}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">
                                Song Style
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                {MUSIC_STYLES.map((s) => (
                                    <button
                                        key={s.value}
                                        onClick={() => setStyle(s.value)}
                                        className={cn(
                                            'p-3 rounded-xl border transition-all duration-300',
                                            style === s.value
                                                ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                                : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600/50'
                                        )}
                                    >
                                        <div className="text-sm font-bold text-white">{s.label}</div>
                                        <div className="text-xs text-slate-400">{s.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!isInstrumental && (
                            <>
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="block text-sm font-medium text-slate-300">
                                            Lyrics
                                        </label>
                                        <button
                                            onClick={handleGenerateLyrics}
                                            disabled={isGeneratingLyrics}
                                            className={cn(
                                                'px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all',
                                                'bg-slate-900 text-orange-400',
                                                'shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)]',
                                                'hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)]',
                                                'hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)]',
                                                'active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed'
                                            )}
                                        >
                                            {isGeneratingLyrics ? (
                                                <span className="flex items-center gap-2">
                                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Generating...
                                                </span>
                                            ) : (
                                                'Auto-Generate Lyrics'
                                            )}
                                        </button>
                                    </div>
                                    <textarea
                                        value={lyrics}
                                        onChange={(e) => setLyrics(e.target.value)}
                                        placeholder="Enter your song lyrics here...

Verse 1:
...

Chorus:
..."
                                        rows={10}
                                        className="w-full bg-slate-900/70 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono text-sm"
                                        autoFocus
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        Include verse labels (Verse 1, Chorus, Bridge, etc.) for better structure
                                    </p>
                                </div>

                                <div>
                                    <label className="flex items-center justify-between text-sm font-medium text-slate-300 mb-3">
                                        <span>Style Description (Optional) - Describe Your Sound</span>
                                        <span className="text-xs text-slate-500 font-mono">{styleTags.length}/1000</span>
                                    </label>
                                    <textarea
                                        value={styleTags}
                                        onChange={(e) => setStyleTags(e.target.value)}
                                        maxLength={1000}
                                        placeholder="Melodic Trap, Ambient Hip Hop, Late Night Vibe, Minimal, Atmospheric, Emotional, cinematic hip-hop & alt-soul with deep underwater ambience and dreamlike vocals, Smooth melodic flow with introspective lyrics, Layered harmonies, warm analog bass, dusty percussion, floating synths..."
                                        rows={4}
                                        className="w-full bg-slate-900/70 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        Describe genres, vibes, instruments, vocal style, mix characteristics - be as detailed as you want!
                                    </p>
                                </div>

                                {/* Weirdness and Style Influence Sliders */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="flex items-center justify-between text-sm font-medium text-slate-300 mb-3">
                                            <span>Weirdness</span>
                                            <span className="text-cyan-400 font-mono">{weirdness}%</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={weirdness}
                                            onChange={(e) => setWeirdness(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">
                                            Experimental texture for otherworldly depth
                                        </p>
                                    </div>

                                    <div>
                                        <label className="flex items-center justify-between text-sm font-medium text-slate-300 mb-3">
                                            <span>Style Influence</span>
                                            <span className="text-cyan-400 font-mono">{styleInfluence}%</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={styleInfluence}
                                            onChange={(e) => setStyleInfluence(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">
                                            How closely to follow your style description
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-3">
                                        Upload Audio or Record Voice (Optional)
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Upload Audio */}
                                        <label className="cursor-pointer">
                                            <input
                                                type="file"
                                                accept="audio/*"
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        setVoiceInputFile(e.target.files[0]);
                                                        setVoiceInputBlob(null);
                                                        setIsRecordingVoice(false);
                                                    }
                                                }}
                                                className="hidden"
                                            />
                                            <div className={cn(
                                                'p-4 rounded-xl border-2 border-dashed transition-all text-center',
                                                voiceInputFile
                                                    ? 'bg-green-500/10 border-green-500/50'
                                                    : 'bg-slate-800/50 border-slate-700/30 hover:border-cyan-500/50'
                                            )}>
                                                <div className="text-2xl mb-2">FILE</div>
                                                <div className="text-sm font-medium text-white">
                                                    {voiceInputFile ? 'Uploaded' : 'Upload Audio'}
                                                </div>
                                                {voiceInputFile && (
                                                    <div className="text-xs text-slate-400 mt-1 truncate">
                                                        {voiceInputFile.name}
                                                    </div>
                                                )}
                                            </div>
                                        </label>

                                        {/* Record Voice */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!isRecordingVoice && !voiceInputBlob) {
                                                    startRecording();
                                                    setIsRecordingVoice(true);
                                                    setVoiceInputFile(null);
                                                } else if (isRecordingVoice) {
                                                    stopRecording();
                                                    // useEffect will handle setting voiceInputBlob
                                                }
                                            }}
                                            className={cn(
                                                'p-4 rounded-xl border-2 border-dashed transition-all',
                                                voiceInputBlob
                                                    ? 'bg-green-500/10 border-green-500/50'
                                                    : isRecordingVoice
                                                    ? 'bg-red-500/10 border-red-500/50 animate-pulse'
                                                    : 'bg-slate-800/50 border-slate-700/30 hover:border-red-500/50'
                                            )}
                                        >
                                            <div className="text-2xl mb-2">
                                                {voiceInputBlob ? 'DONE' : isRecordingVoice ? 'REC' : 'MIC'}
                                            </div>
                                            <div className="text-sm font-medium text-white">
                                                {voiceInputBlob ? 'Recorded' : isRecordingVoice ? 'Recording...' : 'Record Voice'}
                                            </div>
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Add your voice for AI to match the style, tone, and delivery
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-3">
                                        Additional Creative Direction (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="e.g., upbeat, melancholic, aggressive, smooth..."
                                        className="w-full bg-slate-900/70 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                    />
                                </div>
                            </>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!lyrics && !isInstrumental}
                                className={cn(glowButton, 'flex-1 py-4 disabled:opacity-40 disabled:grayscale')}
                            >
                                Next: Reference Track
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Reference Track (Optional) */}
                {step === 3 && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Reference Track (Optional)</h3>
                            <p className="text-sm text-slate-400 mb-6">
                                Upload a reference track to match its vocal production style
                            </p>
                        </div>

                        <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-700/30">
                            {!referenceFile ? (
                                <label className="block cursor-pointer">
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => e.target.files && handleReferenceUpload(e.target.files[0])}
                                        className="hidden"
                                    />
                                    <div className="text-center py-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-cyan-500/30">
                                            <span className="text-3xl">FILE</span>
                                        </div>
                                        <p className="text-white font-medium mb-2">Upload Reference Track</p>
                                        <p className="text-sm text-slate-400">Click to select an audio file</p>
                                    </div>
                                </label>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                                                <span className="text-xl">✓</span>
                                            </div>
                                            <div>
                                                <p className="text-white font-medium">{referenceFile.name}</p>
                                                <p className="text-xs text-slate-400">
                                                    {(referenceFile.size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setReferenceFile(null);
                                                setReferenceBuffer(null);
                                                setFxAnalysis(null);
                                            }}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {isAnalyzing && (
                                        <div className="text-center py-6">
                                            <div className="w-12 h-12 mx-auto mb-3 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                                            <p className="text-sm text-slate-400">Analyzing vocal processing...</p>
                                        </div>
                                    )}

                                    {fxAnalysis && (
                                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-5">
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-cyan-400 text-sm">✓</span>
                                                </div>
                                                <div>
                                                    <p className="text-cyan-400 text-sm font-bold mb-1">FX Analysis Complete</p>
                                                    <p className="text-cyan-300/90 text-xs">
                                                        Confidence: {fxAnalysis.confidence}%
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-xs text-slate-300">
                                                {fxAnalysis.explanations?.slice(0, 5).map((exp: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2">
                                                        <span className="text-cyan-400">•</span>
                                                        <span>{exp}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSkip}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Skip
                            </button>
                            <button
                                onClick={handleNext}
                                className={cn(glowButton, 'flex-1 py-4')}
                            >
                                Next: Hybrid Vocals
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Hybrid Vocals (Optional) */}
                {step === 4 && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Hybrid Vocals (Optional)</h3>
                            <p className="text-sm text-slate-400 mb-6">
                                Record your own vocals and AI will generate harmonies or doubles in your cloned voice
                            </p>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useHybrid}
                                    onChange={(e) => setUseHybrid(e.target.checked)}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 checked:bg-cyan-500"
                                />
                                <span className="text-white font-medium">Enable hybrid vocal stacking</span>
                            </label>
                        </div>

                        {useHybrid && (
                            <div className="space-y-6">
                                <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-700/30">
                                    {recordingState === 'idle' && !audioUrl && (
                                        <div className="text-center space-y-6">
                                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                                                <span className="text-4xl">MIC</span>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white mb-2">Ready to Record</h3>
                                                <p className="text-sm text-slate-400">
                                                    Record your lead vocals for the song
                                                </p>
                                            </div>
                                            <button
                                                onClick={startRecording}
                                                className="bg-slate-900 text-orange-400 font-bold py-4 px-8 rounded-2xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all uppercase tracking-wider text-sm"
                                            >
                                                Start Recording
                                            </button>
                                        </div>
                                    )}

                                    {recordingState === 'recording' && (
                                        <div className="text-center space-y-6">
                                            <div className="w-20 h-20 mx-auto rounded-full bg-red-500 flex items-center justify-center animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.6)]">
                                                <div className="w-6 h-6 rounded-full bg-white" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-red-400 mb-2">Recording...</h3>
                                                <p className="text-sm text-slate-400">Sing your vocals clearly</p>
                                            </div>
                                            <button
                                                onClick={stopRecording}
                                                className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-8 rounded-2xl transition-all"
                                            >
                                                Stop Recording
                                            </button>
                                        </div>
                                    )}

                                    {recordingState === 'stopped' && audioUrl && (
                                        <div className="space-y-6">
                                            <div className="text-center">
                                                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                                    <span className="text-4xl">✓</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-green-400 mb-2">Recording Complete</h3>
                                                <audio
                                                    src={audioUrl}
                                                    controls
                                                    className="w-full max-w-md mx-auto rounded-xl mt-4"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                                    AI Vocals Type
                                                </label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        onClick={() => setHarmoniesType('harmonies')}
                                                        className={cn(
                                                            'p-4 rounded-xl border transition-all',
                                                            harmoniesType === 'harmonies'
                                                                ? 'bg-cyan-500/20 border-cyan-500/50'
                                                                : 'bg-slate-800/50 border-slate-700/30'
                                                        )}
                                                    >
                                                        <div className="text-sm font-bold text-white">Harmonies</div>
                                                        <div className="text-xs text-slate-400">Background vocals</div>
                                                    </button>
                                                    <button
                                                        onClick={() => setHarmoniesType('doubles')}
                                                        className={cn(
                                                            'p-4 rounded-xl border transition-all',
                                                            harmoniesType === 'doubles'
                                                                ? 'bg-cyan-500/20 border-cyan-500/50'
                                                                : 'bg-slate-800/50 border-slate-700/30'
                                                        )}
                                                    >
                                                        <div className="text-sm font-bold text-white">Doubles</div>
                                                        <div className="text-xs text-slate-400">Layered vocals</div>
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                onClick={resetRecording}
                                                className={cn(secondaryButton, 'w-full py-3')}
                                            >
                                                Re-record
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {recorderError && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                                                <span className="text-red-400 text-sm">!</span>
                                            </div>
                                            <div>
                                                <p className="text-red-400 text-sm font-bold mb-1">Microphone Error</p>
                                                <p className="text-red-300/90 text-xs">{recorderError.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSkip}
                                className={cn(secondaryButton, 'flex-1 py-4')}
                            >
                                Skip
                            </button>
                            <button
                                onClick={handleNext}
                                className={cn(glowButton, 'flex-1 py-4')}
                            >
                                Next: Generate
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: Generate & Preview */}
                {step === 5 && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4">Generate Song</h3>
                            <p className="text-sm text-slate-400 mb-6">Review your settings and generate your AI-powered song</p>
                        </div>

                        {/* Summary */}
                        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/30 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Voice Model</span>
                                <span className="text-white font-medium">{selectedModel?.name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Style</span>
                                <span className="text-white font-medium capitalize">{style}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Lyrics Length</span>
                                <span className="text-white font-medium">{lyrics.length} characters</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Reference Track</span>
                                <span className={referenceFile ? 'text-green-400' : 'text-slate-500'}>
                                    {referenceFile ? 'Applied' : 'None'}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Hybrid Vocals</span>
                                <span className={useHybrid && audioBlob ? 'text-green-400' : 'text-slate-500'}>
                                    {useHybrid && audioBlob ? 'Enabled' : 'None'}
                                </span>
                            </div>
                        </div>

                        {/* Generation Progress */}
                        {isGenerating && !previewSong && (
                            <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-700/30 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-white font-bold mb-2">{generationStatus}</p>
                                <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${generationProgress}%` }}
                                    />
                                </div>
                                <p className="text-sm text-slate-400">Estimated time: 30-60 seconds</p>
                            </div>
                        )}

                        {/* Preview */}
                        {previewSong && (
                            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl p-8 border border-green-500/30">
                                <div className="text-center mb-6">
                                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                        <span className="text-4xl">✓</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-green-400 mb-2">Song Generated!</h3>
                                    <p className="text-sm text-slate-400">{previewSong.name}</p>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={handleRegenerate}
                                        className={cn(secondaryButton, 'flex-1 py-4')}
                                    >
                                        Regenerate
                                    </button>
                                    <button
                                        onClick={handleRouteToWorkspace}
                                        className={cn(glowButton, 'flex-1 py-4')}
                                    >
                                        Route to Workspace →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <span className="text-red-400 text-sm">!</span>
                                    </div>
                                    <div>
                                        <p className="text-red-400 text-sm font-bold mb-1">Generation Error</p>
                                        <p className="text-red-300/90 text-xs">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isGenerating && !previewSong && (
                            <div className="flex gap-3">
                                <button
                                    onClick={handleBack}
                                    className={cn(secondaryButton, 'flex-1 py-4')}
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={!rateLimit.allowed}
                                    className={cn(glowButton, 'flex-1 py-4 disabled:opacity-40 disabled:grayscale')}
                                >
                                    Generate Song
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SongGenerationWizard;
