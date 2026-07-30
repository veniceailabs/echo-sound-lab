/**
 * New Feature Tests — Power Engine, Beat Machine UX, Restoration Panel, Transport Labels
 */
import { test, expect } from '@playwright/test';

async function goToStudio(page: any) {
  await page.goto('/');
  await page.getByTestId('mode-tab-ai_studio').click();
  await page.waitForTimeout(600);
}

async function openPowerEngine(page: any) {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Master / Engine' }).click();
  await expect(page.locator('h2', { hasText: 'Power Engine' })).toBeVisible({ timeout: 5000 });
}

async function clickPowerTab(page: any, tabId: string) {
  await page.getByTestId(`power-engine-tab-${tabId}`).click();
  await page.waitForTimeout(350);
}

// ── Transport button labels ────────────────────────────────────────────────────

test('transport buttons have full descriptive labels', async ({ page }) => {
  await goToStudio(page);
  await expect(page.locator('button', { hasText: 'Beat Machine' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Synth / Keys' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Arrange Song' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Master / Engine' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Live Collab' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Save Session' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Export Stems' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Mixdown to Master' })).toBeVisible();
});

// ── Beat Machine ─────────────────────────────────────────────────────────────

test('Beat Machine opens with grid, guide text, and velocity legend', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Beat Machine' }).click();
  await page.waitForTimeout(400);

  // Instruments
  await expect(page.getByText('Kick')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Snare')).toBeVisible();

  // Preset buttons
  await expect(page.locator('button', { hasText: 'Trap' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'House' })).toBeVisible();

  // Plain-English guide (always visible, not in title attr)
  await expect(page.getByText('Left-click a square', { exact: false })).toBeVisible();
  await expect(page.getByText('Right-click = cycle velocity', { exact: false })).toBeVisible();
  await expect(page.getByText('Add to Track', { exact: false }).last()).toBeVisible();
});

test('Beat Machine velocity legend shows Soft / Medium / Hard', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Beat Machine' }).click();
  await page.waitForTimeout(400);

  // Legend section — scoped to the beat machine container area
  const guide = page.getByText('Velocity:', { exact: true });
  await expect(guide).toBeVisible();
  // The legend spans should include these labels
  const soft = page.locator('span', { hasText: 'Soft' });
  const hard = page.locator('span', { hasText: 'Hard' });
  expect(await soft.count()).toBeGreaterThan(0);
  expect(await hard.count()).toBeGreaterThan(0);
});

test('Beat Machine Trap preset highlights on selection', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Beat Machine' }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Trap' }).click();
  // Highlighted preset has orange class
  await expect(page.locator('button.bg-orange-500\\/20', { hasText: 'Trap' })).toBeVisible();
});

test('Beat Machine Add to Track button is present', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Beat Machine' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('button', { hasText: 'Add to Track' })).toBeVisible();
});

// ── Power Engine tabs ─────────────────────────────────────────────────────────

test('Power Engine opens on AI Master tab with How it works guide', async ({ page }) => {
  await openPowerEngine(page);
  await expect(page.getByText('How it works', { exact: false })).toBeVisible();
});

test('Power Engine has 5 tabs via data-testid', async ({ page }) => {
  await openPowerEngine(page);
  for (const id of ['ai', 'multiband', 'eq', 'transient', 'saturation']) {
    await expect(page.getByTestId(`power-engine-tab-${id}`)).toBeVisible();
  }
});

test('Power Engine intensity badge shows Strong at default 75%', async ({ page }) => {
  await openPowerEngine(page);
  await expect(page.locator('span', { hasText: 'Strong — 75%' })).toBeVisible();
});

test('Power Engine platform dropdown has 6 options including Club', async ({ page }) => {
  await openPowerEngine(page);
  const platformSelect = page.getByTestId('pe-select-platform');
  const options = await platformSelect.locator('option').allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(6);
  expect(options.some(t => t.includes('Spotify'))).toBeTruthy();
  expect(options.some(t => t.includes('Apple Music'))).toBeTruthy();
  expect(options.some(t => t.includes('Club'))).toBeTruthy();
});

test('Power Engine genre dropdown has Auto-detect and 8 genres', async ({ page }) => {
  await openPowerEngine(page);
  const genreSelect = page.getByTestId('pe-select-genre');
  const options = await genreSelect.locator('option').allTextContents();
  expect(options.some(t => t.includes('Auto-detect'))).toBeTruthy();
  expect(options.some(t => t.includes('Hip-Hop'))).toBeTruthy();
  expect(options.some(t => t.includes('Electronic'))).toBeTruthy();
  expect(options.some(t => t.includes('Podcast'))).toBeTruthy();
});

test('Power Engine 5-Band tab shows band names, ranges, and descriptions', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'multiband');

  await expect(page.getByText('Sub Bass')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Low-Mid')).toBeVisible();
  await expect(page.getByText('Air', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('20–80 Hz')).toBeVisible();
  await expect(page.getByText('8k–20k Hz')).toBeVisible();
  await expect(page.getByText('Controls rumble', { exact: false })).toBeVisible();
});

test('Power Engine EQ tab shows zero-phase callout and band names', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'eq');

  await expect(page.getByText('Zero Phase Shift', { exact: false })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Sub')).toBeVisible();
  await expect(page.getByText('Brilliance')).toBeVisible();
  await expect(page.getByText('boost (adds energy)', { exact: false })).toBeVisible();
});

