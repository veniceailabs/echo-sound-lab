#!/usr/bin/env node

/**
 * FULLY AUTOMATED DEMO GENERATION
 *
 * Generates all 4 professional demos using the DemoFactory UI:
 * 1. Opens Echo Sound Lab in browser
 * 2. For each app, clicks through the DemoFactory UI
 * 3. Waits for video generation to complete
 * 4. Opens all generated videos
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

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

const DEMOS = [
  { id: 'paper-perfector', name: 'Paper Perfector', duration: 45 },
  { id: 'master-lease', name: 'Master Lease', duration: 45 },
  { id: 'data-blaster', name: 'Data Blaster', duration: 45 },
  { id: 'echo-sound-lab', name: 'Echo Sound Lab', duration: 90 }
];

async function generateDemo(page, demoId, demoName, duration) {
  logSection(`🎬 GENERATING: ${demoName}`);

  try {
    // Wait for DemoFactory UI to be visible
    log('Waiting for DemoFactory UI...', 'cyan');
    await page.waitForSelector('select', { timeout: 10000 });

    // Select the app from dropdown
    log(`Selecting ${demoName} from dropdown...`, 'cyan');
    const appSelectors = await page.$$('select');
    if (appSelectors.length >= 1) {
      await appSelectors[0].select(demoId);
      await new Promise(r => setTimeout(r, 500));
    }

    // Click the generate button
    log('Clicking generate button...', 'cyan');
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text.includes('Generate') || text.includes('GENERATE')) {
        await button.click();
        log('✅ Generation started!', 'green');
        break;
      }
    }

    // Wait for screen recording permission dialog
    log('⚠️  Grant screen recording permission in the browser dialog!', 'yellow');
    await new Promise(r => setTimeout(r, 5000));

    // Monitor for completion (look for download link or success message)
    log('Monitoring generation progress...', 'cyan');
    const startTime = Date.now();
    const timeout = (duration + 120) * 1000; // duration + 2 minutes buffer

    let videoUrl = null;
    while (Date.now() - startTime < timeout) {
      // Check for success message
      const pageText = await page.evaluate(() => document.body.textContent);

      if (pageText.includes('Demo Generated') || pageText.includes('Download Video')) {
        log('✅ Demo generation complete!', 'green');

        // Extract video URL
        const links = await page.$$('a');
        for (const link of links) {
          const href = await page.evaluate(el => el.getAttribute('href'), link);
          if (href && href.includes('final_demo')) {
            videoUrl = href;
            log(`📹 Video URL: ${videoUrl}`, 'cyan');
            break;
          }
        }
        break;
      }

      if (pageText.includes('ERROR') || pageText.includes('Failed')) {
        log('❌ Demo generation failed!', 'yellow');
        break;
      }

      // Wait and check again
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!videoUrl) {
      log('⚠️  Could not find video URL, but generation may have completed', 'yellow');
    }

    return videoUrl;

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'yellow');
    return null;
  }
}

async function main() {
  logSection('🚀 FULLY AUTOMATED DEMO GENERATION');
  log('Generating all 4 professional demos with Action Authority governance', 'magenta');
  log('Sit back and relax - this will take ~10-15 minutes', 'magenta');
  log('', 'reset');

  // Check backend
  try {
    const response = await fetch('http://localhost:8000/health');
    const data = await response.json();
    log(`✅ Backend ready: ${data.status}`, 'green');
  } catch (error) {
    log('❌ Backend not running!', 'yellow');
    log('Please start: cd echo-bridge && python server.py', 'yellow');
    process.exit(1);
  }

  // Launch browser
  log('\n🌐 Launching browser...', 'cyan');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-usermedia-screen-capturing',
      '--allow-http-screen-capture',
      '--auto-select-desktop-capture-source=Echo Sound Lab'
    ]
  });

  const page = await browser.newPage();

  try {
    // Navigate to Echo Sound Lab
    log('Opening Echo Sound Lab...', 'cyan');
    await page.goto('http://localhost:3005', { waitUntil: 'networkidle0', timeout: 30000 });
    log('✅ Echo Sound Lab loaded', 'green');

    // Wait for app to settle
    await new Promise(r => setTimeout(r, 3000));

    // Generate all demos
    const videoUrls = [];
    for (const demo of DEMOS) {
      const videoUrl = await generateDemo(page, demo.id, demo.name, demo.duration);
      if (videoUrl) {
        videoUrls.push({ name: demo.name, url: videoUrl });
      }

      // Wait between demos
      if (demo !== DEMOS[DEMOS.length - 1]) {
        log('\n⏳ Waiting 5 seconds before next demo...\n', 'cyan');
        await new Promise(r => setTimeout(r, 5000));

        // Refresh page to reset DemoFactory
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Summary
    logSection('✨ ALL DEMOS GENERATED');
    log(`Completed: ${videoUrls.length}/${DEMOS.length} demos`, 'bright');
    log('', 'reset');

    // Open all videos
    if (videoUrls.length > 0) {
      log('🎥 Opening generated videos...', 'cyan');
      for (const video of videoUrls) {
        log(`  📹 ${video.name}: ${video.url}`, 'cyan');

        // Convert URL to local path and open
        const urlPath = video.url.replace('http://localhost:8000/stems/', '');
        const fullPath = `/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/echo-bridge/output/${urlPath}`;

        try {
          execSync(`open "${fullPath}"`, { stdio: 'ignore' });
          log(`  ✅ Opened ${video.name}`, 'green');
        } catch (error) {
          log(`  ⚠️  Could not open ${fullPath}`, 'yellow');
        }
      }

      log('\n✅ All videos opened in default player!', 'green');
      log('🚀 Ready for Fiverr upload!', 'bright');
    } else {
      log('⚠️  No videos were generated', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'yellow');
    console.error(error);
  } finally {
    // Keep browser open so user can see the final state
    log('\n💡 Browser will stay open. Close it manually when done.', 'cyan');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
