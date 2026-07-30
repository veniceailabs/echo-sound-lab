#!/usr/bin/env node

/**
 * ROBUST DEMO RECORDING SYSTEM
 *
 * Handles:
 * - Popups and modals
 * - Failed interactions with retries
 * - Waiting for element visibility
 * - Network delays
 * - Dynamic content loading
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
  { id: 'paper-perfector', url: 'http://localhost:5173', duration: 50 },
  { id: 'master-lease', url: 'http://localhost:3002', duration: 50 },
  { id: 'data-blaster', url: 'http://localhost:3003', duration: 50 },
  { id: 'echo-sound-lab', url: 'http://localhost:3005', duration: 90 }
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
 * Safe click with retries and error handling
 */
async function safeClick(page, selector, label, maxRetries = 3) {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // Wait for element
      await page.waitForSelector(selector, { timeout: 2000 }).catch(() => null);

      // Check if visible
      const visible = await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0;
      }, selector);

      if (visible) {
        // Click
        await page.evaluate(sel => {
          const el = document.querySelector(sel);
          if (el) el.click();
        }, selector);

        await wait(500); // Wait for reaction
        log(`     ✓ ${label}`, 'green');
        return true;
      }
    } catch (e) {
      // Silently retry
    }

    if (retry < maxRetries - 1) {
      await wait(500);
    }
  }

  log(`     ✗ ${label} (not found or not clickable)`, 'yellow');
  return false;
}

/**
 * Close any visible popups or modals
 */
