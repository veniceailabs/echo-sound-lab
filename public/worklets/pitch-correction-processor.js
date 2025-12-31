class SimplePitchShifter {
  constructor(bufferSize, grainSize) {
    this.bufferSize = bufferSize;
    this.grainSize = grainSize;
    this.buffer = new Float32Array(bufferSize);
    this.writeIndex = 0;
    this.readIndexA = 0;
    this.readIndexB = Math.floor(bufferSize / 2);
    this.fade = 0;
    this.delay = Math.floor(bufferSize / 2);
  }

  reset() {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.readIndexA = 0;
    this.readIndexB = Math.floor(this.bufferSize / 2);
    this.fade = 0;
  }

  readInterp(index) {
    const i0 = Math.floor(index) % this.bufferSize;
    const i1 = (i0 + 1) % this.bufferSize;
    const frac = index - Math.floor(index);
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  processSample(input, ratio) {
    this.buffer[this.writeIndex] = input;

    const sampleA = this.readInterp(this.readIndexA);
    const sampleB = this.readInterp(this.readIndexB);
    const output = sampleA * (1 - this.fade) + sampleB * this.fade;

    this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
    this.readIndexA = (this.readIndexA + ratio) % this.bufferSize;
    this.readIndexB = (this.readIndexB + ratio) % this.bufferSize;

    this.fade += 1 / this.grainSize;
    if (this.fade >= 1) {
      this.fade -= 1;
      this.readIndexA = (this.writeIndex - this.delay + this.bufferSize) % this.bufferSize;
      this.readIndexB = (this.readIndexA + Math.floor(this.grainSize / 2)) % this.bufferSize;
    }

    return output;
  }
}

function yinPitch(buffer, sampleRate) {
  const size = buffer.length;
  const half = Math.floor(size / 2);
  const diff = new Float32Array(half);
  const cmndf = new Float32Array(half);

  for (let tau = 1; tau < half; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] * tau / (runningSum || 1);
  }

  const threshold = 0.15;
  for (let tau = 2; tau < half; tau++) {
    if (cmndf[tau] < threshold && cmndf[tau] < cmndf[tau - 1]) {
      const betterTau = tau + 1 < half && cmndf[tau + 1] < cmndf[tau] ? tau + 1 : tau;
      return sampleRate / betterTau;
    }
  }

  return 0;
}

function quantizeFrequency(freq, mode, keyIndex, scaleIndex) {
  if (!freq || freq <= 0) return 0;

  const note = 69 + 12 * Math.log2(freq / 440);
  let targetNote = Math.round(note);

  if (mode === 'scale' && keyIndex !== null && scaleIndex !== null) {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const minor = [0, 2, 3, 5, 7, 8, 10];
    const scale = scaleIndex === 1 ? major : scaleIndex === 2 ? minor : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const baseOctave = Math.floor(targetNote / 12) * 12;
    let closest = targetNote;
    let bestDistance = Infinity;
    for (let octaveOffset = -1; octaveOffset <= 1; octaveOffset++) {
      for (const interval of scale) {
        const candidate = baseOctave + interval + keyIndex + octaveOffset * 12;
        const distance = Math.abs(candidate - note);
        if (distance < bestDistance) {
          bestDistance = distance;
          closest = candidate;
        }
      }
    }
    targetNote = closest;
  }

  return 440 * Math.pow(2, (targetNote - 69) / 12);
}

class PitchCorrectionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'strength', defaultValue: 15, minValue: 0, maxValue: 100 },
      { name: 'retuneSpeed', defaultValue: 70, minValue: 0, maxValue: 100 },
      { name: 'humanize', defaultValue: 80, minValue: 0, maxValue: 100 },
      { name: 'formantPreserve', defaultValue: 1, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.analysisSize = 1024;
    this.analysisBuffer = new Float32Array(this.analysisSize);
    this.analysisIndex = 0;
    this.detectedFreq = 0;
    this.currentRatio = 1;
    this.mode = 'chromatic';
    this.keyIndex = null;
    this.scaleIndex = null;
    this.shifters = [
      new SimplePitchShifter(1024, 256),
      new SimplePitchShifter(1024, 256),
    ];

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'config') {
        this.mode = event.data.mode || 'chromatic';
        this.keyIndex = event.data.key;
        this.scaleIndex = event.data.scale;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const enabled = (parameters.enabled.length ? parameters.enabled[0] : 0) > 0.5;
    if (!enabled) {
      for (let ch = 0; ch < output.length; ch++) {
        if (input[ch]) {
          output[ch].set(input[ch]);
        } else {
          output[ch].fill(0);
        }
      }
      return true;
    }

    const strength = (parameters.strength.length ? parameters.strength[0] : 15) / 100;
    const retuneSpeed = (parameters.retuneSpeed.length ? parameters.retuneSpeed[0] : 70) / 100;
    const humanize = (parameters.humanize.length ? parameters.humanize[0] : 80) / 100;

    for (let i = 0; i < input[0].length; i++) {
      const monoSample = input.length > 1 ? (input[0][i] + input[1][i]) * 0.5 : input[0][i];
      this.analysisBuffer[this.analysisIndex++] = monoSample;
      if (this.analysisIndex >= this.analysisSize) {
        this.detectedFreq = yinPitch(this.analysisBuffer, this.sampleRate);
        this.analysisIndex = 0;
      }

      let ratio = 1;
      if (this.detectedFreq > 0) {
        const targetFreq = quantizeFrequency(this.detectedFreq, this.mode, this.keyIndex, this.scaleIndex);
        if (targetFreq > 0) {
          const rawRatio = targetFreq / this.detectedFreq;
          const humanizeScale = 1 - humanize * 0.5;
          ratio = 1 + (rawRatio - 1) * strength * humanizeScale;
        }
      }

      if (ratio < 0.5) ratio = 0.5;
      if (ratio > 2) ratio = 2;

      const smoothing = Math.max(0.02, 1 - retuneSpeed);
      this.currentRatio += (ratio - this.currentRatio) * smoothing;

      for (let ch = 0; ch < output.length; ch++) {
        const sourceSample = input[ch] ? input[ch][i] : monoSample;
        output[ch][i] = this.shifters[ch].processSample(sourceSample, this.currentRatio);
      }
    }

    return true;
  }
}

registerProcessor('pitch-correction-processor', PitchCorrectionProcessor);
