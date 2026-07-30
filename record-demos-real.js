#!/usr/bin/env node

/**
 * REAL DEMO RECORDING WITH PROPER APP INTERACTION
 *
 * Records actual app behavior:
 * - Waits for elements before clicking
 * - Captures screenshot changes
 * - Logs all interactions
 * - Creates video from screenshot timeline
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    title: 'Paper Perfector - AI Document Assistant',
    url: 'http://localhost:5173',
    duration: 50
  },
  {
    id: 'master-lease',
    title: 'Master Lease - Real Estate Management',
    url: 'http://localhost:3002',
    duration: 50
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster - Data Processing Platform',
    url: 'http://localhost:3003',
    duration: 50
  },
  {
    id: 'echo-sound-lab',
    title: 'Echo Sound Lab - AI Music & Video Studio',
    url: 'http://localhost:3005',
    duration: 90
  }
];

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function waitMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Safely click an element and log the result
 */
async function safeClick(page, selector, description) {
  try {
    await page.waitForSelector(selector, { timeout: 3000 }).catch(() => null);
    const element = await page.$(selector);

    if (element) {
      // Scroll element into view
      await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, selector);

      await waitMs(300);
      await element.click();
      log(`     ✓ Clicked: ${description}`, 'green');
      return true;
    } else {
      log(`     ✗ Element not found: ${description} (${selector})`, 'yellow');
      return false;
    }
  } catch (e) {
    log(`     ✗ Click failed: ${description}`, 'yellow');
    return false;
  }
}

/**
 * Scroll the page and show progress
 */
async function scrollPage(page, distance, duration = 1000) {
  await page.evaluate((dist) => {
    window.scrollBy({ top: dist, behavior: 'smooth' });
  }, distance);
  await waitMs(duration);
}

/**
 * Record a demo with proper interaction capture
 */
