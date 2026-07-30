// Vocal chain: proves the de-esser actually targets sibilance and that the
// compressors reduce dynamic range without destroying the signal.
const path = require('path');
const { VocalChain } = require(path.join(__dirname, '..', 'build', 'Release', 'echo-sound-lab.node'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const SR = 48000;

// Energy at a frequency, via Goertzel-style correlation.
function toneLevel(buf, freq, from = 0, to = buf.length) {
  const w = 2 * Math.PI * freq / SR;
  let re = 0, im = 0;
  for (let i = from; i < to; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); }
  const n = to - from;
  return 2 * Math.sqrt(re * re + im * im) / n;
}
function rms(buf, from = 0, to = buf.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / (to - from));
}
const db = x => 20 * Math.log10(x + 1e-12);

// A crude "vocal": a 200 Hz fundamental running throughout, with a burst of
// 7 kHz sibilance in the middle third (the "s").
function makeVocal() {
  const N = SR * 3;
  const b = new Float32Array(N);
  const sibStart = Math.floor(N / 3), sibEnd = Math.floor(2 * N / 3);
  for (let i = 0; i < N; i++) {
    let v = 0.20 * Math.sin(2 * Math.PI * 200 * i / SR)
          + 0.08 * Math.sin(2 * Math.PI * 400 * i / SR);
    if (i >= sibStart && i < sibEnd) {
      v += 0.35 * Math.sin(2 * Math.PI * 7000 * i / SR);
    }
    b[i] = v;
  }
  return { buf: b, sibStart, sibEnd, N };
}

console.log('\n--- de-esser targets sibilance, not the vowel ---');
{
  const { buf, sibStart, sibEnd, N } = makeVocal();

  const off = new VocalChain(SR);
  off.setSettings({ deesserEnabled: false, comp1Enabled: false, comp2Enabled: false,
                    saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const dry = off.process(buf);

  const on = new VocalChain(SR);
  on.setSettings({ deesserEnabled: true, deessFreqHz: 6000, deessThresholdDb: -30,
                   deessRatio: 6, deessRangeDb: 18,
                   comp1Enabled: false, comp2Enabled: false,
                   saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const wet = on.process(buf);

  // Sibilance band during the "s"
  const sibDry = db(toneLevel(dry, 7000, sibStart, sibEnd));
  const sibWet = db(toneLevel(wet, 7000, sibStart, sibEnd));
  const sibReduction = sibDry - sibWet;

  // Fundamental during the same window - must survive
  const fundDry = db(toneLevel(dry, 200, sibStart, sibEnd));
  const fundWet = db(toneLevel(wet, 200, sibStart, sibEnd));
  const fundLoss = fundDry - fundWet;

  console.log(`    7 kHz during "s": ${sibDry.toFixed(2)} -> ${sibWet.toFixed(2)} dB (reduced ${sibReduction.toFixed(2)} dB)`);
  console.log(`    200 Hz during "s": ${fundDry.toFixed(2)} -> ${fundWet.toFixed(2)} dB (lost ${fundLoss.toFixed(2)} dB)`);

  check('sibilance is reduced', sibReduction > 4, `-> ${sibReduction.toFixed(2)} dB`);
  check('fundamental is preserved', Math.abs(fundLoss) < 1.0, `-> ${fundLoss.toFixed(2)} dB`);
  check('de-esser is frequency-selective', sibReduction > fundLoss + 4,
        `-> ${(sibReduction - fundLoss).toFixed(2)} dB of selectivity`);

  // Outside the sibilance window the de-esser should be essentially inactive.
  const preDry = db(rms(dry, 0, sibStart));
  const preWet = db(rms(wet, 0, sibStart));
  check('non-sibilant passage untouched', Math.abs(preDry - preWet) < 1.0,
        `-> ${(preDry - preWet).toFixed(2)} dB`);
}

console.log('\n--- range limit prevents over-de-essing (lisp guard) ---');
{
  const { buf, sibStart, sibEnd } = makeVocal();
  const limited = new VocalChain(SR);
  limited.setSettings({ deesserEnabled: true, deessFreqHz: 6000, deessThresholdDb: -50,
                        deessRatio: 20, deessRangeDb: 6,
                        comp1Enabled: false, comp2Enabled: false,
                        saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const out = limited.process(buf);

  const raw = new VocalChain(SR);
  raw.setSettings({ deesserEnabled: false, comp1Enabled: false, comp2Enabled: false,
                    saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const dry = raw.process(buf);

  const reduction = db(toneLevel(dry, 7000, sibStart, sibEnd)) - db(toneLevel(out, 7000, sibStart, sibEnd));
  console.log(`    reduction with 6 dB range cap: ${reduction.toFixed(2)} dB`);
  check('reduction respects the range cap', reduction <= 8.0, `-> ${reduction.toFixed(2)} dB (cap 6 dB + envelope slop)`);
}

console.log('\n--- serial compression reduces dynamic range ---');
{
  // Quiet passage then loud passage; compression should narrow the gap.
  const N = SR * 4, half = N / 2;
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const amp = i < half ? 0.05 : 0.5;
    b[i] = amp * Math.sin(2 * Math.PI * 220 * i / SR);
  }

  const dryChain = new VocalChain(SR);
  dryChain.setSettings({ deesserEnabled: false, comp1Enabled: false, comp2Enabled: false,
                         saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const dry = dryChain.process(b);

  const wetChain = new VocalChain(SR);
  wetChain.setSettings({ deesserEnabled: false,
                         comp1Enabled: true, comp1ThresholdDb: -24, comp1Ratio: 4,
                         comp2Enabled: true, comp2ThresholdDb: -30, comp2Ratio: 3,
                         saturationAmount: 0, presenceGainDb: 0, airGainDb: 0 });
  const wet = wetChain.process(b);

  // Compare late in each half so envelopes have settled.
  const dryRange = db(rms(dry, half + SR, N)) - db(rms(dry, SR, half));
  const wetRange = db(rms(wet, half + SR, N)) - db(rms(wet, SR, half));
  console.log(`    quiet->loud span: dry ${dryRange.toFixed(2)} dB, compressed ${wetRange.toFixed(2)} dB`);
  check('dynamic range is reduced', wetRange < dryRange - 3,
        `-> narrowed by ${(dryRange - wetRange).toFixed(2)} dB`);
  check('signal survives compression', rms(wet, half + SR, N) > 0.01);
}

console.log('\n--- output sanity ---');
{
  const { buf } = makeVocal();
  const chain = new VocalChain(SR);
  chain.setSettings({ parallelBlend: 0.3, saturationAmount: 0.2, presenceGainDb: 3, airGainDb: 2 });
  const out = chain.process(buf);

  let finite = true, peak = 0, silent = true;
  for (const v of out) {
    if (!Number.isFinite(v)) { finite = false; break; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a > 1e-6) silent = false;
  }
  check('full chain produces finite output', finite);
  check('full chain output not silent', !silent);
  check('full chain does not explode', peak < 4.0, `-> peak ${peak.toFixed(3)}`);

  const gr = chain.getReduction();
  console.log(`    final GR: deesser ${gr.deesser.toFixed(2)} dB, comp1 ${gr.comp1.toFixed(2)} dB, comp2 ${gr.comp2.toFixed(2)} dB`);
  check('metering reports finite values',
        Number.isFinite(gr.deesser) && Number.isFinite(gr.comp1) && Number.isFinite(gr.comp2));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
