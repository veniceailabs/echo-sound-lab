// Verifies the multiband crossover actually splits and reconstructs.
// Runs against the exported MasteringEngine with all other stages neutralised
// as far as the public API allows, plus a direct band-isolation probe.
const path = require('path');
const { MasteringEngine } = require(path.join(__dirname, '..', 'build', 'Release', 'echo-sound-lab.node'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const SR = 48000;
const N = SR * 2;

// Measure RMS of a sine at `freq` after passing through the engine, relative
// to its input RMS. With compression thresholds well below the signal we can
// at least confirm energy is preserved across the spectrum rather than
// notched out at crossover points.
function rms(buf) {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

function sine(freq, amp = 0.05) {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) b[i] = amp * Math.sin(2 * Math.PI * freq * i / SR);
  return b;
}

console.log('\n--- crossover reconstruction across the spectrum ---');
// A correct LR4 tree sums back to flat magnitude. A broken/absent crossover
// (or one with a notch at the split points) shows up as level dips exactly at
// 250 / 2000 / 8000 Hz -- the configured band edges.
const probes = [60, 150, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000];
const responses = [];
for (const f of probes) {
  const input = sine(f);
  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(-14);
  const out = eng.process(input, 1);
  // Normalise out the engine's loudness targeting by comparing shape, not
  // absolute level: record RMS, then compare the spread across probes.
  responses.push({ f, db: 20 * Math.log10(rms(out) / rms(input) + 1e-12) });
}
for (const r of responses) console.log(`    ${String(r.f).padStart(5)} Hz : ${r.db >= 0 ? '+' : ''}${r.db.toFixed(2)} dB`);

// The engine normalises loudness, so absolute gain varies; what matters is
// that no probe collapses relative to its neighbours (a crossover notch).
const dbs = responses.map(r => r.db);
const median = [...dbs].sort((a, b) => a - b)[Math.floor(dbs.length / 2)];
let worstDip = 0, worstFreq = 0;
for (const r of responses) {
  const dip = median - r.db;
  if (dip > worstDip) { worstDip = dip; worstFreq = r.f; }
}
check('no crossover notch', worstDip < 6,
      `-> worst dip ${worstDip.toFixed(2)} dB at ${worstFreq} Hz (vs median)`);

console.log('\n--- band edges are not specially attenuated ---');
// Specifically compare each configured crossover frequency against the
// midpoint of its neighbouring bands.
const at = f => responses.find(r => r.f === f).db;
check('250 Hz edge intact', Math.abs(at(250) - (at(150) + at(500)) / 2) < 6,
      `-> ${at(250).toFixed(2)} dB vs neighbours ${((at(150) + at(500)) / 2).toFixed(2)} dB`);
check('2 kHz edge intact', Math.abs(at(2000) - (at(1000) + at(4000)) / 2) < 6,
      `-> ${at(2000).toFixed(2)} dB vs neighbours ${((at(1000) + at(4000)) / 2).toFixed(2)} dB`);
check('8 kHz edge intact', Math.abs(at(8000) - (at(4000) + at(12000)) / 2) < 6,
      `-> ${at(8000).toFixed(2)} dB vs neighbours ${((at(4000) + at(12000)) / 2).toFixed(2)} dB`);

console.log('\n--- multiband behaviour: loud bass must not duck the highs ---');
// This is the defining property of multiband vs full-band compression. A
// full-band compressor (or four stacked ones) pumps the entire spectrum when
// bass hits. A true multiband leaves the high band largely alone.
{
  const hf = 6000, lf = 80;
  const quietBass = new Float32Array(N);
  const loudBass = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const h = 0.05 * Math.sin(2 * Math.PI * hf * i / SR);
    quietBass[i] = h + 0.01 * Math.sin(2 * Math.PI * lf * i / SR);
    loudBass[i] = h + 0.60 * Math.sin(2 * Math.PI * lf * i / SR);
  }

  // Isolate the HF content of each output with a crude Goertzel at hf.
  function toneLevel(buf, freq) {
    const w = 2 * Math.PI * freq / SR;
    let re = 0, im = 0;
    for (let i = 0; i < buf.length; i++) { re += buf[i] * Math.cos(w * i); im += buf[i] * Math.sin(w * i); }
    return 2 * Math.sqrt(re * re + im * im) / buf.length;
  }

  // Disable loudness normalisation's influence by using the same target and
  // comparing the HF tone's level relative to the input HF tone.
  const engQ = new MasteringEngine(SR); engQ.setLUFSTarget(-14);
  const engL = new MasteringEngine(SR); engL.setLUFSTarget(-14);
  const outQ = engQ.process(quietBass, 1);
  const outL = engL.process(loudBass, 1);

  const hfQ = 20 * Math.log10(toneLevel(outQ, hf) / toneLevel(quietBass, hf) + 1e-12);
  const hfL = 20 * Math.log10(toneLevel(outL, hf) / toneLevel(loudBass, hf) + 1e-12);
  const ducking = hfQ - hfL;
  console.log(`    HF gain w/ quiet bass: ${hfQ.toFixed(2)} dB`);
  console.log(`    HF gain w/ loud  bass: ${hfL.toFixed(2)} dB`);
  console.log(`    -> HF ducked by ${ducking.toFixed(2)} dB when bass got loud`);
  // Loudness normalisation alone will pull the level down when bass is loud,
  // so allow a generous margin; a full-band chain ducks far harder.
  check('bass does not pump the high band excessively', ducking < 25,
        `-> ${ducking.toFixed(2)} dB`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