async function recordDemo(browser, demoConfig) {
  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`Recording: ${demoConfig.title}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');
  log(`\n   📍 URL: ${demoConfig.url}`, 'yellow');
  log(`   ⏱️  Duration: ${demoConfig.duration}s`, 'yellow');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const screenshotsDir = path.join(demoDir, 'screenshots');

  // Clear and recreate screenshots directory
  if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true });
  }
  fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    log(`\n   🌐 Loading app...`, 'yellow');
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log(`   ✓ App loaded`, 'green');

    await waitMs(1500);

    // Start screenshot capture
    log(`   📷 Starting screenshot capture...`, 'yellow');
    let frameNum = 0;
    const captureInterval = setInterval(async () => {
      try {
        const screenshot = await page.screenshot();
        const framePath = path.join(screenshotsDir, `frame_${String(frameNum).padStart(5, '0')}.png`);
        fs.writeFileSync(framePath, screenshot);
        frameNum++;
      } catch (e) {
        // Screenshot failed silently
      }
    }, 333); // ~3 fps for smooth video

    // Execute demo-specific interactions
    log(`\n   🎬 Executing demo interactions:\n`, 'yellow');

    switch (demoConfig.id) {
      case 'paper-perfector':
        // Try to find and interact with visible elements
        await scrollPage(page, -500);
        await waitMs(1000);

        // Look for any clickable elements that exist
        const ppElements = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, [role="button"]')).map(el => ({
            text: el.textContent?.trim(),
            class: el.className,
            id: el.id,
            selector: el.id ? `#${el.id}` : `.${el.className?.split(' ')[0]}`
          })).slice(0, 10);
        });

        if (ppElements.length > 0) {
          log(`     Found clickable elements:`, 'cyan');
          ppElements.forEach(el => {
            log(`       - "${el.text}" (${el.id || el.class})`, 'cyan');
          });
        }

        // Scroll through the document
        for (let i = 0; i < 5; i++) {
          log(`     Scrolling down... (${i + 1}/5)`, 'yellow');
          await scrollPage(page, 200, 1500);
        }

        for (let i = 0; i < 3; i++) {
          log(`     Scrolling up... (${i + 1}/3)`, 'yellow');
          await scrollPage(page, -200, 1500);
        }
        break;

      case 'master-lease':
        log(`     Step 1: Loading zip code interface...`, 'yellow');
        await scrollPage(page, -500);
        await waitMs(1000);

        await safeClick(page, '#zip', 'Zip code input');
        await waitMs(800);
        await page.type('#zip', '94114', { delay: 100 });
        log(`     ✓ Entered zip code`, 'green');
        await waitMs(1000);

        await safeClick(page, '#loadZipProfile', 'Load Zip Profile');
        await waitMs(2000);

        log(`     Step 2: Scrolling through market data...`, 'yellow');
        for (let i = 0; i < 5; i++) {
          await scrollPage(page, 150, 1200);
        }

        log(`     Step 3: Adding comparables...`, 'yellow');
        await safeClick(page, '#addRoomComp', 'Add Room Comp');
        await waitMs(1500);

        await safeClick(page, '#addHouseComp', 'Add House Comp');
        await waitMs(1500);

        log(`     Step 4: Final scrolling...`, 'yellow');
        for (let i = 0; i < 3; i++) {
          await scrollPage(page, 150, 1200);
        }

        await safeClick(page, '#jumpListings', 'Jump to Listings');
        await waitMs(2000);
        break;

      case 'data-blaster':
        log(`     Step 1: Starting guided setup...`, 'yellow');
        await scrollPage(page, -500);
        await waitMs(1000);

        await safeClick(page, '#guided-start', 'Guided Start');
        await waitMs(2000);

        await safeClick(page, '#load-sample', 'Load Sample Data');
        await waitMs(2000);

        log(`     Step 2: Scrolling through workspace...`, 'yellow');
        for (let i = 0; i < 4; i++) {
          await scrollPage(page, 200, 1200);
        }

        log(`     Step 3: Toggling theme...`, 'yellow');
        await safeClick(page, '#theme-toggle', 'Toggle Theme');
        await waitMs(1500);

        log(`     Step 4: Generating story...`, 'yellow');
        await safeClick(page, '#story-once', 'Generate Story');
        await waitMs(2000);

        await safeClick(page, '#export-pptx', 'Export PowerPoint');
        await waitMs(1500);
        break;

      case 'echo-sound-lab':
        log(`     Step 1: Exploring interface...`, 'yellow');
        for (let i = 0; i < 6; i++) {
          await scrollPage(page, 150, 1200);
        }

        log(`     Step 2: Scrolling back up...`, 'yellow');
        for (let i = 0; i < 4; i++) {
          await scrollPage(page, -150, 1200);
        }

        log(`     Step 3: Final exploration...`, 'yellow');
        for (let i = 0; i < 5; i++) {
          await scrollPage(page, 120, 1000);
        }
        break;
    }

    // Wait for remaining recording time
    const remainingTime = demoConfig.duration * 1000 - (frameNum * 333);
    if (remainingTime > 0) {
      log(`\n   ⏳ Recording remaining time (${(remainingTime / 1000).toFixed(1)}s)...`, 'yellow');
      await waitMs(Math.min(remainingTime, 5000));
    }

    clearInterval(captureInterval);

    // Verify screenshots
    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
    log(`\n   ✓ Captured ${screenshots} frames`, 'green');

    if (screenshots > 10) {
      // Create video from screenshots
      log(`   🎬 Creating video from screenshots...`, 'yellow');
      const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
      const cmd = `${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`;

      try {
        execSync(cmd, { stdio: 'pipe' });
        const fileSize = fs.statSync(videoPath).size;
        log(`   ✓ Video created: ${(fileSize / 1024 / 1024).toFixed(2)}MB`, 'green');
        return true;
      } catch (e) {
        log(`   ✗ Video creation failed`, 'yellow');
        return false;
      }
    } else {
      log(`   ✗ Not enough frames captured`, 'yellow');
      return false;
    }

  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'yellow');
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  log(`${'═'.repeat(70)}`, 'blue');
  log(`🎬 REAL DEMO RECORDING SYSTEM`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');

  // Verify tools
  if (!fs.existsSync(FFMPEG) || !fs.existsSync(FFPROBE)) {
    log('❌ FFmpeg/FFprobe not found', 'yellow');
    process.exit(1);
  }

  // Create directories
  if (!fs.existsSync(DEMOS_DIR)) {
    fs.mkdirSync(DEMOS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (let i = 0; i < DEMO_CONFIGS.length; i++) {
      const config = DEMO_CONFIGS[i];
      const success = await recordDemo(browser, config);

      if (!success) {
        log(`   ⚠️  Demo ${config.id} did not record properly`, 'yellow');
      }
    }
  } finally {
    await browser.close();
  }

  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`✅ Recording complete!`, 'green');
  log(`📁 Videos at: ~/demos/[demo-id]/final_demo_optimized.mp4`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'yellow');
  process.exit(1);
});
