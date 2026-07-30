import React, { useEffect, useMemo, useState } from 'react';
import { VoiceModel, GeneratedSong } from '../types';
import { voiceEngineService } from '../services/voiceEngineService';
import { useRecorder } from '../hooks/useRecorder';
import { glassCard, glowButton, secondaryButton, sectionHeader, cn } from '../utils/secondLightStyles';
import AudioDeviceSelector from './AudioDeviceSelector';
import { INTEGRATION_FLAGS } from '../config/integrationFlags';
import { nativeVoiceService } from '../services/nativeVoiceService';
import {
  REFERENCE_WORLD_PROFILES,
  resolveReferenceWorldPitchPreset,
  type ReferenceWorldProfileId,
} from '../services/finishing/referenceWorldEngine';
import { analyzeRecordingIntake, type RecordingIntakeAnalysis } from '../services/recordingIntakeService';

interface SongGenerationWizardProps {
  voiceModels: VoiceModel[];
  onComplete: (generatedSong: GeneratedSong) => void;
  onOpenSingleTrack?: (generatedSong: GeneratedSong) => void;
  onCancel: () => void;
}

type StudioPane = 'create' | 'library' | 'personas';
type LocalStyle = 'Trap' | 'Synthwave' | 'Rock' | 'Ambient';
type VocalTexture = 'none' | 'gospel_choir' | 'rn_b_silk' | 'gritty_soul';

interface PersonaPreset {
  id: string;
  name: string;
  style: LocalStyle;
  voiceId: string;
  tempo: number;
  instrumental: boolean;
}

const PERSONA_STORAGE_KEY = 'echo.aiStudio.personas.v1';

const STYLE_OPTIONS: Array<{ value: LocalStyle; tags: string[]; defaultTempo: number }> = [
  { value: 'Trap', tags: ['808', 'dark', 'drill'], defaultTempo: 140 },
  { value: 'Synthwave', tags: ['retro', 'neon', 'analog'], defaultTempo: 108 },
  { value: 'Rock', tags: ['guitars', 'arena', 'live-kit'], defaultTempo: 122 },
  { value: 'Ambient', tags: ['cinematic', 'airy', 'textures'], defaultTempo: 84 },
];

const DEFAULT_LYRICS = `[Verse]\nCity lights and static in my chest tonight\nRunning through the noise till the silence hits right\n\n[Chorus]\nWe rise in stereo, we glow in neon rain\nEcho in the skyline, singing through the pain`;

