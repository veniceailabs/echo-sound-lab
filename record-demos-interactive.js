#!/usr/bin/env node

/**
 * INTERACTIVE DEMO RECORDING
 *
 * Uses JavaScript evaluation to trigger real app state changes
 * instead of just clicking DOM elements
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    title: 'Paper Perfector',
    url: 'http://localhost:5173',
    duration: 50
  },
  {
    id: 'master-lease',
    title: 'Master Lease',
    url: 'http://localhost:3002',
    duration: 50
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster',
    url: 'http://localhost:3003',
    duration: 50
  },
  {
    id: 'echo-sound-lab',
    title: 'Echo Sound Lab',
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

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function recordDemo(browser, demoConfig) {
  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`Recording: ${demoConfig.title}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const screenshotsDir = path.join(demoDir, 'screenshots');

  // Clear and recreate
  if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true });
  }
  fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    log(`   Loading ${demoConfig.url}...`, 'yellow');
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log(`   ✓ Loaded`, 'green');

    await wait(2000);

    // Start capturing
    log(`   📷 Capturing...`, 'yellow');
    let frameNum = 0;
    const captureInterval = setInterval(async () => {
      try {
        const screenshot = await page.screenshot();
        const framePath = path.join(screenshotsDir, `frame_${String(frameNum).padStart(5, '0')}.png`);
        fs.writeFileSync(framePath, screenshot);
        frameNum++;
      } catch (e) {
        // Silently fail
      }
    }, 333); // ~3 fps

    log(`\n   🎬 Interactions:\n`, 'yellow');

    // Demo-specific interaction logic
    if (demoConfig.id === 'paper-perfector') {
      log(`     Scrolling document...`, 'yellow');
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 100);
        });
        await wait(800);
      }

      log(`     Scrolling back...`, 'yellow');
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, -100);
        });
        await wait(800);
      }

      log(`     More scrolling...`, 'yellow');
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 80);
        });
        await wait(700);
      }
    } else if (demoConfig.id === 'master-lease') {
      // Scroll to input
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Click zip input
      const zipClicked = await page.evaluate(() => {
        const input = document.querySelector('#zip');
        if (input) {
          input.focus();
          input.click();
          return true;
        }
        return false;
      });
      log(`     ${zipClicked ? '✓' : '✗'} Focused zip input`, 'yellow');

      // Type zip code
      await page.keyboard.type('94114', { delay: 80 });
      log(`     ✓ Entered zip: 94114`, 'green');
      await wait(1000);

      // Click load button
      const loadClicked = await page.evaluate(() => {
        const btn = document.querySelector('#loadZipProfile');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${loadClicked ? '✓' : '✗'} Clicked Load Profile`, 'yellow');
      await wait(2500);

      // Scroll to see results
      log(`     Scrolling through results...`, 'yellow');
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 120);
        });
        await wait(1000);
      }

      // Click add room comp
      const roomClicked = await page.evaluate(() => {
        const btn = document.querySelector('#addRoomComp');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${roomClicked ? '✓' : '✗'} Clicked Add Room Comp`, 'yellow');
      await wait(1500);

      // Click add house comp
      const houseClicked = await page.evaluate(() => {
        const btn = document.querySelector('#addHouseComp');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${houseClicked ? '✓' : '✗'} Clicked Add House Comp`, 'yellow');
      await wait(1500);

      log(`     Final scrolling...`, 'yellow');
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 150);
        });
        await wait(1200);
      }

      // Click listings
      const listingsClicked = await page.evaluate(() => {
        const btn = document.querySelector('#jumpListings');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${listingsClicked ? '✓' : '✗'} Clicked Listings`, 'yellow');
      await wait(2000);

    } else if (demoConfig.id === 'data-blaster') {
      // Scroll to buttons
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Click guided start
      const guidedClicked = await page.evaluate(() => {
        const btn = document.querySelector('#guided-start');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${guidedClicked ? '✓' : '✗'} Clicked Guided Start`, 'yellow');
      await wait(2000);

      // Click load sample
      const sampleClicked = await page.evaluate(() => {
        const btn = document.querySelector('#load-sample');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${sampleClicked ? '✓' : '✗'} Clicked Load Sample`, 'yellow');
      await wait(2500);

      // Scroll through workspace
      log(`     Scrolling through workspace...`, 'yellow');
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 140);
        });
        await wait(1100);
      }

      // Toggle theme
      const themeClicked = await page.evaluate(() => {
        const btn = document.querySelector('#theme-toggle');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${themeClicked ? '✓' : '✗'} Toggled Theme`, 'yellow');
      await wait(1500);

      // Scroll back
      log(`     Scrolling back...`, 'yellow');
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, -180);
        });
        await wait(1200);
      }

      // Generate story
      const storyClicked = await page.evaluate(() => {
        const btn = document.querySelector('#story-once');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${storyClicked ? '✓' : '✗'} Clicked Generate Story`, 'yellow');
      await wait(2000);

      // Export
      const exportClicked = await page.evaluate(() => {
        const btn = document.querySelector('#export-pptx');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      log(`     ${exportClicked ? '✓' : '✗'} Clicked Export`, 'yellow');
      await wait(1500);

    } else if (demoConfig.id === 'echo-sound-lab') {
      log(`     Exploring interface...`, 'yellow');
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 100);
        });
        await wait(1000);
      }

      log(`     Scrolling back...`, 'yellow');
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, -120);
        });
        await wait(1100);
      }

      log(`     Final exploration...`, 'yellow');
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 110);
        });
        await wait(1000);
      }
    }

    // Wait remaining time
    const elapsedMs = frameNum * 333;
    const targetMs = demoConfig.duration * 1000;
    const remainingMs = targetMs - elapsedMs;

    if (remainingMs > 0) {
      log(`\n   ⏳ Recording remaining ${(remainingMs / 1000).toFixed(1)}s...`, 'yellow');
      await wait(Math.min(remainingMs, 8000));
    }

    clearInterval(captureInterval);

    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
    log(`\n   ✓ ${screenshots} frames captured`, 'green');

    if (screenshots > 10) {
      log(`   🎬 Creating video...`, 'yellow');
      const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
      const cmd = `${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`;

      try {
        execSync(cmd, { stdio: 'pipe' });
        const size = fs.statSync(videoPath).size;
        log(`   ✓ Video: ${(size / 1024 / 1024).toFixed(2)}MB`, 'green');
        return true;
      } catch (e) {
        log(`   ✗ Video failed`, 'yellow');
        return false;
      }
    }

  } catch (error) {
    log(`   ❌ ${error.message}`, 'yellow');
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  log(`${'═'.repeat(70)}`, 'blue');
  log(`🎬 INTERACTIVE DEMO RECORDING`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue\n');

  if (!fs.existsSync(DEMOS_DIR)) {
    fs.mkdirSync(DEMOS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const config of DEMO_CONFIGS) {
      await recordDemo(browser, config);
    }
  } finally {
    await browser.close();
  }

  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`✅ Done! Videos ready at ~/demos/[app]/final_demo_optimized.mp4`, 'green');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
