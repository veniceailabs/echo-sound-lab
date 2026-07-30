import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  isNativeAudio,
  nativeAudio,
  desktopAPI,
  type NativeInputDevice,
  type NativeMasterResult,
} from '../../utils/electronDesktopApi';

/**
 * Hardware recording + native mastering.
 *
 * Only functional in the desktop build: capture goes through PortAudio to
 * CoreAudio/WASAPI and mastering runs in a compiled C++ addon, neither of
 * which exists in a browser. In the web build this renders an explanatory
 * state rather than disappearing, so the capability is discoverable.
 */

const LUFS_TARGETS = [
  { label: 'Streaming', value: -14, hint: 'Spotify / Apple / YouTube' },
  { label: 'Club', value: -11, hint: 'Louder, denser' },
  { label: 'CD', value: -9, hint: 'Maximum loudness' },
  { label: 'Dynamic', value: -16, hint: 'Preserves transients' },
];

function formatDb(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Peak meter. Maps -60..0 dBFS onto the bar, red above -3. */
const LevelMeter: React.FC<{ dbfs: number; label: string }> = ({ dbfs, label }) => {
  const pct = Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100));
  const hot = dbfs > -3;
  const warm = dbfs > -12;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-500 w-4">{label}</span>
      <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full transition-all duration-75 ${
            hot ? 'bg-red-500' : warm ? 'bg-amber-400' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono w-12 text-right ${hot ? 'text-red-400' : 'text-slate-400'}`}>
        {formatDb(dbfs)}
      </span>
    </div>
  );
};

export const NativeStudioPanel: React.FC = () => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<NativeInputDevice[]>([]);
  const [deviceIndex, setDeviceIndex] = useState<number | null>(null);
  const [channels, setChannels] = useState(1);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [overruns, setOverruns] = useState(0);
  const [takePath, setTakePath] = useState<string | null>(null);

  const [targetLufs, setTargetLufs] = useState(-14);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NativeMasterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isNativeAudio || !nativeAudio) { setAvailable(false); return; }
      try {
        const ok = await nativeAudio.isAvailable();
        if (cancelled) return;
        setAvailable(ok);
        if (!ok) return;
        const list = await nativeAudio.listInputDevices();
        if (cancelled) return;
        setDevices(list);
        const preferred = list.find(d => d.isDefaultInput) ?? list[0];
        if (preferred) {
          setDeviceIndex(preferred.index);
          setChannels(Math.min(2, preferred.maxInputChannels));
        }
      } catch (e: any) {
        if (!cancelled) { setAvailable(false); setError(e?.message ?? String(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stop polling if the component unmounts mid-take.
  useEffect(() => () => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    if (!nativeAudio || deviceIndex === null) return;
    setError(null);
    setResult(null);
    try {
      // macOS will not deliver audio until the user has granted access.
      await desktopAPI.requestMicrophoneAccess();

      const dir = await desktopAPI.getPath('documents');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const path = `${dir}/EchoSoundLab/take-${stamp}.wav`;
      await desktopAPI.mkdir(`${dir}/EchoSoundLab`);

      const device = devices.find(d => d.index === deviceIndex);
      const session = await nativeAudio.startRecording({
        path,
        device: deviceIndex,
        channels,
        sampleRate: device?.defaultSampleRate ?? 48000,
        framesPerBuffer: 256,
      });

      setTakePath(session.path);
      setRecording(true);
      setElapsed(0);
      setOverruns(0);

      pollRef.current = window.setInterval(async () => {
        try {
          const status = await nativeAudio.recordingStatus();
          if (!status.recording) return;
          setElapsed(status.seconds ?? 0);
          setLevels(status.peakDbfs ?? []);
          setOverruns(status.overruns ?? 0);
        } catch { /* transient poll failure is not fatal to the take */ }
      }, 100);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [deviceIndex, channels, devices]);

  const stopRecording = useCallback(async () => {
    if (!nativeAudio) return;
    if (pollRef.current !== null) { window.clearInterval(pollRef.current); pollRef.current = null; }
    try {
      const res = await nativeAudio.stopRecording();
      setRecording(false);
      setElapsed(res.seconds);
      setOverruns(res.overruns);
      setLevels([]);
    } catch (e: any) {
      setRecording(false);
      setError(e?.message ?? String(e));
    }
  }, []);

  const masterTake = useCallback(async () => {
    if (!nativeAudio || !takePath) return;
    setBusy(true);
    setError(null);
    try {
      const output = takePath.replace(/\.wav$/i, '') + `_master_${Math.abs(targetLufs)}LUFS.wav`;
      const res = await nativeAudio.masterFile({
        input: takePath,
        output,
        targetLufs,
        ceiling: -0.3,
        bits: 24,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [takePath, targetLufs]);

  if (available === null) {
    return <div className="p-6 text-slate-500 text-sm">Checking for native audio core…</div>;
  }

  if (!available) {
    return (
      <div className="p-6 rounded-2xl bg-black/30 border border-white/5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Native Studio</h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          Hardware recording and the native mastering engine are available in the desktop app.
          They use a compiled audio core that talks to your interface directly, which a browser
          cannot do.
        </p>
        {error && <p className="mt-2 text-xs text-red-400 font-mono">{error}</p>}
      </div>
    );
  }

  const device = devices.find(d => d.index === deviceIndex);

  return (
    <div className="p-6 rounded-2xl bg-black/30 border border-white/5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Native Studio</h3>
        <span className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-mono">
          Hardware I/O
        </span>
      </div>

      {/* Input selection */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-widest text-slate-500">Input</label>
        <select
          value={deviceIndex ?? ''}
          disabled={recording}
          onChange={(e) => {
            const idx = Number(e.target.value);
            setDeviceIndex(idx);
            const d = devices.find(x => x.index === idx);
            if (d) setChannels(Math.min(channels, d.maxInputChannels));
          }}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
        >
          {devices.map(d => (
            <option key={d.index} value={d.index}>
              {d.name} ({d.maxInputChannels}ch, {Math.round(d.defaultSampleRate / 1000)}kHz)
            </option>
          ))}
        </select>
        {device && (
          <p className="text-[10px] text-slate-500 font-mono">
            {device.hostApi} · {device.lowInputLatencyMs.toFixed(1)}ms latency
          </p>
        )}
      </div>

      {/* Meters */}
      {recording && levels.length > 0 && (
        <div className="space-y-1.5">
          {levels.map((db, i) => (
            <LevelMeter key={i} dbfs={db} label={levels.length === 1 ? 'M' : i === 0 ? 'L' : 'R'} />
          ))}
        </div>
      )}

      {/* Transport */}
      <div className="flex items-center gap-3">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={deviceIndex === null}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40 ${
            recording
              ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
              : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
          }`}
        >
          {recording ? '■ Stop' : '● Record'}
        </button>
        <span className="font-mono text-lg text-slate-300 tabular-nums">{formatTime(elapsed)}</span>
        {/* Overruns mean the writer thread fell behind and samples were lost -
            surfaced rather than hidden, because it invalidates a take. */}
        {overruns > 0 && (
          <span className="text-[10px] text-red-400 font-mono">{overruns} dropout(s)</span>
        )}
      </div>

      {takePath && !recording && (
        <div className="pt-4 border-t border-white/5 space-y-4">
          <p className="text-[10px] text-slate-500 font-mono break-all">{takePath}</p>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Master to</label>
            <div className="grid grid-cols-2 gap-2">
              {LUFS_TARGETS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTargetLufs(t.value)}
                  className={`px-3 py-2 rounded-xl text-left transition-all border ${
                    targetLufs === t.value
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-black/30 border-white/5 text-slate-400 hover:border-white/10'
                  }`}
                >
                  <div className="text-xs font-bold">{t.label}</div>
                  <div className="text-[10px] opacity-70 font-mono">{t.value} LUFS · {t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={masterTake}
            disabled={busy}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 text-amber-200 text-xs font-bold uppercase tracking-widest hover:from-amber-500/30 hover:to-orange-600/30 transition-all disabled:opacity-40"
          >
            {busy ? 'Mastering…' : 'Master This Take'}
          </button>
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400">Mastered</div>
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <div className="text-slate-500 text-[10px]">Integrated</div>
              <div className="text-slate-200">{result.integratedLufs.toFixed(2)} LUFS</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">True peak</div>
              <div className="text-slate-200">{result.truePeakDbfs.toFixed(2)} dBTP</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">Range</div>
              <div className="text-slate-200">{result.loudnessRange.toFixed(1)} LU</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-mono break-all pt-1">{result.output}</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300 font-mono">{error}</p>
        </div>
      )}
    </div>
  );
};

export default NativeStudioPanel;
