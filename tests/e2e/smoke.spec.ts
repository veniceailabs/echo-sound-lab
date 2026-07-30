import { test, expect } from '@playwright/test';
import path from 'node:path';

test('loads and mode tabs are usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('mode-tab-single')).toBeVisible();
  await expect(page.getByTestId('mode-tab-multi')).toBeVisible();
  await expect(page.getByTestId('mode-tab-ai_studio')).toBeVisible();
  await expect(page.getByTestId('mode-tab-video')).toBeVisible();
});

test('studio onboarding tour is visible and does not overlap the upload card', async ({ page }) => {
  await page.goto('/');

  const tour = page.getByTestId('studio-tour-tooltip');
  const uploadCard = page.getByTestId('studio-upload-card');

  await expect(tour).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('studio-tour-title')).toContainText('Upload a Track');
  await expect(uploadCard).toBeVisible();

  const [tourBox, uploadBox] = await Promise.all([
    tour.boundingBox(),
    uploadCard.boundingBox(),
  ]);

  expect(tourBox).not.toBeNull();
  expect(uploadBox).not.toBeNull();
  if (tourBox && uploadBox) {
    const intersects = !(
      tourBox.x > uploadBox.x + uploadBox.width ||
      tourBox.x + tourBox.width < uploadBox.x ||
      tourBox.y > uploadBox.y + uploadBox.height ||
      tourBox.y + tourBox.height < uploadBox.y
    );
    expect(intersects).toBe(false);
  }
});

test('single track upload advances to ready UI', async ({ page }) => {
  await page.goto('/');

  const audioPath = path.resolve(process.cwd(), 'structure_test.wav');
  await page.getByTestId('single-upload-input').setInputFiles(audioPath);

  // Prove the upload reaches the actionable ready state, not just the analysis pane.
  await expect(page.getByText('Sonic Analysis')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('service-template-bar')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('timeline-export-wav')).toBeVisible({ timeout: 30_000 });
});

test('friendly/advanced toggle works and advanced tools is not dead', async ({ page }) => {
  await page.goto('/');

  const audioPath = path.resolve(process.cwd(), 'structure_test.wav');
  await page.getByTestId('single-upload-input').setInputFiles(audioPath);
  await expect(page.getByText('Sonic Analysis')).toBeVisible({ timeout: 60_000 });

  // Starts in Friendly by default.
  await expect(page.getByText('Friendly Mode')).toBeVisible();
  await expect(page.getByTestId('advanced-tools-toggle')).toBeDisabled();

  // Toggle to Advanced.
  await page.getByTestId('engine-mode-toggle').click();
  await expect(page.getByText('Advanced Mode')).toBeVisible();
  await expect(page.getByTestId('advanced-tools-toggle')).toBeEnabled();

  // Open Advanced Tools modal.
  await page.getByTestId('advanced-tools-toggle').click();
  await expect(page.getByTestId('advanced-tools-modal')).toBeVisible();

  // Close it.
  await page.getByTestId('advanced-tools-close').click();
  await expect(page.getByTestId('advanced-tools-modal')).toHaveCount(0);
});
