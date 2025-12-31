// Gold Reel — WAM 2.0 Plugin
// Warm analog tape saturation. Density, not distortion.

class WebAudioModule {
  constructor(hostGroupId, audioContext) {
    this.hostGroupId = hostGroupId;
    this.audioContext = audioContext;
  }
}

export default class GoldReelWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    const ctx = this.audioContext;
    this._input = ctx.createGain();
    this._output = ctx.createGain();

    // ========== DRIVE INPUT ==========
    const driveInput = ctx.createGain();
    driveInput.gain.value = 1; // 18% default = 1.18x

    // ========== SOFT SATURATION (tanh approximation with waveshaper) ==========
    const satShaper = ctx.createWaveShaper();
    satShaper.curve = this._generateSaturationCurve(0.18); // 18% default
    satShaper.oversample = '4x'; // High quality

    // ========== HF ROLL-OFF (no shimmer, no brightness) ==========
    const hfRolloff = ctx.createBiquadFilter();
    hfRolloff.type = 'lowpass';
    hfRolloff.frequency.value = 11000; // Starts ~10-12kHz
    hfRolloff.Q.value = 0.707;

    // ========== LF HEAD BUMP (low shelf, ~90Hz) ==========
    const lfBump = ctx.createBiquadFilter();
    lfBump.type = 'lowshelf';
    lfBump.frequency.value = 90;
    lfBump.Q.value = 0.707;
    lfBump.gain.value = 1.5; // 12% default ≈ 1.5dB

    // ========== WET/DRY ==========
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0; // 100% mix default
    const wetGain = ctx.createGain();
    wetGain.gain.value = 1;

    // ========== WIRE UP GRAPH ==========
    // Input → drive → saturation → HF rolloff → LF bump
    this._input.connect(driveInput);
    driveInput.connect(satShaper);
    satShaper.connect(hfRolloff);
    hfRolloff.connect(lfBump);

    // Wet path
    lfBump.connect(wetGain);
    wetGain.connect(this._output);

    // Dry path
    this._input.connect(dryGain);
    dryGain.connect(this._output);

    // ========== PARAMETER STATE ==========
    let driveVal = 0.18;
    let toneVal = 0.40;
    let lowPushVal = 0.12;
    let glueVal = 0.65;
    let mixVal = 1.0;
    let bypassVal = false;

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          drive: {
            label: 'Drive',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.18,
            description: 'Saturation amount (logarithmic)'
          },
          tone: {
            label: 'Tone',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.40,
            description: 'Dark (0) to Neutral (1), never bright'
          },
          lowPush: {
            label: 'Low Push',
            type: 'float',
            minValue: 0,
            maxValue: 0.25,
            defaultValue: 0.12,
            description: 'Head bump amount'
          },
          glue: {
            label: 'Glue',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.65,
            description: 'Saturation softness/knee'
          },
          mix: {
            label: 'Mix',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 1.0,
            description: 'Wet/Dry blend'
          },
          bypass: {
            label: 'Bypass',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
            description: 'On/Off'
          },
        };
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          switch (key) {
            case 'drive':
              driveVal = value;
              // Logarithmic scaling: drive range 1.0 to ~2.5x
              const driveLin = 1.0 + (Math.log(1 + value * 10) / Math.log(11)) * 1.5;
              driveInput.gain.value = driveLin;
              // Update saturation curve
              satShaper.curve = this._generateSaturationCurve(value);
              break;
            case 'tone':
              toneVal = value;
              // Tone: 0 = dark (8kHz), 1 = neutral (12kHz)
              hfRolloff.frequency.value = 8000 + (value * 4000);
              break;
            case 'lowPush':
              lowPushVal = value;
              // Low push: 0-25% → 0-3.5dB
              lfBump.gain.value = 1.0 + (value * 3.5);
              break;
            case 'glue':
              glueVal = value;
              // Glue increases softness (Q reduction for warmer response)
              // Higher glue = lower Q = softer knee
              satShaper.curve = this._generateSaturationCurve(driveVal, value);
              break;
            case 'mix':
              mixVal = value;
              dryGain.gain.value = 1 - value;
              wetGain.gain.value = value;
              break;
            case 'bypass':
              bypassVal = value > 0.5;
              // Bypass: output dry signal only
              if (bypassVal) {
                dryGain.gain.value = 1;
                wetGain.gain.value = 0;
              } else {
                dryGain.gain.value = 1 - mixVal;
                wetGain.gain.value = mixVal;
              }
              break;
          }
        });
      },

      getParameterValues: async () => ({
        drive: driveVal,
        tone: toneVal,
        lowPush: lowPushVal,
        glue: glueVal,
        mix: mixVal,
        bypass: bypassVal ? 1 : 0,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  // ========== SATURATION CURVE GENERATOR ==========
  _generateSaturationCurve(drive, glue = 0.65) {
    const samples = 4096;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      // Map to -1 to 1 range
      let x = (i / samples) * 2 - 1;

      // Apply drive (already scaled in setParameterValues)
      x *= 1.0 + (drive * 1.5); // Max 2.5x

      // Soft saturation using tanh approximation
      // Higher glue = softer saturation knee
      const saturation = Math.tanh(x * (0.5 + glue * 2.5));

      // Blend original with saturation based on glue
      curve[i] = x * (1 - glue * 0.3) + saturation * (glue * 0.7);

      // Hard ceiling at ±1 (safety)
      curve[i] = Math.max(-1, Math.min(1, curve[i]));
    }

    return curve;
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new GoldReelWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return new GoldReelWAM(hostGroupId, audioContext).createInstance(hostGroupId, audioContext);
  }

  get audioNode() {
    return this._audioNode;
  }

  async createGui() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: 10px; background: #1a1410; border-radius: 4px; color: #fff; font-family: monospace; font-size: 12px; border-left: 3px solid #d97706;">
        <div style="font-weight: bold;">Gold Reel</div>
        <div style="margin-top: 6px; font-size: 11px; color: #b8860b;">Warm tape saturation. Density, not distortion.</div>
      </div>
    `;
    return container;
  }
}
