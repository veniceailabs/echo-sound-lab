#!/usr/bin/env node
// Master a WAV file with the native engine.
//   node master.js in.wav [out.wav] [--lufs -14] [--ceiling -0.3] [--sat 0.2]
const path = require('path');
const { MasteringEngine } = require(path.join(__dirname, 'build', 'Release', 'echo-sound-lab.node'));
const { readWav, writeWav } = require('./lib/wav');

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('-')) {
  console.error('usage: node master.js <in.wav> [out.wav] [--lufs -14] [--ceiling -0.3] [--sat 0.2] [--bits 24]');
  process.exit(1);
}
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? parseFloat(args[i + 1]) : def; };
const input = args[0];
const output = (args[1] && !args[1].startsWith('-')) ? args[1]
  : input.replace(/\.wav$/i, '') + '_mastered.wav';
const targetLufs = flag('lufs', -14);
const ceiling = flag('ceiling', -0.3);
const sat = flag('sat', 0);
const outBits = flag('bits', 24);
if (outBits !== 16 && outBits !== 24) {
  console.error('--bits must be 16 or 24');
  process.exit(1);
}

const src = readWav(input);
console.log(`in   : ${path.basename(input)}  ${(src.frames / src.sampleRate).toFixed(1)}s  ${src.sampleRate}Hz  ${src.channels}ch  ${src.bits}-bit`);

const t0 = process.hrtime.bigint();
const eng = new MasteringEngine(src.sampleRate);
eng.setLUFSTarget(targetLufs);
eng.setLimiterThreshold(ceiling);
if (sat > 0) eng.setSaturation(sat, 1.0);

let outPlanes;
if (src.channels === 2) {
  // Stereo goes through the linked path: BS.1770 channel-summed loudness, one
  // shared makeup gain, stereo-linked compression and limiting. Running the
  // two channels independently would mis-report loudness by ~3 LU and move the
  // stereo image around.
  outPlanes = eng.processStereo(src.planes[0], src.planes[1]);
} else if (src.channels === 1) {
  outPlanes = [eng.process(src.planes[0], 1)];
} else {
  console.error(`unsupported channel count: ${src.channels} (mono and stereo only)`);
  process.exit(1);
}
const metrics = eng.getMetrics();
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

writeWav(output, outPlanes, src.sampleRate, outBits);

let peak = 0;
for (const pl of outPlanes) for (const v of pl) peak = Math.max(peak, Math.abs(v));
console.log(`out  : ${path.basename(output)}  ${outBits}-bit${outBits === 16 ? ' (TPDF dither + noise shaping)' : ''}`);
console.log(`LUFS : ${metrics.integrated_lufs.toFixed(2)} (target ${targetLufs})`);
console.log(`peak : ${(20 * Math.log10(peak + 1e-12)).toFixed(2)} dBFS sample / ${metrics.true_peak_dbfs.toFixed(2)} dBTP (ceiling ${ceiling})`);
console.log(`LRA  : ${metrics.loudness_range.toFixed(2)} LU`);
console.log(`time : ${(ms / 1000).toFixed(2)}s  (${((src.frames / src.sampleRate) * 1000 / ms).toFixed(0)}x realtime)`);
