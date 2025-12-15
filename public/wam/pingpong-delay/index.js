// PingPong Delay - WAM 2.0 Plugin (Self-Contained)
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

export default class PingPongDelayWAM extends WebAudioModule {
  static VERSION = '1.0.0';

  constructor(hostGroupId, audioContext) {
    super(hostGroupId, audioContext);
  }

  async initialize() {
    // Create audio nodes for stereo ping-pong delay
    this._input = this.audioContext.createGain();
    this._output = this.audioContext.createGain();

    // Left channel delay
    const leftDelay = this.audioContext.createDelay(5);
    leftDelay.delayTime.value = 0.5;

    // Right channel delay (inverted for ping-pong effect)
    const rightDelay = this.audioContext.createDelay(5);
    rightDelay.delayTime.value = 0.5;

    // Feedback for repeats
    const feedback = this.audioContext.createGain();
    feedback.gain.value = 0.4;

    // Dry/wet mix
    const dryGain = this.audioContext.createGain();
    dryGain.gain.value = 0.5;
    const wetGain = this.audioContext.createGain();
    wetGain.gain.value = 0.5;

    // Splitter for stereo
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);

    // Wire up the graph
    this._input.connect(dryGain);
    dryGain.connect(this._output);

    this._input.connect(splitter);
    splitter.connect(leftDelay, 0);
    splitter.connect(rightDelay, 1);

    leftDelay.connect(merger, 0, 0);
    rightDelay.connect(merger, 0, 1);

    leftDelay.connect(feedback);
    rightDelay.connect(feedback);
    feedback.connect(leftDelay);
    feedback.connect(rightDelay);

    merger.connect(wetGain);
    wetGain.connect(this._output);

    this._audioNode = {
      inputs: [this._input],
      outputs: [this._output],
      connect: (destination) => this._output.connect(destination),
      disconnect: () => this._output.disconnect(),

      getParameterInfo: async (paramId) => {
        const params = {
          delay: { label: 'Delay Time', type: 'float', minValue: 0.1, maxValue: 2, defaultValue: 0.5 },
          feedback: { label: 'Feedback', type: 'float', minValue: 0, maxValue: 0.8, defaultValue: 0.4 },
          wetDry: { label: 'Wet/Dry Mix', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.5 },
        };
        return paramId ? params[paramId] : params;
      },

      setParameterValues: async (params) => {
        Object.entries(params).forEach(([key, { value }]) => {
          if (key === 'delay') {
            leftDelay.delayTime.value = value;
            rightDelay.delayTime.value = value;
          } else if (key === 'feedback') {
            feedback.gain.value = value;
          } else if (key === 'wetDry') {
            dryGain.gain.value = 1 - value;
            wetGain.gain.value = value;
          }
        });
      },

      getParameterValues: async () => ({
        delay: leftDelay.delayTime.value,
        feedback: feedback.gain.value,
        wetDry: wetGain.gain.value,
      }),

      getState: async () => ({}),
      setState: async () => {},
    };
  }

  async createInstance(hostGroupId, audioContext) {
    const wam = new PingPongDelayWAM(hostGroupId, audioContext);
    await wam.initialize();
    return wam;
  }

  static async createInstance(hostGroupId, audioContext) {
    return PingPongDelayWAM.prototype.createInstance.call(
      new PingPongDelayWAM(hostGroupId, audioContext),
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
        <div>PingPong Delay WAM</div>
        <div style="margin-top: 8px; font-size: 11px; color: #aaa;">Stereo ping-pong delay effect</div>
      </div>
    `;
    return container;
  }
}
