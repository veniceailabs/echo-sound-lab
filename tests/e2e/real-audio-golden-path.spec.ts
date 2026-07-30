import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RUN_REAL_AUDIO_BENCHMARK = process.env.RUN_REAL_AUDIO_BENCHMARK === '1';

interface ParsedWavMetrics {
  durationSec: number;
  sampleRate: number;
  channelCount: number;
  bitsPerSample: number;
  sampleCount: number;
  peakAbs: number;
  rms: number;
  clippingRatio: number;
}

interface WavFormatChunk {
  audioFormat: number;
  channelCount: number;
  sampleRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

function parseWavMetrics(filePath: string): ParsedWavMetrics {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Invalid WAV file: ${filePath}`);
  }

  let offset = 12;
  let fmt: WavFormatChunk | null = null;
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

test('real WAV upload -> deterministic template -> export passes quality/provenance checks', async ({ page }, testInfo) => {
  test.skip(!RUN_REAL_AUDIO_BENCHMARK, 'Set RUN_REAL_AUDIO_BENCHMARK=1 to run the extended real-audio benchmark.');
  test.skip(testInfo.project.name !== 'Desktop Chrome', 'Audio byte verification runs on Desktop Chrome only.');
  test.setTimeout(420_000);

  await page.route('**/api/proxy/security/sign-manifest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signature: 'real-audio-e2e-signature',
        signatureAlgorithm: 'hmac-sha256-v1',
        manifestHash: 'real-audio-e2e-manifest-hash',
        keyId: 'real-audio-e2e-key',
        signedAt: Date.now(),
      }),
    });
  });

  await page.addInitScript(() => {
    type CapturedExportBlob = { fileName: string; blob: Blob };
    const captured: CapturedExportBlob[] = [];
    const blobByUrl = new Map<string, Blob>();

    (window as Window & { __eslCapturedExports?: CapturedExportBlob[] }).__eslCapturedExports = captured;

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
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

  const fixtures = [
    { file: 'structure_test.wav', templateId: 'podcast-cleanup' },
    { file: 'beta_final_smoke.wav', templateId: 'pro-vocal-polish' },
    { file: 'defender_verify.wav', templateId: 'master-fast' },
  ];

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esl-real-audio-'));

  for (const fixture of fixtures) {
    await page.goto('/');

    const skipButton = page.getByRole('button', { name: 'Skip' }).first();
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
    }

    const fixturePath = path.resolve(process.cwd(), fixture.file);
    const inputMetrics = parseWavMetrics(fixturePath);

    await page.evaluate(() => {
      const win = window as Window & {
        __eslCapturedExports?: Array<{ fileName: string; blob: Blob }>;
      };
      if (Array.isArray(win.__eslCapturedExports)) {
        win.__eslCapturedExports.length = 0;
      }
    });

    await page.getByTestId('single-upload-input').setInputFiles(fixturePath);
    await expect(page.getByText('Sonic Analysis')).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId('service-template-bar')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(`service-template-${fixture.templateId}`).click();
    await expect(page.getByTestId('timeline-export-wav')).toBeEnabled({ timeout: 60_000 });

    await page.getByTestId('timeline-export-wav').click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const captured = (window as Window & { __eslCapturedExports?: Array<{ fileName: string }> }).__eslCapturedExports || [];
            return captured.length;
          }),
        { timeout: 90_000 }
      )
      .toBeGreaterThanOrEqual(2);

    const exportPayload = await page.evaluate(async () => {
      const captured = (window as Window & {
        __eslCapturedExports?: Array<{ fileName: string; blob: Blob }>;
      }).__eslCapturedExports || [];

      const wav = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.wav'));
      const manifest = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.manifest.json'));
      if (!wav || !manifest) {
        return null;
      }

      const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob as base64'));
        reader.readAsDataURL(blob);
      });

      const wavBuffer = await wav.blob.arrayBuffer();
      const wavBytes = new Uint8Array(wavBuffer);
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

      const wavBase64 = await blobToBase64(wav.blob);
      return {
        wavFileName: wav.fileName,
        manifestFileName: manifest.fileName,
        wavBase64,
        manifestText: await manifest.blob.text(),
        markerFound,
      };
    });

    expect(exportPayload).not.toBeNull();
    expect(exportPayload!.markerFound).toBe(true);

    const wavPath = path.join(outputDir, `${path.basename(fixture.file, '.wav')}.rendered.wav`);
    const manifestPath = path.join(outputDir, `${path.basename(fixture.file, '.wav')}.manifest.json`);
    fs.writeFileSync(wavPath, Buffer.from(exportPayload!.wavBase64, 'base64'));
    fs.writeFileSync(manifestPath, exportPayload!.manifestText, 'utf8');

    const outputMetrics = parseWavMetrics(wavPath);
    const durationDeltaSec = Math.abs(outputMetrics.durationSec - inputMetrics.durationSec);

    expect(durationDeltaSec).toBeLessThanOrEqual(0.35);
    expect(outputMetrics.peakAbs).toBeGreaterThan(0.01);
    expect(outputMetrics.rms).toBeGreaterThan(0.0005);
    expect(outputMetrics.clippingRatio).toBeLessThan(0.05);

    const signedManifest = JSON.parse(exportPayload!.manifestText) as {
      manifest?: {
        entries?: unknown[];
        c2pa?: {
          Creator?: unknown;
          Generator?: unknown;
          Timestamp?: unknown;
        };
      };
      manifestHash?: unknown;
      signature?: unknown;
    };
    expect(typeof signedManifest.manifestHash === 'string' && signedManifest.manifestHash.length > 20).toBe(true);
    expect(typeof signedManifest.signature === 'string' && signedManifest.signature.length > 20).toBe(true);
    expect(Array.isArray(signedManifest.manifest?.entries)).toBe(true);
    expect(typeof signedManifest.manifest?.c2pa?.Creator === 'string').toBe(true);
    expect(typeof signedManifest.manifest?.c2pa?.Generator === 'string').toBe(true);
    expect(typeof signedManifest.manifest?.c2pa?.Timestamp === 'string').toBe(true);
  }
});
