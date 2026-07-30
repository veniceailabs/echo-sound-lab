// Native core smoke test: does the DSP actually process audio correctly?
const path = require('path');
const { MasteringEngine } = require(path.join(__dirname, '..', 'build', 'Release', 'echo-sound-lab.node'));

const SR = 48000;
const N = SR; // 1 second
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

// 1kHz sine at -12 dBFS
const amp = Math.pow(10, -12 / 20);
const sine = new Float32Array(N);
for (let i = 0; i < N; i++) sine[i] = amp * Math.sin(2 * Math.PI * 1000 * i / SR);

const eng = new MasteringEngine(SR);
eng.setLUFSTarget(-14);

console.log('\n--- native mastering core smoke ---');

const out = eng.process(sine, 1);
check('returns Float32Array', out instanceof Float32Array);
check('length preserved', out.length === sine.length, `got ${out.length} want ${sine.length}`);

let finite = true, silent = true, peak = 0;
for (let i = 0; i < out.length; i++) {
  if (!Number.isFinite(out[i])) { finite = false; break; }
  const a = Math.abs(out[i]);
  if (a > 1e-6) silent = false;
  if (a > peak) peak = a;
}
check('no NaN/Inf in output', finite);
check('output is not silent', !silent);
check('output does not clip (peak <= 1.0)', peak <= 1.0, `peak=${peak.toFixed(4)}`);

const m = eng.getMetrics();
console.log('  metrics:', JSON.stringify(m));
check('integrated LUFS is finite', Number.isFinite(m.integrated_lufs), `got ${m.integrated_lufs}`);
check('true peak is finite', Number.isFinite(m.true_peak_dbfs), `got ${m.true_peak_dbfs}`);
check('LUFS in plausible range (-60..0)', m.integrated_lufs > -60 && m.integrated_lufs < 0, `got ${m.integrated_lufs}`);

// silence in -> silence out (no self-noise / denormal blowup)
eng.reset();
const sil = new Float32Array(N);
const silOut = eng.process(sil, 1);
let silPeak = 0;
for (const v of silOut) silPeak = Math.max(silPeak, Math.abs(v));
check('silence in -> silence out', silPeak < 1e-4, `peak=${silPeak}`);

// throughput
eng.reset();
const t0 = process.hrtime.bigint();
const ITER = 50;
for (let i = 0; i < ITER; i++) eng.process(sine, 1);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const xRealtime = (ITER * 1000) / ms;
console.log(`  throughput: ${ms.toFixed(1)}ms for ${ITER}s audio = ${xRealtime.toFixed(0)}x realtime`);
check('faster than realtime', xRealtime > 1);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
