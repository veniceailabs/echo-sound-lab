import { test, expect } from '@playwright/test';

test('debug: studio state after master click', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => { if (msg.type() !== 'error') logs.push(msg.text()); });

  await page.goto('/');
  await page.getByTestId('mode-tab-ai_studio').click();
  await page.waitForTimeout(800);

  // Check what mode tab we're on
  const aiStudioTab = page.getByTestId('mode-tab-ai_studio');
  const isSelected = await aiStudioTab.getAttribute('class');
  console.log('AI Studio tab class:', isSelected?.slice(0, 80));

  const masterBtn = page.locator('button', { hasText: 'Master / Engine' });
  const btnCount = await masterBtn.count();
  console.log('Master btn count:', btnCount);

  await masterBtn.click();
  await page.waitForTimeout(1000);

  const consoleAfter = logs.filter(l => l.includes('Power') || l.includes('Engine') || l.includes('show'));
  console.log('Relevant console:', JSON.stringify(consoleAfter));

  // Check dialog/modal presence
  const dialogs = await page.locator('[role="dialog"]').count();
  const fixed = await page.locator('.fixed').count();
  console.log('Dialog count:', dialogs, 'Fixed elements:', fixed);

  await page.screenshot({ path: '/tmp/studio-debug.png', fullPage: true });
});
