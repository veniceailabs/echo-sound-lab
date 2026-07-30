// Bridges the native C++ audio core into the Electron main process.
//
// This code can only run here. The native addon is a compiled .node binary and
// PortAudio talks to CoreAudio directly, so neither works in a browser tab or
// on Vercel's static hosting -- hardware capture and the native engine are
// desktop-only by construction. The web build keeps using the WebAudio path.

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let native = null;
let loadError = null;
let recorder = null;

// Candidate locations: unpacked from the asar in a packaged build, or the
// working tree during development.
function candidatePaths() {
  const rel = path.join('native', 'build', 'Release', 'echo-sound-lab.node');
  const out = [];
  if (process.resourcesPath) {
    out.push(path.join(process.resourcesPath, rel));
    out.push(path.join(process.resourcesPath, 'app.asar.unpacked', rel));
  }
  out.push(path.join(__dirname, '..', rel));
  return out;
}

export function loadNative() {
  if (native || loadError) return native;
  for (const p of candidatePaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      native = require(p);
      console.log('[native-audio] loaded', p);
      return native;
    } catch (err) {
      loadError = err;
      console.error('[native-audio] failed to load', p, err.message);
    }
  }
  if (!native) {
    loadError = loadError || new Error('native addon not found; run `npm run build` in native/');
    console.warn('[native-audio]', loadError.message);
  }
  return native;
}

export function isAvailable() {
  return loadNative() !== null;
}

function requireNative() {
  const n = loadNative();
  if (!n) throw new Error(loadError ? loadError.message : 'native audio core unavailable');
  return n;
}

// --- capture -------------------------------------------------------------

export function listInputDevices() {
  return requireNative().Recorder.listDevices();
}

export function startRecording(options) {
  const n = requireNative();
  if (recorder) throw new Error('already recording');
  recorder = new n.Recorder();
  try {
    return recorder.start(options);
  } catch (err) {
    recorder = null;
    throw err;
  }
}

export function recordingStatus() {
  if (!recorder) return { recording: false };
  return recorder.getStatus();
}

export function stopRecording() {
  if (!recorder) throw new Error('not recording');
  const result = recorder.stop();
  recorder = null;
  return result;
}

// --- offline processing --------------------------------------------------

export function masterFile({ input, output, targetLufs = -14, ceiling = -0.3, saturation = 0, bits = 24 }) {
  const n = requireNative();
  const { readWav, writeWav } = require(path.join(__dirname, '..', 'native', 'lib', 'wav.js'));

  const src = readWav(input);
  const engine = new n.MasteringEngine(src.sampleRate);
  engine.setLUFSTarget(targetLufs);
  engine.setLimiterThreshold(ceiling);
  if (saturation > 0) engine.setSaturation(saturation, 1.0);

  let planes;
  if (src.channels === 2) {
    planes = engine.processStereo(src.planes[0], src.planes[1]);
  } else if (src.channels === 1) {
    planes = [engine.process(src.planes[0], 1)];
  } else {
    throw new Error(`unsupported channel count: ${src.channels}`);
  }

  writeWav(output, planes, src.sampleRate, bits);
  const metrics = engine.getMetrics();
  return {
    output,
    sampleRate: src.sampleRate,
    channels: src.channels,
    seconds: src.frames / src.sampleRate,
    integratedLufs: metrics.integrated_lufs,
    truePeakDbfs: metrics.true_peak_dbfs,
    loudnessRange: metrics.loudness_range,
  };
}

export function processVocal({ input, output, settings = {}, bits = 24 }) {
  const n = requireNative();
  const { readWav, writeWav } = require(path.join(__dirname, '..', 'native', 'lib', 'wav.js'));

  const src = readWav(input);
  // One chain per channel -- filter and envelope state must not be shared.
  const planes = src.planes.map((plane) => {
    const chain = new n.VocalChain(src.sampleRate);
    chain.setSettings(settings);
    return chain.process(plane);
  });

  writeWav(output, planes, src.sampleRate, bits);
  return { output, sampleRate: src.sampleRate, channels: src.channels,
           seconds: src.frames / src.sampleRate };
}
