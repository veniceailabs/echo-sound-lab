import React, { useState, useRef, useEffect } from 'react';
import './ProMixingConsole.css';

interface ChannelStrip {
  id: string;
  name: string;
  type: 'vocal' | 'drums' | 'bass' | 'other' | 'guitar' | 'keys' | 'synth' | 'strings' | 'horns' | 'misc';
  fader: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  peakLevel: number;
  rmsLevel: number;
  eqBands: Array<{ frequency: number; gain: number; q: number }>;
  compressorThreshold: number;
  compressorRatio: number;
  reverbSend: number;
  delaySend: number;
}

interface MixingSession {
  id: string;
  name: string;
  bpm: number;
  channels: ChannelStrip[];
}

type MixStemKey = 'vocals' | 'drums' | 'bass' | 'other';

const createDefaultMixState = () => ({
  vocals: { volume_db: 0, pan: 0, mute: false, solo: false },
  drums: { volume_db: 0, pan: 0, mute: false, solo: false },
  bass: { volume_db: 0, pan: 0, mute: false, solo: false },
  other: { volume_db: 0, pan: 0, mute: false, solo: false },
});

const buildMixState = (channels: ChannelStrip[]) => {
  const mixState = createDefaultMixState();
  const resolveKey = (channel: ChannelStrip): MixStemKey => {
    if (channel.type === 'drums') return 'drums';
    if (channel.type === 'bass') return 'bass';
    if (channel.type === 'other') return 'other';
    return 'vocals';
  };

  channels.forEach((channel) => {
    const key = resolveKey(channel);
    mixState[key] = {
      volume_db: channel.fader,
      pan: Math.max(-1, Math.min(1, channel.pan)),
      mute: channel.mute,
      solo: channel.solo,
    };
  });

  return mixState;
};