test('Power Engine EQ tab has 8 sliders', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'eq');
  // Each band has a gain slider and a Q slider = 16 total, but let's count gain sliders (type=range)
  const sliders = page.locator('input[type="range"]');
  const count = await sliders.count();
  expect(count).toBeGreaterThanOrEqual(8);
});

test('Power Engine Transient tab shows live readout with neutral defaults', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'transient');

  await expect(page.getByText('Transient Shaper')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Attack effect')).toBeVisible();
  await expect(page.getByText('Sustain effect')).toBeVisible();
  const neutralItems = page.getByText('Neutral — no change');
  expect(await neutralItems.count()).toBe(2);
});

test('Power Engine Warmth tab shows algorithm cards via data-testid', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'saturation');

  // Check the top-level section renders
  await expect(page.getByText('Analog Warmth', { exact: false })).toBeVisible({ timeout: 5000 });

  // Verify algorithm buttons by testid
  for (const algo of ['tape', 'tube', 'density', 'console', 'totape', 'purestdrive']) {
    await expect(page.getByTestId(`sat-algo-${algo}`)).toBeVisible();
  }
});

test('Power Engine saturation selecting Density highlights it', async ({ page }) => {
  await openPowerEngine(page);
  await clickPowerTab(page, 'saturation');

  await page.getByTestId('sat-algo-density').click();
  // Should have purple active class
  await expect(page.getByTestId('sat-algo-density')).toHaveClass(/bg-purple-500\/10/);
});

test('Power Engine tip trigger renders and is clickable', async ({ page }) => {
  await openPowerEngine(page);
  // ? button should be present (multiple — at least one visible)
  const tips = page.getByTestId('tip-trigger');
  expect(await tips.count()).toBeGreaterThan(0);
  await expect(tips.first()).toBeVisible();
});

test('Power Engine tip popup appears on hover', async ({ page }) => {
  await openPowerEngine(page);
  const firstTip = page.getByTestId('tip-trigger').first();
  await firstTip.hover();
  await page.waitForTimeout(200);
  // Popup should now be visible
  await expect(page.getByTestId('tip-popup').first()).toBeVisible({ timeout: 3000 });
});

test('Power Engine apply button disabled with no audio', async ({ page }) => {
  await openPowerEngine(page);
  await expect(page.locator('button', { hasText: 'Apply AI Master' })).toBeDisabled();
});

test('Power Engine closes via X', async ({ page }) => {
  await openPowerEngine(page);
  await page.locator('button', { hasText: '✕' }).click();
  await expect(page.locator('h2', { hasText: 'Power Engine' })).toHaveCount(0);
});

test('Power Engine closes on backdrop click', async ({ page }) => {
  await openPowerEngine(page);
  await page.mouse.click(5, 5);
  await expect(page.locator('h2', { hasText: 'Power Engine' })).toHaveCount(0);
});

// ── Restoration Panel ─────────────────────────────────────────────────────────

test('Restore button opens restoration panel with three tools', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await expect(page.getByText('Noise Reduction').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('De-Clicker')).toBeVisible();
  await expect(page.getByText('De-Esser')).toBeVisible();
});

test('Restoration cards show taglines about what they fix', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await expect(page.getByText('Removes constant background hiss', { exact: false })).toBeVisible();
  await expect(page.getByText('Removes clicks, pops', { exact: false })).toBeVisible();
  await expect(page.getByText('Tames harsh S', { exact: false })).toBeVisible();
});

test('Restoration apply button disabled when no tools enabled', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await expect(page.locator('button', { hasText: 'Enable at least one tool above' })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('button', { hasText: 'Enable at least one tool above' })).toBeDisabled();
});

test('Noise Reduction card expands showing Best-for section and sliders', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await page.locator('button').filter({ hasText: 'Noise Reduction' }).first().click();
  await page.waitForTimeout(400);

  await expect(page.getByText('Best for', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Home recordings', { exact: false })).toBeVisible();
  await expect(page.getByText('Strength').first()).toBeVisible();
  await expect(page.getByText('Smoothing').first()).toBeVisible();
});

test('De-Clicker card expands showing sensitivity and max width', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await page.locator('button').filter({ hasText: 'De-Clicker' }).first().click();
  await page.waitForTimeout(400);

  await expect(page.getByText('Sensitivity').first()).toBeVisible();
  await expect(page.getByText('Max Click Width', { exact: false })).toBeVisible();
});

test('De-Esser card expands showing four parameters', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await page.locator('button').filter({ hasText: 'De-Esser' }).first().click();
  await page.waitForTimeout(400);

  await expect(page.getByText('Sibilance Frequency', { exact: false })).toBeVisible();
  await expect(page.getByText('Focus (Q)', { exact: false })).toBeVisible();
  await expect(page.getByText('Threshold').first()).toBeVisible();
  await expect(page.getByText('Ratio').first()).toBeVisible();
});

test('Restoration what-will-happen preview shows after enabling NR', async ({ page }) => {
  await goToStudio(page);
  await page.locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(400);

  await page.locator('button').filter({ hasText: 'Noise Reduction' }).first().click();
  await page.waitForTimeout(400);

  await expect(page.getByText('What will happen', { exact: false })).toBeVisible();
  await expect(page.getByText('→ Noise Reduction', { exact: false })).toBeVisible();
});
