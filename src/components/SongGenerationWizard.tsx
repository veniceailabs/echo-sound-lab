import React, { useEffect, useMemo, useState } from 'react';
import { VoiceModel, GeneratedSong } from '../types';
import { voiceEngineService } from '../services/voiceEngineService';
import { useRecorder } from '../hooks/useRecorder';
import { glassCard, glowButton, secondaryButton, sectionHeader, cn } from '../utils/secondLightStyles';

interface SongGenerationWizardProps {
  voiceModels: VoiceModel[];
  onComplete: (generatedSong: GeneratedSong) => void;
  onCancel: () => void;
}

type StudioPane = 'create' | 'library' | 'personas';
type LocalStyle = 'Trap' | 'Synthwave' | 'Rock' | 'Ambient';

interface PersonaPreset {
  id: string;
  name: string;
  style: LocalStyle;
  voiceId: string;
  tempo: number;
  instrumental: boolean;
}

interface GeneratedEntry {
  id: string;
  name: string;
  style: string;
  createdAt: number;
}

const PERSONA_STORAGE_KEY = 'echo.aiStudio.personas.v1';

const STYLE_OPTIONS: Array<{ value: LocalStyle; tags: string[]; defaultTempo: number }> = [
  { value: 'Trap', tags: ['808', 'dark', 'drill'], defaultTempo: 140 },
  { value: 'Synthwave', tags: ['retro', 'neon', 'analog'], defaultTempo: 108 },
  { value: 'Rock', tags: ['guitars', 'arena', 'live-kit'], defaultTempo: 122 },
  { value: 'Ambient', tags: ['cinematic', 'airy', 'textures'], defaultTempo: 84 },
];

const DEFAULT_LYRICS = `[Verse]\nCity lights and static in my chest tonight\nRunning through the noise till the silence hits right\n\n[Chorus]\nWe rise in stereo, we glow in neon rain\nEcho in the skyline, singing through the pain`;

const SongGenerationWizard: React.FC<SongGenerationWizardProps> = ({ voiceModels, onComplete, onCancel }) => {
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
  const [usingRecordedVoice, setUsingRecordedVoice] = useState(false);

  const [personas, setPersonas] = useState<PersonaPreset[]>([]);
  const [generatedHistory, setGeneratedHistory] = useState<GeneratedEntry[]>([]);
  const [latestSong, setLatestSong] = useState<GeneratedSong | null>(null);

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
  } = useRecorder();

  useEffect(() => {
    if (recorderError) setError(recorderError.message);
  }, [recorderError]);

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
    () => !!voiceFile || !!audioBlob,
    [voiceFile, audioBlob]
  );

  const persistPersonas = (next: PersonaPreset[]) => {
    setPersonas(next);
    localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(next));
  };

  const insertLyricTag = (tag: 'Verse' | 'Chorus') => {
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
      const outputName = `${title.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'echo_song'}_${Date.now()}.wav`;
      const result = await voiceEngineService.generateSong(
        selectedModel,
        lyrics,
        style,
        {
          voiceInput: audioBlob || voiceFile || undefined,
          tempo,
          voiceId,
          instrumental,
          outputName,
        }
      );

      setLatestSong(result);
      setGeneratedHistory((prev) => [
        {
          id: result.id,
          name: result.name,
          style,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
      setStatusMessage('Song built locally.');
      setPane('library');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Local generation failed.');
      setStatusMessage('Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn(glassCard, 'p-0 overflow-hidden max-w-6xl mx-auto')}>
      <div className="flex min-h-[720px]">
        <aside className="w-[230px] border-r border-slate-800/60 bg-slate-950/70 p-4 space-y-2">
          <div className="mb-4">
            <h2 className={cn(sectionHeader, 'text-xl mb-1')}>Echo AI Studio</h2>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Suno-Grade Local</p>
          </div>

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

          <button onClick={onCancel} className={cn(secondaryButton, 'w-full mt-6 py-2 text-xs')}>
            Close Studio
          </button>
        </aside>

        <main className="flex-1 p-6 space-y-6">
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
                        <button onClick={() => insertLyricTag('Verse')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Verse]</button>
                        <button onClick={() => insertLyricTag('Chorus')} className={cn(secondaryButton, 'px-2 py-1 text-[10px]')}>+ [Chorus]</button>
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
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (recordingState === 'recording') {
                            stopRecording();
                          } else {
                            setVoiceFile(null);
                            setUsingRecordedVoice(true);
                            startRecording();
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
              {!generatedHistory.length && !latestSong && (
                <p className="text-sm text-slate-500">No local songs generated yet.</p>
              )}
              {latestSong && (
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 mb-4">
                  <p className="text-sm text-green-200 font-semibold">Latest: {latestSong.name}</p>
                  <button onClick={() => onComplete(latestSong)} className={cn(glowButton, 'mt-3 px-4 py-2 text-xs')}>
                    Route Latest To Workspace
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {generatedHistory.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-sm text-slate-100">{entry.name}</p>
                    <p className="text-xs text-slate-500">{entry.style} · {new Date(entry.createdAt).toLocaleString()}</p>
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
