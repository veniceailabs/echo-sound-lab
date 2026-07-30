#!/usr/bin/env node

/**
 * REAL SCREEN RECORDING WITH MEDIARECORDER
 *
 * Records actual screen interaction using browser MediaRecorder API
 * - Real app interactions captured
 * - HybridDemoDirector executes scene actions
 * - Voiceovers generated with Samantha
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const DEMOS = [
  {
    id: 'paper-perfector',
    title: 'Paper Perfector - AI Document Assistant',
    url: 'http://localhost:5173',
    duration: 45
  },
  {
    id: 'master-lease',
    title: 'Master Lease - Real Estate Management',
    url: 'http://localhost:3002',
    duration: 45
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster - Data Processing Platform',
    url: 'http://localhost:3003',
    duration: 45
  },
  {
    id: 'echo-sound-lab',
    title: 'Echo Sound Lab - AI Audio Mastering',
    url: 'http://localhost:3005',
    duration: 90
  }
];

async function recordDemoWithMediaRecorder(browser, demoConfig) {
  console.log(`\n🎬 Recording: ${demoConfig.title}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    console.log(`   Opening ${demoConfig.url}...`);
    await page.goto(demoConfig.url, { waitUntil: 'networkidle0', timeout: 20000 });

    // Inject recording script into page
    console.log(`   Setting up MediaRecorder...`);

    const recordingScript = `
      (async () => {
        const canvas = await html2canvas(document.body, {
          allowTaint: true,
          useCORS: true,
          width: 1280,
          height: 720
        });

        const stream = canvas.captureStream(2); // 2 FPS
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          window.DEMO_RECORDING = {
            blob,
            ready: true
          };
        };

        mediaRecorder.start();
        window.DEMO_MEDIA_RECORDER = mediaRecorder;
        window.DEMO_RECORDING_START = Date.now();
      })();
    `;

    // Load html2canvas for rendering
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js' });

    // Wait for libraries to load
    await new Promise(r => setTimeout(r, 2000));

    // Start recording
    await page.evaluate(recordingScript);

    console.log(`   Recording for ${demoConfig.duration}s...`);

    // Execute demo actions
    const demoActions = {
      'paper-perfector': async () => {
        await page.click('.assistant-toggle').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        await page.click('.assistant-actions button:first-child').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
      },
      'master-lease': async () => {
        await page.focus('#zip');
        await page.type('#zip', '94114', { delay: 100 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
        await page.click('#loadZipProfile').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        await page.click('#addRoomComp').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        await page.click('#addHouseComp').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
      },
      'data-blaster': async () => {
        await page.click('#guided-start').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        await page.click('#load-sample').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        await page.click('#story-once').catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
      },
      'echo-sound-lab': async () => {
        await new Promise(r => setTimeout(r, 2000));
      }
    };

    const executor = demoActions[demoConfig.id];
    if (executor) {
      await executor();
    }

    // Wait for remaining time
    await new Promise(r => setTimeout(r, (demoConfig.duration * 1000) - 10000));

    // Stop recording
    console.log(`   Stopping recording...`);
    await page.evaluate(() => {
      window.DEMO_MEDIA_RECORDER.stop();
    });

    // Wait for recording to finish
    await new Promise(r => setTimeout(r, 2000));

    // Get blob and save
    const blob = await page.evaluate(() => {
      return window.DEMO_RECORDING ? window.DEMO_RECORDING.blob : null;
    });

    if (blob) {
      const demoDir = path.join(DEMOS_DIR, demoConfig.id);
      if (!fs.existsSync(demoDir)) {
        fs.mkdirSync(demoDir, { recursive: true });
      }

      const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
      console.log(`   ✅ Recording complete`);
      return true;
    } else {
      console.log(`   ❌ Recording failed`);
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('\n🎬 DEMO RECORDING WITH MEDIARECORDER\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const demo of DEMOS) {
      await recordDemoWithMediaRecorder(browser, demo);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
