import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bridge, BridgeMessage } from '../services/BridgeService';
import type { VideoScene } from '../types';

type SfsStyle = 'Noir' | 'Glitch' | 'Cinematic' | 'Abstract';
type ColorGradePreset = 'none' | 'teal-orange' | 'bw-contrast' | 'vibrant' | 'matrix';
type SceneDraft = VideoScene & { colorGrade?: ColorGradePreset };

interface TerminalLine {
  id: string;
  text: string;
}

interface JobState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface RestorationRackState {
  highpass: boolean;
  highpassHz: number;
  lowpass: boolean;
  lowpassHz: number;
  denoiseFft: boolean;
  denoiseFftAmount: number;
  denoiseNlm: boolean;
  denoiseNlmStrength: number;
  declick: boolean;
  declip: boolean;
  deesser: boolean;
  deesserAmount: number;
  dehum: boolean;
  dehumFrequencyHz: number;
  dehumHarmonics: number;
  dynamicEq: boolean;
  dynamicEqFrequencyHz: number;
  dynamicEqRangeDb: number;
  speechLevel: boolean;
  compress: boolean;
  compressThresholdDb: number;
  compressRatio: number;
  gate: boolean;
  gateThresholdDb: number;
  gateRatio: number;
  trimSilence: boolean;
  trimSilenceThresholdDb: number;
  limiter: boolean;
  limiterCeilingDb: number;
}

type RestorationPreset = 'manual' | 'dialogue-polish' | 'noisy-room' | 'hum-hiss' | 'light-touch';

const restorationPresets: Record<Exclude<RestorationPreset, 'manual'>, RestorationRackState> = {
  'dialogue-polish': {
    highpass: true,
    highpassHz: 80,
    lowpass: true,
    lowpassHz: 9500,
    denoiseFft: true,
    denoiseFftAmount: 10,
    denoiseNlm: true,
    denoiseNlmStrength: 0.32,
    declick: true,
    declip: true,
    deesser: true,
    deesserAmount: 0.28,
    dehum: false,
    dehumFrequencyHz: 60,
    dehumHarmonics: 4,
    dynamicEq: true,
    dynamicEqFrequencyHz: 3200,
    dynamicEqRangeDb: 7,
    speechLevel: true,
    compress: true,
    compressThresholdDb: -18,
    compressRatio: 2.3,
    gate: false,
    gateThresholdDb: -42,
    gateRatio: 2,
    trimSilence: false,
    trimSilenceThresholdDb: -45,
    limiter: true,
    limiterCeilingDb: -1.5,
  },
  'noisy-room': {
    highpass: true,
    highpassHz: 90,
    lowpass: true,
    lowpassHz: 8500,
    denoiseFft: true,
    denoiseFftAmount: 16,
    denoiseNlm: true,
    denoiseNlmStrength: 0.48,
    declick: true,
    declip: true,
    deesser: true,
    deesserAmount: 0.32,
    dehum: false,
    dehumFrequencyHz: 60,
    dehumHarmonics: 4,
    dynamicEq: true,
    dynamicEqFrequencyHz: 2900,
    dynamicEqRangeDb: 9,
    speechLevel: true,
    compress: true,
    compressThresholdDb: -20,
    compressRatio: 2.6,
    gate: true,
    gateThresholdDb: -48,
    gateRatio: 1.8,
    trimSilence: false,
    trimSilenceThresholdDb: -45,
    limiter: true,
    limiterCeilingDb: -1.5,
  },
  'hum-hiss': {
    highpass: true,
    highpassHz: 85,
    lowpass: true,
    lowpassHz: 9000,
    denoiseFft: true,
    denoiseFftAmount: 14,
    denoiseNlm: true,
    denoiseNlmStrength: 0.38,
    declick: true,
    declip: true,
    deesser: false,
    deesserAmount: 0.25,
    dehum: true,
    dehumFrequencyHz: 60,
    dehumHarmonics: 5,
    dynamicEq: true,
    dynamicEqFrequencyHz: 3000,
    dynamicEqRangeDb: 6,
    speechLevel: true,
    compress: true,
    compressThresholdDb: -18,
    compressRatio: 2.1,
    gate: false,
    gateThresholdDb: -42,
    gateRatio: 2,
    trimSilence: false,
    trimSilenceThresholdDb: -45,
    limiter: true,
    limiterCeilingDb: -1.3,
  },
  'light-touch': {
    highpass: true,
    highpassHz: 75,
    lowpass: false,
    lowpassHz: 10000,
    denoiseFft: true,
    denoiseFftAmount: 6,
    denoiseNlm: true,
    denoiseNlmStrength: 0.2,
    declick: true,
    declip: false,
    deesser: false,
    deesserAmount: 0.2,
    dehum: false,
    dehumFrequencyHz: 60,
    dehumHarmonics: 3,
    dynamicEq: false,
    dynamicEqFrequencyHz: 3200,
    dynamicEqRangeDb: 5,
    speechLevel: false,
    compress: true,
    compressThresholdDb: -16,
    compressRatio: 1.8,
    gate: false,
    gateThresholdDb: -42,
    gateRatio: 2,
    trimSilence: false,
    trimSilenceThresholdDb: -45,
    limiter: true,
    limiterCeilingDb: -1.2,
  },
};

