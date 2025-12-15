/**
 * Echo Chorus Processor - AudioWorklet
 * Rich stereo chorus with multiple voices and LFO modulation
 */

class EchoChorusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 1.0, minValue: 0.1, maxValue: 10.0, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'voices', defaultValue: 2, minValue: 1, maxValue: 4, automationRate: 'k-rate' },
      { name: 'spread', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // Maximum delay for modulation (30ms)
    this.maxDelaySamples = Math.ceil(sampleRate * 0.03);

    // Delay buffers for each voice (4 voices max, stereo)
    this.delayBuffersL = [];
    this.delayBuffersR = [];
    for (let v = 0; v < 4; v++) {
      this.delayBuffersL.push(new Float32Array(this.maxDelaySamples));
      this.delayBuffersR.push(new Float32Array(this.maxDelaySamples));
    }

    this.writeIndex = 0;

    // LFO phases for each voice (slightly offset for richness)
    this.lfoPhases = [0, 0.25, 0.5, 0.75];

    // Base delay times for each voice (in samples)
    this.baseDelays = [
      0.007 * sampleRate,  // 7ms
      0.011 * sampleRate,  // 11ms
      0.013 * sampleRate,  // 13ms
      0.017 * sampleRate,  // 17ms (prime numbers for less comb filtering)
    ];

    // Smoothed parameters
    this.smoothMix = 0.5;
    this.smoothDepth = 0.5;

    // Feedback storage
    this.feedbackL = 0;
    this.feedbackR = 0;
  }

  // Linear interpolation for fractional delay
  lerp(buffer, index, length) {
    const i0 = Math.floor(index);
    const i1 = (i0 + 1) % length;
    const frac = index - i0;
    return buffer[i0] * (1 - frac) + buffer[i1] * frac;
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
    const rate = parameters.rate[0];
    const depth = parameters.depth[0];
    const mix = parameters.mix[0];
    const numVoices = Math.floor(parameters.voices[0]);
    const spread = parameters.spread[0];
    const feedback = parameters.feedback[0];

    // LFO increment per sample
    const lfoIncrement = (rate / sampleRate) * 2 * Math.PI;

    // Depth in samples (max ~5ms modulation)
    const depthSamples = depth * 0.005 * sampleRate;

    // Smooth parameters
    this.smoothMix = this.smoothMix * 0.99 + mix * 0.01;
    this.smoothDepth = this.smoothDepth * 0.99 + depthSamples * 0.01;

    for (let i = 0; i < inputL.length; i++) {
      // Write input + feedback to all delay buffers
      const inputWithFeedbackL = inputL[i] + this.feedbackL * feedback;
      const inputWithFeedbackR = inputR[i] + this.feedbackR * feedback;

      for (let v = 0; v < 4; v++) {
        this.delayBuffersL[v][this.writeIndex] = inputWithFeedbackL;
        this.delayBuffersR[v][this.writeIndex] = inputWithFeedbackR;
      }

      // Sum chorus voices
      let chorusL = 0;
      let chorusR = 0;

      for (let v = 0; v < numVoices; v++) {
        // Calculate LFO modulation for this voice
        const lfoValue = Math.sin(this.lfoPhases[v]);

        // Modulated delay time
        const modulatedDelay = this.baseDelays[v] + lfoValue * this.smoothDepth;

        // Read position (with wrapping)
        let readIndexL = this.writeIndex - modulatedDelay;
        let readIndexR = this.writeIndex - modulatedDelay;

        // Slight stereo offset for width
        const stereoOffset = spread * 0.002 * sampleRate * (v % 2 === 0 ? 1 : -1);
        readIndexR += stereoOffset;

        // Wrap indices
        while (readIndexL < 0) readIndexL += this.maxDelaySamples;
        while (readIndexR < 0) readIndexR += this.maxDelaySamples;
        while (readIndexL >= this.maxDelaySamples) readIndexL -= this.maxDelaySamples;
        while (readIndexR >= this.maxDelaySamples) readIndexR -= this.maxDelaySamples;

        // Interpolated read
        const voiceL = this.lerp(this.delayBuffersL[v], readIndexL, this.maxDelaySamples);
        const voiceR = this.lerp(this.delayBuffersR[v], readIndexR, this.maxDelaySamples);

        // Pan voices across stereo field
        const panPos = (v / (numVoices - 1 || 1)) * 2 - 1; // -1 to 1
        const panL = Math.cos((panPos + 1) * Math.PI * 0.25);
        const panR = Math.sin((panPos + 1) * Math.PI * 0.25);

        chorusL += voiceL * panL;
        chorusR += voiceR * panR;

        // Update LFO phase for this voice
        // Slight rate variation per voice for movement
        const rateVariation = 1 + (v * 0.1);
        this.lfoPhases[v] += lfoIncrement * rateVariation;
        if (this.lfoPhases[v] > 2 * Math.PI) {
          this.lfoPhases[v] -= 2 * Math.PI;
        }
      }

      // Normalize by number of voices
      chorusL /= numVoices;
      chorusR /= numVoices;

      // Store for feedback
      this.feedbackL = chorusL;
      this.feedbackR = chorusR;

      // Mix dry/wet
      const dry = 1 - this.smoothMix;
      const wet = this.smoothMix;
      outputL[i] = inputL[i] * dry + chorusL * wet;
      outputR[i] = inputR[i] * dry + chorusR * wet;

      // Advance write index
      this.writeIndex++;
      if (this.writeIndex >= this.maxDelaySamples) {
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('echo-chorus-processor', EchoChorusProcessor);
