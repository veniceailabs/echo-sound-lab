// Microverb - WAM 2.0 Plugin (Self-Contained)
// Minimal stub implementation for testing self-hosting infrastructure
// Replace this file with actual plugin bundle from Burns Audio repository

// Minimal WebAudioModule base class (self-contained, no external imports)
class WebAudioModule {
  constructor(hostGroupId, audioContext) {
    this.hostGroupId = hostGroupId;
    this.audioContext = audioContext;
  }

  async initialize() {}
  async createInstance() {}
  async createGui() { return null; }
}

export default class MicroverbWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    this._input = this.audioContext.createGain();
    this._output = this.audioContext.createGain();

    // Simple reverb using multiple delay taps
    const taps = [
      { delay: 0.011, gain: 0.3 },
      { delay: 0.023, gain: 0.25 },
      { delay: 0.037, gain: 0.2 },
      { delay: 0.053, gain: 0.15 },
    ];

    const dryGain = this.audioContext.createGain();
    dryGain.gain.value = 0.7;
    const wetGain = this.audioContext.createGain();
    wetGain.gain.value = 0.3;

    const delayNodes = [];
    const gainNodes = [];

    // Create reverb taps
    taps.forEach(({ delay, gain }) => {
      const delayNode = this.audioContext.createDelay(0.5);
      delayNode.delayTime.value = delay;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = gain;

      this._input.connect(delayNode);
      delayNode.connect(gainNode);
      gainNode.connect(this._output);

      delayNodes.push(delayNode);
      gainNodes.push(gainNode);
    });

    this._input.connect(dryGain);
    dryGain.connect(this._output);
    this._input.connect(wetGain);
    wetGain.connect(this._output);

    // Damping filter
    const damp = this.audioContext.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3000;

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          roomSize: { label: 'Room Size', type: 'float', minValue: 0.5, maxValue: 1, defaultValue: 0.7 },
          damping: { label: 'Damping', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.5 },
          wetDry: { label: 'Wet/Dry Mix', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.3 },
        };
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          if (key === 'roomSize') {
            // Modulate delay times based on room size
            delayNodes.forEach((node, i) => {
              node.delayTime.value = taps[i].delay * (0.5 + value * 0.5);
            });
          } else if (key === 'damping') {
            damp.frequency.value = 1000 + value * 3000;
          } else if (key === 'wetDry') {
            dryGain.gain.value = 1 - value;
            wetGain.gain.value = value;
          }
        });
      },

      getParameterValues: async () => ({
        roomSize: 0.7,
        damping: damp.frequency.value / 4000,
        wetDry: wetGain.gain.value,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new MicroverbWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return MicroverbWAM.prototype.createInstance.call(
      new MicroverbWAM(hostGroupId, audioContext),
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
      <div style="padding: 10px; background: #222; border-radius: 4px; color: #fff; font-family: monospace; font-size: 12px;">
        <div>Microverb WAM</div>
        <div style="margin-top: 8px; font-size: 11px; color: #aaa;">High-quality compact reverb</div>
      </div>
    `;
    return container;
  }
}
