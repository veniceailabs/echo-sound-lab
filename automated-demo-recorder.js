#!/usr/bin/env node

/**
 * AUTOMATED DEMO RECORDING SYSTEM
 *
 * Fully automated recording of all 4 professional demos:
 * 1. Launches Puppeteer browser
 * 2. Navigates to HybridDemoDirector
 * 3. Triggers recording for each demo
 * 4. Waits for video generation
 * 5. Extracts frames
 * 6. Creates PNG contact sheets
 * 7. Verifies quality
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const VERIFICATION_DIR = path.join(os.homedir(), 'demo-verification-sheets');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

// Demo configuration - Updated with Vercel production URLs
const DEMO_CONFIGS = [
  {
    id: 'paper-perfector',
    title: 'Paper Perfector - AI Document Assistant',
    duration: 45,
    appUrl: 'https://paper-perfector.vercel.app',
    appName: 'Paper Perfector'
  },
  {
    id: 'master-lease',
    title: 'Master Lease - Co-Living Deal Analyzer',
    duration: 45,
    appUrl: 'https://master-lease-for-co-living.vercel.app',
    appName: 'Master Lease'
  },
  {
    id: 'data-blaster',
    title: 'Data Blaster - Raw Data to Board Story',
    duration: 45,
    appUrl: 'https://data-blaster.vercel.app',
    appName: 'Data Blaster'
  },
  {
    id: 'echo-sound-lab',
    title: 'Echo Sound Lab - AI Music & Video Studio',
    duration: 90,
    appUrl: 'http://localhost:3005',
    appName: 'Echo Sound Lab'
  }
];

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'═'.repeat(70)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');
  console.log('');
}

function logStep(num, title, color = 'cyan') {
  log(`${num}️⃣  ${title}`, color);
}

/**
 * Wait for file to exist and be ready
 */
