#!/usr/bin/env node

/**
 * REAL DEMO RECORDING - Uses HybridDemoDirector for proper voiceovers + video
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const DEMOS = [
  { id: 'paper-perfector', title: 'Paper Perfector', duration: 60 },
  { id: 'master-lease', title: 'Master Lease', duration: 60 },
  { id: 'data-blaster', title: 'Data Blaster', duration: 60 },
  { id: 'echo-sound-lab', title: 'Echo Sound Lab', duration: 90 }
];

async function recordWithHybridDirector(browser, demoConfig) {
  console.log(`\n🎬 ${demoConfig.title}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log(`   Loading HybridDemoDirector...`);
    await page.goto('http://localhost:3005', { waitUntil: 'networkidle0', timeout: 20000 });

    // Inject auto-start command
    await page.evaluate((demoId) => {
      window.DEMO_AUTO_RECORD = {
        demoId: demoId,
        autoStart: true
      };
      console.log('[Puppeteer] Auto-record triggered:', demoId);
    }, demoConfig.id);

    // Wait for demo factory to load
    await new Promise(r => setTimeout(r, 2000));

    // Trigger the demo generation
    console.log(`   Starting demo generation...`);
    await page.evaluate(() => {
      // Find and click the "Generate Demo" button
      const generateBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Generate'));
      if (generateBtn) {
        generateBtn.click();
        console.log('[Puppeteer] Clicked Generate Demo');
      }
    });

    // Wait for the video file to be generated
    const demoDir = path.join(DEMOS_DIR, demoConfig.id);
    const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
    
    console.log(`   Waiting for video generation (max 5 minutes)...`);
    let waited = 0;
    while (waited < 300000) {
      if (fs.existsSync(videoPath)) {
        const size = fs.statSync(videoPath).size;
        if (size > 100000) {
          console.log(`   ✅ Video created (${(size / 1024 / 1024).toFixed(1)}MB)`);
          return true;
        }
      }
      await new Promise(r => setTimeout(r, 1000));
      waited += 1000;
      if (waited % 10000 === 0) process.stdout.write('.');
    }

    console.log(`   ⏱️  Timeout waiting for video`);
    return false;

  } catch (error) {
    console.log(`   ❌ ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('\n🎬 RECORDING WITH HYBRID DIRECTOR\n');

  // Clear old demos
  if (fs.existsSync(DEMOS_DIR)) {
    fs.rmSync(DEMOS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DEMOS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const demo of DEMOS) {
      await recordWithHybridDirector(browser, demo);
    }
  } finally {
    await browser.close();
  }

  console.log('\n✅ All demos complete\n');
}

main().catch(console.error);
