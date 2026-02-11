import React, { useEffect, useMemo, useState } from 'react';

type ChannelMode = 'mono' | 'stereo';

interface AudioDeviceSelectorProps {
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  channelMode: ChannelMode;
  onChannelModeChange: (mode: ChannelMode) => void;
  inputLevel: number;
  disabled?: boolean;
}

const AudioDeviceSelector: React.FC<AudioDeviceSelectorProps> = ({
  selectedDeviceId,
  onSelectDevice,
  channelMode,
  onChannelModeChange,
  inputLevel,
  disabled = false,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError('Device discovery is not supported in this browser.');
        return;
      }

      // Prime labels in browsers that hide names until permission is granted.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((device) => device.kind === 'audioinput');
      setDevices(audioInputs);
      if (!selectedDeviceId && audioInputs[0]) {
        onSelectDevice(audioInputs[0].deviceId);
      }
      setIsReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list audio devices.');
      setIsReady(false);
    }
  };

  useEffect(() => {
    refreshDevices();
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }
    const handleChange = () => {
      refreshDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', handleChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleChange);
  }, [selectedDeviceId]);

  const meterColor = useMemo(() => {
    if (inputLevel < 0.5) return 'bg-emerald-400';
    if (inputLevel < 0.8) return 'bg-amber-400';
    return 'bg-red-500';
  }, [inputLevel]);

  const meterPercent = Math.round(Math.max(0, Math.min(100, inputLevel * 100)));

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Input Device</p>
        <button
          type="button"
          onClick={refreshDevices}
          disabled={disabled}
          className="rounded-full border border-slate-700/60 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-300 transition-colors hover:border-orange-400/40 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Device</span>
          <select
            value={selectedDeviceId}
            onChange={(event) => onSelectDevice(event.target.value)}
            disabled={disabled || !devices.length}
            className="w-full rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none"
          >
            {!devices.length && <option value="">No input devices found</option>}
            {devices.map((device, index) => (
              <option key={device.deviceId || `${device.label}-${index}`} value={device.deviceId}>
                {device.label || `Audio Input ${index + 1}`}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Channel Mode</span>
          <select
            value={channelMode}
            onChange={(event) => onChannelModeChange(event.target.value as ChannelMode)}
            disabled={disabled}
            className="w-full rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none"
          >
            <option value="mono">Mono (1 ch)</option>
            <option value="stereo">Stereo (2 ch)</option>
          </select>
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <span>Input Level</span>
          <span className="text-slate-300">{meterPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/80">
          <div
            className={`h-full transition-all duration-75 ${meterColor}`}
            style={{ width: `${meterPercent}%` }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {!error && isReady && (
        <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Plug & Play Active</p>
      )}
    </div>
  );
};

export default AudioDeviceSelector;