export const ProMixingConsole: React.FC<{ onMixComplete?: (url: string) => void }> = ({
  onMixComplete,
}) => {
  const [session, setSession] = useState<MixingSession>({
    id: 'mix_001',
    name: 'My Mix',
    bpm: 120,
    channels: [
      {
        id: 'vocals',
        name: 'Vocals',
        type: 'vocal',
        fader: -6,
        pan: 0,
        mute: false,
        solo: false,
        peakLevel: -20,
        rmsLevel: -30,
        eqBands: [
          { frequency: 100, gain: 0, q: 0.7 },
          { frequency: 400, gain: 0, q: 1.0 },
          { frequency: 1000, gain: 0, q: 1.0 },
          { frequency: 4000, gain: 0, q: 1.0 },
          { frequency: 12000, gain: 0, q: 0.7 },
        ],
        compressorThreshold: -18,
        compressorRatio: 3,
        reverbSend: 0.15,
        delaySend: 0.05,
      },
      {
        id: 'drums',
        name: 'Drums',
        type: 'drums',
        fader: -4,
        pan: 0,
        mute: false,
        solo: false,
        peakLevel: -15,
        rmsLevel: -25,
        eqBands: [
          { frequency: 100, gain: 2, q: 0.7 },
          { frequency: 1000, gain: 0, q: 1.0 },
          { frequency: 5000, gain: 1, q: 1.0 },
          { frequency: 10000, gain: 0, q: 0.7 },
          { frequency: 12000, gain: 0, q: 0.7 },
        ],
        compressorThreshold: -20,
        compressorRatio: 4,
        reverbSend: 0.1,
        delaySend: 0,
      },
      {
        id: 'bass',
        name: 'Bass',
        type: 'bass',
        fader: -6,
        pan: 0,
        mute: false,
        solo: false,
        peakLevel: -18,
        rmsLevel: -28,
        eqBands: [
          { frequency: 100, gain: 1, q: 0.7 },
          { frequency: 400, gain: -1, q: 1.0 },
          { frequency: 1000, gain: 0, q: 1.0 },
          { frequency: 4000, gain: 0, q: 1.0 },
          { frequency: 12000, gain: 0, q: 0.7 },
        ],
        compressorThreshold: -15,
        compressorRatio: 3.5,
        reverbSend: 0,
        delaySend: 0,
      },
      {
        id: 'other',
        name: 'Other',
        type: 'other',
        fader: -8,
        pan: 0,
        mute: false,
        solo: false,
        peakLevel: -22,
        rmsLevel: -32,
        eqBands: [
          { frequency: 100, gain: 0, q: 0.7 },
          { frequency: 1000, gain: 0, q: 1.0 },
          { frequency: 5000, gain: 0.5, q: 1.0 },
          { frequency: 10000, gain: 1, q: 0.7 },
          { frequency: 12000, gain: 0, q: 0.7 },
        ],
        compressorThreshold: -22,
        compressorRatio: 2.5,
        reverbSend: 0.2,
        delaySend: 0.1,
      },
    ],
  });

  const [selectedChannel, setSelectedChannel] = useState<string>('vocals');
  const [isMixing, setIsMixing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mixResult, setMixResult] = useState<any>(null);
  const [changeRequest, setChangeRequest] = useState('');
  const consoleRef = useRef<HTMLDivElement>(null);

  const handleChannelUpdate = (channelId: string, updates: Partial<ChannelStrip>) => {
    setSession((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id === channelId ? { ...ch, ...updates } : ch
      ),
    }));
  };

  const handleEQUpdate = (
    channelId: string,
    bandIndex: number,
    gain: number
  ) => {
    setSession((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) => {
        if (ch.id === channelId) {
          const newBands = [...ch.eqBands];
          newBands[bandIndex] = { ...newBands[bandIndex], gain };
          return { ...ch, eqBands: newBands };
        }
        return ch;
      }),
    }));
  };

  const handleMix = async () => {
    setIsMixing(true);
    setProgress(0);

    try {
      // Simulate mixing progress
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 20, 85));
      }, 500);

      const mix_state = buildMixState(session.channels);
      const response = await fetch('/api/proxy/mixing/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, mix_state, request_text: changeRequest.trim() || undefined }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`Mixing failed: ${response.statusText}`);
      }

      const data = await response.json();
      setProgress(100);
      setMixResult(data);

      if (onMixComplete) {
        onMixComplete(data.downloadUrl);
      }
    } catch (error) {
      console.error('Mixing error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMixing(false);
      setProgress(0);
    }
  };

  const selectedChannelData = session.channels.find((ch) => ch.id === selectedChannel);

  return (
    <div className="pro-mixing-console" ref={consoleRef}>
      <div className="console-header">
        <h1>Echo Studio | Professional Mixing Console</h1>
        <p>Describe the sound you want in plain English. Keep the knobs only for surgical work.</p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2">
            Change Brief
          </label>
          <textarea
            value={changeRequest}
            onChange={(e) => setChangeRequest(e.target.value)}
            placeholder="Example: keep the lead vocal forward but not loud, tuck the beat under the verse, keep the dynamic EQ simple, and leave the hook wide."
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-orange-400/50"
          />
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            This brief is sent with the mix session so you can direct the result without adjusting every channel by hand.
          </p>
        </div>
      </div>

      {!mixResult ? (
        <div className="mixing-workspace">
          {/* Channel Strips */}
          <div className="channel-strips">
            {session.channels.map((channel) => (
              <div
                key={channel.id}
                className={`channel-strip ${selectedChannel === channel.id ? 'selected' : ''}`}
                onClick={() => setSelectedChannel(channel.id)}
              >
                <div className="channel-meters">
                  <div className="meter">
                    <div className="meter-label">Peak</div>
                    <div className="meter-bar" style={{ height: `${Math.max(0, channel.peakLevel + 40)}%` }}></div>
                    <div className="meter-value">{channel.peakLevel.toFixed(1)}</div>
                  </div>
                  <div className="meter">
                    <div className="meter-label">RMS</div>
                    <div className="meter-bar rms" style={{ height: `${Math.max(0, channel.rmsLevel + 40)}%` }}></div>
                    <div className="meter-value">{channel.rmsLevel.toFixed(1)}</div>
                  </div>
                </div>

                <div className="channel-controls">
                  {/* Fader */}
                  <input
                    type="range"
                    min="-48"
                    max="6"
                    step="0.5"
                    value={channel.fader}
                    onChange={(e) =>
                      handleChannelUpdate(channel.id, { fader: parseFloat(e.target.value) })
                    }
                    className="fader"
                    title="Volume fader"
                  />

                  {/* Pan */}
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={channel.pan}
                    onChange={(e) =>
                      handleChannelUpdate(channel.id, { pan: parseFloat(e.target.value) })
                    }
                    className="pan"
                    title="Panning"
                  />

                  {/* Mute/Solo */}
                  <div className="mute-solo">
                    <button
                      className={`mute-btn ${channel.mute ? 'active' : ''}`}
                      onClick={() =>
                        handleChannelUpdate(channel.id, { mute: !channel.mute })
                      }
                    >
                      M
                    </button>
                    <button
                      className={`solo-btn ${channel.solo ? 'active' : ''}`}
                      onClick={() =>
                        handleChannelUpdate(channel.id, { solo: !channel.solo })
                      }
                    >
                      S
                    </button>
                  </div>
                </div>

                <div className="channel-name">{channel.name}</div>
              </div>
            ))}
          </div>

          {/* Channel Editor */}
          {selectedChannelData && (
            <div className="channel-editor">
              <h2>{selectedChannelData.name} Settings</h2>

              {/* EQ Section */}
              <details open>
                <summary className="section-title">5-Band EQ</summary>
                <div className="eq-bands">
                  {selectedChannelData.eqBands.map((band, idx) => (
                    <div key={idx} className="eq-band">
                      <label>{band.frequency} Hz</label>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={band.gain}
                        onChange={(e) =>
                          handleEQUpdate(selectedChannelData.id, idx, parseFloat(e.target.value))
                        }
                      />
                      <span className="eq-value">{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)} dB</span>
                    </div>
                  ))}
                </div>
              </details>

              {/* Compressor Section */}
              <details open>
                <summary className="section-title">Compressor</summary>
                <div className="compressor-settings">
                  <div className="setting-group">
                    <label>Threshold</label>
                    <input
                      type="range"
                      min="-40"
                      max="0"
                      step="1"
                      value={selectedChannelData.compressorThreshold}
                      onChange={(e) =>
                        handleChannelUpdate(selectedChannelData.id, {
                          compressorThreshold: parseInt(e.target.value),
                        })
                      }
                    />
                    <span>{selectedChannelData.compressorThreshold} dB</span>
                  </div>

                  <div className="setting-group">
                    <label>Ratio</label>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="0.5"
                      value={selectedChannelData.compressorRatio}
                      onChange={(e) =>
                        handleChannelUpdate(selectedChannelData.id, {
                          compressorRatio: parseFloat(e.target.value),
                        })
                      }
                    />
                    <span>{selectedChannelData.compressorRatio.toFixed(1)}:1</span>
                  </div>
                </div>
              </details>

              {/* Effects Sends */}
              <details>
                <summary className="section-title">âœEffects Sends</summary>
                <div className="effects-sends">
                  <div className="send-group">
                    <label>Reverb</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedChannelData.reverbSend}
                      onChange={(e) =>
                        handleChannelUpdate(selectedChannelData.id, {
                          reverbSend: parseFloat(e.target.value),
                        })
                      }
                    />
                    <span>{(selectedChannelData.reverbSend * 100).toFixed(0)}%</span>
                  </div>

                  <div className="send-group">
                    <label>Delay</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedChannelData.delaySend}
                      onChange={(e) =>
                        handleChannelUpdate(selectedChannelData.id, {
                          delaySend: parseFloat(e.target.value),
                        })
                      }
                    />
                    <span>{(selectedChannelData.delaySend * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      ) : (
        // Results screen
        <div className="mixing-results">
          <h2>âœMix Complete</h2>
          <p>Your multi-track mix is ready to master</p>

          <div className="result-actions">
            <a href={mixResult.downloadUrl} download="mix.wav" className="download-btn">
              Download Mix (32-bit)
            </a>
            <button
              onClick={() => setMixResult(null)}
              className="remix-btn"
            >
              Mix Again
            </button>
            <button className="master-btn">
              Go to Mastering
            </button>
          </div>
        </div>
      )}

      {/* Mix Button */}
      <button
        onClick={handleMix}
        disabled={isMixing}
        className="mix-button"
      >
        {isMixing ? (
          <>
            <span className="spinner"></span>
            MIXING ({Math.round(progress)}%)
          </>
        ) : (
          'MIX NOW'
        )}
      </button>

      {isMixing && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      )}
    </div>
  );
};
