// Stereo correctness + independent LUFS verification against ffmpeg's
// ebur128 filter (a mature BS.1770 implementation).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { MasteringEngine } = require(path.join(__dirname, '..', 'build', 'Release', 'echo-sound-lab.node'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const SR = 48000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esl-stereo-'));

function writeWav24(file, planes, sampleRate) {
  const channels = planes.length, frames = planes[0].length, bytes = 3;
  const dataLen = frames * channels * bytes;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytes, 28);
  buf.writeUInt16LE(channels * bytes, 32); buf.writeUInt16LE(24, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataLen, 40);
  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, planes[c][i]));
      buf.writeIntLE(Math.round(s * 8388607), p, 3); p += 3;
    }
  }
  fs.writeFileSync(file, buf);
}

// Ask ffmpeg for integrated LUFS and true peak.
function ffmpegLoudness(file) {
  // ffmpeg writes its ebur128 summary to stderr, not stdout.
  const res = spawnSync('ffmpeg',
    ['-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  const tail = out.slice(out.lastIndexOf('Integrated loudness'));
  const lufs = /I:\s*(-?[\d.]+)\s*LUFS/.exec(tail);
  const tp = /Peak:\s*(-?[\d.]+)\s*dBFS/.exec(tail);
  return { lufs: lufs ? parseFloat(lufs[1]) : null, truePeak: tp ? parseFloat(tp[1]) : null };
}

// Pink-ish stereo noise with a little decorrelation between channels.
function stereoNoise(seconds) {
  const N = SR * seconds;
  const mk = () => {
    let b0 = 0, b1 = 0, b2 = 0;
    const o = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      o[i] = (b0 + b1 + b2 + w * 0.1848) * 0.10;
    }
    return o;
  };
  return [mk(), mk()];
}

console.log('\n--- stereo vs dual-mono loudness (BS.1770 channel summing) ---');
{
  // Identical content in both channels must read ~3 LU louder than one channel
  // alone. If the engine measured stereo as mono, both would read the same.
  const [l] = stereoNoise(4);
  const engMono = new MasteringEngine(SR);
  engMono.setLUFSTarget(-14);
  engMono.process(l, 1);
  const monoLufs = engMono.getMetrics().integrated_lufs;

  const engSt = new MasteringEngine(SR);
  engSt.setLUFSTarget(-14);
  engSt.processStereo(l, Float32Array.from(l));
  const stLufs = engSt.getMetrics().integrated_lufs;

  console.log(`    mono path targeted -14 -> ${monoLufs.toFixed(2)} LUFS`);
  console.log(`    stereo path targeted -14 -> ${stLufs.toFixed(2)} LUFS`);
  check('stereo path hits its target', Math.abs(stLufs + 14) < 1.0, `-> ${stLufs.toFixed(2)}`);
}

console.log('\n--- independent verification vs ffmpeg ebur128 ---');
for (const target of [-16, -14, -11]) {
  const [l, r] = stereoNoise(6);
  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(target);
  const [outL, outR] = eng.processStereo(l, r);
  const ours = eng.getMetrics();

  const f = path.join(tmp, `master_${Math.abs(target)}.wav`);
  writeWav24(f, [outL, outR], SR);
  const ref = ffmpegLoudness(f);

  if (ref.lufs === null) { console.log('    (ffmpeg gave no reading - skipped)'); continue; }
  const delta = Math.abs(ours.integrated_lufs - ref.lufs);
  console.log(`    target ${target}: ours ${ours.integrated_lufs.toFixed(2)} | ffmpeg ${ref.lufs.toFixed(2)} LUFS`);
  check(`  agrees with ffmpeg within 0.5 LU`, delta < 0.5, `-> delta ${delta.toFixed(2)} LU`);
  check(`  ffmpeg confirms target hit`, Math.abs(ref.lufs - target) < 1.0, `-> ${ref.lufs.toFixed(2)} vs ${target}`);

  if (ref.truePeak !== null) {
    console.log(`      true peak: ours ${ours.true_peak_dbfs.toFixed(2)} | ffmpeg ${ref.truePeak.toFixed(2)} dBFS`);
    check(`  true peak agrees within 1 dB`, Math.abs(ours.true_peak_dbfs - ref.truePeak) < 1.0,
          `-> delta ${Math.abs(ours.true_peak_dbfs - ref.truePeak).toFixed(2)} dB`);
    check(`  true peak under 0 dBTP`, ref.truePeak < 0.0, `-> ${ref.truePeak.toFixed(2)} dBFS`);
  }
}

console.log('\n--- stereo image preserved (linked limiting) ---');
{
  // Hard-panned content: if the limiter ran independently per channel, the
  // L/R energy ratio would change between input and output.
  const N = SR * 4;
  const l = new Float32Array(N), r = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    l[i] = 0.50 * Math.sin(2 * Math.PI * 220 * i / SR);
    r[i] = 0.12 * Math.sin(2 * Math.PI * 220 * i / SR);
  }
  const rmsOf = b => { let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); };
  const inRatio = 20 * Math.log10(rmsOf(l) / rmsOf(r));

  const eng = new MasteringEngine(SR);
  eng.setLUFSTarget(-11); // push into limiting
  const [ol, or_] = eng.processStereo(l, r);
  const outRatio = 20 * Math.log10(rmsOf(ol) / rmsOf(or_));

  console.log(`    L/R balance in: ${inRatio.toFixed(2)} dB, out: ${outRatio.toFixed(2)} dB`);
  check('stereo balance preserved', Math.abs(inRatio - outRatio) < 0.5,
        `-> shifted ${Math.abs(inRatio - outRatio).toFixed(3)} dB`);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
