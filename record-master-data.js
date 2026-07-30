#!/usr/bin/env node

/**
 * SIMPLIFIED RECORDING FOR MASTER LEASE & DATA BLASTER
 *
 * Fixed issues:
 * - Reliable scrolling (fixed iterations instead of height calculation)
 * - Better popup handling
 * - Victoria voice (Siri-like)
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const VOICE = 'Victoria';

const DEMO_CONFIGS = [
  {
    id: 'master-lease',
    url: 'http://localhost:3002',
    duration: 100,
    voiceovers: [
      'Master Lease is the complete platform for real estate investment analysis.',
      'The main interface shows market input fields and property analysis sections.',
      'Enter a zip code to instantly load lyve market data for your area.',
      'Real-time market data loads with current trends, sales prices, and rental rates.',
      'Market assumptions are cached for accurate and consistent investment modeling.',
      'View detailed market data including rental prices, sales trends, and comparable properties.',
      'Room-level rental comparables provide granular data for specific property types and sizes.',
      'Whole-home rental data benchmarks competitive pricing across the market.',
      'Property comparables show similar homes sold recently, informing your investment strategy.',
      'Advanced profit analysis reveals potential returns and key investment metrics.',
      'Browse available listings directly to identify specific investment opportunities.',
      'Master Lease brings professional-grade analysis to real estate investing.'
    ]
  },
  {
    id: 'data-blaster',
    url: 'http://localhost:3003',
    duration: 100,
    voiceovers: [
      'Data Blaster is the fast way to analyze any dataset.',
      'The workspace provides data input on the left and analysis results on the right.',
      'Get guided through the analysis workflow step by step with clear instructions.',
      'Load sample data to instantly see how the system works with real information.',
      'The system automatically parses your data and identifies all column headers.',
      'Explore comprehensive data health panels showing quality metrics and potential issues.',
      'Advanced mapping controls let you customize analysis and data transformations.',
      'Switch between light and dark themes for comfortable viewing and analysis.',
      'View the complete workspace with all your analysis controls and options.',
      'Generate natural language insights and stories from your data automatically.',
      'Export your analysis as PowerPoint presentations or formatted summary notes.',
      'Data Blaster transforms raw data into confident business decisions.'
    ]
  }
];

const colors = {
  reset: '\x1b[0m',
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

async function generateVoiceover(text, outputPath) {
  return new Promise((resolve) => {
    try {
      const escapedText = text.replace(/"/g, '\\"');
      const aiffPath = outputPath.replace('.wav', '.aiff');
      const cmd = `say -v '${VOICE}' -o "${aiffPath}" "${escapedText}" && ${FFMPEG} -i "${aiffPath}" "${outputPath}" -y 2>/dev/null && rm "${aiffPath}" 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
      resolve(fs.existsSync(outputPath));
    } catch (e) {
      resolve(fs.existsSync(outputPath));
    }
  });
}

async function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(output) || 0;
  } catch {
    return 0;
  }
}

async function recordDemo(browser, demoConfig) {
  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`📹 ${demoConfig.id.toUpperCase()}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const screenshotsDir = path.join(demoDir, 'screenshots');
  const audioDir = path.join(demoDir, 'audio');

  // Clear and recreate
  if (fs.existsSync(screenshotsDir)) fs.rmSync(screenshotsDir, { recursive: true });
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    log(`   Loading...`, 'yellow');
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log(`   ✓ Loaded\n`, 'green');
    await wait(2000);

    let frameNum = 0;
    const startTime = Date.now();

    const captureInterval = setInterval(async () => {
      try {
        const screenshot = await page.screenshot();
        fs.writeFileSync(
          path.join(screenshotsDir, `frame_${String(frameNum).padStart(5, '0')}.png`),
          screenshot
        );
        frameNum++;
      } catch (e) {}
    }, 333);

    log(`   🎬 INTERACTIONS:\n`, 'yellow');

    if (demoConfig.id === 'master-lease') {
      // Scroll to top
      await page.evaluate(() => window.scrollBy(0, -1000));
      await wait(800);

      // Enter zip
      await page.evaluate(() => document.querySelector('#zip')?.focus());
      await page.keyboard.type('94114', { delay: 80 });
      log(`     ✓ Zip: 94114`, 'green');
      await wait(1000);

      // Load profile
      await page.evaluate(() => document.querySelector('#loadZipProfile')?.click());
      log(`     ✓ Loaded profile`, 'green');
      await wait(2500);

      // Scroll down (12 sections x 150px = 1800px)
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, 150));
        await wait(400);
      }
      log(`     ✓ Scrolled down`, 'green');

      // Add comps
      await page.evaluate(() => document.querySelector('#addRoomComp')?.click());
      log(`     ✓ Room comp`, 'green');
      await wait(1500);

      await page.evaluate(() => document.querySelector('#addHouseComp')?.click());
      log(`     ✓ House comp`, 'green');
      await wait(1500);

      // Scroll more
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 120));
        await wait(400);
      }

      // Jump to listings
      await page.evaluate(() => document.querySelector('#jumpListings')?.click());
      log(`     ✓ Listings`, 'green');
      await wait(2000);

      // Scroll back to top
      for (let i = 0; i < 20; i++) {
        await page.evaluate(() => window.scrollBy(0, -150));
        await wait(300);
      }

    } else if (demoConfig.id === 'data-blaster') {
      // Scroll to top
      await page.evaluate(() => window.scrollBy(0, -1000));
      await wait(800);

      // Guided start
      await page.evaluate(() => document.querySelector('#guided-start')?.click());
      log(`     ✓ Guided start`, 'green');
      await wait(2000);

      // Close popups aggressively
      await page.evaluate(() => {
        // Try multiple selectors for closing popups
        document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], .overlay, .backdrop').forEach(el => {
          const closeBtn = el.querySelector('[aria-label*="close"], [aria-label*="Close"], .close, .close-btn, [data-testid*="close"], button[aria-label]');
          if (closeBtn && closeBtn.offsetParent !== null) closeBtn.click();
        });
        // Also try clicking escape key
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      });
      await wait(1000);

      // Load sample
      await page.evaluate(() => document.querySelector('#load-sample')?.click());
      log(`     ✓ Sample data`, 'green');
      await wait(2500);

      // Close popups aggressively
      await page.evaluate(() => {
        document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], .overlay, .backdrop').forEach(el => {
          const closeBtn = el.querySelector('[aria-label*="close"], [aria-label*="Close"], .close, .close-btn, [data-testid*="close"], button[aria-label]');
          if (closeBtn && closeBtn.offsetParent !== null) closeBtn.click();
        });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      });
      await wait(1000);

      // Scroll down (12 sections)
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, 140));
        await wait(400);
      }
      log(`     ✓ Scrolled down`, 'green');

      // Toggle theme
      await page.evaluate(() => document.querySelector('#theme-toggle')?.click());
      log(`     ✓ Theme toggle`, 'green');
      await wait(1500);

      // Scroll back up
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, -140));
        await wait(400);
      }
      log(`     ✓ Scrolled up`, 'green');

      // Generate story
      await page.evaluate(() => document.querySelector('#story-once')?.click());
      log(`     ✓ Story gen`, 'green');
      await wait(2000);

      // Close popups
      await page.evaluate(() => {
        document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]').forEach(el => {
          const closeBtn = el.querySelector('[aria-label*="close"], .close');
          if (closeBtn) closeBtn.click();
        });
      });
      await wait(800);

      // Export
      await page.evaluate(() => document.querySelector('#export-pptx')?.click());
      log(`     ✓ Export`, 'green');
      await wait(1500);
    }

    // Wait for remaining time
    const elapsedMs = frameNum * 333;
    const targetMs = demoConfig.duration * 1000;
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    if (remainingMs > 0) {
      log(`\n   ⏳ Recording ${(remainingMs / 1000).toFixed(0)}s more...\n`, 'yellow');
      await wait(remainingMs);
    }

    clearInterval(captureInterval);

    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
    log(`   ✓ ${screenshots} frames\n`, 'green');

    // Generate voiceovers
    log(`   🎙️  Voiceovers...`, 'yellow');
    const audioSegments = [];

    for (let i = 0; i < demoConfig.voiceovers.length; i++) {
      const text = demoConfig.voiceovers[i];
      try {
        const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
        const success = await generateVoiceover(text, voPath);
        if (success) {
          const duration = await getAudioDuration(voPath);
          audioSegments.push({ path: voPath, duration });
          process.stdout.write(`\r   ${i + 1}/${demoConfig.voiceovers.length}`);
        }
      } catch (e) {}
    }

    log(`\n   ✓ Ready\n`, 'green');
    if (audioSegments.length === 0) return false;

    // Build audio timeline
    log(`   🎵 Timeline...`, 'yellow');
    const audioTimelinePath = path.join(audioDir, 'timeline.wav');
    const concatFile = path.join(audioDir, 'concat.txt');

    let concatContent = '';
    audioSegments.forEach(seg => {
      concatContent += `file '${seg.path}'\n`;
    });
    fs.writeFileSync(concatFile, concatContent);

    try {
      execSync(`${FFMPEG} -f concat -safe 0 -i "${concatFile}" -c copy "${audioTimelinePath}" -y 2>/dev/null`, { stdio: 'pipe' });
    } catch (e) {
      return false;
    }

    // Create video
    log(`   🎬 Video...`, 'yellow');
    const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
    try {
      execSync(`${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`, { stdio: 'pipe' });
    } catch (e) {
      return false;
    }

    // Mix (without -shortest to allow full audio playback)
    log(`   🎵 Mixing...`, 'yellow');
    const finalPath = path.join(demoDir, 'demo_final.mp4');
    try {
      execSync(`${FFMPEG} -i "${videoPath}" -i "${audioTimelinePath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${finalPath}" -y 2>/dev/null`, { stdio: 'pipe' });
      fs.copyFileSync(finalPath, videoPath);
      fs.unlinkSync(finalPath);

      const size = fs.statSync(videoPath).size;
      log(`   ✓ ${(size / 1024 / 1024).toFixed(2)}MB\n`, 'green');
      return true;
    } catch (e) {
      return false;
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
  log(`🎬 MASTER LEASE & DATA BLASTER`, 'blue');
  log(`Voice: Victoria (Siri-like)`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue\n');

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

  log(`${'═'.repeat(70)}`, 'blue');
  log(`✅ COMPLETE!`, 'green');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