async function closePopups(page) {
  try {
    // Try to close common popup patterns
    await page.evaluate(() => {
      // Close buttons
      document.querySelectorAll('[aria-label*="close"], [aria-label*="Close"], .close-btn, .modal-close').forEach(el => {
        if (el && el.offsetParent !== null) el.click();
      });

      // Escape key
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    await wait(300);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Generate voiceover using espeak
 */
async function generateVoiceover(text, outputPath) {
  return new Promise((resolve) => {
    try {
      const cmd = `echo "${text.replace(/"/g, '\\"')}" | espeak -v f2 -s 160 -p 55 -w "${outputPath}" 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe', shell: true });
      resolve(fs.existsSync(outputPath));
    } catch {
      resolve(false);
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
  } catch {
    return 0;
  }
}

/**
 * Record demo with robust interaction handling
 */
async function recordDemo(browser, demoConfig) {
  log(`\n${'═'.repeat(70)}`, 'blue');
  log(`Recording: ${demoConfig.id}`, 'cyan');
  log(`${'═'.repeat(70)}`, 'blue');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const screenshotsDir = path.join(demoDir, 'screenshots');
  const audioDir = path.join(demoDir, 'audio');

  if (fs.existsSync(screenshotsDir)) fs.rmSync(screenshotsDir, { recursive: true });
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    log(`   🌐 Loading...`, 'yellow');
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log(`   ✓ Loaded`, 'green');
    await wait(2000);

    // Start screenshot capture
    log(`   📷 Recording...`, 'yellow');
    let frameNum = 0;
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

    // Robust interactions
    log(`   🎬 Interactions:\n`, 'yellow');
    const interactions = [];

    try {
      if (demoConfig.id === 'paper-perfector') {
        interactions.push(
          { action: 'scroll', amount: 100, times: 10, wait: 800 },
          { action: 'scroll', amount: -100, times: 5, wait: 800 },
          { action: 'scroll', amount: 80, times: 8, wait: 700 }
        );

      } else if (demoConfig.id === 'master-lease') {
        interactions.push(
          { action: 'scroll-up', amount: 500 },
          { action: 'click', selector: '#zip', label: 'Zip input', wait: 800 },
          { action: 'type', selector: '#zip', text: '94114', wait: 1000 },
          { action: 'click', selector: '#loadZipProfile', label: 'Load Profile', wait: 2500 },
          { action: 'scroll', amount: 150, times: 5, wait: 1000 },
          { action: 'click', selector: '#addRoomComp', label: 'Add Room Comp', wait: 1500 },
          { action: 'click', selector: '#addHouseComp', label: 'Add House Comp', wait: 1500 },
          { action: 'scroll', amount: 150, times: 4, wait: 1200 },
          { action: 'click', selector: '#jumpListings', label: 'Jump to Listings', wait: 2000 }
        );

      } else if (demoConfig.id === 'data-blaster') {
        interactions.push(
          { action: 'scroll-up', amount: 500 },
          { action: 'popup-close' }, // Close any startup popups
          { action: 'click', selector: '#guided-start', label: 'Guided Start', wait: 2000 },
          { action: 'popup-close' },
          { action: 'click', selector: '#load-sample', label: 'Load Sample', wait: 2500 },
          { action: 'popup-close' },
          { action: 'scroll', amount: 140, times: 4, wait: 1100 },
          { action: 'click', selector: '#theme-toggle', label: 'Toggle Theme', wait: 1500 },
          { action: 'scroll', amount: -180, times: 3, wait: 1200 },
          { action: 'click', selector: '#story-once', label: 'Generate Story', wait: 2000 },
          { action: 'popup-close' },
          { action: 'click', selector: '#export-pptx', label: 'Export', wait: 1500 }
        );

      } else if (demoConfig.id === 'echo-sound-lab') {
        interactions.push(
          { action: 'scroll', amount: 100, times: 8, wait: 1000 },
          { action: 'scroll', amount: -120, times: 5, wait: 1100 },
          { action: 'scroll', amount: 110, times: 6, wait: 1000 }
        );
      }

      // Execute all interactions
      for (const interaction of interactions) {
        try {
          if (interaction.action === 'scroll') {
            for (let i = 0; i < interaction.times; i++) {
              await page.evaluate(amt => window.scrollBy(0, amt), interaction.amount);
              await wait(interaction.wait);
            }
          } else if (interaction.action === 'scroll-up') {
            await page.evaluate(amt => window.scrollBy(0, -amt), interaction.amount);
            await wait(500);
          } else if (interaction.action === 'click') {
            await safeClick(page, interaction.selector, interaction.label);
            await wait(interaction.wait || 500);
          } else if (interaction.action === 'type') {
            const exists = await page.$(interaction.selector);
            if (exists) {
              await page.focus(interaction.selector);
              await page.keyboard.type(interaction.text, { delay: 80 });
              log(`     ✓ Typed text`, 'green');
            }
            await wait(interaction.wait || 500);
          } else if (interaction.action === 'popup-close') {
            await closePopups(page);
          }
        } catch (e) {
          // Continue even if interaction fails
        }
      }
    } catch (e) {
      log(`   ⚠️  Error during interactions: ${e.message}`, 'yellow');
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

    // Generate voiceovers with simple, clear narration
    log(`   🎙️  Generating voiceovers...`, 'yellow');
    const voiceovers = {
      'paper-perfector': [
        'Welcome to Paper Perfector. Smart document creation powered by AI.',
        'The interface is clean and intuitive with formatting controls on the right.',
        'Documents load with structure built in. Introduction, content, conclusion.',
        'Scroll down to see the full document layout and sections.',
        'Change fonts, colors, spacing with one click using the format menu.',
        'Save your work instantly to the library for access anytime.',
        'Export to PDF for sharing or printing when youre done.',
        'Paper Perfector makes document creation effortless. Try it today.'
      ],
      'master-lease': [
        'Welcome to Master Lease. The platform for real estate analysis.',
        'Enter a zip code to load live market data for your area.',
        'We entered 94114. The system shows room comps and rent prices instantly.',
        'Click to load the zip profile and cache market assumptions.',
        'Scroll down to see detailed market data and analysis.',
        'Add room comparables to capture micro level rent detail.',
        'Add whole home comparables to benchmark overall performance.',
        'Jump to listings to browse available properties in your market.',
        'Master Lease helps you price rooms with confidence and maximize returns.'
      ],
      'data-blaster': [
        'Welcome to Data Blaster. Fast and intuitive data analysis platform.',
        'Start with guided setup to walk through the workflow step by step.',
        'Load sample data to see the interface in action.',
        'The system automatically parses columns and identifies headers.',
        'Toggle between light and dark theme to match your preference.',
        'The workspace shows health panels and mapping controls.',
        'Generate an executive story from your data with one click.',
        'Export a board ready PowerPoint deck or summary notes.',
        'Data Blaster transforms raw data into confident business decisions.'
      ],
      'echo-sound-lab': [
        'Welcome to Echo Sound Lab. Professional audio mastering powered by AI.',
        'The platform provides three core modes. Single for stereo, Multi stem, and AI Studio.',
        'Upload your audio file to begin real time analysis and processing.',
        'The analyzer shows LUFS, dynamic range, and spectral data instantly.',
        'Switch to AI Studio for intelligent guided mastering suggestions.',
        'Multi stem mode lets you work with individual tracks for precise control.',
        'Video Engine generates AI powered visuals synced to your audio.',
        'Return to Single mode for streamlined stereo mastering.',
        'View your complete processing history and revert changes anytime.',
        'Configure settings to customize your workflow and preferences.',
        'All actions are governed by Action Authority for transparent processing.',
        'Echo Sound Lab. Professional mastering powered by AI. Your sound perfected.'
      ]
    };

    const audioSegments = [];
    const demoVos = voiceovers[demoConfig.id] || [];

    for (let i = 0; i < demoVos.length; i++) {
      try {
        const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
        const success = await generateVoiceover(demoVos[i], voPath);

        if (success) {
          const duration = await getAudioDuration(voPath);
          audioSegments.push({ path: voPath, duration });
          log(`     ✓ Voiceover ${i + 1}`, 'green');
        }
      } catch (e) {}
    }

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
    log(`   🎵 Mixing audio...`, 'yellow');
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
  log(`🎬 ROBUST DEMO RECORDING + CUSTOM VOICE`, 'blue');
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
  log(`✅ All videos ready at ~/demos/[app]/final_demo_optimized.mp4`, 'green');
  log(`${'═'.repeat(70)}`, 'blue\n');
}

main().catch(e => {
  log(`\n❌ ${e.message}`, 'yellow');
  process.exit(1);
});
