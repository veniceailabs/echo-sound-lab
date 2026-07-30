#!/usr/bin/env node
// Process a vocal take through the native vocal chain.
//   node vocal.js in.wav [out.wav] [--preset modern|natural|aggressive] [--deess -28] [--blend 0.2]
const path = require('path');
const { VocalChain } = require(path.join(__dirname, 'build', 'Release', 'echo-sound-lab.node'));
const { readWav, writeWav } = require('./lib/wav');

const PRESETS = {
  // Controlled and forward: tight dynamics, present top. General-purpose modern vocal.
  modern: { highpassHz: 90, deessThresholdDb: -28, deessRatio: 5, deessRangeDb: 10,
            comp1ThresholdDb: -18, comp1Ratio: 4, comp1AttackMs: 1, comp1ReleaseMs: 60,
            comp2ThresholdDb: -24, comp2Ratio: 2.5, comp2AttackMs: 25, comp2ReleaseMs: 300,
            saturationAmount: 0.15, presenceGainDb: 2.5, airGainDb: 2, parallelBlend: 0.15 },
  // Lighter hand: keeps more of the original dynamic performance.
  natural: { highpassHz: 75, deessThresholdDb: -24, deessRatio: 3, deessRangeDb: 6,
             comp1ThresholdDb: -14, comp1Ratio: 2.5, comp1AttackMs: 5, comp1ReleaseMs: 100,
             comp2ThresholdDb: -20, comp2Ratio: 2, comp2AttackMs: 40, comp2ReleaseMs: 400,
             saturationAmount: 0.08, presenceGainDb: 1.5, airGainDb: 1.5, parallelBlend: 0 },
  // Dense and upfront: heavy parallel blend, hard levelling.
  aggressive: { highpassHz: 100, deessThresholdDb: -32, deessRatio: 6, deessRangeDb: 12,
                comp1ThresholdDb: -22, comp1Ratio: 6, comp1AttackMs: 0.5, comp1ReleaseMs: 40,
                comp2ThresholdDb: -28, comp2Ratio: 3, comp2AttackMs: 15, comp2ReleaseMs: 250,
                saturationAmount: 0.25, presenceGainDb: 3.5, airGainDb: 2.5, parallelBlend: 0.35 },
};

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('-')) {
  console.error('usage: node vocal.js <in.wav> [out.wav] [--preset modern|natural|aggressive] [--deess dB] [--blend 0-1]');
  console.error('presets: ' + Object.keys(PRESETS).join(', '));
  process.exit(1);
}
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? parseFloat(args[i + 1]) : d; };
const strFlag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const input = args[0];
const output = (args[1] && !args[1].startsWith('-')) ? args[1] : input.replace(/\.wav$/i, '') + '_vox.wav';
const presetName = strFlag('preset', 'modern');
if (!PRESETS[presetName]) { console.error(`unknown preset: ${presetName}`); process.exit(1); }

const settings = { ...PRESETS[presetName] };
const deess = flag('deess', null); if (deess !== null) settings.deessThresholdDb = deess;
const blend = flag('blend', null); if (blend !== null) settings.parallelBlend = blend;

const src = readWav(input);
console.log(`in    : ${path.basename(input)}  ${(src.frames / src.sampleRate).toFixed(1)}s  ${src.sampleRate}Hz  ${src.channels}ch`);
console.log(`preset: ${presetName}`);

const t0 = process.hrtime.bigint();
// Each channel gets its own chain instance -- filter and envelope state must
// not be shared across channels.
const outPlanes = src.planes.map(p => {
  const chain = new VocalChain(src.sampleRate);
  chain.setSettings(settings);
  return chain.process(p);
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

writeWav(output, outPlanes, src.sampleRate, 24);

let peak = 0;
for (const pl of outPlanes) for (const v of pl) peak = Math.max(peak, Math.abs(v));
console.log(`out   : ${path.basename(output)}  24-bit`);
console.log(`peak  : ${(20 * Math.log10(peak + 1e-12)).toFixed(2)} dBFS`);
console.log(`time  : ${(ms / 1000).toFixed(2)}s  (${((src.frames / src.sampleRate) * 1000 / ms).toFixed(0)}x realtime)`);