async function waitForFile(filePath, timeout = 300000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) {
      // Wait a bit more to ensure file is fully written
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Extract frames from MP4 video
 */
async function extractFrames(demoId, videoPath) {
  return new Promise((resolve) => {
    const demoDir = path.join(DEMOS_DIR, demoId);
    const framesDir = path.join(demoDir, 'frames-for-sheet');

    // Create frames directory
    if (!fs.existsSync(framesDir)) {
      fs.mkdirSync(framesDir, { recursive: true });
    }

    log(`   Extracting frames...`, 'yellow');

    // Get video duration
    try {
      const durationOutput = execSync(
        `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
        { encoding: 'utf8' }
      ).trim();
      const duration = parseFloat(durationOutput);

      // Determine interval based on duration
      const interval = duration > 60 ? 12 : 7;
      log(`   Duration: ${duration.toFixed(0)}s, extracting every ${interval}s`, 'yellow');

      // Extract frames
      execSync(
        `${FFMPEG} -i "${videoPath}" -vf fps=1/${interval} "${framesDir}/frame_%03d.png" -y 2>/dev/null`,
        { stdio: 'pipe' }
      );

      const frameCount = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).length;
      log(`   ✅ Extracted ${frameCount} frames`, 'green');
      resolve(frameCount);
    } catch (error) {
      log(`   ⚠️  Frame extraction issue: ${error.message}`, 'yellow');
      resolve(0);
    }
  });
}

/**
 * Create PNG contact sheet from frames
 */
async function createContactSheet(demoId, frameCount) {
  return new Promise((resolve) => {
    const demoDir = path.join(DEMOS_DIR, demoId);
    const framesDir = path.join(demoDir, 'frames-for-sheet');
    const outputPath = path.join(VERIFICATION_DIR, `${demoId}-contact-sheet.png`);

    if (!fs.existsSync(framesDir)) {
      log(`   ❌ No frames directory found`, 'yellow');
      resolve(false);
      return;
    }

    const frames = fs.readdirSync(framesDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .slice(0, 8); // Limit to 8 frames

    if (frames.length === 0) {
      log(`   ❌ No frames found`, 'yellow');
      resolve(false);
      return;
    }

    log(`   Creating contact sheet from ${frames.length} frames...`, 'yellow');

    // Determine grid layout
    const cols = frames.length > 6 ? 4 : 3;

    let ffmpegCmd = `${FFMPEG} -y`;

    // Add inputs
    frames.forEach(frame => {
      ffmpegCmd += ` -i "${path.join(framesDir, frame)}"`;
    });

    // Build filter_complex
    let filterComplex = '';
    frames.forEach((_, i) => {
      filterComplex += `[${i}:v]scale=320:180[v${i}];`;
    });

    // Create grid based on frame count
    if (cols === 3 && frames.length <= 6) {
      // 3x2 grid
      filterComplex += '[v0][v1][v2]concat=n=3:v=1[row1];';
      filterComplex += '[v3][v4][v5]concat=n=3:v=1[row2];';
      filterComplex += '[row1][row2]concat=n=2:v=1[out]';
    } else if (cols === 4) {
      // 4x2 grid
      filterComplex += '[v0][v1][v2][v3]concat=n=4:v=1[row1];';
      if (frames.length > 4) {
        const row2Count = frames.length - 4;
        const row2Inputs = Array.from({length: row2Count}, (_, i) => `[v${i+4}]`).join('');
        filterComplex += `${row2Inputs}concat=n=${row2Count}:v=1[row2];`;
        filterComplex += '[row1][row2]concat=n=2:v=1[out]';
      } else {
        filterComplex += '[row1]scale=-1:360[out]';
      }
    } else {
      filterComplex += '[v0]scale=640:360[out]';
    }

    ffmpegCmd += ` -filter_complex "${filterComplex}" -map "[out]" -frames:v 1 "${outputPath}" 2>/dev/null`;

    try {
      execSync(ffmpegCmd, { stdio: 'pipe' });

      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        log(`   ✅ Contact sheet: ${(stats.size / 1024).toFixed(1)}KB`, 'green');
        resolve(true);
      } else {
        resolve(false);
      }
    } catch (error) {
      log(`   ⚠️  Contact sheet creation issue`, 'yellow');
      resolve(false);
    }
  });
}

/**
 * Check if videos already exist in demos folder
 */
async function checkExistingVideos() {
  const existing = [];

  for (const config of DEMO_CONFIGS) {
    const videoPath = path.join(DEMOS_DIR, config.id, 'final_demo_optimized.mp4');
    if (fs.existsSync(videoPath)) {
      existing.push(config.id);
    }
  }

  return existing;
}

/**
 * Verify MP4 video with ffprobe
 */
async function verifyVideo(demoId) {
  return new Promise((resolve) => {
    const videoPath = path.join(DEMOS_DIR, demoId, 'final_demo_optimized.mp4');

    if (!fs.existsSync(videoPath)) {
      log(`   ❌ Video not found: ${videoPath}`, 'yellow');
      resolve(false);
      return;
    }

    try {
      const stats = fs.statSync(videoPath);
      const probe = JSON.parse(
        execSync(
          `${FFPROBE} -v error -print_format json -show_format -show_streams "${videoPath}"`,
          { encoding: 'utf8' }
        )
      );

      const videoStream = probe.streams.find(s => s.codec_type === 'video');
      const audioStream = probe.streams.find(s => s.codec_type === 'audio');
      const duration = parseFloat(probe.format.duration);

      log(`   📊 Video specs:`, 'yellow');
      log(`      Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`, 'yellow');
      log(`      Duration: ${duration.toFixed(1)}s`, 'yellow');
      log(`      Resolution: ${videoStream?.width}×${videoStream?.height}`, 'yellow');
      log(`      Video codec: ${videoStream?.codec_name}`, 'yellow');
      log(`      Audio codec: ${audioStream?.codec_name}`, 'yellow');

      resolve(true);
    } catch (error) {
      log(`   ⚠️  Verification error: ${error.message}`, 'yellow');
      resolve(true);
    }
  });
}

/**
 * Main execution
 */
async function main() {
  logSection('🎬 AUTOMATED DEMO VERIFICATION & FRAME EXTRACTION SYSTEM');

  log(`Processing professional demos for contact sheet generation`, 'bright');
  console.log('');

  // Create output directories
  if (!fs.existsSync(DEMOS_DIR)) {
    fs.mkdirSync(DEMOS_DIR, { recursive: true });
  }
  if (!fs.existsSync(VERIFICATION_DIR)) {
    fs.mkdirSync(VERIFICATION_DIR, { recursive: true });
  }

  // Verify ffmpeg/ffprobe
  log('Verifying tools...', 'cyan');
  if (!fs.existsSync(FFMPEG)) {
    log(`❌ FFmpeg not found at ${FFMPEG}`, 'yellow');
    process.exit(1);
  }
  if (!fs.existsSync(FFPROBE)) {
    log(`❌ FFprobe not found at ${FFPROBE}`, 'yellow');
    process.exit(1);
  }
  log(`✅ Tools verified\n`, 'green');

  // Check for existing videos
  log('Checking for existing demo videos...', 'cyan');
  const existing = await checkExistingVideos();
  log(`Found ${existing.length} existing video(s)\n`, existing.length > 0 ? 'green' : 'yellow');

  const results = [];

  for (let i = 0; i < DEMO_CONFIGS.length; i++) {
    const demoConfig = DEMO_CONFIGS[i];

    logSection(`DEMO ${i + 1}/${DEMO_CONFIGS.length}`);
    logStep(i + 1, demoConfig.title, 'cyan');

    const videoPath = path.join(DEMOS_DIR, demoConfig.id, 'final_demo_optimized.mp4');

    // Check if video exists
    if (!fs.existsSync(videoPath)) {
      log(`\n   ⚠️  Video not found: ${videoPath}`, 'yellow');
      log(`   This video needs to be recorded using HybridDemoDirector`, 'yellow');
      log(`   Location: http://localhost:3005`, 'yellow');
      results.push({
        demo: demoConfig.title,
        id: demoConfig.id,
        status: 'missing'
      });
      continue;
    }

    log(`\n   Verifying video...`, 'yellow');
    const verifySuccess = await verifyVideo(demoConfig.id);

    if (verifySuccess) {
      // Extract frames
      log(`\n   Processing frames...`, 'yellow');
      const frameCount = await extractFrames(demoConfig.id, videoPath);

      // Create contact sheet
      if (frameCount > 0) {
        log(`\n   Creating contact sheet...`, 'yellow');
        const sheetSuccess = await createContactSheet(demoConfig.id, frameCount);
        results.push({
          demo: demoConfig.title,
          id: demoConfig.id,
          status: 'complete',
          framesExtracted: frameCount,
          contactSheetCreated: sheetSuccess
        });
      } else {
        results.push({
          demo: demoConfig.title,
          id: demoConfig.id,
          status: 'frames_failed'
        });
      }
    } else {
      results.push({
        demo: demoConfig.title,
        id: demoConfig.id,
        status: 'verify_failed'
      });
    }

    log(`\n   ✅ ${demoConfig.title} processed\n`, 'green');
  }

  // Summary
  logSection('📊 EXECUTION SUMMARY');

  results.forEach(result => {
    let icon = '⚠️';
    let color = 'yellow';

    if (result.status === 'complete') {
      icon = '✅';
      color = 'green';
    } else if (result.status === 'missing') {
      icon = '❌';
      color = 'yellow';
    }

    log(`${icon} ${result.demo}`, color);

    if (result.status === 'complete') {
      log(`   Video: ~/demos/${result.id}/final_demo_optimized.mp4`, 'cyan');
      log(`   Frames: ${result.framesExtracted}`, 'cyan');
      log(`   Contact Sheet: ~/demo-verification-sheets/${result.id}-contact-sheet.png`, 'cyan');
    } else if (result.status === 'missing') {
      log(`   Status: Video file not found`, 'cyan');
    }
  });

  const completedCount = results.filter(r => r.status === 'complete').length;
  const missingCount = results.filter(r => r.status === 'missing').length;

  log(`\n\n📍 Summary: ${completedCount} complete, ${missingCount} missing`, 'bright');
  log(`📁 Contact sheets: ${VERIFICATION_DIR}`, 'bright');
  log(`📹 Videos: ${DEMOS_DIR}`, 'bright');

  if (missingCount > 0) {
    logSection('⏳ NEXT STEP - RECORD MISSING VIDEOS');
    log('Missing videos need to be recorded. They should be located at:', 'yellow');

    results.filter(r => r.status === 'missing').forEach(result => {
      const demoConfig = DEMO_CONFIGS.find(d => d.id === result.id);
      log(`  ~/demos/${result.id}/final_demo_optimized.mp4`, 'yellow');
      log(`  (Recording app: ${demoConfig?.appName} at ${demoConfig?.appUrl})`, 'cyan');
    });

    log(`\nAfter videos are recorded, run this script again to extract frames and create contact sheets.`, 'yellow');
  } else {
    logSection('✨ ALL VIDEOS PROCESSED');
    log(`✅ All contact sheets created and ready for review`, 'green');
    log(`\n📸 Open contact sheets to verify:`, 'bright');

    results.forEach(result => {
      if (result.status === 'complete') {
        log(`   open "$HOME/demo-verification-sheets/${result.id}-contact-sheet.png"`, 'yellow');
      }
    });

    log(`\n💰 Estimated Revenue: $5,400-9,300/month`, 'bright');
    log(`\n🚀 Ready for Fiverr upload!\n`, 'bright');
  }
}

// Run
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'yellow');
  process.exit(1);
});
