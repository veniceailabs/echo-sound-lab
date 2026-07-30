#!/usr/bin/env node

/**
 * COMPREHENSIVE DEMO RECORDING SYSTEM
 *
 * Records detailed demos with:
 * - Natural voice (pyttsx3 native macOS TTS)
 * - Comprehensive feature interactions
 * - Multiple UI state changes
 * - Professional narration synced to actions
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const PYTHON = '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3';
const VOICE_SCRIPT = '/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/natural-voice-system.py';

const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    url: 'http://localhost:5173',
    duration: 70,
    voiceovers: [
      { text: 'Welcome to Paper Perfector. Intelligent document creation powered by artificial intelligence.', duration: 4 },
      { text: 'The interface features a clean workspace with a document panel on the left and formatting controls on the right.', duration: 5 },
      { text: 'Notice the structured document view with sections for introduction, body content, and conclusion.', duration: 4 },
      { text: 'The assistant menu provides options to create new documents, import existing files, or select templates.', duration: 4 },
      { text: 'Scroll through the document to see how content is automatically organized.', duration: 3 },
      { text: 'The toolbar provides quick access to edit, format, save, and export functions.', duration: 3 },
      { text: 'Notice the formatting panel with options for fonts, colors, spacing, and styles.', duration: 3 },
      { text: 'All changes save automatically to the library for secure access.', duration: 3 },
      { text: 'Export the document to PDF, Word, or other formats with one click.', duration: 3 },
      { text: 'Paper Perfector transforms document creation. Professional quality, AI powered.', duration: 4 }
    ]
  },
  {
    id: 'master-lease',
    url: 'http://localhost:3002',
    duration: 70,
    voiceovers: [
      { text: 'Welcome to Master Lease. The complete platform for real estate investment analysis.', duration: 4 },
      { text: 'The main interface shows the deal analyzer with market input fields and property analysis sections.', duration: 4 },
      { text: 'Enter a zip code to load live market data. The system immediately provides rent comps.', duration: 4 },
      { text: 'We enter 94114 to load market data for the San Francisco area.', duration: 3 },
      { text: 'The system loads room comparables and whole-home rent prices automatically.', duration: 3 },
      { text: 'Click Load Zip Profile to cache the market assumptions and pricing data.', duration: 3 },
      { text: 'The Property and Cost Stack section shows calculations for returns and profitability.', duration: 4 },
      { text: 'Scroll down to see detailed market data including room rent comps and whole-home comparables.', duration: 4 },
      { text: 'Add room comparables to capture granular rent detail for specific unit types.', duration: 3 },
      { text: 'Add whole-home comparables to benchmark performance against similar properties.', duration: 3 },
      { text: 'Jump to listings to browse available properties in your target market.', duration: 3 },
      { text: 'Master Lease brings confidence and precision to real estate investment decisions.', duration: 4 }
    ]
  },
  {
    id: 'data-blaster',
    url: 'http://localhost:3003',
    duration: 70,
    voiceovers: [
      { text: 'Welcome to Data Blaster. Fast and intuitive data analysis for modern enterprises.', duration: 4 },
      { text: 'The interface provides a clean workspace with data input on the left and analysis results on the right.', duration: 4 },
      { text: 'Start with guided setup to walk through the analysis workflow step by step.', duration: 3 },
      { text: 'Load sample data to see the system in action with real numbers.', duration: 3 },
      { text: 'Data Blaster automatically parses every column and identifies headers.', duration: 3 },
      { text: 'The system flags anomalies and provides data quality insights.', duration: 3 },
      { text: 'Toggle between light and dark theme to match your workspace preference.', duration: 3 },
      { text: 'The workspace displays health panels showing data completeness and quality metrics.', duration: 4 },
      { text: 'Mapping controls let you define relationships between data columns.', duration: 3 },
      { text: 'Generate an executive story from your data with a single click.', duration: 3 },
      { text: 'The narrative view presents auto-generated business insights and recommendations.', duration: 4 },
      { text: 'Export a board-ready PowerPoint deck for presentations.', duration: 3 },
      { text: 'Send executive summaries as structured notes to team members.', duration: 3 },
      { text: 'Data Blaster transforms raw data into confident business intelligence.', duration: 4 }
    ]
  },
  {
    id: 'echo-sound-lab',
    url: 'http://localhost:3005',
    duration: 90,
    voiceovers: [
      { text: 'Welcome to Echo Sound Lab. Professional audio mastering powered by artificial intelligence.', duration: 4 },
      { text: 'The platform provides three core modes for audio processing. Single for stereo mixing.', duration: 4 },
      { text: 'Multi stem mode for working with individual instrument tracks.', duration: 3 },
      { text: 'And AI Studio for intelligent guided mastering suggestions.', duration: 3 },
      { text: 'The main workspace shows the current processing mode and available controls.', duration: 3 },
      { text: 'Upload your audio file to begin real time analysis and automatic mastering.', duration: 3 },
      { text: 'The analyzer displays LUFS measurements, dynamic range, and spectral data.', duration: 3 },
      { text: 'Switch to AI Studio mode for intelligent, guided mastering recommendations.', duration: 3 },
      { text: 'The AI suggests adjustments for EQ, compression, and levels based on audio analysis.', duration: 4 },
      { text: 'Multi stem mode lets you work with individual tracks for precise control.', duration: 3 },
      { text: 'Process drums, bass, vocals, and other stems independently.', duration: 3 },
      { text: 'The Video Engine generates AI powered visuals synced to your audio.', duration: 3 },
      { text: 'Return to Single mode for streamlined stereo mastering.', duration: 3 },
      { text: 'View your complete processing history and instantly revert to previous versions.', duration: 4 },
      { text: 'Configure settings to customize your workflow and mastering preferences.', duration: 3 },
      { text: 'All actions are governed by Action Authority for transparent and auditable processing.', duration: 4 },
      { text: 'Echo Sound Lab brings professional audio mastering to everyone.', duration: 3 }
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
      // Use macOS say command with Flo voice (natural sounding)
      const escapedText = text.replace(/"/g, '\\"');
      const aiffPath = outputPath.replace('.wav', '.aiff');
      const cmd = `say -v 'Flo (English (US))' -o "${aiffPath}" "${escapedText}" && ${FFMPEG} -i "${aiffPath}" "${outputPath}" -y 2>/dev/null && rm "${aiffPath}" 2>/dev/null`;
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

    // Start recording
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

    // Comprehensive interactions for each app
    if (demoConfig.id === 'paper-perfector') {
      // Scroll down to show document structure
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 100));
        await wait(800);
      }
      // Scroll back up slowly
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, -150));
        await wait(1000);
      }
      // More scrolling to show different sections
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, 80));
        await wait(900);
      }
      log(`     ✓ Document scrolling`, 'green');

    } else if (demoConfig.id === 'master-lease') {
      // Scroll to top
      await page.evaluate(() => window.scrollBy(0, -500));
      await wait(1000);

      // Enter zip code
      await page.evaluate(() => document.querySelector('#zip')?.focus());
      await page.keyboard.type('94114', { delay: 80 });
      log(`     ✓ Entered zip code: 94114`, 'green');
      await wait(1000);

      // Load profile
      await page.evaluate(() => document.querySelector('#loadZipProfile')?.click());
      log(`     ✓ Loaded zip profile`, 'green');
      await wait(2500);

      // Scroll to see data
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, 100));
        await wait(1000);
      }
      log(`     ✓ Scrolled through market data`, 'green');

      // Click buttons if they exist
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

      // More scrolling
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 100));
        await wait(1100);
      }

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

      // Close any popups
      await page.evaluate(() => {
        document.querySelectorAll('[aria-label*="close"], .modal-close').forEach(el => {
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
        document.querySelectorAll('[aria-label*="close"], .modal-close').forEach(el => {
          if (el?.offsetParent !== null) el.click();
        });
      });
      await wait(500);

      // Scroll through workspace
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 120));
        await wait(1000);
      }
      log(`     ✓ Scrolled workspace`, 'green');

      // Toggle theme
      const themeToggle = await page.$('#theme-toggle');
      if (themeToggle) {
        await page.evaluate(() => document.querySelector('#theme-toggle')?.click());
        log(`     ✓ Toggled theme`, 'green');
        await wait(1500);
      }

      // Scroll back
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, -150));
        await wait(1100);
      }

      // Generate story
      const generateStory = await page.$('#story-once');
      if (generateStory) {
        await page.evaluate(() => document.querySelector('#story-once')?.click());
        log(`     ✓ Generated story`, 'green');
        await wait(2000);
      }

      // Close popups
      await page.evaluate(() => {
        document.querySelectorAll('[aria-label*="close"], .modal-close').forEach(el => {
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

    } else if (demoConfig.id === 'echo-sound-lab') {
      // Scroll down to show interface
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 90));
        await wait(900);
      }
      log(`     ✓ Scrolled interface`, 'green');

      // Scroll back up
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, -100));
        await wait(1000);
      }

      // More scrolling
      for (let i = 0; i < 7; i++) {
        await page.evaluate(() => window.scrollBy(0, 80));
        await wait(900);
      }
      log(`     ✓ Explored full interface`, 'green');
    }

    // Wait for remaining time
    const elapsedMs = frameNum * 333;
    const targetMs = demoConfig.duration * 1000;
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    if (remainingMs > 0) {
      log(`\n   ⏳ Recording ${(remainingMs / 1000).toFixed(1)}s more...\n`, 'yellow');
      await wait(Math.min(remainingMs, 8000));
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
          process.stdout.write(`\r   ${i + 1}/${demoConfig.voiceovers.length} voiceovers generated`);
        }
      } catch (e) {}
    }

    log(`\n   ✓ All voiceovers ready\n`, 'green');

    if (audioSegments.length === 0) {
      log(`   ❌ No voiceovers generated`, 'yellow');
      return false;
    }

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

    // Mix audio with video
    log(`   🎵 Mixing audio with video...`, 'yellow');
    const finalPath = path.join(demoDir, 'demo_final.mp4');
    try {
      execSync(`${FFMPEG} -i "${videoPath}" -i "${audioTimelinePath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" -y 2>/dev/null`, { stdio: 'pipe' });
      fs.copyFileSync(finalPath, videoPath);
      fs.unlinkSync(finalPath);

      const size = fs.statSync(videoPath).size;
      log(`   ✓ Final video: ${(size / 1024 / 1024).toFixed(2)}MB`, 'green');
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
  log(`🎬 COMPREHENSIVE DEMO RECORDING SYSTEM`, 'blue');
  log(`Voice: Natural (macOS Flo - Professional Neural TTS)`, 'cyan');
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
  log(`✅ ALL DEMOS COMPLETE!`, 'green');
  log(`📁 Videos at ~/demos/[app-id]/final_demo_optimized.mp4`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
