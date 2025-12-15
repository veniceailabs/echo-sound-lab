/**
 * Echo Delay Processor - AudioWorklet
 * Tempo-synced delay with feedback, filtering, and stereo ping-pong option
 */

class EchoDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'delayTime', defaultValue: 0.25, minValue: 0.01, maxValue: 2.0, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.4, minValue: 0, maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'highCut', defaultValue: 8000, minValue: 1000, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'lowCut', defaultValue: 100, minValue: 20, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'pingPong', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // Max delay time in samples (2 seconds at 48kHz)
    this.maxDelaySamples = Math.ceil(sampleRate * 2);

    // Circular buffers for stereo delay lines
    this.delayBufferL = new Float32Array(this.maxDelaySamples);
    this.delayBufferR = new Float32Array(this.maxDelaySamples);
    this.writeIndex = 0;

    // Filter states (simple one-pole filters)
    this.lpStateL = 0;
    this.lpStateR = 0;
    this.hpStateL = 0;
    this.hpStateR = 0;

    // Smoothed parameters
    this.smoothDelayTime = 0.25;
    this.smoothFeedback = 0.4;
    this.smoothMix = 0.3;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) return true;

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];

    // Get parameters
    const delayTime = parameters.delayTime[0];
    const feedback = parameters.feedback[0];
    const mix = parameters.mix[0];
    const highCut = parameters.highCut[0];
    const lowCut = parameters.lowCut[0];
    const pingPong = parameters.pingPong[0] > 0.5;

    // Smoothing coefficient
    const smoothing = 0.995;
    this.smoothDelayTime = this.smoothDelayTime * smoothing + delayTime * (1 - smoothing);
    this.smoothFeedback = this.smoothFeedback * smoothing + feedback * (1 - smoothing);
    this.smoothMix = this.smoothMix * smoothing + mix * (1 - smoothing);

    // Calculate delay in samples
    const delaySamples = Math.floor(this.smoothDelayTime * sampleRate);

    // Filter coefficients (simple one-pole)
    const lpCoeff = Math.exp(-2 * Math.PI * highCut / sampleRate);
    const hpCoeff = Math.exp(-2 * Math.PI * lowCut / sampleRate);

    for (let i = 0; i < inputL.length; i++) {
      // Read from delay line
      let readIndex = this.writeIndex - delaySamples;
      if (readIndex < 0) readIndex += this.maxDelaySamples;

      let delayedL = this.delayBufferL[readIndex];
      let delayedR = this.delayBufferR[readIndex];

      // Apply low-pass filter (high cut)
      this.lpStateL = delayedL + lpCoeff * (this.lpStateL - delayedL);
      this.lpStateR = delayedR + lpCoeff * (this.lpStateR - delayedR);
      delayedL = this.lpStateL;
      delayedR = this.lpStateR;

      // Apply high-pass filter (low cut)
      this.hpStateL = delayedL + hpCoeff * (this.hpStateL - delayedL);
      this.hpStateR = delayedR + hpCoeff * (this.hpStateR - delayedR);
      delayedL = delayedL - this.hpStateL;
      delayedR = delayedR - this.hpStateR;

      // Write to delay line with feedback
      if (pingPong) {
        // Ping-pong: cross-feed between channels
        this.delayBufferL[this.writeIndex] = inputL[i] + delayedR * this.smoothFeedback;
        this.delayBufferR[this.writeIndex] = inputR[i] + delayedL * this.smoothFeedback;
      } else {
        // Standard stereo delay
        this.delayBufferL[this.writeIndex] = inputL[i] + delayedL * this.smoothFeedback;
        this.delayBufferR[this.writeIndex] = inputR[i] + delayedR * this.smoothFeedback;
      }

      // Mix dry/wet
      const dry = 1 - this.smoothMix;
      const wet = this.smoothMix;
      outputL[i] = inputL[i] * dry + delayedL * wet;
      outputR[i] = inputR[i] * dry + delayedR * wet;

      // Advance write index
      this.writeIndex++;
      if (this.writeIndex >= this.maxDelaySamples) {
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('echo-delay-processor', EchoDelayProcessor);
