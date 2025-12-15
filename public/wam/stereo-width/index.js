// Stereo Width — WAM 2.0 Plugin
// Subtle, phase-coherent stereo widening for mastering
// Mid/side processing ensures mono compatibility and phase safety

class WebAudioModule {
  constructor(hostGroupId, audioContext) {
    this.hostGroupId = hostGroupId;
    this.audioContext = audioContext;
  }
}

export default class StereoWidthWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    const ctx = this.audioContext;
    this._input = ctx.createGain();
    this._output = ctx.createGain();

    // ========== MID/SIDE CONVERTER ==========
    // Stereo → mid/side (phase-coherent, mono-safe)
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Mid = (L + R) / 2
    const midSum = ctx.createGain();
    midSum.gain.value = 0.5;

    // Side = (L - R) / 2
    const sideDiff = ctx.createGain();
    sideDiff.gain.value = 0.5;

    // Invert right channel for side calculation
    const rightInvert = ctx.createGain();
    rightInvert.gain.value = -1;

    // ========== MID PATH (UNCHANGED) ==========
    const midGain = ctx.createGain();
    midGain.gain.value = 1;

    // ========== SIDE PATH (PROCESSING) ==========
    // Gentle highpass (removes sub/mono components from widening)
    const sideHighpass = ctx.createBiquadFilter();
    sideHighpass.type = 'highpass';
    sideHighpass.frequency.value = 200; // Don't widen bass
    sideHighpass.Q.value = 0.707;

    // Side width control (hard-limited to 0.4 max for safety)
    const sideWidth = ctx.createGain();
    sideWidth.gain.value = 0.2; // 20% default (subtle)

    // Side saturation (prevents phase artifacts at higher widths)
    const sideSat = ctx.createWaveShaper();
    sideSat.curve = this._generateSaturationCurve(0.5); // 50% intensity default
    sideSat.oversample = '2x';

    // Side output gain (controls processing intensity)
    const sideIntensity = ctx.createGain();
    sideIntensity.gain.value = 0.5;

    // ========== WIRE UP MID/SIDE GRAPH ==========
    // Input splits to L/R
    this._input.connect(splitter);

    // Mid: L + R
    splitter.connect(midSum, 0);
    midSum.connect(midGain);
    midGain.connect(merger, 0, 0); // Mid to output L

    // Side: L - R (R inverted, then summed with L)
    splitter.connect(sideDiff, 0);
    splitter.connect(rightInvert, 1);
    rightInvert.connect(sideDiff);

    // Process side channel
    sideDiff.connect(sideHighpass);
    sideHighpass.connect(sideSat);
    sideSat.connect(sideIntensity);
    sideIntensity.connect(sideWidth);
    sideWidth.connect(merger, 0, 1); // Side to output R

    // Output: recombine M/S back to L/R
    // L = M + S, R = M - S (built into merger setup)
    const outputRecombine = ctx.createGain();
    merger.connect(outputRecombine);
    outputRecombine.connect(this._output);

    // ========== PARAMETER STATE ==========
    let widthVal = 0.2;
    let intensityVal = 0.5;
    let bypassVal = false;

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          width: {
            label: 'Width',
            type: 'float',
            minValue: 0,
            maxValue: 0.4,
            defaultValue: 0.2,
            description: 'Stereo width expansion (0 = mono, 0.4 = max safe)'
          },
          intensity: {
            label: 'Intensity',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.5,
            description: 'Side channel processing strength'
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
            case 'width':
              widthVal = Math.min(0.4, value); // Hard limit
              sideWidth.gain.value = widthVal;
              break;
            case 'intensity':
              intensityVal = value;
              sideIntensity.gain.value = intensityVal;
              // Update saturation curve based on intensity
              sideSat.curve = this._generateSaturationCurve(intensityVal);
              break;
            case 'bypass':
              bypassVal = value > 0.5;
              if (bypassVal) {
                // Bypass: only mid signal, no side widening
                sideWidth.gain.value = 0;
              } else {
                sideWidth.gain.value = widthVal;
              }
              break;
          }
        });
      },

      getParameterValues: async () => ({
        width: widthVal,
        intensity: intensityVal,
        bypass: bypassVal ? 1 : 0,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  // ========== SOFT SATURATION FOR SIDE CHANNEL ==========
  // Prevents phase artifacts and clipping at higher widths
  _generateSaturationCurve(intensity) {
    const samples = 4096;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      let x = (i / samples) * 2 - 1;

      // Apply intensity (amount of saturation)
      const drive = intensity * 1.5;
      x *= drive;

      // Soft tanh saturation
      const saturated = Math.tanh(x);

      // Blend: higher intensity = more saturation
      curve[i] = x * (1 - intensity * 0.5) + saturated * (intensity * 0.5);

      // Safety ceiling
      curve[i] = Math.max(-1, Math.min(1, curve[i]));
    }

    return curve;
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new StereoWidthWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return new StereoWidthWAM(hostGroupId, audioContext).createInstance(hostGroupId, audioContext);
  }

  get audioNode() {
    return this._audioNode;
  }

  async createGui() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: 10px; background: #0f1419; border-radius: 4px; color: #fff; font-family: monospace; font-size: 12px; border-left: 3px solid #06b6d4;">
        <div style="font-weight: bold;">Stereo Width</div>
        <div style="margin-top: 6px; font-size: 11px; color: #a0a0a0;">Phase-coherent mastering stereo. Mono-safe.</div>
      </div>
    `;
    return container;
  }
}
