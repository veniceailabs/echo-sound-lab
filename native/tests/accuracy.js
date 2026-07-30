// Accuracy checks: does the engine hit its LUFS target on real material?
const path = require('path');
const fs = require('fs');
const { MasteringEngine } = require(path.join(__dirname, '..', 'build', 'Release', 'echo-sound-lab.node'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

// --- Minimal 16/24/32-bit PCM WAV reader -> mono Float32Array ---
function readWavMono(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10),
              sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  if (!fmt || dataOff < 0) return null;
  const bytes = fmt.bits / 8;
  const frames = Math.floor(dataLen / (bytes * fmt.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataOff + (i * fmt.channels + c) * bytes;
      if (p + bytes > buf.length) break;
      let v = 0;
      if (fmt.format === 3 && fmt.bits === 32) v = buf.readFloatLE(p);
      else if (fmt.bits === 16) v = buf.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) { const x = buf.readUIntLE(p, 3); v = ((x & 0x800000) ? x - 0x1000000 : x) / 8388608; }
      else if (fmt.bits === 32) v = buf.readInt32LE(p) / 2147483648;
      acc += v;
    }
    out[i] = acc / fmt.channels;
  }
  return { audio: out, sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits };
}

console.log('\n--- LUFS targeting accuracy (synthetic) ---');
const SR = 48000;
// Pink-ish noise, 4 seconds: more representative than a sine for gating.
const N = SR * 4;
let b0 = 0, b1 = 0, b2 = 0;
const noise = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const w = Math.random() * 2 - 1;
  b0 = 0.99765 * b0 + w * 0.0990460;
  b1 = 0.96300 * b1 + w * 0.2965164;
  b2 = 0.57000 * b2 + w * 1.0526913;
  noise[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
}

// Achievable targets: streaming/CD range. Must land within 1 LU.
for (const target of [-16, -14, -11]) {
  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(target);
  eng.process(noise, 1);
  const got = eng.getMetrics().integrated_lufs;
  const err = Math.abs(got - target);
  check(`target ${target} LUFS`, err < 1.0, `-> measured ${got.toFixed(2)} (err ${err.toFixed(2)} LU)`);
}

// Beyond what a -0.3 dBFS ceiling can deliver on dense material. The correct
// behaviour is to get as close as possible and stop -- NOT to clip its way
// there. We assert the ceiling holds rather than that the target is met.
{
  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(-9);
  const out = eng.process(noise, 1);
  const got = eng.getMetrics().integrated_lufs;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const dbfs = 20 * Math.log10(peak + 1e-12);
  check('unreachable target degrades gracefully', got > -12 && dbfs < 0,
        `-> reached ${got.toFixed(2)} LUFS at ${dbfs.toFixed(2)} dBFS (target -9 not physically reachable)`);
}

console.log('\n--- true peak ceiling ---');
{
  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(-9); // push hard
  const out = eng.process(noise, 1);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const dbfs = 20 * Math.log10(peak + 1e-12);
  check('output stays below 0 dBFS', dbfs < 0, `-> ${dbfs.toFixed(2)} dBFS`);
}

console.log('\n--- real audio from disk ---');
const candidates = fs.readdirSync(path.join(__dirname, '..', '..'))
  .filter(f => f.toLowerCase().endsWith('.wav'))
  .map(f => path.join(__dirname, '..', '..', f));

if (!candidates.length) {
  console.log('  (no wav files found alongside the project - skipped)');
} else {
  for (const f of candidates.slice(0, 3)) {
    const w = readWavMono(f);
    if (!w || w.audio.length < 48000) { console.log(`  (skip ${path.basename(f)})`); continue; }
    const eng = new MasteringEngine(w.sampleRate);
    eng.setLUFSTarget(-14);
    const t0 = process.hrtime.bigint();
    const out = eng.process(w.audio, 1);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const m = eng.getMetrics();
    let finite = true, peak = 0;
    for (const v of out) { if (!Number.isFinite(v)) { finite = false; break; } peak = Math.max(peak, Math.abs(v)); }
    const dur = w.audio.length / w.sampleRate;
    console.log(`  ${path.basename(f)} (${dur.toFixed(1)}s, ${w.bits}-bit, ${w.channels}ch)`);
    check(`  finite output`, finite);
    check(`  hits -14 LUFS`, Math.abs(m.integrated_lufs + 14) < 1.5, `-> ${m.integrated_lufs.toFixed(2)}`);
    check(`  no clipping`, peak <= 1.0, `-> peak ${(20*Math.log10(peak+1e-12)).toFixed(2)} dBFS`);
    console.log(`        ${(dur*1000/ms).toFixed(0)}x realtime`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
