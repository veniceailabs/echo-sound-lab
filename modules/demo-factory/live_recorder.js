/**
 * 🏭 FIVERR DEMO FACTORY - LIVE RECORDER
 * Drives the Vercel apps + Captures via Python Bridge
 *
 * NO 400MS HOLD - Fast, snappy marketing flow
 */

import puppeteer from 'puppeteer';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../src/config/fiverr_live_scripts.json'), 'utf8')
);

const BRIDGE_URL = 'ws://localhost:8000/ws/bridge';
const OUTPUT_DIR = path.join(__dirname, '../../echo-bridge/output');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`);
}

function logSection(title) {
  log(`${'═'.repeat(70)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');
}

async function runDemo(appKey) {
  const config = APPS[appKey];
  logSection(`🎬 PRODUCTION: ${config.meta.title}`);

  log(`🌐 Target: ${config.url}`, 'cyan');
  log(`🎙️  Voiceover scenes: ${config.timeline.length}`, 'cyan');
  log(`⏱️  Estimated duration: ${config.timeline.reduce((sum, s) => sum + s.duration, 0)}s`, 'cyan');

  // 1. Setup Browser
  log('\n🚀 Launching Chrome...', 'cyan');
  const browser = await puppeteer.launch({
    headless: false, // Show browser for recording
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-usermedia-screen-capturing',
      '--allow-http-screen-capture'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // 2. Connect to Python Bridge (for TTS generation)
    log('🔗 Connecting to Echo Bridge for TTS...', 'cyan');
    const ws = new WebSocket(BRIDGE_URL);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Bridge connection timeout')), 5000);
    });
    log('✅ Connected to Echo Bridge', 'green');

    // 3. Navigate to Vercel App
    log(`\n🌍 Loading ${config.meta.title}...`, 'cyan');
    await page.goto(config.url, { waitUntil: 'networkidle0', timeout: 30000 });
    log('✅ Page loaded', 'green');

    // Wait for app to settle
    await new Promise(r => setTimeout(r, 2000));

    // 4. Inject Demo UI Styles (Ghost Cursor + Captions)
    log('\n💉 Injecting demo UI elements...', 'cyan');
    await page.addStyleTag({ content: `
      .ghost-cursor {
        position: fixed; pointer-events: none; z-index: 10000;
        width: 24px; height: 24px;
        background: radial-gradient(circle, rgba(255,0,255,0.8) 0%, rgba(255,0,255,0.2) 70%);
        border-radius: 50%;
        box-shadow: 0 0 20px #ff00ff, 0 0 40px rgba(255,0,255,0.5);
        transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
      }
      .demo-caption {
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9); color: #fff;
        padding: 15px 40px;
        font-family: 'SF Pro Display', -apple-system, system-ui, sans-serif;
        font-weight: 700; font-size: 28px; letter-spacing: 0.5px;
        border: 2px solid #333; border-radius: 8px; z-index: 10001;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        text-transform: uppercase;
      }
    `});

    // 5. Start Screen Recording
    log('\n🎥 Starting MediaRecorder...', 'cyan');
    const recordingStarted = await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser', cursor: 'always' },
          audio: false
        });

        window.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000
        });

        window.recordedChunks = [];
        window.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) window.recordedChunks.push(e.data);
        };

        window.mediaRecorder.start();
        return true;
      } catch (error) {
        console.error('Recording error:', error);
        return false;
      }
    });

    if (!recordingStarted) {
      log('⚠️  MediaRecorder failed - continuing with screenshots', 'yellow');
    } else {
      log('✅ Recording started', 'green');
      log('⚠️  SELECT THE BROWSER WINDOW when prompted!', 'yellow');
      await new Promise(r => setTimeout(r, 3000));
    }

    // 6. Execute Demo Script (The "Fast" Ghost - No 400ms Hold)
    log('\n🎬 Executing demo timeline...', 'cyan');
    const ttsRequests = [];

    for (let i = 0; i < config.timeline.length; i++) {
      const step = config.timeline[i];
      log(`  Scene ${i + 1}/${config.timeline.length}: ${step.action} (${step.duration}s)`, 'cyan');

      // A. Request TTS Generation (async)
      if (step.voice) {
        const sceneId = `${appKey}_scene_${i}`;
        ttsRequests.push(sceneId);

        ws.send(JSON.stringify({
          action: 'GENERATE_SPEECH',
          text: step.voice,
          scene_id: sceneId
        }));
      }

      // B. Update Caption
      if (step.caption) {
        await page.evaluate((text) => {
          let el = document.querySelector('.demo-caption');
          if (!el) {
            el = document.createElement('div');
            el.className = 'demo-caption';
            document.body.appendChild(el);
          }
          el.innerText = text;
          el.style.opacity = '0';
          el.style.transform = 'translateX(-50%) translateY(20px)';
          setTimeout(() => {
            el.style.transition = 'all 0.3s ease-out';
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
          }, 50);
        }, step.caption);
      }

      // C. Perform Action (NO 400MS HOLD - Fast Click!)
      if (step.action === 'CLICK') {
        await page.evaluate((sel) => {
          // Create ghost cursor
          const cursor = document.createElement('div');
          cursor.className = 'ghost-cursor';
          document.body.appendChild(cursor);

          // Find target
          const target = document.querySelector(sel);
          if (target) {
            const rect = target.getBoundingClientRect();
            cursor.style.left = (rect.left + rect.width / 2 - 12) + 'px';
            cursor.style.top = (rect.top + rect.height / 2 - 12) + 'px';

            // INSTANT CLICK - No delay, no hold!
            setTimeout(() => {
              target.click();
              // Pulse effect
              cursor.style.transform = 'scale(1.5)';
              setTimeout(() => cursor.style.transform = 'scale(1)', 150);
            }, 200);

            // Remove cursor after action
            setTimeout(() => cursor.remove(), step.duration * 1000 - 200);
          }
        }, step.selector, step.duration);

      } else if (step.action === 'TYPE') {
        try {
          await page.type(step.selector, step.value, { delay: 50 });
        } catch (e) {
          log(`    ⚠️  Type failed for selector: ${step.selector}`, 'yellow');
        }

      } else if (step.action === 'SCROLL') {
        try {
          await page.evaluate((sel) => {
            const target = document.querySelector(sel);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, step.target || step.selector);
        } catch (e) {
          log(`    ⚠️  Scroll failed`, 'yellow');
        }
      }

      // Wait for scene duration (visual pacing, not safety)
      await new Promise(r => setTimeout(r, step.duration * 1000));
    }

    log('\n⏹️  Stopping recording...', 'cyan');

    // 7. Stop Recording & Download Video
    const videoBlob = await page.evaluate(async () => {
      if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
        window.mediaRecorder.stop();
        await new Promise(r => window.mediaRecorder.onstop = r);

        const blob = new Blob(window.recordedChunks, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(buffer));
      }
      return null;
    });

    if (videoBlob) {
      const webmPath = path.join(OUTPUT_DIR, `${appKey}_raw.webm`);
      fs.writeFileSync(webmPath, Buffer.from(videoBlob));
      log(`✅ Video saved: ${webmPath} (${(videoBlob.length / 1024 / 1024).toFixed(2)} MB)`, 'green');

      // Convert to MP4
      const mp4Path = path.join(OUTPUT_DIR, `${appKey}_demo.mp4`);
      log(`🎞️  Converting to MP4...`, 'cyan');

      try {
        execSync(`${FFMPEG} -i "${webmPath}" -c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p -y "${mp4Path}" 2>/dev/null`, {
          stdio: 'pipe'
        });

        log(`✅ ${config.meta.title} - COMPLETE!`, 'green');
        log(`   📹 ${mp4Path}`, 'cyan');

        // Clean up WebM
        fs.unlinkSync(webmPath);
      } catch (error) {
        log(`⚠️  FFmpeg conversion failed, keeping WebM`, 'yellow');
      }
    } else {
      log(`⚠️  No video recorded (screenshot fallback would go here)`, 'yellow');
    }

    ws.close();
    log(`\n✅ CUT! ${config.meta.title} Complete.`, 'bright');

  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'yellow');
    console.error(error);
  } finally {
    await browser.close();
  }
}

// Main Execution
(async () => {
  logSection('🏭 FIVERR DEMO FACTORY - PRODUCTION MODE');
  log('Target: Live Vercel Apps', 'magenta');
  log('Mode: Fast/Snappy (NO 400ms Hold)', 'magenta');
  log('Output: 30-second marketing demos', 'magenta');
  log('', 'reset');

  // Check backend
  try {
    const response = await fetch('http://localhost:8000/health');
    const data = await response.json();
    log(`✅ Echo Bridge: ${data.status}`, 'green');
  } catch (error) {
    log('❌ Echo Bridge not running!', 'yellow');
    log('Please start: cd echo-bridge && python server.py', 'yellow');
    process.exit(1);
  }

  // Run all 3 demos
  await runDemo('paper-perfector');
  await new Promise(r => setTimeout(r, 3000));

  await runDemo('data-blaster');
  await new Promise(r => setTimeout(r, 3000));

  await runDemo('master-lease');

  logSection('✨ PRODUCTION COMPLETE');
  log('All 3 Fiverr demos ready!', 'bright');
  log('Output: ~/echo-bridge/output/', 'cyan');

  // Open all videos
  execSync(`open "${OUTPUT_DIR}/"*.mp4`, { stdio: 'ignore' });

})().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