const SongGenerationWizard: React.FC<SongGenerationWizardProps> = ({ voiceModels, onComplete, onOpenSingleTrack, onCancel }) => {
  const [pane, setPane] = useState<StudioPane>('create');
  const [isCustomMode, setIsCustomMode] = useState(true);

  const [title, setTitle] = useState('Untitled Echo Session');
  const [lyrics, setLyrics] = useState(DEFAULT_LYRICS);
  const [style, setStyle] = useState<LocalStyle>('Trap');
  const [styleTags, setStyleTags] = useState('808, dark, wide');
  const [tempo, setTempo] = useState(140);
  const [instrumental, setInstrumental] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState<string>(voiceModels[0]?.id || '');
  const [voiceId, setVoiceId] = useState('');

  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [compTakeFiles, setCompTakeFiles] = useState<File[]>([]);
  const [enableSmartComping, setEnableSmartComping] = useState(false);
  const [compingSegmentMs, setCompingSegmentMs] = useState(420);
  const [enableHonestTuner, setEnableHonestTuner] = useState(false);
  const [tunerKey, setTunerKey] = useState('C');
  const [tunerScale, setTunerScale] = useState<'major' | 'minor' | 'chromatic'>('chromatic');
  const [tunerStrength, setTunerStrength] = useState(18);
  const [referenceWorldId, setReferenceWorldId] = useState<ReferenceWorldProfileId>('balanced_modern_release');
  const [vocalTexture, setVocalTexture] = useState<VocalTexture>('none');
  const [usingRecordedVoice, setUsingRecordedVoice] = useState(false);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('');
  const [channelMode, setChannelMode] = useState<'mono' | 'stereo'>('mono');
  const [recordingIntake, setRecordingIntake] = useState<RecordingIntakeAnalysis | null>(null);

  const [personas, setPersonas] = useState<PersonaPreset[]>([]);
  const [generatedSongs, setGeneratedSongs] = useState<Array<GeneratedSong & { createdAt: number }>>([]);
  const [latestSong, setLatestSong] = useState<GeneratedSong | null>(null);
  const [editingExtensionSongId, setEditingExtensionSongId] = useState<string | null>(null);
  const [extensionStartBySongId, setExtensionStartBySongId] = useState<Record<string, number>>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Idle');
  const [error, setError] = useState<string | null>(null);

  const {
    startRecording,
    stopRecording,
    resetRecording,
    recordingState,
    audioUrl,
    audioBlob,
    error: recorderError,
    inputLevel,
  } = useRecorder();

  useEffect(() => {
    if (recorderError) setError(recorderError.message);
  }, [recorderError]);

  useEffect(() => {
    if (!audioBlob) {
      setRecordingIntake(null);
      return;
    }

    let cancelled = false;
    const analyze = async () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const result = analyzeRecordingIntake(buffer);
        if (!cancelled) setRecordingIntake(result);
        if (ctx.state !== 'closed') {
          await ctx.close();
        }
      } catch (err) {
        console.warn('[SongGenerationWizard] Recording intake analysis failed:', err);
        if (!cancelled) setRecordingIntake(null);
      }
    };

    void analyze();
    return () => {
      cancelled = true;
    };
  }, [audioBlob]);

  useEffect(() => {
    if (!voiceModels.length) {
      setSelectedModelId('');
      return;
    }
    if (!voiceModels.find((m) => m.id === selectedModelId)) {
      setSelectedModelId(voiceModels[0].id);
    }
  }, [voiceModels, selectedModelId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSONA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersonaPreset[];
        if (Array.isArray(parsed)) setPersonas(parsed);
      }
    } catch {
      // ignore corrupted persona state
    }
  }, []);

  const selectedModel = useMemo(
    () => voiceModels.find((m) => m.id === selectedModelId) || null,
    [voiceModels, selectedModelId]
  );

  const canGenerate = useMemo(
    () => (
      !!voiceFile ||
      !!audioBlob ||
      (enableSmartComping && compTakeFiles.length > 0) ||
      (!INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE && lyrics.trim().length > 0)
    ),
    [voiceFile, audioBlob, enableSmartComping, compTakeFiles.length, lyrics]
  );

  const persistPersonas = (next: PersonaPreset[]) => {
    setPersonas(next);
    localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(next));
  };

  const insertLyricTag = (tag: 'Intro' | 'Verse' | 'Chorus' | 'Outro') => {
    setLyrics((prev) => `${prev.trim()}\n\n[${tag}]\n`);
  };

  const randomizeStyle = () => {
    const pick = STYLE_OPTIONS[Math.floor(Math.random() * STYLE_OPTIONS.length)];
    setStyle(pick.value);
    setStyleTags(pick.tags.join(', '));
    setTempo(pick.defaultTempo);
  };

  const applyStylePreset = (next: LocalStyle) => {
    setStyle(next);
    const preset = STYLE_OPTIONS.find((s) => s.value === next);
    if (preset && !isCustomMode) {
      setTempo(preset.defaultTempo);
      setStyleTags(preset.tags.join(', '));
    }
  };

  const savePersona = () => {
    const personaName = `${style} Persona ${personas.length + 1}`;
    const nextPersona: PersonaPreset = {
      id: `persona-${Date.now()}`,
      name: personaName,
      style,
      voiceId,
      tempo,
      instrumental,
    };
    persistPersonas([nextPersona, ...personas]);
    setPane('personas');
  };

  const loadPersona = (personaId: string) => {
    const persona = personas.find((p) => p.id === personaId);
    if (!persona) return;
    setStyle(persona.style);
    setVoiceId(persona.voiceId);
    setTempo(persona.tempo);
    setInstrumental(persona.instrumental);
    setPane('create');
  };

  const deletePersona = (personaId: string) => {
    persistPersonas(personas.filter((p) => p.id !== personaId));
  };

  const buildSong = async () => {
    setError(null);
    if (!canGenerate) {
      setError('Record or upload a vocal idea first.');
      return;
    }

    setIsGenerating(true);
    setStatusMessage('Launching local music engine...');

    try {
      let derivedVoiceInput: Blob | File | undefined = audioBlob || voiceFile || undefined;
      if (!derivedVoiceInput && !INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE) {
        setStatusMessage('Generating native speech guide...');
        const previewText = lyrics.slice(0, 320).trim() || title.trim() || 'Echo Sound Lab voice guide';
        const asset = await nativeVoiceService.createVoiceAsset(previewText);
        const voiceResponse = await fetch(asset.audioUrl);
        derivedVoiceInput = await voiceResponse.blob();
      }

      const outputName = `${title.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'echo_song'}_${Date.now()}.wav`;
      const result = await voiceEngineService.generateSong(
        selectedModel,
        lyrics,
        style,
        {
          voiceInput: derivedVoiceInput,
          tempo,
          songTitle: title,
          voiceId,
          instrumental,
          outputName,
          vocalTexture,
          enableHonestTuner,
          tunerKey: enableHonestTuner ? (resolveReferenceWorldPitchPreset(referenceWorldId).key ?? tunerKey) : tunerKey,
          tunerScale: enableHonestTuner ? (resolveReferenceWorldPitchPreset(referenceWorldId).scale ?? tunerScale) : tunerScale,
          tunerStrength: enableHonestTuner ? resolveReferenceWorldPitchPreset(referenceWorldId).strength : tunerStrength,
          enableSmartComping,
          compingSegmentMs,
          compTakeInputs: enableSmartComping ? compTakeFiles : [],
        }
      );

      setLatestSong(result);
      setGeneratedSongs((prev) => [{ ...result, createdAt: Date.now() }, ...prev]);
      setStatusMessage('Song built locally.');
      setPane('library');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Local generation failed.');
      setStatusMessage('Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, '0')}`;
  };

  const getDefaultExtensionStart = (song: GeneratedSong) => Math.max(0, (song.buffer?.duration || 0) - 5);

  const enterExtensionEditMode = (song: GeneratedSong) => {
    setEditingExtensionSongId(song.id);
    setExtensionStartBySongId((prev) => {
      if (Number.isFinite(prev[song.id])) return prev;
      return { ...prev, [song.id]: getDefaultExtensionStart(song) };
    });
  };

  const extendSong = async (baseSong: GeneratedSong, explicitStartTime?: number) => {
    setError(null);
    setIsGenerating(true);
    setStatusMessage(`Extending "${baseSong.name}" locally...`);

    try {
      const chosenStartTime = Number.isFinite(explicitStartTime)
        ? explicitStartTime!
        : (Number.isFinite(extensionStartBySongId[baseSong.id])
          ? extensionStartBySongId[baseSong.id]
          : getDefaultExtensionStart(baseSong));
      const extension = await voiceEngineService.extendSong(baseSong, {
        lyrics,
        style,
        tempo,
        songTitle: `${baseSong.name} Extended`,
        voiceId,
        instrumental,
        startTime: chosenStartTime,
        voiceInput: audioBlob || voiceFile || undefined,
        vocalTexture,
        enableHonestTuner,
        tunerKey,
        tunerScale,
        tunerStrength,
        enableSmartComping,
        compingSegmentMs,
        compTakeInputs: enableSmartComping ? compTakeFiles : [],
      });

      setLatestSong(extension);
      setGeneratedSongs((prev) => [{ ...extension, createdAt: Date.now() }, ...prev]);
      setEditingExtensionSongId(null);
      setStatusMessage('Song extension complete.');
      setPane('library');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Song extension failed.');
      setStatusMessage('Extension failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn(glassCard, 'p-0 overflow-hidden max-w-6xl mx-auto')}>
      <div className="flex min-h-[720px] flex-col md:flex-row">
        <aside className="w-full md:w-[230px] border-b md:border-b-0 md:border-r border-slate-800/60 bg-slate-950/70 p-4 space-y-2">
          <div className="mb-4">
            <h2 className={cn(sectionHeader, 'text-xl mb-1')}>Echo AI Studio</h2>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Suno-Grade Local</p>
          </div>

          {!INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[10px] uppercase tracking-wider text-emerald-200">
                Native Voice Mode
              </div>
              <button
                type="button"
                disabled
                title="This capability is disabled in Sovereign Mode."
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 cursor-not-allowed"
              >
                Premium Voice API Disabled
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
            {([
              ['create', 'Create'],
              ['library', 'Library'],
              ['personas', 'Personas'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPane(id)}
                className={cn(
                  'w-full text-left rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all',
                  pane === id
                    ? 'bg-orange-500/20 border border-orange-500/40 text-orange-200'
                    : 'bg-slate-900/70 border border-slate-800/70 text-slate-400 hover:text-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button onClick={onCancel} className={cn(secondaryButton, 'w-full mt-6 py-2 text-xs')}>
            Close Studio
          </button>
        </aside>

        <main className="flex-1 p-4 sm:p-6 space-y-6">
          {pane === 'create' && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Create</h3>
                <label className="flex items-center gap-2 text-xs text-slate-300 uppercase tracking-wider">
                  <span>Custom Mode</span>
                  <input
                    type="checkbox"
                    checked={isCustomMode}
                    onChange={(e) => setIsCustomMode(e.target.checked)}
                    className="accent-orange-400"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="space-y-4">
                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <label className="text-[11px] uppercase tracking-wider text-slate-500">Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none"
                    />

                    <label className="text-[11px] uppercase tracking-wider text-slate-500">Style Tags</label>
                    <div className="flex gap-2">
                      <input
                        value={styleTags}
                        onChange={(e) => setStyleTags(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                      <button onClick={randomizeStyle} className={cn(secondaryButton, 'px-3 text-xs')}>Randomize</button>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Lyrics Editor</label>
                      <div className="flex gap-2">
                        <button onClick={() => insertLyricTag('Intro')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Intro]</button>
                        <button onClick={() => insertLyricTag('Verse')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Verse]</button>
                        <button onClick={() => insertLyricTag('Chorus')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Chorus]</button>
                        <button onClick={() => insertLyricTag('Outro')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Outro]</button>
                      </div>
                    </div>
                    <textarea
                      value={lyrics}
                      onChange={(e) => setLyrics(e.target.value)}
                      rows={14}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 font-mono outline-none"
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-4">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Style</label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {STYLE_OPTIONS.map((item) => (
                          <button
                            key={item.value}
                            onClick={() => applyStylePreset(item.value)}
                            className={cn(
                              'rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider',
                              style === item.value
                                ? 'border-orange-500/50 bg-orange-500/20 text-orange-200'
                                : 'border-slate-700 bg-slate-800/70 text-slate-300'
                            )}
                          >
                            {item.value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Tempo: {tempo} BPM</label>
                      <input
                        type="range"
                        min={70}
                        max={170}
                        step={1}
                        value={tempo}
                        onChange={(e) => setTempo(parseInt(e.target.value, 10))}
                        className="w-full accent-orange-400 mt-2"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] uppercase tracking-wider text-slate-500">Persona Voice ID</label>
                        <input
                          value={voiceId}
                          onChange={(e) => setVoiceId(e.target.value)}
                          placeholder="e.g. samantha"
                          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] uppercase tracking-wider text-slate-500">Voice Model</label>
                        <select
                          value={selectedModelId}
                          onChange={(e) => setSelectedModelId(e.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none mt-1"
                        >
                          <option value="">None</option>
                          {voiceModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-300 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={instrumental}
                        onChange={(e) => setInstrumental(e.target.checked)}
                        className="accent-orange-400"
                      />
                      Instrumental
                    </label>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <label className="text-[11px] uppercase tracking-wider text-slate-500">Record Vocal</label>
                    <AudioDeviceSelector
                      selectedDeviceId={selectedInputDeviceId}
                      onSelectDevice={setSelectedInputDeviceId}
                      channelMode={channelMode}
                      onChannelModeChange={setChannelMode}
                      inputLevel={inputLevel}
                      disabled={recordingState === 'recording' || isGenerating}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (recordingState === 'recording') {
                            stopRecording();
                          } else {
                            setVoiceFile(null);
                            setUsingRecordedVoice(true);
                            startRecording({
                              deviceId: selectedInputDeviceId || undefined,
                              channelCount: channelMode === 'stereo' ? 2 : 1,
                            });
                          }
                        }}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider',
                          recordingState === 'recording'
                            ? 'border-red-500/60 bg-red-500/20 text-red-200 animate-pulse'
                            : 'border-orange-500/50 bg-orange-500/20 text-orange-200'
                        )}
                      >
                        {recordingState === 'recording' ? 'Stop Recording' : 'Record Vocal'}
                      </button>

                      <label className="rounded-xl border border-slate-700 bg-slate-800/70 text-slate-200 text-xs font-bold uppercase tracking-wider px-3 py-3 text-center cursor-pointer">
                        Upload Vocal
                        <input
                          type="file"
                          accept="audio/*,.wav,.mp3,.aiff,.flac"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setVoiceFile(f);
                            setUsingRecordedVoice(false);
                            if (f) resetRecording();
                          }}
                        />
                      </label>
                    </div>

                    {voiceFile && <p className="text-xs text-green-300">Uploaded: {voiceFile.name}</p>}
                    {audioUrl && usingRecordedVoice && <audio src={audioUrl} controls className="w-full" />}
                    {recordingIntake && usingRecordedVoice && (
                      <div className={`rounded-xl border p-3 text-left text-xs ${
                        recordingIntake.verdict === 'ready'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : recordingIntake.verdict === 'borderline'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                      }`}>
                        <div className="font-bold uppercase tracking-wider">Recording Intake</div>
                        <p className="mt-1">{recordingIntake.summary}</p>
                        <p className="mt-1 text-[11px] opacity-90">{recordingIntake.recommendation}</p>
                        <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-300">
                          Recommended lane: {REFERENCE_WORLD_PROFILES.find((profile) => profile.id === recordingIntake.recommendedWorldId)?.label}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Smart Vocal Comping</label>
                      <input
                        type="checkbox"
                        checked={enableSmartComping}
                        onChange={(e) => setEnableSmartComping(e.target.checked)}
                        className="accent-orange-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Upload 2-6 takes. The engine keeps the strongest phrases per segment.
                    </p>
                    <label className="rounded-xl border border-slate-700 bg-slate-800/70 text-slate-200 text-xs font-bold uppercase tracking-wider px-3 py-2 text-center cursor-pointer block">
                      Add Vocal Takes
                      <input
                        type="file"
                        accept="audio/*,.wav,.mp3,.aiff,.flac,.m4a"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setCompTakeFiles(files.slice(0, 6));
                        }}
                      />
                    </label>
                    {compTakeFiles.length > 0 && (
                      <p className="text-xs text-emerald-300">
                        {compTakeFiles.length} take{compTakeFiles.length === 1 ? '' : 's'} loaded
                      </p>
                    )}
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">
                        Phrase Window: {Math.round(compingSegmentMs)}ms
                      </label>
                      <input
                        type="range"
                        min={180}
                        max={1200}
                        step={10}
                        value={compingSegmentMs}
                        onChange={(e) => setCompingSegmentMs(parseInt(e.target.value, 10))}
                        className="w-full accent-orange-400 mt-2"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Honest Tuner</label>
                      <input
                        type="checkbox"
                        checked={enableHonestTuner}
                        onChange={(e) => setEnableHonestTuner(e.target.checked)}
                        className="accent-orange-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Gentle note correction that preserves performance character.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={tunerKey}
                        onChange={(e) => setTunerKey(e.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100 outline-none"
                      >
                        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <select
                        value={tunerScale}
                        onChange={(e) => setTunerScale(e.target.value as 'major' | 'minor' | 'chromatic')}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100 outline-none"
                      >
                        <option value="chromatic">Chromatic</option>
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                      </select>
                      <div className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-200">
                        {tunerKey} {tunerScale}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider text-slate-500">Benchmark Worlds</label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {REFERENCE_WORLD_PROFILES.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => {
                              setReferenceWorldId(profile.id);
                              setEnableHonestTuner(true);
                              const preset = resolveReferenceWorldPitchPreset(profile.id);
                              setTunerKey(preset.key ?? 'C');
                              setTunerScale(preset.scale ?? 'chromatic');
                              setTunerStrength(preset.strength);
                            }}
                            className={`rounded-xl border px-3 py-3 text-left transition-all ${
                              referenceWorldId === profile.id
                                ? 'border-orange-500/60 bg-orange-500/15 text-orange-200'
                                : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-orange-400/40'
                            }`}
                          >
                            <div className="text-sm font-bold">{profile.label}</div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">{profile.aliases[0]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">Tuning Strength: {tunerStrength}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={tunerStrength}
                        onChange={(e) => setTunerStrength(parseInt(e.target.value, 10))}
                        className="w-full accent-orange-400 mt-2"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <label className="text-[11px] uppercase tracking-wider text-slate-500">Vocal Texture</label>
                    <select
                      value={vocalTexture}
                      onChange={(e) => setVocalTexture(e.target.value as VocalTexture)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none"
                    >
                      <option value="none">None (Natural)</option>
                      <option value="gospel_choir">Gospel Choir</option>
                      <option value="rn_b_silk">90s RnB Silk</option>
                      <option value="gritty_soul">Gritty Soul</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={savePersona} className={cn(secondaryButton, 'flex-1 py-3 text-xs')}>Save Persona</button>
                    <button
                      onClick={buildSong}
                      disabled={!canGenerate || isGenerating}
                      className={cn(glowButton, 'flex-1 py-3 text-xs uppercase tracking-wider', (!canGenerate || isGenerating) && 'opacity-50 cursor-not-allowed')}
                    >
                      {isGenerating ? 'Building Locally...' : 'Build Song Locally'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">Status: {statusMessage}</p>
                  {error && <p className="text-xs text-red-300">{error}</p>}
                </section>
              </div>
            </>
          )}

          {pane === 'library' && (
            <>
              <h3 className="text-lg font-bold text-white">Library</h3>
              {!generatedSongs.length && !latestSong && (
                <p className="text-sm text-slate-500">No local songs generated yet.</p>
              )}
              {latestSong && (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 mb-4">
                  <p className="text-sm text-green-200 font-semibold">Latest: {latestSong.name}</p>
                  {editingExtensionSongId === latestSong.id && (
                    <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>Start Extension at: {formatTime(extensionStartBySongId[latestSong.id] ?? getDefaultExtensionStart(latestSong))}</span>
                        <span className="text-slate-500">Duration: {formatTime(latestSong.buffer?.duration || 0)}</span>
                      </div>
                      <div className="relative h-2 rounded bg-slate-800 overflow-hidden border border-slate-700/60">
                        <div
                          className="absolute inset-y-0 left-0 bg-emerald-500/70"
                          style={{
                            width: `${Math.max(0, Math.min(100, (((extensionStartBySongId[latestSong.id] ?? getDefaultExtensionStart(latestSong)) / Math.max(0.001, latestSong.buffer?.duration || 0.001)) * 100)))}%`,
                          }}
                        />
                        <div
                          className="absolute inset-y-0 border-t border-dashed border-slate-400/80"
                          style={{
                            left: `${Math.max(0, Math.min(100, (((extensionStartBySongId[latestSong.id] ?? getDefaultExtensionStart(latestSong)) / Math.max(0.001, latestSong.buffer?.duration || 0.001)) * 100)))}%`,
                            right: 0,
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, latestSong.buffer?.duration || 0)}
                        step={0.1}
                        value={extensionStartBySongId[latestSong.id] ?? getDefaultExtensionStart(latestSong)}
                        onChange={(e) =>
                          setExtensionStartBySongId((prev) => ({
                            ...prev,
                            [latestSong.id]: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-orange-400"
                      />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => onComplete(latestSong)} className={cn(glowButton, 'px-4 py-2 text-xs')}>
                      Route To Stems
                    </button>
                    <button
                      onClick={() => {
                        if (editingExtensionSongId === latestSong.id) {
                          extendSong(latestSong, extensionStartBySongId[latestSong.id] ?? getDefaultExtensionStart(latestSong));
                        } else {
                          enterExtensionEditMode(latestSong);
                        }
                      }}
                      disabled={isGenerating}
                      className={cn(secondaryButton, 'px-4 py-2 text-xs', isGenerating && 'opacity-50 cursor-not-allowed')}
                    >
                      {editingExtensionSongId === latestSong.id ? 'Run Extension' : 'Extend'}
                    </button>
                    {editingExtensionSongId === latestSong.id && (
                      <button
                        onClick={() => setEditingExtensionSongId(null)}
                        className={cn(secondaryButton, 'px-4 py-2 text-xs')}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => onOpenSingleTrack?.(latestSong)}
                      className={cn(secondaryButton, 'px-4 py-2 text-xs')}
                    >
                      Open In Single Track
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {generatedSongs.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950/70">
                      {entry.coverArtUrl ? (
                        <img src={entry.coverArtUrl} alt={`${entry.name} cover art`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] uppercase tracking-wider text-slate-500">
                          No Art
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-100 truncate">{entry.name}</p>
                      <p className="text-xs text-slate-500">{entry.metadata.style} · {new Date(entry.createdAt).toLocaleString()}</p>
                      {editingExtensionSongId === entry.id && (
                        <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-950/70 p-3 space-y-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-300">
                            <span>Start Extension at: {formatTime(extensionStartBySongId[entry.id] ?? getDefaultExtensionStart(entry))}</span>
                            <span className="text-slate-500">Duration: {formatTime(entry.buffer?.duration || 0)}</span>
                          </div>
                          <div className="relative h-2 rounded bg-slate-800 overflow-hidden border border-slate-700/60">
                            <div
                              className="absolute inset-y-0 left-0 bg-emerald-500/70"
                              style={{
                                width: `${Math.max(0, Math.min(100, (((extensionStartBySongId[entry.id] ?? getDefaultExtensionStart(entry)) / Math.max(0.001, entry.buffer?.duration || 0.001)) * 100)))}%`,
                              }}
                            />
                            <div
                              className="absolute inset-y-0 border-t border-dashed border-slate-400/80"
                              style={{
                                left: `${Math.max(0, Math.min(100, (((extensionStartBySongId[entry.id] ?? getDefaultExtensionStart(entry)) / Math.max(0.001, entry.buffer?.duration || 0.001)) * 100)))}%`,
                                right: 0,
                              }}
                            />
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, entry.buffer?.duration || 0)}
                            step={0.1}
                            value={extensionStartBySongId[entry.id] ?? getDefaultExtensionStart(entry)}
                            onChange={(e) =>
                              setExtensionStartBySongId((prev) => ({
                                ...prev,
                                [entry.id]: parseFloat(e.target.value),
                              }))
                            }
                            className="w-full accent-orange-400"
                          />
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => onComplete(entry)} className={cn(secondaryButton, 'px-3 py-1.5 text-[10px]')}>To Stems</button>
                        <button
                          onClick={() => {
                            if (editingExtensionSongId === entry.id) {
                              extendSong(entry, extensionStartBySongId[entry.id] ?? getDefaultExtensionStart(entry));
                            } else {
                              enterExtensionEditMode(entry);
                            }
                          }}
                          disabled={isGenerating}
                          className={cn(secondaryButton, 'px-3 py-1.5 text-[10px]', isGenerating && 'opacity-50 cursor-not-allowed')}
                        >
                          {editingExtensionSongId === entry.id ? 'Run Extension' : 'Extend'}
                        </button>
                        {editingExtensionSongId === entry.id && (
                          <button
                            onClick={() => setEditingExtensionSongId(null)}
                            className={cn(secondaryButton, 'px-3 py-1.5 text-[10px]')}
                          >
                            Cancel
                          </button>
                        )}
                        <button onClick={() => onOpenSingleTrack?.(entry)} className={cn(secondaryButton, 'px-3 py-1.5 text-[10px]')}>Open In Single Track</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {pane === 'personas' && (
            <>
              <h3 className="text-lg font-bold text-white">Personas</h3>
              {!personas.length && <p className="text-sm text-slate-500">No personas saved yet. Save from Create view.</p>}
              <div className="space-y-2">
                {personas.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-100">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.style} · {p.tempo} BPM · voice: {p.voiceId || 'default'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => loadPersona(p.id)} className={cn(secondaryButton, 'px-3 py-2 text-[10px]')}>Use Persona</button>
                      <button onClick={() => deletePersona(p.id)} className={cn(secondaryButton, 'px-3 py-2 text-[10px]')}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default SongGenerationWizard;
