#!/usr/bin/env node

/**
 * AUTOMATED DEMO GENERATION - ALL 4 APPS
 *
 * Uses existing HybridDemoDirector infrastructure to generate professional demos
 * for all apps with Action Authority governance, professional voiceovers, and
 * cinematic intros via EVE VideoEngine.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    name: 'Paper Perfector - AI Document Assistant',
    scriptPath: './paper_perfector_demo_hybrid.json',
    appUrl: 'http://localhost:5173',
    port: 5173
  },
  {
    id: 'master-lease',
    name: 'Master Lease - Real Estate Management',
    scriptPath: './master_lease_demo_hybrid.json',
    appUrl: 'http://localhost:3002',
    port: 3002
  },
  {
    id: 'data-blaster',
    name: 'Data Blaster - Data Processing Platform',
    scriptPath: './data_blaster_demo_hybrid.json',
    appUrl: 'http://localhost:3003',
    port: 3003
  },
  {
    id: 'echo-sound-lab',
    name: 'Echo Sound Lab - AI Music & Video Studio',
    scriptPath: './echo_sound_lab_demo_hybrid.json',
    appUrl: 'http://localhost:3005',
    port: 3005
  }
];

async function checkBackend() {
  try {
    const response = await fetch('http://localhost:8000/health');
    const data = await response.json();
    log(`✅ Backend healthy: ${data.status}`, 'green');
    log(`   Device: ${data.device}, MPS: ${data.mps_available}`, 'cyan');
    return true;
  } catch (error) {
    log(`❌ Backend not running on localhost:8000`, 'yellow');
    log(`   Please start: cd echo-bridge && python server.py`, 'yellow');
    return false;
  }
}

async function checkApp(appUrl, appName) {
  try {
    const response = await fetch(appUrl);
    if (response.ok) {
      log(`  ✅ ${appName} ready`, 'green');
      return true;
    }
  } catch (error) {
    log(`  ❌ ${appName} not running at ${appUrl}`, 'yellow');
    return false;
  }
  return false;
}

async function generateDemoViaBrowser(config) {
  logSection(`🎬 GENERATING: ${config.name}`);

  const browser = await puppeteer.launch({
    headless: false, // Need visible browser for screen recording permission
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-usermedia-screen-capturing',
      '--allow-http-screen-capture',
      '--auto-select-desktop-capture-source=Echo Sound Lab'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to Echo Sound Lab (which has DemoFactory UI)
    log(`🌐 Opening Echo Sound Lab at localhost:3005...`, 'cyan');
    await page.goto('http://localhost:3005', { waitUntil: 'networkidle0', timeout: 30000 });

    log(`⏳ Waiting for app to load...`, 'cyan');
    await new Promise(r => setTimeout(r, 3000));

    // Load demo script
    const scriptPath = path.join(__dirname, config.scriptPath);
    const demoScript = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));

    log(`📜 Loaded demo script: ${demoScript.meta.title}`, 'cyan');
    log(`   Scenes: ${demoScript.scenes.length}`, 'cyan');
    log(`   Intro: ${demoScript.intro?.enabled ? 'Yes' : 'No'}`, 'cyan');
    log(`   Voice: ${demoScript.voice.provider}`, 'cyan');

    // Inject demo execution code
    log(`💉 Injecting HybridDirector execution...`, 'cyan');

    const result = await page.evaluate(async (script) => {
      // Wait for HybridDirector to be available
      while (!window.HybridDirector) {
        await new Promise(r => setTimeout(r, 100));
      }

      const statusMessages = [];
      const logStatus = (msg) => {
        statusMessages.push(msg);
        console.log(msg);
      };

      try {
        // Execute demo via HybridDirector
        const demoResult = await window.HybridDirector.executeDemo(
          script,
          logStatus
        );

        return {
          success: true,
          result: demoResult,
          messages: statusMessages
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          messages: statusMessages
        };
      }
    }, demoScript);

    if (result.success) {
      log(`✅ Demo generated successfully!`, 'green');
      log(`   Video: ${result.result.videoUrl}`, 'cyan');
      log(`   Size: ${(result.result.fileSize / 1024 / 1024).toFixed(2)} MB`, 'cyan');
      log(`   Duration: ${result.result.duration}s`, 'cyan');

      if (result.result.metadata) {
        log(`   Intro: ${result.result.metadata.introGenerated ? 'Yes' : 'No'}`, 'cyan');
        log(`   Voice: ${result.result.metadata.voiceProvider}`, 'cyan');
        log(`   TTS Scenes: ${result.result.metadata.ttsScenes}`, 'cyan');
        log(`   Render Time: ${(result.result.metadata.renderTimeMs / 1000).toFixed(1)}s`, 'cyan');
      }

      // Show status messages
      log(`\n📋 Execution Log:`, 'cyan');
      result.messages.forEach(msg => log(`   ${msg}`, 'cyan'));

      return {
        success: true,
        videoUrl: result.result.videoUrl,
        videoPath: result.result.videoPath
      };
    } else {
      log(`❌ Demo generation failed: ${result.error}`, 'yellow');
      log(`\n📋 Error Log:`, 'yellow');
      result.messages.forEach(msg => log(`   ${msg}`, 'yellow'));

      return {
        success: false,
        error: result.error
      };
    }

  } catch (error) {
    log(`❌ Browser automation error: ${error.message}`, 'yellow');
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  logSection('🎬 AUTOMATED DEMO GENERATION - ALL APPS');
  log('Using HybridDemoDirector with Action Authority governance', 'magenta');
  log('Professional voiceovers + Cinematic intros via EVE VideoEngine', 'magenta');
  log('', 'reset');

  // Step 1: Check backend
  log('🔍 Step 1: Checking backend...', 'bright');
  const backendReady = await checkBackend();
  if (!backendReady) {
    log('\n❌ Cannot proceed without backend', 'yellow');
    process.exit(1);
  }

  // Step 2: Check apps
  log('\n🔍 Step 2: Checking app availability...', 'bright');
  const appChecks = await Promise.all(
    DEMO_CONFIGS.map(config => checkApp(config.appUrl, config.name))
  );

  const readyCount = appChecks.filter(Boolean).length;
  log(`\n✅ ${readyCount}/${DEMO_CONFIGS.length} apps ready\n`, 'green');

  // Step 3: Generate demos
  log('🎬 Step 3: Generating demos...\n', 'bright');

  const results = [];
  for (const config of DEMO_CONFIGS) {
    const result = await generateDemoViaBrowser(config);
    results.push({ config, result });

    // Wait between demos
    if (config !== DEMO_CONFIGS[DEMO_CONFIGS.length - 1]) {
      log('\n⏳ Waiting 5 seconds before next demo...\n', 'cyan');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Summary
  logSection('✨ DEMO GENERATION COMPLETE');
  const successCount = results.filter(r => r.result.success).length;
  log(`Completed: ${successCount}/${DEMO_CONFIGS.length} demos`, 'bright');
  log('', 'reset');

  results.forEach(({ config, result }) => {
    if (result.success) {
      log(`✅ ${config.name}`, 'green');
      log(`   📹 ${result.videoPath || result.videoUrl}`, 'cyan');
    } else {
      log(`❌ ${config.name}`, 'yellow');
      log(`   Error: ${result.error}`, 'yellow');
    }
  });

  log('\n🚀 All demos ready for Fiverr upload!', 'bright');
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'yellow');
  console.error(error);
  process.exit(1);
});
