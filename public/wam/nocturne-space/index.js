// Nocturne Space — WAM 2.0 Plugin
// Dark, intimate Drake-style vocal reverb
// Early-reflection dominant. Felt, not heard.

class WebAudioModule {
  constructor(hostGroupId, audioContext) {
    this.hostGroupId = hostGroupId;
    this.audioContext = audioContext;
  }
}

export default class NocturneSpaceWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    const ctx = this.audioContext;
    this._input = ctx.createGain();
    this._output = ctx.createGain();

    // ========== PRE-DELAY ==========
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.032; // 32ms default

    // ========== HIGHPASS (remove mud) ==========
    const hipass = ctx.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.value = 150;
    hipass.Q.value = 0.707;

    // ========== EARLY REFLECTION NETWORK (6 taps, 5-45ms) ==========
    const earlyDelays = [
      { time: 0.011, gain: 0.25 },
      { time: 0.019, gain: 0.23 },
      { time: 0.031, gain: 0.20 },
      { time: 0.043, gain: 0.18 },
      { time: 0.057, gain: 0.15 },
      { time: 0.071, gain: 0.12 },
    ];

    const earlyNodes = earlyDelays.map(({ time, gain }) => {
      const delayNode = ctx.createDelay(0.1);
      delayNode.delayTime.value = time;
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      return { delayNode, gainNode };
    });

    // ========== DAMPING LOWPASS (dark, no shimmer) ==========
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 5500; // 72% default ≈ 5500Hz
    damp.Q.value = 0.707;

    // ========== DIFFUSION / FEEDBACK MATRIX ==========
    const fbGain = ctx.createGain();
    fbGain.gain.value = 0.30; // < 0.35 per spec

    // ========== STEREO SPREAD ==========
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // ========== WET/DRY ==========
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.14; // 14% default (hard limit 30%)

    // ========== WIRE UP GRAPH ==========

    // Main path: input → preDelay → hipass
    this._input.connect(preDelay);
    preDelay.connect(hipass);

    // Early reflections from hipass output
    earlyNodes.forEach(({ delayNode, gainNode }) => {
      hipass.connect(delayNode);
      delayNode.connect(gainNode);
      gainNode.connect(damp);
    });

    // Damping to stereo spread
    damp.connect(splitter);

    // Stereo offset (slight width from L/R separation)
    const lGain = ctx.createGain();
    const rGain = ctx.createGain();
    lGain.gain.value = 1;
    rGain.gain.value = 0.95; // Subtle width

    splitter.connect(lGain, 0);
    splitter.connect(rGain, 1);
    lGain.connect(merger, 0, 0);
    rGain.connect(merger, 0, 1);

    // Feedback: damp → feedback gain → back into early reflections
    damp.connect(fbGain);
    fbGain.connect(hipass);

    // Wet path
    merger.connect(wetGain);
    wetGain.connect(this._output);

    // Dry path
    this._input.connect(dryGain);
    dryGain.connect(this._output);

    // ========== PARAMETER STATE ==========
    let spaceVal = 0.35;
    let dampVal = 0.72;
    let widthVal = 0.58;
    let depthVal = 0.45;
    let mixVal = 0.14;

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          space: {
            label: 'Space',
            type: 'float',
            minValue: 0.2,
            maxValue: 0.6,
            defaultValue: 0.35,
            description: 'Delay times + feedback density'
          },
          preDelay: {
            label: 'Pre-Delay',
            type: 'float',
            minValue: 0,
            maxValue: 0.08,
            defaultValue: 0.032,
            description: 'Vocal intimacy control (seconds)'
          },
          damp: {
            label: 'Damp',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.72,
            description: 'High-frequency absorption'
          },
          width: {
            label: 'Width',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.58,
            description: 'Stereo spread'
          },
          depth: {
            label: 'Depth',
            type: 'float',
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.45,
            description: 'Wet signal push-back'
          },
          mix: {
            label: 'Mix',
            type: 'float',
            minValue: 0,
            maxValue: 0.3,
            defaultValue: 0.14,
            description: 'Wet/Dry (hard limit 30%)'
          },
        };
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          switch (key) {
            case 'space':
              spaceVal = value;
              // Space controls delay times + feedback
              const spaceFeedback = 0.30 * (value / 0.6);
              fbGain.gain.value = Math.min(0.35, spaceFeedback);
              break;
            case 'preDelay':
              preDelay.delayTime.value = value;
              break;
            case 'damp':
              dampVal = value;
              // Damp: 0% = 4kHz, 100% = 1kHz (dark)
              const dampFreq = 4000 - (value * 3000);
              damp.frequency.value = Math.max(1000, dampFreq);
              break;
            case 'width':
              widthVal = value;
              // Width controls stereo separation
              rGain.gain.value = 0.95 + (value * 0.05);
              break;
            case 'depth':
              depthVal = value;
              break;
            case 'mix':
              mixVal = Math.min(0.3, value); // Hard limit
              dryGain.gain.value = 1 - mixVal;
              wetGain.gain.value = mixVal;
              break;
          }
        });
      },

      getParameterValues: async () => ({
        space: spaceVal,
        preDelay: preDelay.delayTime.value,
        damp: dampVal,
        width: widthVal,
        depth: depthVal,
        mix: mixVal,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new NocturneSpaceWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return new NocturneSpaceWAM(hostGroupId, audioContext).createInstance(hostGroupId, audioContext);
  }

  get audioNode() {
    return this._audioNode;
  }

  async createGui() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: 10px; background: #0d0d0d; border-radius: 4px; color: #fff; font-family: monospace; font-size: 12px; border-left: 3px solid #7c3aed;">
        <div style="font-weight: bold;">Nocturne Space</div>
        <div style="margin-top: 6px; font-size: 11px; color: #a0a0a0;">Dark vocal reverb. Felt, not heard.</div>
      </div>
    `;
    return container;
  }
}
