/**
 * Echo Reverb Processor - AudioWorklet
 * Freeverb-style algorithmic reverb with early reflections
 */

class EchoReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'roomSize', defaultValue: 0.5, minValue: 0.1, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 2.0, minValue: 0.1, maxValue: 10.0, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'predelay', defaultValue: 20, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'width', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // Freeverb tuning constants (in samples at 44.1kHz, scaled to current rate)
    const scaleFactor = sampleRate / 44100;

    // Comb filter delays (8 parallel comb filters per channel)
    this.combDelays = [
      1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617
    ].map(d => Math.floor(d * scaleFactor));

    // Allpass filter delays (4 series allpass filters per channel)
    this.allpassDelays = [
      556, 441, 341, 225
    ].map(d => Math.floor(d * scaleFactor));

    // Stereo spread
    this.stereoSpread = Math.floor(23 * scaleFactor);

    // Initialize comb filters (left and right)
    this.combBuffersL = this.combDelays.map(d => new Float32Array(d));
    this.combBuffersR = this.combDelays.map(d => new Float32Array(d + this.stereoSpread));
    this.combIndexL = this.combDelays.map(() => 0);
    this.combIndexR = this.combDelays.map(() => 0);
    this.combFilterStoreL = new Float32Array(8);
    this.combFilterStoreR = new Float32Array(8);

    // Initialize allpass filters
    this.allpassBuffersL = this.allpassDelays.map(d => new Float32Array(d));
    this.allpassBuffersR = this.allpassDelays.map(d => new Float32Array(d + this.stereoSpread));
    this.allpassIndexL = this.allpassDelays.map(() => 0);
    this.allpassIndexR = this.allpassDelays.map(() => 0);

    // Predelay buffer (max 100ms)
    this.maxPredelay = Math.ceil(sampleRate * 0.1);
    this.predelayBufferL = new Float32Array(this.maxPredelay);
    this.predelayBufferR = new Float32Array(this.maxPredelay);
    this.predelayIndex = 0;

    // Smoothed parameters
    this.smoothMix = 0.25;
  }

  processComb(input, buffer, index, filterStore, feedback, damp) {
    const output = buffer[index];
    filterStore = output + (filterStore - output) * damp;
    buffer[index] = input + filterStore * feedback;
    return output;
  }

  processAllpass(input, buffer, index, feedback = 0.5) {
    const bufOut = buffer[index];
    const output = -input + bufOut;
    buffer[index] = input + bufOut * feedback;
    return output;
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
    const roomSize = parameters.roomSize[0];
    const decay = parameters.decay[0];
    const damping = parameters.damping[0];
    const predelayMs = parameters.predelay[0];
    const mix = parameters.mix[0];
    const width = parameters.width[0];

    // Calculate derived values
    const feedback = 0.7 + roomSize * 0.28; // 0.7 to 0.98
    const damp = damping * 0.4; // Scale damping
    const predelaySamples = Math.floor((predelayMs / 1000) * sampleRate);

    // Smooth mix
    this.smoothMix = this.smoothMix * 0.99 + mix * 0.01;

    for (let i = 0; i < inputL.length; i++) {
      // Read from predelay
      let readIdx = this.predelayIndex - predelaySamples;
      if (readIdx < 0) readIdx += this.maxPredelay;

      const predelayedL = this.predelayBufferL[readIdx];
      const predelayedR = this.predelayBufferR[readIdx];

      // Write to predelay
      this.predelayBufferL[this.predelayIndex] = inputL[i];
      this.predelayBufferR[this.predelayIndex] = inputR[i];
      this.predelayIndex++;
      if (this.predelayIndex >= this.maxPredelay) this.predelayIndex = 0;

      // Mix input to mono for reverb input
      const reverbInput = (predelayedL + predelayedR) * 0.5;

      // Process comb filters in parallel
      let combOutL = 0;
      let combOutR = 0;

      for (let c = 0; c < 8; c++) {
        // Left channel
        const combL = this.processComb(
          reverbInput,
          this.combBuffersL[c],
          this.combIndexL[c],
          this.combFilterStoreL[c],
          feedback,
          damp
        );
        this.combFilterStoreL[c] = combL;
        this.combIndexL[c]++;
        if (this.combIndexL[c] >= this.combBuffersL[c].length) this.combIndexL[c] = 0;
        combOutL += combL;

        // Right channel (with stereo spread)
        const combR = this.processComb(
          reverbInput,
          this.combBuffersR[c],
          this.combIndexR[c],
          this.combFilterStoreR[c],
          feedback,
          damp
        );
        this.combFilterStoreR[c] = combR;
        this.combIndexR[c]++;
        if (this.combIndexR[c] >= this.combBuffersR[c].length) this.combIndexR[c] = 0;
        combOutR += combR;
      }

      // Scale comb output
      combOutL *= 0.125;
      combOutR *= 0.125;

      // Process allpass filters in series
      let allpassOutL = combOutL;
      let allpassOutR = combOutR;

      for (let a = 0; a < 4; a++) {
        allpassOutL = this.processAllpass(
          allpassOutL,
          this.allpassBuffersL[a],
          this.allpassIndexL[a]
        );
        this.allpassIndexL[a]++;
        if (this.allpassIndexL[a] >= this.allpassBuffersL[a].length) this.allpassIndexL[a] = 0;

        allpassOutR = this.processAllpass(
          allpassOutR,
          this.allpassBuffersR[a],
          this.allpassIndexR[a]
        );
        this.allpassIndexR[a]++;
        if (this.allpassIndexR[a] >= this.allpassBuffersR[a].length) this.allpassIndexR[a] = 0;
      }

      // Stereo width processing
      const wet1 = allpassOutL;
      const wet2 = allpassOutR;
      const wetL = wet1 + (wet2 - wet1) * (1 - width) * 0.5;
      const wetR = wet2 + (wet1 - wet2) * (1 - width) * 0.5;

      // Mix dry/wet
      const dry = 1 - this.smoothMix;
      const wet = this.smoothMix;
      outputL[i] = inputL[i] * dry + wetL * wet;
      outputR[i] = inputR[i] * dry + wetR * wet;
    }

    return true;
  }
}

registerProcessor('echo-reverb-processor', EchoReverbProcessor);
