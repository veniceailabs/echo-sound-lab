// Graphic EQ - WAM 2.0 Plugin (Self-Contained)
// Minimal stub implementation for testing self-hosting infrastructure
// Replace this file with actual plugin bundle from Wimmics repository

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

export default class GraphicEqWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    this._input = this.audioContext.createGain();
    this._output = this.audioContext.createGain();

    // Create 10-band graphic equalizer
    const bands = [
      { freq: 63, label: '63Hz' },
      { freq: 125, label: '125Hz' },
      { freq: 250, label: '250Hz' },
      { freq: 500, label: '500Hz' },
      { freq: 1000, label: '1kHz' },
      { freq: 2000, label: '2kHz' },
      { freq: 4000, label: '4kHz' },
      { freq: 8000, label: '8kHz' },
      { freq: 16000, label: '16kHz' },
    ];

    const filters = bands.map((band) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.freq;
      filter.Q.value = 1.41; // Butterworth Q
      filter.gain.value = 0;
      return filter;
    });

    // Wire up the EQ chain
    let currentNode = this._input;
    filters.forEach((filter) => {
      currentNode.connect(filter);
      currentNode = filter;
    });
    currentNode.connect(this._output);

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {};
        bands.forEach((band, i) => {
          params[`band${i}`] = {
            label: band.label,
            type: 'float',
            minValue: -12,
            maxValue: 12,
            defaultValue: 0,
          };
        });
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          const bandIndex = parseInt(key.replace('band', ''));
          if (bandIndex >= 0 && bandIndex < filters.length) {
            filters[bandIndex].gain.value = value;
          }
        });
      },

      getParameterValues: async () => {
        const values = {};
        filters.forEach((filter, i) => {
          values[`band${i}`] = filter.gain.value;
        });
        return values;
      },

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new GraphicEqWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return GraphicEqWAM.prototype.createInstance.call(
      new GraphicEqWAM(hostGroupId, audioContext),
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
        <div>Graphic EQ WAM</div>
        <div style="margin-top: 8px; font-size: 11px; color: #aaa;">9-band parametric equalizer</div>
      </div>
    `;
    return container;
  }
}
