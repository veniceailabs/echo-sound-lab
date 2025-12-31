import React, { useState, useRef } from 'react';

interface RenderJob {
  id: string;
  status: 'uploading' | 'rendering' | 'complete' | 'failed';
  progress: number;
  videoFile?: File;
  audioFile?: File;
  outputUrl?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

const VideoEngine: React.FC = () => {
  const [mode, setMode] = useState<'upload' | 'prompt'>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [currentJob, setCurrentJob] = useState<RenderJob | null>(null);
  const [outputVideos, setOutputVideos] = useState<string[]>([]);
  const [effects, setEffects] = useState<'none' | 'minimal' | 'all'>('none');

  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
    }
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type.startsWith('audio/') || file.name.endsWith('.wav'))) {
      setAudioFile(file);
    }
  };

  const handleRender = async () => {
    // Validation
    if (mode === 'upload' && !videoFile) {
      alert('Please select a video file');
      return;
    }
    if (mode === 'prompt' && !prompt.trim()) {
      alert('Please enter a text prompt');
      return;
    }
    if (!audioFile) {
      alert('Please select an audio file');
      return;
    }

    const jobId = `job-${Date.now()}`;
    const job: RenderJob = {
      id: jobId,
      status: 'uploading',
      progress: 0,
      videoFile,
      audioFile,
      startTime: Date.now()
    };

    setCurrentJob(job);

    try {
      // Upload files
      const formData = new FormData();
      if (mode === 'upload' && videoFile) {
        formData.append('video', videoFile);
      }
      formData.append('audio', audioFile);
      if (mode === 'prompt') {
        formData.append('prompt', prompt);
      }

      const uploadRes = await fetch('/api/video/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Upload failed');

      const uploadData = await uploadRes.json();

      // Start render
      job.status = 'rendering';
      job.progress = 10;
      setCurrentJob({ ...job });

      const renderRes = await fetch('/api/video/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: uploadData.videoPath,
          audioPath: uploadData.audioPath,
          prompt: mode === 'prompt' ? prompt : undefined,
          effects
        })
      });

      if (!renderRes.ok) throw new Error('Render failed');

      const renderData = await renderRes.json();
      const renderJobId = renderData.jobId;

      // Poll for status
      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`/api/video/status/${renderJobId}`);
        const statusData = await statusRes.json();

        setCurrentJob(prev => prev ? { ...prev, progress: statusData.progress } : null);

        if (statusData.status === 'complete') {
          clearInterval(pollInterval);
          job.status = 'complete';
          job.progress = 100;
          job.outputUrl = `/api/video/output/${statusData.outputFilename}`;
          job.endTime = Date.now();
          setCurrentJob({ ...job });
          setOutputVideos(prev => [statusData.outputFilename, ...prev]);
        } else if (statusData.status === 'failed') {
          clearInterval(pollInterval);
          job.status = 'failed';
          job.error = statusData.error || 'Render failed';
          setCurrentJob({ ...job });
        }
      }, 1000);

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      setCurrentJob({ ...job });
    }
  };

  const renderTime = currentJob && currentJob.startTime && currentJob.endTime
    ? ((currentJob.endTime - currentJob.startTime) / 1000).toFixed(1)
    : null;

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl p-6 border border-slate-800/50 shadow-[8px_8px_24px_#000000,-4px_-4px_12px_#0f1828]">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-orange-500/30 flex items-center justify-center shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828]">
            <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-200 uppercase tracking-tight">Video Engine</h2>
            <p className="text-xs text-orange-400 font-semibold tracking-widest uppercase mt-1">Motion Continuity Extension</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3 uppercase tracking-wider">
          Extends any video to full song length • $0 cost • Seamless breathing motion
        </p>
      </div>

      {/* Mode Selection */}
      <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Video Source
        </label>
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setMode('upload')}
            className={`flex-1 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              mode === 'upload'
                ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/50'
                : 'bg-slate-800/50 text-slate-500 border-2 border-slate-700/30 hover:border-slate-600'
            }`}
          >
            Upload Video
          </button>
          <button
            onClick={() => setMode('prompt')}
            className={`flex-1 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              mode === 'prompt'
                ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/50'
                : 'bg-slate-800/50 text-slate-500 border-2 border-slate-700/30 hover:border-slate-600'
            }`}
          >
            Text Prompt (Scene)
          </button>
        </div>

        {mode === 'upload' ? (
          <>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
              className="hidden"
            />
            <button
              onClick={() => videoInputRef.current?.click()}
              className="w-full p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-orange-500/50 bg-slate-800/30 transition-all flex flex-col items-center gap-2"
            >
              {videoFile ? (
                <>
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-slate-300 font-medium">{videoFile.name}</span>
                  <span className="text-xs text-slate-500">{(videoFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm text-slate-500">Click to upload video</span>
                </>
              )}
            </button>
          </>
        ) : (
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your video... (e.g., 'Jellyfish floating peacefully in deep ocean waters')"
              className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border-2 border-slate-700 focus:border-orange-500/50 text-slate-200 placeholder-slate-600 text-sm resize-none outline-none transition-all"
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-2">
              EVE generates a 30-second procedural scene, then SFS extends to full song length
            </p>
            <p className="text-xs text-green-400/70 mt-1">
              ✓ Rendered locally via EVE + SFS (no cloud generation)
            </p>
          </div>
        )}
      </div>

      {/* Upload Section */}
      <div className="grid grid-cols-1 gap-4">

        {/* Audio Upload */}
        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Audio Track (Full song)
          </label>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.wav"
            onChange={handleAudioSelect}
            className="hidden"
          />
          <button
            onClick={() => audioInputRef.current?.click()}
            className="w-full p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-orange-500/50 bg-slate-800/30 transition-all flex flex-col items-center gap-2"
          >
            {audioFile ? (
              <>
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-slate-300 font-medium">{audioFile.name}</span>
                <span className="text-xs text-slate-500">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span className="text-sm text-slate-500">Click to upload audio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Effects Selection */}
      <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Visual Effects
        </label>
        <div className="flex gap-3">
          {(['none', 'minimal', 'all'] as const).map(fx => (
            <button
              key={fx}
              onClick={() => setEffects(fx)}
              className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                effects === fx
                  ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/50'
                  : 'bg-slate-800/50 text-slate-500 border-2 border-slate-700/30 hover:border-slate-600'
              }`}
            >
              {fx}
            </button>
          ))}
        </div>
      </div>

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={!videoFile || !audioFile || currentJob?.status === 'rendering'}
        className="w-full py-5 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-black text-sm uppercase tracking-widest shadow-[4px_4px_16px_#000000] disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-orange-700 transition-all"
      >
        {currentJob?.status === 'rendering' ? 'Rendering...' : 'Generate Extended Video'}
      </button>

      {/* Progress */}
      {currentJob && (
        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {currentJob.status === 'complete' ? 'Complete' : currentJob.status === 'failed' ? 'Failed' : 'Processing'}
            </span>
            <span className="text-xs font-mono text-orange-400">{currentJob.progress}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300"
              style={{ width: `${currentJob.progress}%` }}
            />
          </div>
          {currentJob.status === 'complete' && renderTime && (
            <p className="text-xs text-slate-500 mt-3 uppercase tracking-wider">
              Rendered in {renderTime}s • Ready for download
            </p>
          )}
          {currentJob.error && (
            <p className="text-xs text-red-400 mt-3">{currentJob.error}</p>
          )}
        </div>
      )}

      {/* Output Video */}
      {currentJob?.outputUrl && (
        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Output Video</h3>
          <video
            src={currentJob.outputUrl}
            controls
            className="w-full rounded-xl bg-black"
          />
          <a
            href={currentJob.outputUrl}
            download
            className="mt-4 block w-full py-3 rounded-xl bg-slate-800 text-center text-sm font-bold text-orange-400 uppercase tracking-wider hover:bg-slate-700 transition-all"
          >
            Download Video
          </a>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 shadow-[4px_4px_12px_#000000,-2px_-2px_6px_#0f1828]">
        <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">How It Works (SFS v0.3)</h3>
        <div className="space-y-2 text-xs text-slate-400">
          <p>• <span className="text-slate-300">Semantic Frame Synthesis</span>: AI analyzes motion physics, GPU renders locally</p>
          <p>• <span className="text-slate-300">BPM-Locked Breathing</span>: Motion syncs to song tempo (4 beats per breath)</p>
          <p>• <span className="text-slate-300">Continuous Timeline</span>: Seamless loops with no 8-second jumps</p>
          <p>• <span className="text-slate-300">Zero Cost</span>: Gemini (unlimited) + M2 Pro GPU = $0 per render</p>
        </div>
      </div>
    </div>
  );
};

export default VideoEngine;
