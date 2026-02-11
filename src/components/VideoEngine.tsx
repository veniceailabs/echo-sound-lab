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

  const audioInputRef = useRef<HTMLInputElement>(null);
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
    };
  }, [audioPreviewUrl]);

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

  const sanitizeOutputName = (value: string) => {
    const trimmed = value.trim() || 'sfs_output.mp4';
    return trimmed.endsWith('.mp4') ? trimmed : `${trimmed}.mp4`;
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
