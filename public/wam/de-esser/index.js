// De-Esser - WAM 2.0 Plugin
// Surgical sibilance control for precise vocal and cymbal taming
// Self-contained, no external dependencies

class WebAudioModule {
  constructor(hostGroupId, audioContext) {
    this.hostGroupId = hostGroupId;
    this.audioContext = audioContext;
  }

  async initialize() {}
  async createInstance() {}
  async createGui() { return null; }
}

export default class DeEsserWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    this._input = this.audioContext.createGain();
    this._output = this.audioContext.createGain();

    // Sibilance detector - isolate 4-8kHz range
    const detectorHighpass = this.audioContext.createBiquadFilter();
    detectorHighpass.type = 'highpass';
    detectorHighpass.frequency.value = 4000;
    detectorHighpass.Q.value = 0.7;

    const detectorLowpass = this.audioContext.createBiquadFilter();
    detectorLowpass.type = 'lowpass';
    detectorLowpass.frequency.value = 8000;
    detectorLowpass.Q.value = 0.7;

    // Sibilance compressor - gentle dynamic control
    const sibComp = this.audioContext.createDynamicsCompressor();
    sibComp.threshold.value = -20; // Start with moderate threshold
    sibComp.ratio.value = 4; // Gentle compression
    sibComp.attack.value = 0.003; // Fast attack for transients
    sibComp.release.value = 0.050; // Musical release
    sibComp.knee.value = 6; // Soft knee for transparency

    // Sibilance output level
    const sibGain = this.audioContext.createGain();
    sibGain.gain.value = 1;

    // Analyser for visual feedback (RMS detection)
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;

    // Dry/wet mix
    const dryGain = this.audioContext.createGain();
    dryGain.gain.value = 1;
    const wetGain = this.audioContext.createGain();
    wetGain.gain.value = 0; // Start with dry signal

    // Wire up sibilance detector chain
    this._input.connect(detectorHighpass);
    detectorHighpass.connect(detectorLowpass);
    detectorLowpass.connect(sibComp);
    sibComp.connect(sibGain);
    sibGain.connect(analyser);

    // Mix dry + processed
    this._input.connect(dryGain);
    dryGain.connect(this._output);
    sibGain.connect(wetGain);
    wetGain.connect(this._output);

    // Bypass toggle
    let isBypassed = false;

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          sensitivity: {
            label: 'Sensitivity',
            type: 'float',
            minValue: -40,
            maxValue: -10,
            defaultValue: -20,
            description: 'Sibilance detection threshold (lower = more sensitive)'
          },
          intensity: {
            label: 'Intensity',
            type: 'float',
            minValue: 1,
            maxValue: 8,
            defaultValue: 4,
            description: 'Compression ratio (higher = stronger reduction)'
          },
          freqLow: {
            label: 'Freq Low',
            type: 'float',
            minValue: 2000,
            maxValue: 5000,
            defaultValue: 4000,
            description: 'Lower frequency boundary'
          },
          freqHigh: {
            label: 'Freq High',
            type: 'float',
            minValue: 6000,
            maxValue: 12000,
            defaultValue: 8000,
            description: 'Upper frequency boundary'
          },
          attack: {
            label: 'Attack',
            type: 'float',
            minValue: 0.001,
            maxValue: 0.1,
            defaultValue: 0.003,
            description: 'Compression attack time'
          },
          release: {
            label: 'Release',
            type: 'float',
            minValue: 0.01,
            maxValue: 0.5,
            defaultValue: 0.05,
            description: 'Compression release time'
          },
          mix: {
            label: 'Mix',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
            description: '0 = dry only, 1 = full de-ess effect'
          },
          bypass: {
            label: 'Bypass',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
            description: '0 = active, 1 = bypassed'
          },
        };
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          switch (key) {
            case 'sensitivity':
              sibComp.threshold.value = value;
              break;
            case 'intensity':
              sibComp.ratio.value = value;
              break;
            case 'freqLow':
              detectorHighpass.frequency.value = value;
              break;
            case 'freqHigh':
              detectorLowpass.frequency.value = value;
              break;
            case 'attack':
              sibComp.attack.value = value;
              break;
            case 'release':
              sibComp.release.value = value;
              break;
            case 'mix':
              dryGain.gain.value = 1 - value;
              wetGain.gain.value = value;
              break;
            case 'bypass':
              isBypassed = value > 0.5;
              break;
          }
        });
      },

      getParameterValues: async () => ({
        sensitivity: sibComp.threshold.value,
        intensity: sibComp.ratio.value,
        freqLow: detectorHighpass.frequency.value,
        freqHigh: detectorLowpass.frequency.value,
        attack: sibComp.attack.value,
        release: sibComp.release.value,
        mix: wetGain.gain.value,
        bypass: isBypassed ? 1 : 0,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new DeEsserWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return DeEsserWAM.prototype.createInstance.call(
      new DeEsserWAM(hostGroupId, audioContext),
      hostGroupId,
      audioContext
    );
  }

  get audioNode() {
    return this._audioNode;
  }

  async createGui() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: 10px; background: #1a1a1a; border-radius: 4px; color: #fff; font-family: monospace; font-size: 12px; border-left: 3px solid #fb923c;">
        <div style="font-weight: bold;">De-Esser</div>
        <div style="margin-top: 8px; font-size: 11px; color: #aaa;">
          Surgical sibilance & sharpness control
        </div>
        <div style="margin-top: 6px; font-size: 10px; color: #666;">
          • Sensitivity: Sibilance detection threshold<br/>
          • Intensity: Compression strength<br/>
          • Freq Range: 4-8kHz sweet spot<br/>
          • Mix: Blend dry + processed signal
        </div>
      </div>
    `;
    return container;
  }
}
