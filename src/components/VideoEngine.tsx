import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bridge, BridgeMessage } from '../services/BridgeService';

interface RenderJob {
  id: string;
  status: 'idle' | 'uploading' | 'rendering' | 'complete' | 'failed';
  progress: number;
  stage?: string;
  outputUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const VideoEngine: React.FC = () => {
  const [mode, setMode] = useState<'prompt' | 'extend'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<'cinematic' | 'abstract' | 'minimal' | 'energetic'>('cinematic');
  const [duration, setDuration] = useState(8);
  const [effects, setEffects] = useState<'none' | 'minimal' | 'all'>('minimal');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [job, setJob] = useState<RenderJob>({
    id: 'idle',
    status: 'idle',
    progress: 0,
  });
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bridge.connect();
    bridge.healthCheck();
    const unsubscribe = bridge.subscribe((msg: BridgeMessage) => {
      if (msg.status === 'idle' && msg.message?.toLowerCase().includes('bridge online')) {
        setBridgeOnline(true);
      }
      if ((msg.status === 'processing' || msg.status === 'rendering' || msg.status === 'loading') && typeof msg.progress === 'number') {
        setJob(prev => ({
          ...prev,
          status: prev.status === 'idle' ? 'rendering' : prev.status,
          progress: Math.max(prev.progress, msg.progress || 0),
          stage: msg.stage || msg.message || prev.stage,
        }));
      }
      if (msg.status === 'error' && msg.message) {
        setJob(prev => ({
          ...prev,
          status: 'failed',
          error: msg.message,
          finishedAt: Date.now(),
        }));
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const renderDuration = useMemo(() => {
    if (!job.startedAt || !job.finishedAt) return null;
    return ((job.finishedAt - job.startedAt) / 1000).toFixed(1);
  }, [job.finishedAt, job.startedAt]);

  const resetJob = (idPrefix: string) => {
    const id = `${idPrefix}-${Date.now()}`;
    setJob({
      id,
      status: 'uploading',
      progress: 2,
      startedAt: Date.now(),
      stage: 'Preparing bridge request',
    });
    return id;
  };

  const runPromptFlow = async () => {
    if (!prompt.trim()) {
      alert('Enter a prompt first.');
      return;
    }

    resetJob('prompt');
    try {
      setJob(prev => ({ ...prev, status: 'rendering', progress: 8, stage: 'Calling GENERATE_INTRO' }));
      const result = await bridge.generateIntro(prompt.trim(), style, duration, effects);
      setJob(prev => ({
        ...prev,
        status: 'complete',
        progress: 100,
        outputUrl: `http://localhost:8000/stems/${result.videoPath.split('/').pop()}`,
        stage: 'Prompt render complete',
        finishedAt: Date.now(),
      }));
    } catch (error) {
      setJob(prev => ({
        ...prev,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Prompt render failed',
        finishedAt: Date.now(),
      }));
    }
  };

  const runExtendFlow = async () => {
    if (!videoFile || !audioFile) {
      alert('Upload both source video and audio to extend visuals.');
      return;
    }

    const runId = resetJob('extend');
    try {
      setJob(prev => ({ ...prev, stage: 'Streaming video to bridge', progress: 8 }));
      const savedVideo = await bridge.saveVideoRecording(videoFile, runId, 256 * 1024, (percent) => {
        setJob(prev => ({ ...prev, progress: Math.max(prev.progress, percent), stage: 'Uploading video chunks' }));
      });

      setJob(prev => ({ ...prev, stage: 'Saving audio track', progress: 84 }));
      const savedAudio = await bridge.saveAudioFile(audioFile, audioFile.name);

      setJob(prev => ({ ...prev, stage: 'Assembling hybrid demo', progress: 90 }));
      const assembled = await bridge.assembleHybridDemo(
        savedVideo.videoPath,
        null,
        [savedAudio.audioPath],
        `sfs_${runId}`,
        {
          fadeOutDuration: 0,
          credits: {
            enabled: false,
          },
        }
      );

      setJob(prev => ({
        ...prev,
        status: 'complete',
        progress: 100,
        outputUrl: assembled.videoUrl,
        stage: 'Extend flow complete',
        finishedAt: Date.now(),
      }));
    } catch (error) {
      setJob(prev => ({
        ...prev,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Extend flow failed',
        finishedAt: Date.now(),
      }));
    }
  };

  const handleRun = async () => {
    if (!bridge.getIsConnected()) {
      bridge.connect();
    }
    if (mode === 'prompt') {
      await runPromptFlow();
      return;
    }
    await runExtendFlow();
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
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Real local pipeline via echo-bridge (GENERATE_INTRO, SAVE_SCREEN_RECORDING_CHUNK, FINALIZE_RECORDING, ASSEMBLE_HYBRID_DEMO)
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Mode</label>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('prompt')}
            className={`flex-1 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${mode === 'prompt' ? 'border-2 border-orange-500/50 bg-orange-500/20 text-orange-400' : 'border-2 border-slate-700/30 bg-slate-800/50 text-slate-500 hover:border-slate-600'}`}
          >
            Prompt New Visual
          </button>
          <button
            onClick={() => setMode('extend')}
            className={`flex-1 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${mode === 'extend' ? 'border-2 border-orange-500/50 bg-orange-500/20 text-orange-400' : 'border-2 border-slate-700/30 bg-slate-800/50 text-slate-500 hover:border-slate-600'}`}
          >
            Extend Current Visuals
          </button>
        </div>
      </div>

      {mode === 'prompt' && (
        <div className="space-y-4 rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene for SFS generation..."
            className="w-full resize-none rounded-xl border-2 border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-200 outline-none transition-all focus:border-orange-500/50"
            rows={4}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as 'cinematic' | 'abstract' | 'minimal' | 'energetic')}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="cinematic">cinematic</option>
                <option value="abstract">abstract</option>
                <option value="minimal">minimal</option>
                <option value="energetic">energetic</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Duration (sec)</label>
              <input
                type="number"
                min={3}
                max={30}
                value={duration}
                onChange={(e) => setDuration(Math.max(3, Math.min(30, Number(e.target.value) || 8)))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Effects</label>
              <select
                value={effects}
                onChange={(e) => setEffects(e.target.value as 'none' | 'minimal' | 'all')}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="none">none</option>
                <option value="minimal">minimal</option>
                <option value="all">all</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === 'extend' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
            <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Source Video</label>
            <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
            <button
              onClick={() => videoInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/40 p-4 text-left text-sm text-slate-400 hover:border-orange-500/40"
            >
              {videoFile ? `${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)` : 'Click to select video'}
            </button>
          </div>
          <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
            <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Audio Track</label>
            <input ref={audioInputRef} type="file" accept="audio/*,.wav,.mp3" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} className="hidden" />
            <button
              onClick={() => audioInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/40 p-4 text-left text-sm text-slate-400 hover:border-orange-500/40"
            >
              {audioFile ? `${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)` : 'Click to select audio'}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={job.status === 'uploading' || job.status === 'rendering'}
        className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-5 text-sm font-black uppercase tracking-widest text-white shadow-[4px_4px_16px_#000000] transition-all hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {job.status === 'uploading' || job.status === 'rendering'
          ? 'Processing...'
          : mode === 'prompt'
            ? 'Prompt SFS Engine'
            : 'Extend Current Visuals'}
      </button>

      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Job Status</span>
          <span className="text-xs font-mono text-orange-400">{job.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        {job.stage && <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{job.stage}</p>}
        {job.error && <p className="mt-3 text-xs text-red-400">{job.error}</p>}
        {renderDuration && job.status === 'complete' && (
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Completed in {renderDuration}s</p>
        )}
      </div>

      {job.outputUrl && (
        <div className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-6 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Output</h3>
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

