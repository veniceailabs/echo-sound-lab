import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.ESL_BENCHMARK_URL || 'https://echo-sound-lab.vercel.app';
const WORK_DIR = process.cwd();
const INCLUDE_SILENT_FIXTURE = process.env.ESL_INCLUDE_SILENT_FIXTURE === '1';
const REFERENCE_PROFILE_PATH = process.env.ESL_REFERENCE_PROFILE
  ? path.resolve(process.env.ESL_REFERENCE_PROFILE)
  : null;
const REQUIRE_REFERENCE_MATCH = process.env.ESL_REQUIRE_REFERENCE_MATCH === '1';

const FIXTURES = [
  { file: 'structure_test.wav', templateId: 'podcast-cleanup' },
  { file: 'beta_final_smoke.wav', templateId: 'pro-vocal-polish' },
  { file: 'defender_verify.wav', templateId: 'master-fast' },
];

function createSilentFixture(targetDir) {
  const file = path.join(targetDir, 'esl-silence-3s.wav');
  const sampleRate = 48_000;
  const channelCount = 2;
  const bitsPerSample = 16;
  const durationSec = 3;
  const frameCount = sampleRate * durationSec;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const bytes = Buffer.alloc(44 + dataSize);

  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channelCount, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(byteRate, 28);
  bytes.writeUInt16LE(blockAlign, 32);
  bytes.writeUInt16LE(bitsPerSample, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(file, bytes);
  return file;
}

function analyzeLoudnessProfile(filePath) {
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );

  const text = `${run.stderr || ''}\n${run.stdout || ''}`;
  const start = text.lastIndexOf('{');
  const end = text.lastIndexOf('}');
  if (run.status !== 0 || start < 0 || end < start) {
    throw new Error(`ffmpeg loudnorm analysis failed for ${filePath}`);
  }

  const data = JSON.parse(text.slice(start, end + 1));
  return {
    integratedLUFS: Number(data.input_i),
    truePeakDbtp: Number(data.input_tp),
    loudnessRangeLu: Number(data.input_lra),
  };
}

function createReferenceChecks(referenceProfile, loudnessProfile) {
  if (!referenceProfile || !loudnessProfile) return {};

  const band = referenceProfile.referenceBand;
  if (!band) return {};

  return {
    referenceIntegratedLufs:
      loudnessProfile.integratedLUFS >= band.integratedLUFS.min
      && loudnessProfile.integratedLUFS <= band.integratedLUFS.max,
    referenceTruePeak:
      loudnessProfile.truePeakDbtp >= band.truePeakDbtp.min
      && loudnessProfile.truePeakDbtp <= band.truePeakDbtp.max,
    referenceLoudnessRange:
      loudnessProfile.loudnessRangeLu >= band.loudnessRangeLu.min
      && loudnessProfile.loudnessRangeLu <= band.loudnessRangeLu.max,
  };
}

function logStep(message) {
  console.log(`[benchmark] ${message}`);
}

function parseTransportTimeToSeconds(value) {
  const match = value.match(/^(\d+):(\d{2}):(\d{3})$/);
  if (!match) return null;
  const mins = Number(match[1]);
  const secs = Number(match[2]);
  const millis = Number(match[3]);
  if (![mins, secs, millis].every(Number.isFinite)) return null;
  return mins * 60 + secs + (millis / 1000);
}

function parseTransportDurationLabel(label) {
  const parts = label.split('/').map((part) => part.trim());
  if (parts.length !== 2) return null;
  return parseTransportTimeToSeconds(parts[1]);
}

