#!/usr/bin/env node

/**
 * VERCEL APP DEMO RECORDER
 *
 * Records professional demos of external Vercel-hosted apps:
 * - Master Lease (co-living deal analyzer)
 * - Paper Perfector (AI document assistant)
 * - Data Blaster (raw data to board story)
 *
 * Uses Puppeteer for screen recording + Echo Bridge for TTS + FFmpeg for assembly
 *
 * Workflow:
 * 1. Open Vercel app in Puppeteer
 * 2. Execute demo actions (wait, click, scroll)
 * 3. Capture video via screen recording
 * 4. Generate TTS voiceovers via Echo Bridge
 * 5. Assemble final video with FFmpeg
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';
import { WebSocket } from 'ws';

// ════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════

const OUTPUT_DIR = path.join(os.homedir(), 'demos');
const ECHO_BRIDGE_URL = 'ws://localhost:8000/ws/bridge';
const ECHO_BRIDGE_HTTP = 'http://localhost:8000';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

// Apps can run locally or from Vercel - set USE_LOCAL=true for local dev servers
const USE_LOCAL = true;

// Local app configurations
const LOCAL_APPS = {
  'master-lease': { path: '/Users/DRA/Desktop/Master Lease for Co-Living', port: 3002, type: 'static' },
  'paper-perfector': { path: '/Users/DRA/Desktop/Paper Perfector', port: 5173, type: 'vite' },
  'data-blaster': { path: '/Users/DRA/Desktop/Data Blaster', port: 3003, type: 'static' }
};

// Demo apps with demo scripts
const DEMO_APPS = [
  {
    id: 'master-lease',
    title: 'Master Lease - Co-Living Deal Analyzer',
    url: USE_LOCAL ? 'http://localhost:3002' : 'https://master-lease-for-co-living.vercel.app',
    scenes: [
      { action: 'WAIT', voiceover: 'Welcome to Master Lease. The complete platform for analyzing co-living investment opportunities.', duration: 3 },
      { action: 'SCROLL', selector: 'main, .main-content', voiceover: 'View real-time deal analytics. Calculate profitability using actual room comps, whole-home rents, and comprehensive cost stacks.', duration: 4 },
      { action: 'CLICK', selector: 'button, .property-card, a', voiceover: 'Analyze any property instantly. Factor in utilities, insurance, vacancy reserves, and platform fees.', duration: 3 },
      { action: 'WAIT', voiceover: 'Every calculation is governed by Action Authority, ensuring accuracy and compliance in your investment decisions.', duration: 3 },
      { action: 'SCROLL', selector: 'main', voiceover: 'Determine break-even points, maximum safe rent offers, and expected returns before committing to any lease.', duration: 3 },
      { action: 'CLICK', selector: 'button, .analytics', voiceover: 'Access landlord direct listings without broker intermediaries. Start building your co-living portfolio today.', duration: 3 },
      { action: 'WAIT', voiceover: 'Master Lease. Smart real estate analysis. Powered by Action Authority.', duration: 3 }
    ]
  },
  {
    id: 'paper-perfector',
    title: 'Paper Perfector - AI Document Assistant',
    url: USE_LOCAL ? 'http://localhost:5173' : 'https://paper-perfector.vercel.app',
    scenes: [
      { action: 'WAIT', voiceover: 'Introducing Paper Perfector. Intelligent document analysis powered by advanced AI.', duration: 3 },
      { action: 'CLICK', selector: 'button, .upload-button, .upload-area, input[type="file"]', voiceover: 'Simply upload any document. PDF, Word documents, images - we handle them all.', duration: 3 },
      { action: 'WAIT', voiceover: 'Our AI instantly analyzes your content in real-time, extracting valuable insights automatically.', duration: 3 },
      { action: 'SCROLL', selector: 'main, .results-panel', voiceover: 'Get comprehensive summaries, extract key information, identify actionable insights from your documents.', duration: 4 },
      { action: 'WAIT', voiceover: 'This is powered by Action Authority - our governance system ensuring every action is safe, verified, and trustworthy.', duration: 3 },
      { action: 'CLICK', selector: 'button, .export-button', voiceover: 'Export your results in any format you need - CSV, JSON, PDF - ready for your workflow.', duration: 3 },
      { action: 'WAIT', voiceover: 'Paper Perfector. Transform how you work with documents. Enterprise-grade intelligence at your fingertips.', duration: 3 }
    ]
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster - Raw Data to Board Story',
    url: USE_LOCAL ? 'http://localhost:3003' : 'https://data-blaster.vercel.app',
    scenes: [
      { action: 'WAIT', voiceover: 'Introducing Data Blaster. Transform raw spreadsheet data into polished executive presentations.', duration: 3 },
      { action: 'CLICK', selector: 'button, .upload-button, input[type="file"]', voiceover: 'Import your data from any source. Excel, CSV, JSON - we handle it all seamlessly.', duration: 3 },
      { action: 'WAIT', voiceover: 'Describe your desired output in plain English. No formulas required.', duration: 3 },
      { action: 'SCROLL', selector: 'main, .data-display', voiceover: 'Visualize your results with interactive charts and dashboards. Multiple audience types supported - executives, operations, product teams.', duration: 4 },
      { action: 'WAIT', voiceover: 'Data security is paramount. Action Authority ensures every data operation is governed and verified.', duration: 3 },
      { action: 'CLICK', selector: 'button, .export-button, .download', voiceover: 'Export board-ready PowerPoint decks, diagrams, or executive dashboards with one click.', duration: 3 },
      { action: 'WAIT', voiceover: 'Data Blaster. Process smarter. Act faster. Transform your data into decisions.', duration: 3 }
    ]
  }
];

const AI_DIRECTOR_PROFILE = {
  voiceProfile: 'Alloy',
  pacingMultiplier: 1.15,
  minSceneDuration: 3,
  pauseDuration: 1.5,
  insertTransitions: false,
  transitionLines: [
    'Let me pause briefly so you can absorb the view.',
    'Hold here for a second while we line up the next highlight.',
    'A calm moment before we dive deeper into the interface.',
    'I like to let things settle before showing you the next move.'
  ]
};

class AIDirector {
  constructor(profile = AI_DIRECTOR_PROFILE) {
    this.profile = profile;
  }

  orchestrate(app) {
    const scenes = [];
    const total = app.scenes.length;

    app.scenes.forEach((scene, index) => {
      const directedScene = this._directScene(scene, index, total);
      scenes.push(directedScene);

      if (this.profile.insertTransitions && index < total - 1) {
        scenes.push(this._createTransitionScene(index + 1, total));
      }
    });

    scenes.forEach((scene, idx) => {
      scene.id = idx + 1;
    });

    return {
      ...app,
      scenes,
      voiceProfile: this.profile.voiceProfile
    };
  }

  _directScene(scene, index, total) {
    const baseDuration = scene.duration || this.profile.minSceneDuration;
    const paced = Math.max(Math.round(baseDuration * this.profile.pacingMultiplier), this.profile.minSceneDuration);

    return {
      ...scene,
      duration: paced,
      voiceover: this._humanizeVoiceover(scene.voiceover, index, total),
      voiceProfile: this.profile.voiceProfile
    };
  }

  _createTransitionScene(index, total) {
    const transitionLine = this.profile.transitionLines[index % this.profile.transitionLines.length];
    return {
      action: 'WAIT',
      voiceover: transitionLine,
      duration: this.profile.pauseDuration,
      voiceProfile: this.profile.voiceProfile
    };
  }

  _humanizeVoiceover(text, index, total) {
    let prefix = 'Next, ';
    if (index === 0) {
      prefix = 'Let me open with this: ';
    } else if (index === total - 1) {
      prefix = 'Finally, ';
    } else if (index === 1) {
      prefix = 'Now watch as ';
    }
    return `${prefix}${text}`;
  }

}

// ════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ════════════════════════════════════════════════════════════════════════

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m'
};

function log(msg, color = 'reset') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'═'.repeat(70)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');
  console.log('');
}

// ════════════════════════════════════════════════════════════════════════
// ECHO BRIDGE TTS SERVICE
// ════════════════════════════════════════════════════════════════════════

class TTSService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.audioFiles = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(ECHO_BRIDGE_URL);

        this.ws.on('open', () => {
          this.connected = true;
          log('✅ Connected to Echo Bridge', 'green');
          resolve();
        });

        this.ws.on('error', (err) => {
          log(`❌ Echo Bridge connection error: ${err.message}`, 'red');
          reject(err);
        });

        this.ws.on('close', () => {
          this.connected = false;
        });

        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      } catch (err) {
        reject(err);
      }
    });
  }

  async generateSpeech(text, sceneId, voiceProfile = 'alex') {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error('Not connected to Echo Bridge'));
        return;
      }

      const messageHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());

          // Echo Bridge returns: { status: 'complete', type: 'TTS_RESULT', audio_path: '...', audio_url: '...' }
          if (response.status === 'complete' && response.type === 'TTS_RESULT' && response.audio_path) {
            this.ws.off('message', messageHandler);
            this.audioFiles.push(response.audio_path);
            log(`   ✅ TTS: ${response.audio_path}`, 'green');
            resolve(response.audio_path);
          } else if (response.status === 'error') {
            this.ws.off('message', messageHandler);
            reject(new Error(response.message || 'TTS failed'));
          }
          // Ignore 'processing' status messages
        } catch (err) {
          // Ignore non-JSON messages
        }
      };

      this.ws.on('message', messageHandler);

      // Send in the format Echo Bridge expects
      log(`   🎤 Voice profile: ${voiceProfile}`, 'cyan');
      this.ws.send(JSON.stringify({
        action: 'GENERATE_SPEECH',
        text: text,
        scene_id: sceneId,
        voice_profile: voiceProfile
      }));

      // Timeout after 60 seconds (TTS can be slow)
      setTimeout(() => {
        this.ws.off('message', messageHandler);
        reject(new Error('TTS generation timeout'));
      }, 60000);
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }

}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findSceneElement(page, scene) {
  if (!scene.selector) {
    return null;
  }
  try {
    await page.waitForSelector(scene.selector, { timeout: 5000 });
    return await page.$(scene.selector);
  } catch (err) {
    log(`   ⚠️  Selector not found: ${scene.selector}`, 'yellow');
    return null;
  }
}

async function highlightSceneElement(page, selector) {
  if (!selector) {
    return;
  }
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return;
    }
    const original = el.style.boxShadow || '';
    el.style.boxShadow = '0 0 0 3px rgba(255, 215, 0, 0.75)';
    setTimeout(() => {
      el.style.boxShadow = original;
    }, 600);
  }, selector);
}

async function performSceneAction(scene, page) {
  switch (scene.action) {
    case 'CLICK': {
      const element = await findSceneElement(page, scene);
      if (element) {
        await highlightSceneElement(page, scene.selector);
        const box = await element.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
        await wait(180);
        await element.click({ delay: 120 });
        await wait(400);
      }
      break;
    }
    case 'TYPE': {
      if (!scene.value) {
        break;
      }
      const element = await findSceneElement(page, scene);
      if (element) {
        await highlightSceneElement(page, scene.selector);
        await element.click({ clickCount: 3 });
        await page.keyboard.down('Meta');
        await page.keyboard.press('A');
        await page.keyboard.up('Meta');
        await page.type(scene.selector, scene.value, { delay: 70 });
        await wait(400);
      }
      break;
    }
    case 'SCROLL': {
      try {
        await page.evaluate(() => {
          window.scrollBy({ top: 400, behavior: 'smooth' });
        });
      } catch (err) {
        log(`   ⚠️  Scroll failed (continuing)`, 'yellow');
      }
      await wait(600);
      break;
    }
    case 'WAIT':
    default:
      await wait(600);
      break;
  }
}

// ════════════════════════════════════════════════════════════════════════
// PUPPETEER DEMO RECORDER
// ════════════════════════════════════════════════════════════════════════

async function recordDemo(app, ttsService) {
  const demoDir = path.join(OUTPUT_DIR, app.id);
  const framesDir = path.join(demoDir, 'frames');
  const audioDir = path.join(demoDir, 'audio');

  // Create directories
  fs.mkdirSync(demoDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  logSection(`🎬 RECORDING: ${app.title}`);
  log(`URL: ${app.url}`, 'cyan');
  log(`Scenes: ${app.scenes.length}`, 'cyan');

  // Launch browser - centered on screen with proper viewport
  log('Launching browser...', 'cyan');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null, // Use window size
    args: [
      '--window-size=1280,800',
      '--window-position=320,140', // Center on a 1920x1080 screen
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=TranslateUI',
      '--disable-infobars'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 }); // 720p for clean recording
  if (typeof page.waitForTimeout !== 'function') {
    page.waitForTimeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  }

  try {
    // Navigate to app
    log(`Navigating to ${app.url}...`, 'cyan');
    await page.goto(app.url, { waitUntil: 'networkidle2', timeout: 30000 });
    log('✅ Page loaded', 'green');

    // Wait for app to settle
    await new Promise(r => setTimeout(r, 2000));

    // Record demo
    let frameIndex = 0;
    const audioFiles = [];
    const frameTimes = [];

    for (let sceneIndex = 0; sceneIndex < app.scenes.length; sceneIndex++) {
      const scene = app.scenes[sceneIndex];
      log(`\n📍 Scene ${sceneIndex + 1}/${app.scenes.length}: ${scene.action}`, 'magenta');
      log(`   "${scene.voiceover.substring(0, 50)}..."`, 'cyan');

      // Generate TTS for this scene
      const audioFilename = `scene_${sceneIndex + 1}.wav`;
      const audioPath = path.join(audioDir, audioFilename);

      try {
        const voiceProfile = scene.voiceProfile || app.voiceProfile || AI_DIRECTOR_PROFILE.voiceProfile;
        log(`   🎙️  Generating voiceover...`, 'yellow');
        const generatedPath = await ttsService.generateSpeech(scene.voiceover, sceneIndex + 1, voiceProfile);
        // Copy from Echo Bridge output to our audio dir
        if (generatedPath && fs.existsSync(generatedPath)) {
          fs.copyFileSync(generatedPath, audioPath);
        }
        audioFiles.push(audioPath);
        log(`   ✅ Voiceover generated`, 'green');
      } catch (err) {
        log(`   ⚠️  TTS failed: ${err.message}`, 'yellow');
        // Create silent audio as fallback
        try {
          execSync(`${FFMPEG} -f lavfi -i anullsrc=r=44100:cl=stereo -t ${scene.duration} "${audioPath}" -y 2>/dev/null`);
        } catch (ffmpegErr) {
          // If ffmpeg fails, just continue without audio for this scene
          log(`   ⚠️  Silent audio creation also failed`, 'yellow');
        }
        audioFiles.push(audioPath);
      }

      // Execute scene action (clicks, typing, scrolls)
      await performSceneAction(scene, page);
      const startFrame = frameIndex;
      const fps = 30;
      const sceneFrames = scene.duration * fps;

      // Capture frames for this scene
      log(`   📸 Capturing ${sceneFrames} frames...`, 'yellow');
      const frameInterval = 1000 / fps;

      for (let f = 0; f < sceneFrames; f++) {
        const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(5, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        frameTimes.push({ frame: frameIndex, scene: sceneIndex, time: frameIndex / fps });
        frameIndex++;

        // Wait for next frame
        if (f < sceneFrames - 1) {
          await new Promise(r => setTimeout(r, frameInterval));
        }
      }

      log(`   ✅ Captured frames ${startFrame} - ${frameIndex - 1}`, 'green');
    }

    // Close browser
    await browser.close();
    log('\n✅ Recording complete', 'green');

    // Assemble video
    log('\n🎬 Assembling final video...', 'cyan');
    const videoPath = path.join(demoDir, 'demo_video.mp4');
    const audioPath = path.join(demoDir, 'demo_audio.wav');
    const finalPath = path.join(demoDir, 'final_demo_optimized.mp4');

    // Create video from frames
    log('   Creating video from frames...', 'yellow');
    execSync(
      `${FFMPEG} -framerate 30 -i "${framesDir}/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 23 "${videoPath}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
    log('   ✅ Video created', 'green');

    // Concatenate audio files
    log('   Concatenating audio...', 'yellow');
    const audioListPath = path.join(demoDir, 'audio_list.txt');
    const audioListContent = audioFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    execSync(
      `${FFMPEG} -f concat -safe 0 -i "${audioListPath}" -c:a pcm_s16le "${audioPath}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
    log('   ✅ Audio concatenated', 'green');

    // Combine video and audio
    log('   Combining video and audio...', 'yellow');
    execSync(
      `${FFMPEG} -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalPath}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
    log('   ✅ Final video assembled', 'green');

    // Get file info
    const stats = fs.statSync(finalPath);
    log(`\n✨ Demo complete: ${finalPath}`, 'bright');
    log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`, 'cyan');

    return finalPath;

  } catch (err) {
    log(`❌ Error: ${err.message}`, 'red');
    await browser.close();
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════

async function main() {
  logSection('🚀 VERCEL APP DEMO RECORDER');
  log('Recording professional demos for Fiverr & Business Contracts', 'magenta');
  log('Apps: Master Lease, Paper Perfector, Data Blaster', 'cyan');
  console.log('');

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check Echo Bridge health
  log('Checking Echo Bridge...', 'cyan');
  try {
    const response = await fetch(`${ECHO_BRIDGE_HTTP}/health`);
    const data = await response.json();
    log(`✅ Echo Bridge: ${data.status}`, 'green');
  } catch (err) {
    log('❌ Echo Bridge not running!', 'red');
    log('Please start: cd echo-bridge && python server.py', 'yellow');
    process.exit(1);
  }

  // Connect TTS service
  const ttsService = new TTSService();
  try {
    await ttsService.connect();
  } catch (err) {
    log(`⚠️  TTS service unavailable: ${err.message}`, 'yellow');
    log('Continuing with silent audio fallback...', 'yellow');
  }

  const director = new AIDirector();
  log('AI Director engaged to orchestrate human pacing and tone.', 'cyan');

  // Record each demo
  const results = [];

  for (const baseApp of DEMO_APPS) {
    try {
      const stagedApp = director.orchestrate(baseApp);
      const videoPath = await recordDemo(stagedApp, ttsService);
      results.push({ app: stagedApp.title, status: 'success', path: videoPath });
    } catch (err) {
      log(`❌ Failed to record ${baseApp.title}: ${err.message}`, 'red');
      results.push({ app: baseApp.title, status: 'failed', error: err.message });
    }
  }

  // Cleanup
  ttsService.close();

  // Summary
  logSection('📊 RECORDING SUMMARY');

  results.forEach(result => {
    if (result.status === 'success') {
      log(`✅ ${result.app}`, 'green');
      log(`   ${result.path}`, 'cyan');
    } else {
      log(`❌ ${result.app}: ${result.error}`, 'red');
    }
  });

  const successCount = results.filter(r => r.status === 'success').length;
  log(`\n📍 Completed: ${successCount}/${results.length} demos`, 'bright');
  log(`📁 Output: ${OUTPUT_DIR}`, 'cyan');

  if (successCount > 0) {
    log('\n🚀 Ready for Fiverr upload!', 'green');
    log('Next steps:', 'cyan');
    log('  1. Review videos in ~/demos/', 'cyan');
    log('  2. Run automated-demo-recorder.js to create contact sheets', 'cyan');
    log('  3. Upload to Fiverr gig gallery', 'cyan');
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
