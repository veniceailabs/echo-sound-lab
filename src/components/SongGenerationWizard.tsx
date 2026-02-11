import React, { useEffect, useMemo, useState } from 'react';
import { VoiceModel, GeneratedSong } from '../types';
import { voiceEngineService } from '../services/voiceEngineService';
import { useRecorder } from '../hooks/useRecorder';
import { glassCard, glowButton, secondaryButton, sectionHeader, gradientDivider, cn } from '../utils/secondLightStyles';

interface SongGenerationWizardProps {
  voiceModels: VoiceModel[];
  onComplete: (generatedSong: GeneratedSong) => void;
  onCancel: () => void;
}

type LocalStyle = 'Trap' | 'Synthwave' | 'Rock' | 'Ambient';

const STYLES: Array<{ value: LocalStyle; description: string; tempo: number }> = [
  { value: 'Trap', description: '808-heavy drums and dark bounce', tempo: 140 },
  { value: 'Synthwave', description: 'Retro drums and neon pads', tempo: 108 },
  { value: 'Rock', description: 'Aggressive rhythm and energy', tempo: 122 },
  { value: 'Ambient', description: 'Slow cinematic atmosphere', tempo: 84 },
];

const SongGenerationWizard: React.FC<SongGenerationWizardProps> = ({ voiceModels, onComplete, onCancel }) => {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(voiceModels[0]?.id || null);
  const [style, setStyle] = useState<LocalStyle>('Trap');
  const [tempo, setTempo] = useState<number>(140);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [usingRecordedVoice, setUsingRecordedVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [stageText, setStageText] = useState('Idle');
  const [previewSong, setPreviewSong] = useState<GeneratedSong | null>(null);

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
    if (recorderError) {
      setError(recorderError.message);
    }
  }, [recorderError]);

  useEffect(() => {
    const preset = STYLES.find((s) => s.value === style);
    if (preset) setTempo(preset.tempo);
  }, [style]);

  const selectedModel = useMemo(
    () => voiceModels.find((model) => model.id === selectedModelId) || null,
    [selectedModelId, voiceModels]
  );

  const canGenerate = !!voiceFile || !!audioBlob;

  const handleGenerate = async () => {
    setError(null);
    if (!canGenerate) {
      setError('Record or upload a vocal first.');
      return;
    }

    setIsGenerating(true);
    setStageText('Preparing local engine...');

    try {
      const song = await voiceEngineService.generateSong(
        selectedModel,
        'local voice-first generation',
        style,
        {
          voiceInput: audioBlob || voiceFile || undefined,
          tempo,
          outputName: `local_${style.toLowerCase()}_${Date.now()}.wav`,
        }
      );
      setStageText('Song built locally.');
      setPreviewSong(song);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Local generation failed.';
      setError(message);
      setStageText('Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRouteToWorkspace = () => {
    if (previewSong) onComplete(previewSong);
  };

  return (
    <div className={cn(glassCard, 'p-8 max-w-5xl mx-auto')}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>Build Song Locally</h2>
          <p className="text-sm text-slate-400">Voice-first local generation. No external APIs.</p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors text-2xl">✕</button>
      </div>

      <div className={gradientDivider} />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/30">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Voice Recorder</h3>
            <p className="text-xs text-slate-400 mb-4">Record your vocal idea or upload an existing vocal take.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <label className="cursor-pointer rounded-xl border border-slate-700/40 bg-slate-800/50 p-4 hover:border-orange-500/40 transition-all">
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.aiff,.flac"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setVoiceFile(file);
                    setUsingRecordedVoice(false);
                    if (file) {
                      resetRecording();
                    }
                  }}
                />
                <div className="text-center">
                  <div className="text-2xl mb-1">FILE</div>
                  <div className="text-xs text-slate-300 font-semibold uppercase tracking-wider">Upload Vocal</div>
                </div>
              </label>

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
                  'rounded-xl border p-4 transition-all text-center',
                  recordingState === 'recording'
                    ? 'border-red-500/50 bg-red-500/10 animate-pulse'
                    : 'border-orange-500/40 bg-orange-500/10 hover:border-orange-400/60'
                )}
              >
                <div className="text-2xl mb-1">MIC</div>
                <div className="text-xs text-slate-200 font-semibold uppercase tracking-wider">
                  {recordingState === 'recording' ? 'Stop Recording' : 'Record Vocal'}
                </div>
              </button>
            </div>

            {voiceFile && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200">
                Uploaded: {voiceFile.name}
              </div>
            )}

            {audioUrl && usingRecordedVoice && (
              <div className="space-y-2">
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200">
                  Recorded voice ready
                </div>
                <audio src={audioUrl} controls className="w-full" />
              </div>
            )}
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/30">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Style</h3>
            <div className="grid grid-cols-2 gap-3">
              {STYLES.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setStyle(item.value)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-all',
                    style === item.value
                      ? 'bg-orange-500/20 border-orange-500/50'
                      : 'bg-slate-800/50 border-slate-700/40 hover:border-slate-600/70'
                  )}
                >
                  <div className="text-sm font-bold text-white">{item.value}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{item.description}</div>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Tempo</span>
                <span className="text-orange-300 font-mono">{tempo} BPM</span>
              </div>
              <input
                type="range"
                min={70}
                max={170}
                step={1}
                value={tempo}
                onChange={(e) => setTempo(parseInt(e.target.value, 10))}
                className="w-full accent-orange-400"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/30">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Voice Model (Optional)</h3>
            {voiceModels.length === 0 ? (
              <p className="text-xs text-slate-500">No saved voice models yet. Local engine can still build using recorded/uploaded voice.</p>
            ) : (
              <select
                value={selectedModelId || ''}
                onChange={(e) => setSelectedModelId(e.target.value || null)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                {voiceModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/30 space-y-4">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className={cn(glowButton, 'w-full py-4 text-sm uppercase tracking-wider', (!canGenerate || isGenerating) && 'opacity-50 cursor-not-allowed')}
            >
              {isGenerating ? 'Building Song Locally...' : 'Build Song Locally'}
            </button>

            <div className="text-xs text-slate-400">Status: {stageText}</div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>

          {previewSong && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-green-300 uppercase tracking-wider">Song Ready</h3>
              <p className="text-xs text-slate-300">{previewSong.name}</p>
              <div className="flex gap-3">
                <button onClick={() => setPreviewSong(null)} className={cn(secondaryButton, 'flex-1 py-3')}>Regenerate</button>
                <button onClick={handleRouteToWorkspace} className={cn(glowButton, 'flex-1 py-3')}>Route to Workspace →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SongGenerationWizard;
