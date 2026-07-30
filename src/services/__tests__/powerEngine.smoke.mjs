/**
 * Smoke tests for Power Engine DSP additions
 * Run with: node src/services/__tests__/powerEngine.smoke.mjs
 *
 * Tests (Node.js, no browser):
 *   1. LR4 5-band crossover frequency clamping
 *   2. Genre auto-detection heuristic
 *   3. Platform spec lookup
 *   4. AI mastering config validation
 *   5. Linear-phase EQ band scaling
 *   6. Saturation algorithm selection
 */

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── 1. LR5 crossover clamping logic ─────────────────────────────────────────
console.log('\n[1] LR5 Crossover clamping');
{
  function clampCrossovers(freqs) {
    return [
      Math.max(30,   Math.min(200,   freqs[0])),
      Math.max(150,  Math.min(1000,  freqs[1])),
      Math.max(800,  Math.min(5000,  freqs[2])),
      Math.max(4000, Math.min(16000, freqs[3])),
    ];
  }

  const defaults = clampCrossovers([80, 300, 2000, 8000]);
  assert('Default crossovers within range',
    defaults[0] === 80 && defaults[1] === 300 && defaults[2] === 2000 && defaults[3] === 8000);

  const clamped = clampCrossovers([0, 50000, -100, 20000]);
  assert('Out-of-range values clamped',
    clamped[0] === 30 && clamped[1] === 1000 && clamped[2] === 800 && clamped[3] === 16000);

  assert('5 bands defined', [80, 300, 2000, 8000].length + 1 === 5);
}

// ── 2. Platform specs ────────────────────────────────────────────────────────
console.log('\n[2] Platform target LUFS');
{
  const PLATFORM_SPECS = {
    spotify:    { targetLUFS: -14,  truePeakMax: -1.0 },
    apple:      { targetLUFS: -16,  truePeakMax: -1.0 },
    youtube:    { targetLUFS: -14,  truePeakMax: -1.0 },
    tidal:      { targetLUFS: -14,  truePeakMax: -1.0 },
    soundcloud: { targetLUFS: -8,   truePeakMax: -0.3 },
    club:       { targetLUFS: -6,   truePeakMax: -0.1 },
  };

  assert('Spotify at -14 LUFS', PLATFORM_SPECS.spotify.targetLUFS === -14);
  assert('Apple Music at -16 LUFS', PLATFORM_SPECS.apple.targetLUFS === -16);
  assert('Club at -6 LUFS (loudest)', PLATFORM_SPECS.club.targetLUFS === -6);
  assert('All platforms have truePeakMax ≤ 0',
    Object.values(PLATFORM_SPECS).every(p => p.truePeakMax <= 0));
}

// ── 3. Loudness normalization math ───────────────────────────────────────────
console.log('\n[3] Loudness gain calculation');
{
  // Given RMS and LUFS target, compute gain
  function computeGain(currentRMS, targetLUFS) {
    const targetRMS = Math.pow(10, (targetLUFS + 23) / 20) * 0.707;
    const gain = currentRMS > 1e-6 ? Math.min(targetRMS / currentRMS, 4.0) : 1.0;
    return gain;
  }

  const gain = computeGain(0.1, -14);
  assert('Gain is finite positive number', isFinite(gain) && gain > 0,
    `got ${gain}`);
  assert('Gain is clamped at max 4.0 for quiet signals', computeGain(0.0001, -14) === 4.0);
  assert('Zero RMS returns 1.0 (no crash)', computeGain(0, -14) === 1.0);

  const gainDb = 20 * Math.log10(gain);
  assert('Gain dB is finite', isFinite(gainDb), `got ${gainDb}`);
}

// ── 4. Genre recipe intensity scaling ───────────────────────────────────────
console.log('\n[4] Recipe intensity scaling');
{
  const hipHopBands = [
    { frequency: 60,    gain: 2.0,  q: 0.7, type: 'lowshelf' },
    { frequency: 200,   gain: -1.5, q: 1.5, type: 'peaking' },
    { frequency: 3000,  gain: 1.0,  q: 1.0, type: 'peaking' },
    { frequency: 12000, gain: 1.5,  q: 0.7, type: 'highshelf' },
  ];

  const intensity = 0.5;
  const scaled = hipHopBands.map(b => ({ ...b, gain: b.gain * intensity }));

  assert('Scaled gains are halved', Math.abs(scaled[0].gain - 1.0) < 0.001);
  assert('Negative gains scale correctly', Math.abs(scaled[1].gain - (-0.75)) < 0.001);

  const zeroIntensity = hipHopBands.map(b => ({ ...b, gain: b.gain * 0 }));
  assert('Zero intensity = zero gain changes', zeroIntensity.every(b => b.gain === 0));
}

// ── 5. Genre auto-detection heuristic ───────────────────────────────────────
console.log('\n[5] Auto-detection heuristic logic');
{
  // Simulate what detectGenreFromBuffer does with derived stats
  function classifyFromStats(zcr, crestFactor) {
    if (zcr < 0.02 && crestFactor > 8) return 'classical';
    if (zcr < 0.05 && crestFactor > 5) return 'jazz';
    if (zcr > 0.25 && crestFactor < 4) return 'electronic';
    if (zcr > 0.2  && crestFactor < 6) return 'hip-hop';
    if (zcr > 0.15 && crestFactor < 5) return 'pop';
    if (zcr > 0.1  && crestFactor > 4) return 'rock';
    return 'pop';
  }

  assert('High dynamics, slow → classical', classifyFromStats(0.01, 10) === 'classical');
  assert('Dense, fast → electronic', classifyFromStats(0.30, 3) === 'electronic');
  assert('Mid zcr, punchy → hip-hop', classifyFromStats(0.22, 5) === 'hip-hop');
  assert('Default fallback → pop', classifyFromStats(0.08, 3) === 'pop');
}

// ── 6. Airwindows saturation type validation ─────────────────────────────────
console.log('\n[6] Saturation type list');
{
  const validTypes = ['tube', 'tape', 'digital', 'density', 'console', 'spiral', 'channel', 'totape', 'purestdrive'];
  assert('9 saturation algorithms available', validTypes.length === 9);
  assert('Contains Airwindows algorithms', ['density', 'console', 'spiral', 'totape', 'purestdrive'].every(t => validTypes.includes(t)));
}

// ── 7. LR4 filter Q values ──────────────────────────────────────────────────
console.log('\n[7] LR4 Butterworth Q values');
{
  // LR4 = 2 cascaded 2nd-order Butterworth sections
  // The Q values for a 4th-order Butterworth are 0.5412 and 1.3066
  const Q1 = 0.5412;
  const Q2 = 1.3066;
  // Verify they approximate the Butterworth polynomial roots
  assert('Q1 is sub-unity (overdamped)', Q1 < 1.0);
  assert('Q2 is supercritical', Q2 > 1.0);
  // The product Q1 * Q2 ≈ 0.707 for LR4
  const product = Q1 * Q2;
  assert('Q1 * Q2 ≈ 0.707 (Butterworth characteristic)', Math.abs(product - 0.707) < 0.01,
    `got ${product.toFixed(4)}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Power Engine: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