function parseWavMetrics(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Invalid WAV file: ${filePath}`);
  }

  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      fmt = {
        audioFormat: bytes.readUInt16LE(chunkDataOffset),
        channelCount: bytes.readUInt16LE(chunkDataOffset + 2),
        sampleRate: bytes.readUInt32LE(chunkDataOffset + 4),
        blockAlign: bytes.readUInt16LE(chunkDataOffset + 12),
        bitsPerSample: bytes.readUInt16LE(chunkDataOffset + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset < 0 || dataSize <= 0) {
    throw new Error(`Missing fmt/data chunks in WAV: ${filePath}`);
  }

  const frameCount = Math.floor(dataSize / fmt.blockAlign);
  const sampleCount = frameCount * fmt.channelCount;
  const durationSec = frameCount / fmt.sampleRate;
  const bytesPerSample = fmt.bitsPerSample / 8;

  let peakAbs = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  const clippingThreshold = 0.999;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameOffset = dataOffset + frameIndex * fmt.blockAlign;
    for (let channel = 0; channel < fmt.channelCount; channel += 1) {
      const sampleOffset = frameOffset + channel * bytesPerSample;
      let value = 0;

      if (fmt.audioFormat === 3 && fmt.bitsPerSample === 32) {
        value = bytes.readFloatLE(sampleOffset);
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 16) {
        value = bytes.readInt16LE(sampleOffset) / 32768;
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 24) {
        let sample = bytes[sampleOffset] | (bytes[sampleOffset + 1] << 8) | (bytes[sampleOffset + 2] << 16);
        if (sample & 0x800000) sample |= ~0xffffff;
        value = sample / 8388608;
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 32) {
        value = bytes.readInt32LE(sampleOffset) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV format (${fmt.audioFormat}/${fmt.bitsPerSample}) in ${filePath}`);
      }

      const abs = Math.abs(value);
      if (abs > peakAbs) peakAbs = abs;
      if (abs >= clippingThreshold) clippedSamples += 1;
      sumSquares += value * value;
    }
  }

  return {
    durationSec,
    sampleRate: fmt.sampleRate,
    channelCount: fmt.channelCount,
    bitsPerSample: fmt.bitsPerSample,
    sampleCount,
    peakAbs,
    rms: Math.sqrt(sumSquares / Math.max(1, sampleCount)),
    clippingRatio: clippedSamples / Math.max(1, sampleCount),
  };
}

async function poll(fn, { timeoutMs = 120000, intervalMs = 500, description = 'poll condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout waiting for ${description} (${timeoutMs}ms)`);
}

async function ensureUploadReady(page) {
  const uploadInput = page.getByTestId('single-upload-input');
  if (await uploadInput.count().catch(() => 0)) {
    return;
  }

  const startFreshButton = page.getByRole('button', { name: 'Start Fresh' }).first();
  if (await startFreshButton.isVisible().catch(() => false)) {
    await startFreshButton.click({ force: true });
  }

  const skipButton = page.getByRole('button', { name: 'Skip' }).first();
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click({ force: true });
  }

  await uploadInput.waitFor({ state: 'attached', timeout: 60_000 });
}

function evaluatePass(fixture, inputMetrics, outputMetrics, markerFound, manifest, referenceProfile = null, loudnessProfile = null) {
  const durationDeltaSec = Math.abs(outputMetrics.durationSec - inputMetrics.durationSec);
  const isSilentFixture = inputMetrics.rms <= 0.0000001 && inputMetrics.peakAbs <= 0.0000001;
  const checks = {
    durationMatch: durationDeltaSec <= 0.35,
    notSilent: isSilentFixture ? outputMetrics.rms <= 0.0000001 : outputMetrics.rms > 0.0005,
    nonTrivialPeak: isSilentFixture ? outputMetrics.peakAbs <= 0.0000001 : outputMetrics.peakAbs > 0.01,
    peakWithinReferenceCeiling: isSilentFixture ? true : outputMetrics.peakAbs <= 0.92,
    clippingControlled: outputMetrics.clippingRatio < 0.05,
    provenanceMarker: markerFound === true,
    manifestHash: typeof manifest?.manifestHash === 'string' && manifest.manifestHash.length > 20,
    manifestSignature: typeof manifest?.signature === 'string' && manifest.signature.length > 20,
    c2paShape:
      typeof manifest?.manifest?.c2pa?.Creator === 'string'
      && typeof manifest?.manifest?.c2pa?.Generator === 'string'
      && typeof manifest?.manifest?.c2pa?.Timestamp === 'string',
  };
  const referenceChecks = isSilentFixture ? {} : createReferenceChecks(referenceProfile, loudnessProfile);
  if (REQUIRE_REFERENCE_MATCH) {
    Object.assign(checks, referenceChecks);
  }

  return {
    fixture,
    checks: {
      ...checks,
      ...referenceChecks,
    },
    input: inputMetrics,
    output: outputMetrics,
    outputLoudness: loudnessProfile,
    durationDeltaSec,
    pass: Object.values(checks).every(Boolean),
  };
}

