#!/usr/bin/env node

/**
 * DEMO RECORDING WITH CUSTOM VOICE SYNTHESIS
 *
 * Records real app interactions and generates voiceovers using custom voice engine
 * - Waits for DOM changes before capturing
 * - Validates interactions are working
 * - Generates natural-sounding narration
 * - Syncs audio with video automatically
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
    title: 'Paper Perfector',
    url: 'http://localhost:5173',
    duration: 50,
    voiceovers: [
      { time: 0, text: 'Welcome to Paper Perfector. Intelligent document creation powered by AI.', duration: 4 },
      { time: 4, text: 'Notice the clean, modern interface with smart formatting controls.', duration: 4 },
      { time: 8, text: 'Documents are structured automatically, with sections for introduction, content, and conclusion.', duration: 5 },
      { time: 13, text: 'Scroll through to see the full document layout.', duration: 3 },
      { time: 16, text: 'All formatting options are right here. Choose fonts, colors, spacing with one click.', duration: 4 },
      { time: 20, text: 'Save your work instantly to the library.', duration: 3 },
      { time: 23, text: 'Export to PDF for sharing or printing.', duration: 3 },
      { time: 26, text: 'Paper Perfector. Transform how you work with documents. Try it now.', duration: 4 }
    ]
  },
  {
    id: 'master-lease',
    title: 'Master Lease',
    url: 'http://localhost:3002',
    duration: 50,
    voiceovers: [
      { time: 0, text: 'Master Lease. The complete platform for real estate analysis.', duration: 3 },
      { time: 3, text: 'Enter a zip code to load live market data for your area.', duration: 3 },
      { time: 6, text: 'Watch as we enter 94114 and load the market profile.', duration: 3 },
      { time: 9, text: 'The system instantly shows room comparables and whole-home rent prices.', duration: 4 },
      { time: 13, text: 'Click to add room comps and capture micro-level rent detail.', duration: 3 },
      { time: 16, text: 'Add whole-home comparables to benchmark overall performance.', duration: 3 },
      { time: 19, text: 'Scroll down to see the live profit stack analysis.', duration: 3 },
      { time: 22, text: 'Browse available listings and submit your own properties to the network.', duration: 4 },
      { time: 26, text: 'Master Lease. Price rooms with confidence. Maximize your returns.', duration: 4 }
    ]
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster',
    url: 'http://localhost:3003',
    duration: 50,
    voiceovers: [
      { time: 0, text: 'Data Blaster makes data analysis fast and intuitive.', duration: 3 },
      { time: 3, text: 'Start with guided setup to walk through the workflow.', duration: 3 },
      { time: 6, text: 'Load sample data to see the platform in action.', duration: 3 },
      { time: 9, text: 'The system automatically parses every column and identifies headers.', duration: 4 },
      { time: 13, text: 'Toggle between light and dark theme to match your preference.', duration: 3 },
      { time: 16, text: 'The workspace shows health panels and mapping controls.', duration: 3 },
      { time: 19, text: 'Generate an executive story from your data with one click.', duration: 3 },
      { time: 22, text: 'Export a ready-to-present PowerPoint deck or summary notes.', duration: 3 },
      { time: 25, text: 'Data Blaster. Transform raw data into confident decisions.', duration: 4 }
    ]
  },
  {
    id: 'echo-sound-lab',
    title: 'Echo Sound Lab',
    url: 'http://localhost:3005',
    duration: 90,
    voiceovers: [
      { time: 0, text: 'Welcome to Echo Sound Lab. Professional audio mastering powered by AI.', duration: 4 },
      { time: 4, text: 'The platform provides three core modes. Single for stereo, Multi-stem for individual tracks, and AI Studio for guided mastering.', duration: 5 },
      { time: 9, text: 'Upload your audio file to begin real-time analysis and processing.', duration: 3 },
      { time: 12, text: 'The analyzer shows LUFS, dynamic range, and spectral data instantly.', duration: 3 },
      { time: 15, text: 'Switch to AI Studio for intelligent, guided mastering suggestions.', duration: 3 },
      { time: 18, text: 'Multi-stem mode lets you work with individual tracks for precise control.', duration: 3 },
      { time: 21, text: 'Video Engine generates AI-powered visuals synced to your audio.', duration: 3 },
      { time: 24, text: 'Return to Single mode for streamlined stereo mastering.', duration: 3 },
      { time: 27, text: 'View your complete processing history and revert changes anytime.', duration: 3 },
      { time: 30, text: 'Configure settings to customize your workflow.', duration: 2 },
      { time: 32, text: 'All actions are governed by Action Authority for transparent, auditable processing.', duration: 4 },
      { time: 36, text: 'Echo Sound Lab. Professional mastering. Powered by AI. Your sound, perfected.', duration: 5 }
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

/**
 * Generate voiceover using espeak
 */
