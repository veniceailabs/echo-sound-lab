import { test, expect } from '@playwright/test';

test('landing page uses the studio shell and exposes the proof player', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Echo Sound Lab', { exact: false })).toBeVisible();
  await expect(page.getByText('Drop your mix or stems here.', { exact: false })).toBeVisible();
  await expect(page.getByText('A/B proof player', { exact: false })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Open studio' })).toBeVisible();
});

test('public download page gates the archive until payment clears', async ({ page }) => {
  await page.route('**/api/proxy/core/api/v1/session/load/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        session: {
          job_id: 'job-public-proof-001',
          audio_paths: {
            unmixed_summed_audio: '/demos/before.mp3',
            final_mastered_audio: '/demos/after.mp3',
          },
          dsp_state: {},
          payment_status: 'unpaid',
          workspace_sandbox_delivery: {
            vault_archive_path: '/vault/job-public-proof-001.zip',
            staged: true,
          },
        },
      }),
    });
  });

  await page.route('**/api/proxy/core/api/v1/session/recover**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'empty',
        session: null,
      }),
    });
  });

  await page.goto('/download/job-public-proof-001');

  await expect(page.getByText('A/B proof', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Purchase/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download unlocked archive/i })).toHaveCount(0);
});

test('public download page reveals the archive after payment clears', async ({ page }) => {
  await page.route('**/api/proxy/core/api/v1/session/load/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        session: {
          job_id: 'job-public-proof-002',
          audio_paths: {
            unmixed_summed_audio: '/demos/before.mp3',
            final_mastered_audio: '/demos/after.mp3',
          },
          dsp_state: {},
          payment_status: 'paid',
          workspace_sandbox_delivery: {
            vault_archive_path: '/vault/job-public-proof-002.zip',
            staged: true,
          },
        },
      }),
    });
  });

  await page.goto('/download/job-public-proof-002');

  await expect(page.getByRole('link', { name: /Download unlocked archive/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Purchase/i })).toHaveCount(0);
});

test('public checkout preserves the job id and return URLs', async ({ page }) => {
  let checkoutPayload: Record<string, unknown> | null = null;

  await page.route('**/api/proxy/core/api/v1/session/load/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        session: {
          job_id: 'job-public-proof-003',
          audio_paths: {
            unmixed_summed_audio: '/demos/before.mp3',
            final_mastered_audio: '/demos/after.mp3',
          },
          dsp_state: {},
          payment_status: 'unpaid',
          workspace_sandbox_delivery: {
            vault_archive_path: '/vault/job-public-proof-003.zip',
            staged: true,
          },
        },
      }),
    });
  });

  await page.route('**/api/proxy/core/api/v1/billing/checkout', async (route) => {
    checkoutPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'job-public-proof-003',
        checkout_session_id: 'cs_test_job_public_proof_003',
        checkout_url: '/download/job-public-proof-003?checkout=success',
      }),
    });
  });

  await page.goto('/download/job-public-proof-003');
  await page.getByRole('button', { name: /Purchase/i }).click();

  await expect(page).toHaveURL(/\/download\/job-public-proof-003\?checkout=success$/);
  expect(checkoutPayload).not.toBeNull();
  expect(checkoutPayload?.job_id).toBe('job-public-proof-003');
  expect(checkoutPayload?.tier_price_id).toBeTruthy();
  expect(String(checkoutPayload?.success_url || '')).toContain('/download/job-public-proof-003?checkout=success');
  expect(String(checkoutPayload?.cancel_url || '')).toContain('/download/job-public-proof-003?checkout=cancelled');
});