async function run() {
  const referenceProfile = REFERENCE_PROFILE_PATH && fs.existsSync(REFERENCE_PROFILE_PATH)
    ? JSON.parse(fs.readFileSync(REFERENCE_PROFILE_PATH, 'utf8'))
    : null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: false });

  await context.route('**/api/proxy/security/sign-manifest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signature: 'real-audio-benchmark-signature',
        signatureAlgorithm: 'hmac-sha256-v1',
        manifestHash: 'real-audio-benchmark-manifest-hash',
        keyId: 'real-audio-benchmark-key',
        signedAt: Date.now(),
      }),
    });
  });

  await context.addInitScript(() => {
    const captured = [];
    const blobByUrl = new Map();

    window.__eslCapturedExports = captured;

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      if (blob instanceof Blob) {
        blobByUrl.set(url, blob);
      }
      return url;
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clickOverride() {
      if (this.download && this.href.startsWith('blob:')) {
        const blob = blobByUrl.get(this.href);
        if (blob) {
          captured.push({ fileName: this.download, blob });
        }
      }
      return originalAnchorClick.call(this);
    };
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esl-real-audio-benchmark-'));
  const results = [];
  const fixtures = [...FIXTURES];
  if (INCLUDE_SILENT_FIXTURE) {
    fixtures.push({
      file: createSilentFixture(tempDir),
      templateId: 'master-fast',
    });
  }

  for (const fixture of fixtures) {
    const page = await context.newPage();
    const fixturePath = path.isAbsolute(fixture.file) ? fixture.file : path.resolve(WORK_DIR, fixture.file);
    if (!fs.existsSync(fixturePath)) {
      await page.close();
      throw new Error(`Fixture missing: ${fixturePath}`);
    }
    const inputMetrics = parseWavMetrics(fixturePath);

    try {
      logStep(`Fixture ${fixture.file}: opening studio`);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

      const startFreshButton = page.getByRole('button', { name: 'Start Fresh' }).first();
      if (await startFreshButton.isVisible().catch(() => false)) {
        await startFreshButton.click({ force: true });
      }

      const advancedToolsModal = page.getByTestId('advanced-tools-modal');
      if (await advancedToolsModal.isVisible().catch(() => false)) {
        const advancedToolsClose = page.getByTestId('advanced-tools-close');
        if (await advancedToolsClose.isVisible().catch(() => false)) {
          await advancedToolsClose.click({ force: true });
        } else {
          await page.keyboard.press('Escape');
        }
      }

      const skipButton = page.getByRole('button', { name: 'Skip' }).first();
      if (await skipButton.isVisible().catch(() => false)) {
        await skipButton.click({ force: true });
      }

      await page.evaluate(() => {
        if (Array.isArray(window.__eslCapturedExports)) {
          window.__eslCapturedExports.length = 0;
        }
      });

      logStep(`Fixture ${fixture.file}: uploading`);
      await ensureUploadReady(page);
      await page.getByTestId('single-upload-input').setInputFiles(fixturePath);
      await page.getByText('Sonic Analysis').waitFor({ state: 'visible', timeout: 120000 });
      const transportLabel = await page.getByTestId('timeline-transport-time').textContent().catch(() => null);
      const observedDurationSec = transportLabel ? parseTransportDurationLabel(transportLabel) : null;
      if (observedDurationSec !== null && Math.abs(observedDurationSec - inputMetrics.durationSec) > 0.2) {
        logStep(
          `${fixture.file}: timeline showed ${observedDurationSec.toFixed(3)}s before export; auto-heal on export will enforce source duration ${inputMetrics.durationSec.toFixed(3)}s`
        );
      }

      await page.getByTestId('service-template-bar').waitFor({ state: 'visible', timeout: 60000 });
      logStep(`Fixture ${fixture.file}: applying template ${fixture.templateId}`);
      await page.getByTestId(`service-template-${fixture.templateId}`).click({ force: true });
      await page.getByTestId('timeline-export-wav').waitFor({ state: 'visible', timeout: 60000 });
      await poll(
        () => page.getByTestId('timeline-export-wav').isEnabled(),
        { timeoutMs: 120000, description: `${fixture.file} export button enable` }
      );

      logStep(`Fixture ${fixture.file}: exporting`);
      await page.getByTestId('timeline-export-wav').click({ force: true });
      await poll(
        async () => {
          const status = await page.evaluate(() => {
            const log = (window.__eslExportLog || {});
            const capturedCount = (window.__eslCapturedExports || []).length;
            return { status: log.status, capturedCount, log };
          });
          logStep(`  [poll] export status=${status.status}, captured=${status.capturedCount}`);
          return status.capturedCount >= 2;
        },
        { timeoutMs: 120000, description: `${fixture.file} export capture` }
      );

      const exportPayload = await page.evaluate(async () => {
        const captured = window.__eslCapturedExports || [];
        const wav = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.wav'));
        const manifest = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.manifest.json'));
        if (!wav || !manifest) return null;

        const blobToBase64 = (blob) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
          };
          reader.onerror = () => reject(reader.error || new Error('Failed to read blob as base64'));
          reader.readAsDataURL(blob);
        });

        const wavBytes = new Uint8Array(await wav.blob.arrayBuffer());
        const markerBytes = new TextEncoder().encode('ESL_PROVENANCE_REF');
        let markerFound = false;
        for (let i = 0; i <= wavBytes.length - markerBytes.length; i += 1) {
          let match = true;
          for (let j = 0; j < markerBytes.length; j += 1) {
            if (wavBytes[i + j] !== markerBytes[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            markerFound = true;
            break;
          }
        }

        return {
          wavBase64: await blobToBase64(wav.blob),
          manifestText: await manifest.blob.text(),
          markerFound,
        };
      });

      if (!exportPayload) {
        throw new Error(`Failed to capture exported WAV + manifest for ${fixture.file}`);
      }

      const wavOutPath = path.join(tempDir, `${path.basename(fixture.file, '.wav')}.rendered.wav`);
      fs.writeFileSync(wavOutPath, Buffer.from(exportPayload.wavBase64, 'base64'));
      const outputMetrics = parseWavMetrics(wavOutPath);
      const outputLoudness = referenceProfile ? analyzeLoudnessProfile(wavOutPath) : null;
      const manifest = JSON.parse(exportPayload.manifestText);

      const evaluation = evaluatePass(
        fixture.file,
        inputMetrics,
        outputMetrics,
        exportPayload.markerFound,
        manifest,
        referenceProfile,
        outputLoudness
      );
      results.push(evaluation);
      logStep(
        `${fixture.file}: ${evaluation.pass ? 'PASS' : 'FAIL'} | durationΔ=${evaluation.durationDeltaSec.toFixed(3)}s | rms=${evaluation.output.rms.toFixed(5)} | clip=${(evaluation.output.clippingRatio * 100).toFixed(3)}%`
      );
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  const artifactsDir = path.resolve(WORK_DIR, 'artifacts', 'qa');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const reportPath = path.join(artifactsDir, `real-audio-benchmark-${Date.now()}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        referenceProfile: referenceProfile
          ? {
            profileName: referenceProfile.profileName,
            sourceFolder: referenceProfile.sourceFolder,
            requireReferenceMatch: REQUIRE_REFERENCE_MATCH,
          }
          : null,
        generatedAt: new Date().toISOString(),
        results,
      },
      null,
      2
    ),
    'utf8'
  );

  const failed = results.filter((result) => !result.pass);
  console.log('\n=== Real Audio Benchmark Summary ===');
  for (const result of results) {
    console.log(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.fixture} | durationΔ=${result.durationDeltaSec.toFixed(3)}s | peak=${result.output.peakAbs.toFixed(4)} | rms=${result.output.rms.toFixed(5)} | clip=${(result.output.clippingRatio * 100).toFixed(3)}%${result.outputLoudness ? ` | LUFS=${result.outputLoudness.integratedLUFS.toFixed(2)} | TP=${result.outputLoudness.truePeakDbtp.toFixed(2)} | LRA=${result.outputLoudness.loudnessRangeLu.toFixed(2)}` : ''}`
    );
  }
  console.log(`Report: ${reportPath}`);
  console.log(`Rendered exports temp dir: ${tempDir}`);

  if (failed.length > 0) {
    process.exitCode = 1;
    throw new Error(`${failed.length} fixture(s) failed benchmark quality gates.`);
  }
}

run().catch((error) => {
  console.error('\n[benchmark] FAILED:', error.message);
  process.exitCode = 1;
});