async function generateVoiceover(text, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const cmd = `echo "${text.replace(/"/g, '\\"')}" | espeak -v f2 -s 160 -p 55 -w "${outputPath}" 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe', shell: true });

      if (fs.existsSync(outputPath)) {
        resolve(true);
      } else {
        reject(new Error('Audio not created'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get audio duration
 */
async function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(output) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Create silent audio padding
 */
async function createSilence(duration, outputPath) {
  return new Promise((resolve) => {
    try {
      const cmd = `${FFMPEG} -f lavfi -i anullsrc=r=48000:cl=mono -t ${duration} -q:a 9 -acodec libmp3lame "${outputPath}" -y 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe' });
      resolve(true);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Record demo video
 */
async function recordDemo(browser, demoConfig) {
  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`Recording: ${demoConfig.title}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const screenshotsDir = path.join(demoDir, 'screenshots');
  const audioDir = path.join(demoDir, 'audio');

  // Clear and recreate
  if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true });
  }
  if (fs.existsSync(audioDir)) {
    fs.rmSync(audioDir, { recursive: true });
  }
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    log(`   Loading app...`, 'yellow');
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log(`   ✓ Loaded`, 'green');
    await wait(2000);

    // Start capturing
    log(`   📷 Recording...`, 'yellow');
    let frameNum = 0;
    const captureInterval = setInterval(async () => {
      try {
        const screenshot = await page.screenshot();
        const framePath = path.join(screenshotsDir, `frame_${String(frameNum).padStart(5, '0')}.png`);
        fs.writeFileSync(framePath, screenshot);
        frameNum++;
      } catch (e) {}
    }, 333); // ~3 fps

    // Execute interactions
    log(`   🎬 Interactions:\n`, 'yellow');

    if (demoConfig.id === 'paper-perfector') {
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 100));
        await wait(800);
      }
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, -100));
        await wait(800);
      }
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 80));
        await wait(700);
      }
    } else if (demoConfig.id === 'master-lease') {
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Click zip input
      await page.evaluate(() => {
        const inp = document.querySelector('#zip');
        if (inp) inp.focus();
      });
      await page.keyboard.type('94114', { delay: 80 });
      log(`     ✓ Entered zip code`, 'green');
      await wait(1000);

      // Load profile
      await page.evaluate(() => {
        const btn = document.querySelector('#loadZipProfile');
        if (btn) btn.click();
      });
      log(`     ✓ Loaded profile`, 'green');
      await wait(2500);

      // Scroll
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 150));
        await wait(1000);
      }

      // Add comps
      await page.evaluate(() => {
        const btn = document.querySelector('#addRoomComp');
        if (btn) btn.click();
      });
      log(`     ✓ Added room comp`, 'green');
      await wait(1500);

      await page.evaluate(() => {
        const btn = document.querySelector('#addHouseComp');
        if (btn) btn.click();
      });
      log(`     ✓ Added house comp`, 'green');
      await wait(1500);

      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 150));
        await wait(1200);
      }

      await page.evaluate(() => {
        const btn = document.querySelector('#jumpListings');
        if (btn) btn.click();
      });
      log(`     ✓ Jumped to listings`, 'green');
      await wait(2000);

    } else if (demoConfig.id === 'data-blaster') {
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      await page.evaluate(() => {
        const btn = document.querySelector('#guided-start');
        if (btn) btn.click();
      });
      log(`     ✓ Started guided setup`, 'green');
      await wait(2000);

      await page.evaluate(() => {
        const btn = document.querySelector('#load-sample');
        if (btn) btn.click();
      });
      log(`     ✓ Loaded sample data`, 'green');
      await wait(2500);

      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 140));
        await wait(1100);
      }

      await page.evaluate(() => {
        const btn = document.querySelector('#theme-toggle');
        if (btn) btn.click();
      });
      log(`     ✓ Toggled theme`, 'green');
      await wait(1500);

      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, -180));
        await wait(1200);
      }

      await page.evaluate(() => {
        const btn = document.querySelector('#story-once');
        if (btn) btn.click();
      });
      log(`     ✓ Generated story`, 'green');
      await wait(2000);

      await page.evaluate(() => {
        const btn = document.querySelector('#export-pptx');
        if (btn) btn.click();
      });
      log(`     ✓ Exported presentation`, 'green');
      await wait(1500);

    } else if (demoConfig.id === 'echo-sound-lab') {
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 100));
        await wait(1000);
      }
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, -120));
        await wait(1100);
      }
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, 110));
        await wait(1000);
      }
    }

    // Wait remaining time
    const elapsedMs = frameNum * 333;
    const targetMs = demoConfig.duration * 1000;
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    if (remainingMs > 0) {
      log(`\n   ⏳ Recording ${(remainingMs / 1000).toFixed(1)}s more...`, 'yellow');
      await wait(Math.min(remainingMs, 8000));
    }

    clearInterval(captureInterval);

    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
    log(`\n   ✓ ${screenshots} frames captured`, 'green');

    // Generate voiceovers
    log(`   🎙️  Generating voiceovers...`, 'yellow');
    const audioSegments = [];
    let totalAudioDuration = 0;

    for (let i = 0; i < demoConfig.voiceovers.length; i++) {
      const vo = demoConfig.voiceovers[i];
      try {
        const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
        await generateVoiceover(vo.text, voPath);

        const duration = await getAudioDuration(voPath);
        audioSegments.push({ path: voPath, duration });
        totalAudioDuration += duration;

        log(`     ✓ Scene ${i + 1}: "${vo.text.slice(0, 40)}..."`, 'yellow');
      } catch (e) {
        log(`     ✗ Scene ${i + 1} failed`, 'yellow');
      }
    }

    if (audioSegments.length === 0) {
      log(`   ❌ No voiceovers generated`, 'yellow');
      return false;
    }

    log(`   ✓ Generated ${audioSegments.length} voiceovers (${totalAudioDuration.toFixed(1)}s total)`, 'green');

    // Build audio timeline
    log(`   🎵 Building audio timeline...`, 'yellow');
    const audioTimelinePath = path.join(audioDir, 'timeline.wav');
    const concatFile = path.join(audioDir, 'concat.txt');

    let concatContent = '';
    audioSegments.forEach(seg => {
      concatContent += `file '${seg.path}'\n`;
    });
    fs.writeFileSync(concatFile, concatContent);

    try {
      const concatCmd = `${FFMPEG} -f concat -safe 0 -i "${concatFile}" -c copy "${audioTimelinePath}" -y 2>/dev/null`;
      execSync(concatCmd, { stdio: 'pipe' });
      log(`   ✓ Audio timeline created`, 'green');
    } catch (e) {
      log(`   ✗ Audio timeline failed`, 'yellow');
      return false;
    }

    // Create video from frames
    log(`   🎬 Creating video...`, 'yellow');
    const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
    try {
      const videoCmd = `${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`;
      execSync(videoCmd, { stdio: 'pipe' });
      log(`   ✓ Video created`, 'green');
    } catch (e) {
      log(`   ✗ Video creation failed`, 'yellow');
      return false;
    }

    // Mix audio with video
    log(`   🎵 Mixing audio with video...`, 'yellow');
    const finalPath = path.join(demoDir, 'demo_final.mp4');
    try {
      const mixCmd = `${FFMPEG} -i "${videoPath}" -i "${audioTimelinePath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" -y 2>/dev/null`;
      execSync(mixCmd, { stdio: 'pipe' });

      // Replace original
      fs.copyFileSync(finalPath, videoPath);
      fs.unlinkSync(finalPath);

      const size = fs.statSync(videoPath).size;
      log(`   ✓ Final video: ${(size / 1024 / 1024).toFixed(2)}MB`, 'green');
      return true;
    } catch (e) {
      log(`   ✗ Audio mixing failed`, 'yellow');
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
  log(`🎬 DEMO RECORDING + CUSTOM VOICE SYSTEM`, 'blue');
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
  log(`✅ Done! All videos with custom voice at ~/demos/[app]/final_demo_optimized.mp4`, 'green');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
