import { expect, test } from '@playwright/test';
import path from 'node:path';

test('golden master workflow: upload -> AI propose -> ACC authorize -> export with provenance', async ({ page }) => {
  await page.route('**/api/proxy/security/sign-manifest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signature: 'test-signature-e2e',
        signatureAlgorithm: 'hmac-sha256-v1',
        manifestHash: 'test-manifest-hash-e2e',
        keyId: 'test-key-e2e',
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

  await page.goto('/');

  const audioPath = path.resolve(process.cwd(), 'structure_test.wav');
  await page.getByTestId('single-upload-input').setInputFiles(audioPath);
  await expect(page.getByText('Sonic Analysis')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('engine-mode-toggle').click();
  await expect(page.getByText('Advanced Mode')).toBeVisible({ timeout: 10_000 });

  const intentInput = page.getByPlaceholder('Describe intent (e.g., make vocals aggressive)').first();
  await expect(intentInput).toBeVisible({ timeout: 30_000 });
  await intentInput.fill('Make vocals aggressive with more air and add slap delay');
  await page.getByRole('button', { name: /AI Propose|Generating…/i }).first().click();

  const feedSidebar = page.locator('aside').filter({ hasText: 'Intelligence Feed' }).first();
  await expect(feedSidebar).toBeVisible({ timeout: 30_000 });

  const holdButton = feedSidebar.getByRole('button', { name: /HOLDING/i }).first();
  await expect(holdButton).toBeVisible({ timeout: 30_000 });
  await holdButton.dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  await holdButton.dispatchEvent('mouseup');
  await expect(holdButton).toContainText(/PRESS ENTER|HOLDING/i, { timeout: 5_000 });
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: /Export WAV|Exportar WAV|WAV 내보내기/i }).first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const captured = (window as Window & { __eslCapturedExports?: Array<{ fileName: string }> }).__eslCapturedExports || [];
          return captured.length;
        }),
      { timeout: 45_000 }
    )
    .toBeGreaterThanOrEqual(2);

  const exportSummary = await page.evaluate(async () => {
    const captured = (window as Window & {
      __eslCapturedExports?: Array<{ fileName: string; blob: Blob }>;
    }).__eslCapturedExports || [];

    const wav = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.wav'));
    const manifest = captured.find((entry) => entry.fileName.toLowerCase().endsWith('.manifest.json'));
    if (!wav || !manifest) {
      return { hasWav: Boolean(wav), hasManifest: Boolean(manifest), wavContainsMarker: false, manifestShapeOk: false };
    }

    const wavBytes = new Uint8Array(await wav.blob.arrayBuffer());
    const markerBytes = new TextEncoder().encode('ESL_PROVENANCE_REF');
    let markerIndex = -1;
    for (let i = 0; i <= wavBytes.length - markerBytes.length; i += 1) {
      let isMatch = true;
      for (let j = 0; j < markerBytes.length; j += 1) {
        if (wavBytes[i + j] !== markerBytes[j]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        markerIndex = i;
        break;
      }
    }

    const manifestJson = JSON.parse(await manifest.blob.text()) as Record<string, unknown>;
    const manifestShapeOk =
      typeof manifestJson.signature === 'string' &&
      typeof manifestJson.manifestHash === 'string' &&
      typeof manifestJson.signatureAlgorithm === 'string';

    return {
      hasWav: true,
      hasManifest: true,
      wavContainsMarker: markerIndex >= 0,
      manifestShapeOk,
    };
  });

  expect(exportSummary.hasWav).toBe(true);
  expect(exportSummary.hasManifest).toBe(true);
  expect(exportSummary.wavContainsMarker).toBe(true);
  expect(exportSummary.manifestShapeOk).toBe(true);
});
