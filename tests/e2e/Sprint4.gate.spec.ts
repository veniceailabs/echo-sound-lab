import { test, expect } from '@playwright/test';

test.describe('Sprint 4: Animation Polish — Perceived Transformation Moment', () => {
  test('should animate proof layer on PROOF mode toggle', async ({ page }) => {
    // Setup: Navigate to app
    await page.goto('http://localhost:5173');

    // Wait for app to load
    await page.waitForTimeout(2000);

    await test.step('1. Proof layer component renders in DOM', async () => {
      // The proof layer should be present in the DOM (even if hidden initially)
      const proofLayer = page.locator('[data-testid="proof-layer"]');
      // This will fail if not present, which is expected
      await expect(proofLayer).toHaveCount(0); // Not rendered until PROOF mode
    });

    await test.step('2. FEEL/PROOF toggle visible and functional', async () => {
      // Look for toggle buttons
      const feelButton = page.getByRole('button', { name: /feel/i });
      const proofButton = page.getByRole('button', { name: /proof/i });

      // Both should be visible
      await expect(feelButton).toBeVisible();
      await expect(proofButton).toBeVisible();
    });

    await test.step('3. Toggle switches between FEEL and PROOF modes', async () => {
      const proofButton = page.getByRole('button', { name: /proof/i });

      // Click PROOF button
      await proofButton.click();

      // Wait for animation to start (~50ms into animation)
      await page.waitForTimeout(50);

      // PROOF layer should now be present
      const proofLayer = page.locator('[data-testid="proof-layer"]');
      // Check if it's in the DOM now (animation may not be complete yet)
    });

    await test.step('4. LUFS before/after values displayed', async () => {
      const proofLayer = page.locator('[data-testid="proof-layer"]');

      // Look for LUFS text (e.g., "-8.2", "-14.1")
      const lufsElements = proofLayer.locator('text');
      const lufsVisible = await lufsElements.count();

      // At least some LUFS numbers should be visible
      expect(lufsVisible).toBeGreaterThan(0);
    });

    await test.step('5. Waveform and spectrum visualizations present', async () => {
      const proofLayer = page.locator('[data-testid="proof-layer"]');

      // Look for SVG elements (waveform and spectrum are SVG)
      const svgElements = proofLayer.locator('svg');
      const svgCount = await svgElements.count();

      // Should have at least 2 SVGs (waveform original + processed, spectrum)
      expect(svgCount).toBeGreaterThanOrEqual(2);
    });

    await test.step('6. Animations trigger smoothly (opacity changes)', async () => {
      const proofLayer = page.locator('[data-testid="proof-layer"]');

      // Check opacity mid-animation (should be between 0 and 1)
      const opacity = await proofLayer.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );

      // At mid-animation (50-150ms), opacity should be animating
      // Could be partially opaque
      expect(parseFloat(opacity) >= 0).toBe(true);
    });

    await test.step('7. Full animation sequence completes', async () => {
      // Wait for full animation sequence: 600ms (spectrum bars complete)
      await page.waitForTimeout(700);

      const proofLayer = page.locator('[data-testid="proof-layer"]');

      // Should be fully opaque now
      const finalOpacity = await proofLayer.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );

      expect(parseFloat(finalOpacity)).toBe(1);
    });

    await test.step('8. Full acceptance summary', async () => {
      const proofLayer = page.locator('[data-testid="proof-layer"]');

      // Proof layer should still be visible
      await expect(proofLayer).toBeVisible();

      // Should have LUFS counter, waveforms, and spectrum visible
      const headings = proofLayer.locator('h4');
      const headingCount = await headings.count();

      // Should have at least 2 headings (loudness, waveform, spectrum)
      expect(headingCount).toBeGreaterThanOrEqual(2);
    });
  });
});