const sceneColorClass: Record<SfsStyle, string> = {
  Noir: 'bg-slate-500',
  Glitch: 'bg-fuchsia-500',
  Cinematic: 'bg-orange-500',
  Abstract: 'bg-cyan-500',
};

const formatTime = (value: number) => {
  const clamped = Math.max(0, Number.isFinite(value) ? value : 0);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const VideoEngine: React.FC = () => {
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<SfsStyle>('Cinematic');
  const [reactivity, setReactivity] = useState(0.65);
  const [outputName, setOutputName] = useState('sfs_output.mp4');

  const [isPostOpen, setIsPostOpen] = useState(false);
  const [colorGrade, setColorGrade] = useState<ColorGradePreset>('none');
  const [textOverlay, setTextOverlay] = useState('');

  const [scenes, setScenes] = useState<SceneDraft[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [job, setJob] = useState<JobState>({ status: 'idle', progress: 0 });
  const [sourceVideoFile, setSourceVideoFile] = useState<File | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState('');
  const [detachedAudioUrl, setDetachedAudioUrl] = useState('');
  const [cleanedAudioUrl, setCleanedAudioUrl] = useState('');
  const [dialogueOutputUrl, setDialogueOutputUrl] = useState('');
  const [dialogueInstruction, setDialogueInstruction] = useState('');
  const [restorationPreset, setRestorationPreset] = useState<RestorationPreset>('dialogue-polish');
  const [dialogueCleanupMode, setDialogueCleanupMode] = useState<'dialogue-focus' | 'balanced'>('dialogue-focus');
  const [useStemIsolation, setUseStemIsolation] = useState(true);
  const [backgroundReductionDb, setBackgroundReductionDb] = useState(18);
  const [noiseReductionStrength, setNoiseReductionStrength] = useState(0.6);
  const [dialogueOutputName, setDialogueOutputName] = useState('dialogue_cleanup.mp4');
  const [dialogueTerminalLines, setDialogueTerminalLines] = useState<TerminalLine[]>([]);
  const [dialogueJob, setDialogueJob] = useState<JobState>({ status: 'idle', progress: 0 });
  const [restorationRack, setRestorationRack] = useState<RestorationRackState>({
    highpass: true,
    highpassHz: 80,
    lowpass: true,
    lowpassHz: 9000,
    denoiseFft: true,
    denoiseFftAmount: 10,
    denoiseNlm: true,
    denoiseNlmStrength: 0.35,
    declick: true,
    declip: true,
    deesser: true,
    deesserAmount: 0.35,
    dehum: false,
    dehumFrequencyHz: 60,
    dehumHarmonics: 4,
    dynamicEq: true,
    dynamicEqFrequencyHz: 3200,
    dynamicEqRangeDb: 8,
    speechLevel: true,
    compress: true,
    compressThresholdDb: -18,
    compressRatio: 2.5,
    gate: false,
    gateThresholdDb: -42,
    gateRatio: 2,
    trimSilence: false,
    trimSilenceThresholdDb: -45,
    limiter: true,
    limiterCeilingDb: -1.5,
  });

  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const instructionInputRef = useRef<HTMLTextAreaElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    bridge.connect();
    bridge.healthCheck();
    const unsubscribe = bridge.subscribe((msg: BridgeMessage) => {
      if (msg.status === 'idle' && msg.message?.toLowerCase().includes('bridge online')) {
        setBridgeOnline(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      if (sourceVideoUrl) {
        URL.revokeObjectURL(sourceVideoUrl);
      }
    };
  }, [audioPreviewUrl, sourceVideoUrl]);

  const elapsed = useMemo(() => {
    if (!job.startedAt || !job.finishedAt) return null;
    return ((job.finishedAt - job.startedAt) / 1000).toFixed(1);
  }, [job.finishedAt, job.startedAt]);

  const hasPostFx = useMemo(
    () => colorGrade !== 'none' || textOverlay.trim().length > 0,
    [colorGrade, textOverlay]
  );

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => a.startTime - b.startTime),
    [scenes]
  );

  const appendTerminal = (text: string) => {
    setTerminalLines(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text }]);
  };

  const appendDialogueTerminal = (text: string) => {
    setDialogueTerminalLines(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text }]);
  };

  const applyRestorationPreset = (preset: RestorationPreset) => {
    setRestorationPreset(preset);
    if (preset === 'manual') {
      return;
    }
    setRestorationRack(restorationPresets[preset]);
  };

  const applyInstruction = (instruction: string) => {
    setDialogueInstruction(instruction);
    requestAnimationFrame(() => {
      instructionInputRef.current?.focus();
      instructionInputRef.current?.setSelectionRange(instruction.length, instruction.length);
    });
  };

  const sanitizeOutputName = (value: string) => {
    const trimmed = value.trim() || 'sfs_output.mp4';
    return trimmed.endsWith('.mp4') ? trimmed : `${trimmed}.mp4`;
  };

  const sanitizeAudioOutputName = (value: string) => {
    const trimmed = value.trim() || 'detached_audio.wav';
    return trimmed.endsWith('.wav') ? trimmed : `${trimmed}.wav`;
  };

  const updateScene = (sceneId: string, patch: Partial<SceneDraft>) => {
    setScenes(prev => prev.map(s => (s.id === sceneId ? { ...s, ...patch } : s)));
  };

  const initializeSingleScene = (duration: number) => {
    const scene: SceneDraft = {
      id: `scene-${Date.now()}`,
      startTime: 0,
      endTime: Math.max(0.1, duration),
      style,
      prompt,
      reactivity,
      caption: '',
    };
    setScenes([scene]);
    setSelectedSceneId(scene.id);
  };

  const handleAudioPicked = (file: File | null) => {
    setAudioFile(file);
    setAudioDuration(0);
    setPlayheadTime(0);
    setScenes([]);
    setSelectedSceneId(null);

    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl('');
    }

    if (file) {
      setAudioPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleVideoPicked = (file: File | null) => {
    setSourceVideoFile(file);
    setDetachedAudioUrl('');
    setCleanedAudioUrl('');
    setDialogueOutputUrl('');
    if (file) {
      const base = file.name.replace(/\.[^.]+$/, '');
      setDialogueOutputName(`${base}-cleaned.mp4`);
    } else {
      setDialogueOutputName('dialogue_cleanup.mp4');
    }
    setDialogueTerminalLines([]);
    setDialogueJob({ status: 'idle', progress: 0 });

    if (sourceVideoUrl) {
      URL.revokeObjectURL(sourceVideoUrl);
      setSourceVideoUrl('');
    }

    if (file) {
      setSourceVideoUrl(URL.createObjectURL(file));
      requestAnimationFrame(() => {
        instructionInputRef.current?.focus();
      });
    }
  };

  const handleVideoDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    handleVideoPicked(event.dataTransfer.files?.[0] || null);
  };

  const handleSplitAtPlayhead = () => {
    if (!audioDuration || !selectedSceneId) return;
    setScenes(prev => {
      const target = prev.find(s => s.id === selectedSceneId);
      if (!target) return prev;
      const split = Math.max(target.startTime + 0.05, Math.min(playheadTime, target.endTime - 0.05));
      if (split <= target.startTime || split >= target.endTime) return prev;

      const left: SceneDraft = { ...target, endTime: split };
      const right: SceneDraft = {
        ...target,
        id: `scene-${Date.now()}`,
        startTime: split,
      };

      return prev.flatMap(s => {
        if (s.id !== target.id) return [s];
        return [left, right];
      });
    });
  };

  const jumpToScene = (sceneId: string) => {
    const scene = sortedScenes.find(s => s.id === sceneId);
    if (!scene) return;
    setSelectedSceneId(sceneId);
    setPlayheadTime(scene.startTime);
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = scene.startTime;
      previewAudioRef.current.play().catch(() => {
        // Playback may be blocked by browser autoplay policy.
      });
    }
  };

  const handleGenerate = async () => {
    if (!audioFile) {
      alert('Please upload an audio file first.');
      return;
    }

    const normalizedScenes = sortedScenes
      .map(scene => ({
        ...scene,
        startTime: Math.max(0, Math.min(scene.startTime, audioDuration || scene.startTime)),
        endTime: Math.max(0, Math.min(scene.endTime, audioDuration || scene.endTime)),
        prompt: (scene.prompt || prompt).trim(),
        caption: scene.caption?.trim() || undefined,
      }))
      .filter(scene => scene.endTime > scene.startTime + 0.02);

    const hasPrompt = prompt.trim().length > 0 || normalizedScenes.some(scene => scene.prompt.length > 0);
    if (!hasPrompt) {
      alert('Please enter a prompt (global or per scene).');
      return;
    }

    setTerminalLines([]);
    setJob({ status: 'running', progress: 2, startedAt: Date.now() });
    appendTerminal('Initializing SFS pipeline...');

    try {
      appendTerminal(`Saving audio file: ${audioFile.name}`);
      const savedAudio = await bridge.saveAudioFile(audioFile, audioFile.name);
      appendTerminal(`Audio ready: ${savedAudio.audioPath}`);

      const outputPath = sanitizeOutputName(outputName);
      if (normalizedScenes.length > 1) {
        appendTerminal(`Scene Switcher active: ${normalizedScenes.length} scenes`);
      } else {
        appendTerminal(`Running video-system.py with style=${style}, reactivity=${reactivity.toFixed(2)}`);
      }
      if (hasPostFx) {
        appendTerminal(`Studio Mode active: color=${colorGrade}, caption=${textOverlay.trim() ? 'on' : 'off'}`);
      }

      const result = await bridge.runSfsVideoSystem(
        {
          mode: 'generate',
          audioPath: savedAudio.audioPath,
          prompt: prompt.trim(),
          style,
          reactivity,
          scenes: normalizedScenes.length > 1 ? normalizedScenes : undefined,
          outputPath,
          textOverlay: textOverlay.trim() || undefined,
          colorGrade: colorGrade !== 'none' ? colorGrade : undefined,
        },
        (event) => {
          if (typeof event.percent === 'number') {
            setJob(prev => ({ ...prev, progress: Math.max(prev.progress, event.percent || 0) }));
          }
          if (event.message) {
            appendTerminal(event.message);
          }
        }
      );

      appendTerminal(`Complete: ${result.videoPath}`);
      setJob(prev => ({ ...prev, status: 'complete', progress: 100, outputUrl: result.videoUrl, finishedAt: Date.now() }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SFS generation failed';
      appendTerminal(`ERROR: ${message}`);
      setJob(prev => ({ ...prev, status: 'failed', error: message, finishedAt: Date.now() }));
    }
  };

  const handleDetachAudio = async () => {
    if (!sourceVideoFile) {
      alert('Please upload a source video first.');
      return;
    }

    setDialogueTerminalLines([]);
    setDialogueJob({ status: 'running', progress: 2, startedAt: Date.now() });
    appendDialogueTerminal(`Saving source video: ${sourceVideoFile.name}`);

    try {
      const savedVideo = await bridge.saveVideoFile(sourceVideoFile, sourceVideoFile.name);
      appendDialogueTerminal(`Video ready: ${savedVideo.videoPath}`);

      const detached = await bridge.extractVideoAudio(
        savedVideo.videoPath,
        sanitizeAudioOutputName(sourceVideoFile.name.replace(/\.[^.]+$/, '') + '_detached.wav'),
        (event) => {
          setDialogueJob(prev => ({ ...prev, progress: Math.max(prev.progress, event.percent || 0) }));
          if (event.message) appendDialogueTerminal(event.message);
        }
      );

      appendDialogueTerminal(`Detached audio ready: ${detached.audioPath}`);
      setDetachedAudioUrl(detached.audioUrl || '');
      setDialogueJob(prev => ({
        ...prev,
        status: 'complete',
        progress: 100,
        finishedAt: Date.now(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio detach failed';
      appendDialogueTerminal(`ERROR: ${message}`);
      setDialogueJob(prev => ({ ...prev, status: 'failed', error: message, finishedAt: Date.now() }));
    }
  };

  const handleDialogueCleanup = async () => {
    if (!sourceVideoFile) {
      alert('Please upload a source video first.');
      return;
    }

    setDialogueTerminalLines([]);
    setDialogueOutputUrl('');
    setCleanedAudioUrl('');
    setDialogueJob({ status: 'running', progress: 2, startedAt: Date.now() });
    appendDialogueTerminal(`Saving source video: ${sourceVideoFile.name}`);
    appendDialogueTerminal(dialogueInstruction.trim() ? `Instruction: ${dialogueInstruction.trim()}` : 'Instruction: simple dialogue cleanup');

    try {
      const savedVideo = await bridge.saveVideoFile(sourceVideoFile, sourceVideoFile.name);
      appendDialogueTerminal(`Video ready: ${savedVideo.videoPath}`);
      appendDialogueTerminal(`Cleanup mode: ${dialogueCleanupMode}`);
      appendDialogueTerminal(`Stem isolation: ${useStemIsolation ? 'on' : 'off'}`);
      appendDialogueTerminal(`Rack preset: ${restorationPreset}`);

      const cleaned = await bridge.cleanupDialogueVideo(
        {
          inputVideoPath: savedVideo.videoPath,
          outputPath: sanitizeOutputName(dialogueOutputName),
          cleanupInstruction: dialogueInstruction.trim(),
          cleanupMode: dialogueCleanupMode,
          useStemIsolation,
          backgroundReductionDb,
          noiseReductionStrength,
          restorationTools: restorationRack,
        },
        (event) => {
          setDialogueJob(prev => ({ ...prev, progress: Math.max(prev.progress, event.percent || 0) }));
          if (event.message) appendDialogueTerminal(event.message);
        }
      );

      appendDialogueTerminal(`Dialogue cleanup complete: ${cleaned.videoPath}`);
      setDialogueOutputUrl(cleaned.videoUrl || '');
      setCleanedAudioUrl(cleaned.cleanedAudioUrl || '');
      setDialogueJob(prev => ({
        ...prev,
        status: 'complete',
        progress: 100,
        outputUrl: cleaned.videoUrl,
        finishedAt: Date.now(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dialogue cleanup failed';
      appendDialogueTerminal(`ERROR: ${message}`);
      setDialogueJob(prev => ({ ...prev, status: 'failed', error: message, finishedAt: Date.now() }));
    }
  };

  return (
    <div className="w-full h-full space-y-6 p-6">
      <div className="rounded-3xl border border-slate-800/50 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tight text-slate-200">SFS Video Engine</h2>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${bridgeOnline ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-orange-500/40 bg-orange-500/10 text-orange-300'}`}>
            {bridgeOnline ? 'Bridge Online' : 'Bridge Connecting'}
          </span>
        </div>
        <p className="text-xs uppercase tracking-wider text-slate-500">Canonical args: --audio --prompt --style --reactivity --output --scenes_json</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Audio (--audio)</label>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.flac,.aiff"
            className="hidden"
            onChange={(e) => handleAudioPicked(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => audioInputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/40 p-4 text-left text-sm text-slate-400 hover:border-orange-500/40"
          >
            {audioFile ? `${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)` : 'Click to select mastered audio'}
          </button>

          {audioPreviewUrl && (
            <div className="mt-4 space-y-2">
              <audio
                ref={previewAudioRef}
                src={audioPreviewUrl}
                controls
                className="w-full"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration || 0;
                  setAudioDuration(d);
                  if (d > 0 && scenes.length === 0) {
                    initializeSingleScene(d);
                  }
                }}
                onTimeUpdate={(e) => setPlayheadTime(e.currentTarget.currentTime || 0)}
              />
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Duration: {formatTime(audioDuration)} | Playhead: {formatTime(playheadTime)}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Output (--output)</label>
          <input
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
            placeholder="sfs_output.mp4"
          />
          <p className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">Saved by bridge under local output directory</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828] space-y-4">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Global Prompt (--prompt)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border-2 border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-200 outline-none transition-all focus:border-orange-500/50"
            placeholder="Describe the visual generation objective..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Style (--style)</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as SfsStyle)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="Noir">Noir</option>
              <option value="Glitch">Glitch</option>
              <option value="Cinematic">Cinematic</option>
              <option value="Abstract">Abstract</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Reactivity (--reactivity): {reactivity.toFixed(2)}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={reactivity}
              onChange={(e) => setReactivity(Number(e.target.value))}
              className="w-full accent-orange-400"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Scene Switcher</h3>
          <button
            onClick={handleSplitAtPlayhead}
            disabled={!selectedSceneId || audioDuration <= 0}
            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Scene At Playhead
          </button>
        </div>

        <div className="relative h-10 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
          {sortedScenes.map((scene) => {
            const left = audioDuration > 0 ? (scene.startTime / audioDuration) * 100 : 0;
            const width = audioDuration > 0 ? ((scene.endTime - scene.startTime) / audioDuration) * 100 : 100;
            return (
              <button
                key={scene.id}
                onClick={() => jumpToScene(scene.id)}
                className={`absolute top-0 h-full border-r border-slate-950 ${sceneColorClass[scene.style]} ${selectedSceneId === scene.id ? 'opacity-100' : 'opacity-70'}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                title={`${scene.style} ${formatTime(scene.startTime)}-${formatTime(scene.endTime)}`}
              />
            );
          })}
          {audioDuration > 0 && (
            <div
              className="absolute top-0 h-full w-[2px] bg-white/80"
              style={{ left: `${Math.min(100, (playheadTime / audioDuration) * 100)}%` }}
            />
          )}
        </div>

        <div className="space-y-3">
          {sortedScenes.map((scene) => (
            <div
              key={scene.id}
              className={`rounded-xl border p-3 ${selectedSceneId === scene.id ? 'border-orange-500/40 bg-slate-800/70' : 'border-slate-800 bg-slate-900/60'}`}
              onClick={() => jumpToScene(scene.id)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formatTime(scene.startTime)} - {formatTime(scene.endTime)}</span>
                <select
                  value={scene.style}
                  onChange={(e) => updateScene(scene.id, { style: e.target.value as SfsStyle })}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                >
                  <option value="Noir">Noir</option>
                  <option value="Glitch">Glitch</option>
                  <option value="Cinematic">Cinematic</option>
                  <option value="Abstract">Abstract</option>
                </select>
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={scene.startTime.toFixed(2)}
                  min={0}
                  max={audioDuration || undefined}
                  step={0.01}
                  onChange={(e) => updateScene(scene.id, { startTime: Number(e.target.value) })}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                />
                <input
                  type="number"
                  value={scene.endTime.toFixed(2)}
                  min={0}
                  max={audioDuration || undefined}
                  step={0.01}
                  onChange={(e) => updateScene(scene.id, { endTime: Number(e.target.value) })}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                />
              </div>

              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Prompt</label>
              <input
                value={scene.prompt}
                onChange={(e) => updateScene(scene.id, { prompt: e.target.value })}
                className="mb-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                placeholder="Optional scene prompt override"
              />

              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Reactivity: {scene.reactivity.toFixed(2)}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scene.reactivity}
                onChange={(e) => updateScene(scene.id, { reactivity: Number(e.target.value) })}
                className="mb-2 w-full accent-orange-400"
              />

              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Caption</label>
              <input
                value={scene.caption || ''}
                onChange={(e) => updateScene(scene.id, { caption: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                placeholder="Per-scene lower third"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <button
          onClick={() => setIsPostOpen((prev) => !prev)}
          className="mb-4 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-300 hover:border-orange-500/40"
        >
          <span>Post-Production Studio</span>
          <span className="text-orange-400">{isPostOpen ? 'Hide' : 'Show'}</span>
        </button>

        {isPostOpen && (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">LUT / Color Grade</label>
              <select
                value={colorGrade}
                onChange={(e) => setColorGrade(e.target.value as ColorGradePreset)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="none">None</option>
                <option value="teal-orange">Cinematic</option>
                <option value="bw-contrast">Noir</option>
                <option value="vibrant">Vibrant</option>
                <option value="matrix">Matrix</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Caption / Lower Third</label>
              <input
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
                placeholder="Track Title - Artist Name"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300">Tell ESL exactly what to change</div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Type the change in plain English. Keep Dynamic EQ on, and leave the advanced knobs for later only if you need them.</p>
          </div>
          <textarea
            ref={instructionInputRef}
            value={dialogueInstruction}
            onChange={(e) => setDialogueInstruction(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && sourceVideoFile && dialogueJob.status !== 'running') {
                e.preventDefault();
                void handleDialogueCleanup();
              }
            }}
            rows={6}
            className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500/50"
            placeholder="Example: remove background laughter, keep the voice natural, lower the beat a touch, and keep the result clean and simple."
          />
          <div className="flex items-center justify-between rounded-xl border border-slate-800/40 bg-slate-900/30 px-4 py-3">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">Dynamic EQ</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Simple on/off cleanup shaping, kept on by default.</div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <input
                type="checkbox"
                checked={restorationRack.dynamicEq}
                onChange={(e) => setRestorationRack(prev => ({ ...prev, dynamicEq: e.target.checked }))}
                className="accent-cyan-400"
              />
              On
            </label>
          </div>
          <div>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm"
              className="hidden"
              onChange={(e) => handleVideoPicked(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => videoInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleVideoDrop}
              className="w-full rounded-xl px-4 py-4 text-left text-sm text-slate-400"
            >
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-200">
                  {sourceVideoFile ? sourceVideoFile.name : 'Drop a video here or click'}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  {sourceVideoFile ? `${(sourceVideoFile.size / 1024 / 1024).toFixed(2)} MB` : 'Upload the source video first, then type the exact change you want'}
                </div>
              </div>
            </button>
          </div>
        </div>

        <details className="space-y-4">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-4 rounded-xl border border-slate-800/40 bg-slate-900/30 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 [&::-webkit-details-marker]:hidden">
            <span>Optional advanced cleanup controls</span>
          </summary>

          <div className="pt-4 space-y-4">
            <button
              onClick={handleDetachAudio}
              disabled={!sourceVideoFile || dialogueJob.status === 'running'}
              className="w-full rounded-2xl border border-cyan-500/40 bg-cyan-500/10 py-3 text-sm font-black uppercase tracking-widest text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Detach Audio Only
            </button>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Rack Preset</label>
              <select
                value={restorationPreset}
                onChange={(e) => applyRestorationPreset(e.target.value as RestorationPreset)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="dialogue-polish">Dialogue Polish</option>
                <option value="noisy-room">Noisy Room</option>
                <option value="hum-hiss">Hum + Hiss</option>
                <option value="light-touch">Light Touch</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cleanup Mode</label>
              <select
                value={dialogueCleanupMode}
                onChange={(e) => setDialogueCleanupMode(e.target.value as 'dialogue-focus' | 'balanced')}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="dialogue-focus">Dialogue Focus</option>
                <option value="balanced">Balanced Ambience</option>
              </select>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <input
                  type="checkbox"
                  checked={useStemIsolation}
                  onChange={(e) => setUseStemIsolation(e.target.checked)}
                  className="accent-cyan-400"
                />
                Stem Isolation
              </label>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Background Suppression: {backgroundReductionDb} dB
              </label>
              <input
                type="range"
                min={6}
                max={30}
                step={1}
                value={backgroundReductionDb}
                onChange={(e) => setBackgroundReductionDb(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Core Noise Reduction: {noiseReductionStrength.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={noiseReductionStrength}
                onChange={(e) => setNoiseReductionStrength(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Output Video</label>
              <input
                value={dialogueOutputName}
                onChange={(e) => setDialogueOutputName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
                placeholder="dialogue_cleanup.mp4"
              />
            </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.denoiseFft} onChange={(e) => setRestorationRack(prev => ({ ...prev, denoiseFft: e.target.checked }))} className="accent-cyan-400" />
                FFT Denoise
              </div>
              <input type="range" min={1} max={30} step={1} value={restorationRack.denoiseFftAmount} onChange={(e) => setRestorationRack(prev => ({ ...prev, denoiseFftAmount: Number(e.target.value) }))} className="w-full accent-cyan-400" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.denoiseNlm} onChange={(e) => setRestorationRack(prev => ({ ...prev, denoiseNlm: e.target.checked }))} className="accent-cyan-400" />
                NLM Denoise
              </div>
              <input type="range" min={0.05} max={1} step={0.01} value={restorationRack.denoiseNlmStrength} onChange={(e) => setRestorationRack(prev => ({ ...prev, denoiseNlmStrength: Number(e.target.value) }))} className="w-full accent-cyan-400" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.declick} onChange={(e) => setRestorationRack(prev => ({ ...prev, declick: e.target.checked }))} className="accent-cyan-400" />
                De-click
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Impulse cleanup</div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.declip} onChange={(e) => setRestorationRack(prev => ({ ...prev, declip: e.target.checked }))} className="accent-cyan-400" />
                De-clip
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Restore overloaded peaks</div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.deesser} onChange={(e) => setRestorationRack(prev => ({ ...prev, deesser: e.target.checked }))} className="accent-cyan-400" />
                De-ess
              </div>
              <input type="range" min={0.05} max={1} step={0.01} value={restorationRack.deesserAmount} onChange={(e) => setRestorationRack(prev => ({ ...prev, deesserAmount: Number(e.target.value) }))} className="w-full accent-cyan-400" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.dehum} onChange={(e) => setRestorationRack(prev => ({ ...prev, dehum: e.target.checked }))} className="accent-cyan-400" />
                De-hum
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={restorationRack.dehumFrequencyHz} onChange={(e) => setRestorationRack(prev => ({ ...prev, dehumFrequencyHz: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                <input type="number" value={restorationRack.dehumHarmonics} onChange={(e) => setRestorationRack(prev => ({ ...prev, dehumHarmonics: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
              </div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.dynamicEq} onChange={(e) => setRestorationRack(prev => ({ ...prev, dynamicEq: e.target.checked }))} className="accent-cyan-400" />
                Dynamic EQ
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={restorationRack.dynamicEqFrequencyHz} onChange={(e) => setRestorationRack(prev => ({ ...prev, dynamicEqFrequencyHz: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                <input type="number" value={restorationRack.dynamicEqRangeDb} onChange={(e) => setRestorationRack(prev => ({ ...prev, dynamicEqRangeDb: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
              </div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.speechLevel} onChange={(e) => setRestorationRack(prev => ({ ...prev, speechLevel: e.target.checked }))} className="accent-cyan-400" />
                Speech Leveler
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Speech norm + dynamic leveling</div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.compress} onChange={(e) => setRestorationRack(prev => ({ ...prev, compress: e.target.checked }))} className="accent-cyan-400" />
                Compressor
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={restorationRack.compressThresholdDb} onChange={(e) => setRestorationRack(prev => ({ ...prev, compressThresholdDb: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                <input type="number" value={restorationRack.compressRatio} step={0.1} onChange={(e) => setRestorationRack(prev => ({ ...prev, compressRatio: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
              </div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.gate} onChange={(e) => setRestorationRack(prev => ({ ...prev, gate: e.target.checked }))} className="accent-cyan-400" />
                Gate / Breath Control
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={restorationRack.gateThresholdDb} onChange={(e) => setRestorationRack(prev => ({ ...prev, gateThresholdDb: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
                <input type="number" value={restorationRack.gateRatio} step={0.1} onChange={(e) => setRestorationRack(prev => ({ ...prev, gateRatio: Number(e.target.value) }))} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
              </div>
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.highpass} onChange={(e) => setRestorationRack(prev => ({ ...prev, highpass: e.target.checked }))} className="accent-cyan-400" />
                High-pass
              </div>
              <input type="number" value={restorationRack.highpassHz} onChange={(e) => setRestorationRack(prev => ({ ...prev, highpassHz: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.lowpass} onChange={(e) => setRestorationRack(prev => ({ ...prev, lowpass: e.target.checked }))} className="accent-cyan-400" />
                Low-pass
              </div>
              <input type="number" value={restorationRack.lowpassHz} onChange={(e) => setRestorationRack(prev => ({ ...prev, lowpassHz: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.trimSilence} onChange={(e) => setRestorationRack(prev => ({ ...prev, trimSilence: e.target.checked }))} className="accent-cyan-400" />
                Trim Silence
              </div>
              <input type="number" value={restorationRack.trimSilenceThresholdDb} onChange={(e) => setRestorationRack(prev => ({ ...prev, trimSilenceThresholdDb: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            </label>

            <label className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={restorationRack.limiter} onChange={(e) => setRestorationRack(prev => ({ ...prev, limiter: e.target.checked }))} className="accent-cyan-400" />
                Limiter
              </div>
              <input type="number" value={restorationRack.limiterCeilingDb} step={0.1} onChange={(e) => setRestorationRack(prev => ({ ...prev, limiterCeilingDb: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200" />
            </label>
          </div>
          </div>
        </details>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={handleDialogueCleanup}
            disabled={!sourceVideoFile || dialogueJob.status === 'running'}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:from-cyan-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dialogueJob.status === 'running' ? 'Cleaning...' : 'Run'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800/50 bg-slate-950/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Progress</span>
            <span className="text-xs font-mono text-cyan-300">{dialogueJob.progress}%</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-sky-600 transition-all duration-300" style={{ width: `${dialogueJob.progress}%` }} />
          </div>
          <div className="max-h-44 overflow-auto rounded-xl border border-slate-800 bg-black/50 p-3 font-mono text-xs text-cyan-200">
            {dialogueTerminalLines.length === 0 ? <div className="text-slate-500">No dialogue cleanup output yet.</div> : dialogueTerminalLines.map(line => <div key={line.id}>{line.text}</div>)}
          </div>
          {dialogueJob.error && <p className="mt-3 text-xs text-red-400">{dialogueJob.error}</p>}
        </div>

        {detachedAudioUrl && (
          <div className="rounded-2xl border border-slate-800/50 bg-slate-950/50 p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Detached Audio</h4>
            <audio src={detachedAudioUrl} controls className="w-full" />
          </div>
        )}

        {cleanedAudioUrl && (
          <div className="rounded-2xl border border-slate-800/50 bg-slate-950/50 p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Cleaned Dialogue Audio</h4>
            <audio src={cleanedAudioUrl} controls className="w-full" />
          </div>
        )}

        {dialogueOutputUrl && (
          <div className="rounded-2xl border border-slate-800/50 bg-slate-950/50 p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Cleaned Dialogue Video</h4>
            <video src={dialogueOutputUrl} controls className="w-full rounded-xl bg-black" />
          </div>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={job.status === 'running'}
        className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-5 text-sm font-black uppercase tracking-widest text-white shadow-[4px_4px_16px_#000000] transition-all hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {job.status === 'running' ? 'Rendering...' : (hasPostFx || sortedScenes.length > 1) ? 'Render Final' : 'Generate Video'}
      </button>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Terminal View</span>
          <span className="text-xs font-mono text-orange-400">{job.progress}%</span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300" style={{ width: `${job.progress}%` }} />
        </div>
        <div className="max-h-52 overflow-auto rounded-xl border border-slate-800 bg-black/50 p-3 font-mono text-xs text-emerald-300">
          {terminalLines.length === 0 ? <div className="text-slate-500">No output yet.</div> : terminalLines.map(line => <div key={line.id}>{line.text}</div>)}
        </div>
        {job.error && <p className="mt-3 text-xs text-red-400">{job.error}</p>}
        {elapsed && job.status === 'complete' && <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Completed in {elapsed}s</p>}
      </div>

      {job.outputUrl && (
        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Output Video</h3>
          <video src={job.outputUrl} controls className="w-full rounded-xl bg-black" />
          <a
            href={job.outputUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block w-full rounded-xl bg-slate-800 py-3 text-center text-sm font-bold uppercase tracking-wider text-orange-400 transition-all hover:bg-slate-700"
          >
            Open Output
          </a>
        </div>
      )}
    </div>
  );
};

export default VideoEngine;
