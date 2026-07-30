#!/usr/bin/env node

/**
 * ENHANCED DEMO RECORDING
 *
 * Improvements:
 * - Full scrolling (top to bottom, bottom to top) for complete interface view
 * - More feature interactions and clicks
 * - Better voice selection (closer to Siri)
 * - Only records: Paper Perfector, Master Lease, Data Blaster
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

// Use Victoria voice - closer to Siri, more natural
const VOICE = 'Victoria';

const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    url: 'http://localhost:5173',
    duration: 100,
    voiceovers: [
      'Paper Perfector is your intelligent document creation platform powered by AI.',
      'The workspace displays document tiles on the left and editing tools on the right.',
      'Open a document by clicking on any tile in your library.',
      'The editing interface provides structured sections with smart formatting controls.',
      'Scroll through your document to see the full content and document structure.',
      'Access comprehensive formatting tools to customize fonts, colors, and text styling.',
      'Apply professional templates and styling options with a single click.',
      'Use the AI assistant to get intelligent suggestions for improving your writing quality.',
      'Document changes are automatically saved to your library in real-time.',
      'Toggle between light and dark themes for comfortable viewing and editing.',
      'Export your finished documents to PDF, Word, or other formats instantly.',
      'Paper Perfector transforms document creation from tedious to effortless.'
    ]
  },
  {
    id: 'master-lease',
    url: 'http://localhost:3002',
    duration: 75,
    voiceovers: [
      { text: 'Master Lease is the complete platform for real estate investment analysis.', duration: 4 },
      { text: 'The main interface shows market input fields and property analysis sections.', duration: 4 },
      { text: 'Enter a zip code to load live market data for your area.', duration: 3 },
      { text: 'We enter 94114 to load the San Francisco market data.', duration: 3 },
      { text: 'Click Load Profile to cache the market assumptions.', duration: 3 },
      { text: 'Scroll down to see the complete market data and analysis.', duration: 4 },
      { text: 'Continue scrolling to view room comparables and whole-home rent prices.', duration: 4 },
      { text: 'Click Add Room Comp to add granular rent data.', duration: 3 },
      { text: 'Click Add House Comp to benchmark against similar properties.', duration: 3 },
      { text: 'Scroll further to see profit analysis and investment metrics.', duration: 4 },
      { text: 'Jump to listings to browse available properties in the market.', duration: 3 },
      { text: 'Master Lease brings professional analysis to real estate investing.', duration: 3 }
    ]
  },
  {
    id: 'data-blaster',
    url: 'http://localhost:3003',
    duration: 75,
    voiceovers: [
      { text: 'Data Blaster is the fast way to analyze any dataset.', duration: 3 },
      { text: 'The workspace provides data input on the left and analysis on the right.', duration: 4 },
      { text: 'Click Guided Start to walk through the analysis workflow.', duration: 3 },
      { text: 'Click Load Sample Data to see the system in action.', duration: 3 },
      { text: 'The system automatically parses columns and identifies headers.', duration: 3 },
      { text: 'Scroll down to explore the data health panels and quality metrics.', duration: 4 },
      { text: 'Continue scrolling to see the mapping controls and analysis sections.', duration: 4 },
      { text: 'Click Toggle Theme to switch between light and dark mode.', duration: 3 },
      { text: 'Scroll back up to see the top of the workspace.', duration: 3 },
      { text: 'Click Generate Story to create executive insights from your data.', duration: 3 },
      { text: 'Export results as PowerPoint presentations or summary notes.', duration: 3 },
      { text: 'Data Blaster transforms raw data into confident business decisions.', duration: 3 }
    ]
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

  for (const dir of [screenshotsDir, audioDir]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    log(`   Loading app...`, 'yellow');
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

    // Enhanced interactions for each app
    if (demoConfig.id === 'paper-perfector') {
      // Click a tile to open document
      await page.evaluate(() => {
        const tile = document.querySelector('[role="button"], button, .tile');
        if (tile) tile.click();
      });
      log(`     ✓ Opened document`, 'green');
      await wait(1500);

      // Scroll down through document
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, 140));
        await wait(400);
      }
      log(`     ✓ Scrolled down full document`, 'green');

      // Click formatting/styling buttons
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach((btn, i) => {
          if (i < 4 && btn.offsetParent !== null) {
            btn.click();
          }
        });
      });
      log(`     ✓ Applied formatting styles`, 'green');
      await wait(1200);

      // Scroll back up
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, -140));
        await wait(400);
      }
      log(`     ✓ Scrolled back to top`, 'green');

      // Toggle theme
      await page.evaluate(() => {
        const themeBtn = document.querySelector('[aria-label*="theme"], [aria-label*="mode"], .theme-toggle');
        if (themeBtn) themeBtn.click();
      });
      log(`     ✓ Toggled theme`, 'green');
      await wait(1500);

      // Click additional feature buttons
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach((btn, i) => {
          if (i >= 4 && i < 7 && btn.offsetParent !== null) {
            btn.click();
          }
        });
      });
      log(`     ✓ Accessed additional features`, 'green');
      await wait(1000);

    } else if (demoConfig.id === 'master-lease') {
      // Scroll to top
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Enter zip code
      await page.evaluate(() => document.querySelector('#zip')?.focus());
      await page.keyboard.type('94114', { delay: 80 });
      log(`     ✓ Entered zip code: 94114`, 'green');
      await wait(1000);

      // Click load profile
      await page.evaluate(() => document.querySelector('#loadZipProfile')?.click());
      log(`     ✓ Loaded profile`, 'green');
      await wait(2500);

      // Full scroll down
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = 720;
      const scrollSteps = Math.ceil((scrollHeight - viewportHeight) / 200);

      log(`     ✓ Scrolling full interface (${scrollSteps} steps)`, 'green');
      for (let i = 0; i < scrollSteps; i++) {
        await page.evaluate(() => window.scrollBy(0, 200));
        await wait(500);
      }

      // Add comparables
      const addRoom = await page.$('#addRoomComp');
      if (addRoom) {
        await page.evaluate(() => document.querySelector('#addRoomComp')?.click());
        log(`     ✓ Added room comparables`, 'green');
        await wait(1500);
      }

      const addHouse = await page.$('#addHouseComp');
      if (addHouse) {
        await page.evaluate(() => document.querySelector('#addHouseComp')?.click());
        log(`     ✓ Added house comparables`, 'green');
        await wait(1500);
      }

      // Scroll back to top
      await page.evaluate(() => window.scrollBy(0, -scrollHeight));
      await wait(800);
      log(`     ✓ Scrolled back to top`, 'green');

      // Jump to listings
      const jumpListings = await page.$('#jumpListings');
      if (jumpListings) {
        await page.evaluate(() => document.querySelector('#jumpListings')?.click());
        log(`     ✓ Jumped to listings`, 'green');
        await wait(2000);
      }

    } else if (demoConfig.id === 'data-blaster') {
      // Scroll to top
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Click guided start
      const guidedStart = await page.$('#guided-start');
      if (guidedStart) {
        await page.evaluate(() => document.querySelector('#guided-start')?.click());
        log(`     ✓ Started guided setup`, 'green');
        await wait(2000);
      }

      // Close popups
      await page.evaluate(() => {
        document.querySelectorAll('[aria-label*="close"], .modal-close, .close-btn').forEach(el => {
          if (el?.offsetParent !== null) el.click();
        });
      });
      await wait(500);

      // Load sample data
      const loadSample = await page.$('#load-sample');
      if (loadSample) {
        await page.evaluate(() => document.querySelector('#load-sample')?.click());
        log(`     ✓ Loaded sample data`, 'green');
        await wait(2500);
      }

      // Close popups again
      await page.evaluate(() => {
        document.querySelectorAll('[aria-label*="close"], .modal-close, .close-btn').forEach(el => {
          if (el?.offsetParent !== null) el.click();
        });
      });
      await wait(500);

      // Full scroll down
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const scrollSteps = Math.ceil((scrollHeight - 720) / 180);

      log(`     ✓ Scrolling full interface (${scrollSteps} steps)`, 'green');
      for (let i = 0; i < scrollSteps; i++) {
        await page.evaluate(() => window.scrollBy(0, 180));
        await wait(500);
      }

      // Toggle theme
      const themeToggle = await page.$('#theme-toggle');
      if (themeToggle) {
        await page.evaluate(() => document.querySelector('#theme-toggle')?.click());
        log(`     ✓ Toggled theme`, 'green');
        await wait(1500);
      }

      // Scroll back to top
      await page.evaluate(() => window.scrollBy(0, -scrollHeight));
      await wait(800);
      log(`     ✓ Scrolled back to top`, 'green');

      // Generate story
      const generateStory = await page.$('#story-once');
      if (generateStory) {
        await page.evaluate(() => document.querySelector('#story-once')?.click());
        log(`     ✓ Generated story`, 'green');
        await wait(2000);
      }

      // Close popups
      await page.evaluate(() => {
        document.querySelectorAll('[aria-label*="close"], .modal-close, .close-btn').forEach(el => {
          if (el?.offsetParent !== null) el.click();
        });
      });
      await wait(500);

      // Export
      const exportPptx = await page.$('#export-pptx');
      if (exportPptx) {
        await page.evaluate(() => document.querySelector('#export-pptx')?.click());
        log(`     ✓ Exported presentation`, 'green');
        await wait(1500);
      }
    }

    const elapsedMs = frameNum * 333;
    const targetMs = demoConfig.duration * 1000;
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    if (remainingMs > 0) {
      log(`\n   ⏳ Recording ${(remainingMs / 1000).toFixed(1)}s more...\n`, 'yellow');
      await wait(remainingMs);
    }

    clearInterval(captureInterval);

    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
    log(`   ✓ ${screenshots} frames captured\n`, 'green');

    // Generate voiceovers
    log(`   🎙️  GENERATING VOICEOVERS`, 'yellow');
    const audioSegments = [];

    for (let i = 0; i < demoConfig.voiceovers.length; i++) {
      const vo = demoConfig.voiceovers[i];
      try {
        const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
        const success = await generateVoiceover(vo.text, voPath);

        if (success) {
          const duration = await getAudioDuration(voPath);
          audioSegments.push({ path: voPath, duration });
          process.stdout.write(`\r   ${i + 1}/${demoConfig.voiceovers.length} voiceovers`);
        }
      } catch (e) {}
    }

    log(`\n   ✓ Ready\n`, 'green');

    if (audioSegments.length === 0) return false;

    // Build audio timeline
    log(`   🎵 Building timeline...`, 'yellow');
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
    log(`   🎬 Creating video...`, 'yellow');
    const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
    try {
      execSync(`${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`, { stdio: 'pipe' });
    } catch (e) {
      return false;
    }

    // Mix audio with video (without -shortest to allow full audio playback)
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
  log(`🎬 ENHANCED DEMO RECORDING`, 'blue');
  log(`Voice: Victoria (Siri-like quality)`, 'cyan');
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
  log(`✅ COMPLETE!`, 'green');
  log(`📁 ~/demos/[app-id]/final_demo_optimized.mp4`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');
  log('', '');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
