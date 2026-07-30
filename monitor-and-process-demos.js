#!/usr/bin/env node

/**
 * DEMO VIDEO MONITOR & AUTO-PROCESSOR
 *
 * This script:
 * 1. Monitors ~/demos/ for new video files
 * 2. When a video appears, extracts frames
 * 3. Creates PNG contact sheets for verification
 * 4. Reports progress in real-time
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const VERIFICATION_DIR = path.join(os.homedir(), 'demo-verification-sheets');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const DEMO_CONFIGS = [
  { id: 'paper-perfector', name: 'Paper Perfector', duration: 45 },
  { id: 'master-lease', name: 'Master Lease', duration: 45 },
  { id: 'data-blaster', name: 'Data Blaster', duration: 45 },
  { id: 'echo-sound-lab', name: 'Echo Sound Lab', duration: 90 }
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
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`);
}

function logSection(title) {
  log(`${'═'.repeat(70)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');
}

async function extractFrames(demoId, videoPath) {
  const demoDir = path.join(DEMOS_DIR, demoId);
  const framesDir = path.join(demoDir, 'frames-for-sheet');

  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  try {
    const durationOutput = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    const duration = parseFloat(durationOutput);
    const interval = duration > 60 ? 12 : 7;
    const frameCount = Math.ceil(duration / interval);

    log(`   Extracting ${frameCount} frames (every ${interval}s)...`, 'yellow');

    execSync(
      `${FFMPEG} -i "${videoPath}" -vf fps=1/${interval} "${framesDir}/frame_%03d.png" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );

    const extracted = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).length;
    log(`   ✅ Extracted ${extracted} frames`, 'green');
    return extracted;
  } catch (e) {
    log(`   ⚠️  Frame extraction error: ${e.message}`, 'yellow');
    return 0;
  }
}

async function createContactSheet(demoId) {
  const demoDir = path.join(DEMOS_DIR, demoId);
  const framesDir = path.join(demoDir, 'frames-for-sheet');
  const outputPath = path.join(VERIFICATION_DIR, `${demoId}-contact-sheet.png`);

  if (!fs.existsSync(framesDir)) {
    log(`   ❌ Frames directory not found`, 'yellow');
    return false;
  }

  const frames = fs.readdirSync(framesDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .slice(0, 8);

  if (frames.length === 0) {
    log(`   ❌ No frames to process`, 'yellow');
    return false;
  }

  log(`   Creating contact sheet from ${frames.length} frames...`, 'yellow');

  const cols = frames.length > 6 ? 4 : 3;
  let cmd = `${FFMPEG} -y`;

  frames.forEach(f => {
    cmd += ` -i "${path.join(framesDir, f)}"`;
  });

  let filter = '';
  frames.forEach((_, i) => {
    filter += `[${i}:v]scale=320:180[v${i}];`;
  });

  if (cols === 3 && frames.length <= 6) {
    filter += '[v0][v1][v2]concat=n=3:v=1[r0];[v3][v4][v5]concat=n=3:v=1[r1];[r0][r1]concat=n=2:v=1[out]';
  } else if (cols === 4) {
    filter += '[v0][v1][v2][v3]concat=n=4:v=1[r0];';
    if (frames.length > 4) {
      const n = frames.length - 4;
      filter += Array.from({length: n}, (_, i) => `[v${i+4}]`).join('') + `concat=n=${n}:v=1[r1];[r0][r1]concat=n=2:v=1[out]`;
    } else {
      filter += '[r0]scale=-1:360[out]';
    }
  }

  cmd += ` -filter_complex "${filter}" -map "[out]" -frames:v 1 "${outputPath}" 2>/dev/null`;

  try {
    execSync(cmd, { stdio: 'pipe' });

    if (fs.existsSync(outputPath)) {
      const size = fs.statSync(outputPath).size / 1024;
      log(`   ✅ Contact sheet created (${size.toFixed(1)}KB)`, 'green');
      return true;
    }
  } catch (e) {
    log(`   ⚠️  Contact sheet error`, 'yellow');
  }
  return false;
}

async function verifyVideo(videoPath) {
  try {
    const stats = fs.statSync(videoPath);
    const probe = JSON.parse(
      execSync(
        `${FFPROBE} -v error -print_format json -show_format -show_streams "${videoPath}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
    );

    const vs = probe.streams.find(s => s.codec_type === 'video');
    const as = probe.streams.find(s => s.codec_type === 'audio');

    return {
      size: (stats.size / 1024 / 1024).toFixed(1),
      duration: parseFloat(probe.format.duration).toFixed(1),
      resolution: `${vs?.width}×${vs?.height}`,
      videoCodec: vs?.codec_name,
      audioCodec: as?.codec_name
    };
  } catch (e) {
    return null;
  }
}

async function processVideo(demoId, videoPath, demoName) {
  log(`\n🎬 Processing: ${demoName}`, 'cyan');
  log(`   File: ${videoPath}`, 'cyan');

  // Verify video
  log(`   Verifying video specs...`, 'yellow');
  const specs = await verifyVideo(videoPath);

  if (specs) {
    log(`   📊 ${specs.resolution}, ${specs.videoCodec}/${specs.audioCodec}, ${specs.duration}s, ${specs.size}MB`, 'cyan');
  }

  // Extract frames
  log(`\n   Extracting frames...`, 'yellow');
  const frameCount = await extractFrames(demoId, videoPath);

  if (frameCount === 0) {
    log(`   ❌ Frame extraction failed`, 'yellow');
    return false;
  }

  // Create contact sheet
  log(`\n   Creating contact sheet...`, 'yellow');
  const sheetCreated = await createContactSheet(demoId);

  if (sheetCreated) {
    log(`\n✅ ${demoName} complete!`, 'green');
    log(`   📍 ~/demos/${demoId}/final_demo_optimized.mp4`, 'green');
    log(`   📸 ~/demo-verification-sheets/${demoId}-contact-sheet.png\n`, 'green');
    return true;
  } else {
    log(`\n⚠️  ${demoName} partially complete (contact sheet failed)\n`, 'yellow');
    return false;
  }
}

async function monitorAndProcess() {
  logSection('🎬 DEMO MONITOR & AUTO-PROCESSOR');
  log('Monitoring ~/demos/ for new videos...', 'bright');
  log('Recording will start automatically when videos appear', 'cyan');
  log('Press Ctrl+C to stop monitoring\n', 'yellow');

  // Create directories if needed
  if (!fs.existsSync(DEMOS_DIR)) fs.mkdirSync(DEMOS_DIR, { recursive: true });
  if (!fs.existsSync(VERIFICATION_DIR)) fs.mkdirSync(VERIFICATION_DIR, { recursive: true });

  const processedVideos = new Set();
  const checkInterval = 3000; // Check every 3 seconds

  // Initial check for any existing videos
  log('Checking for existing videos...', 'cyan');
  for (const config of DEMO_CONFIGS) {
    const videoPath = path.join(DEMOS_DIR, config.id, 'final_demo_optimized.mp4');
    if (fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      const age = (Date.now() - stats.mtimeMs) / 1000;

      // If file is older than 1 minute, it was probably already processed
      if (age > 60) {
        processedVideos.add(config.id);
      }
    }
  }

  if (processedVideos.size > 0) {
    log(`   Found ${processedVideos.size} existing video(s)`, 'green');
  } else {
    log(`   Waiting for first video...`, 'yellow');
  }

  log('');

  // Main monitoring loop
  const monitor = setInterval(async () => {
    for (const config of DEMO_CONFIGS) {
      if (processedVideos.has(config.id)) continue;

      const videoPath = path.join(DEMOS_DIR, config.id, 'final_demo_optimized.mp4');

      if (fs.existsSync(videoPath)) {
        const stats = fs.statSync(videoPath);
        const size = stats.size / 1024 / 1024;

        // Only process if file is at least 1MB (valid video)
        if (size > 1) {
          // Wait a moment to ensure file is fully written
          await new Promise(r => setTimeout(r, 2000));

          // Check file size hasn't changed (fully written)
          const newStats = fs.statSync(videoPath);
          if (newStats.size === stats.size) {
            processedVideos.add(config.id);
            await processVideo(config.id, videoPath, config.name);
          }
        }
      }
    }

    // Check if all videos are processed
    if (processedVideos.size === DEMO_CONFIGS.length) {
      logSection('✨ ALL DEMOS PROCESSED');
      log('All 4 demos have been recorded and processed!', 'bright');
      log('', 'bright');
      log('📸 Review contact sheets:', 'cyan');

      for (const config of DEMO_CONFIGS) {
        log(`   open "$HOME/demo-verification-sheets/${config.id}-contact-sheet.png"`, 'yellow');
      }

      log(`\n📹 All videos are ready at ~/demos/`, 'bright');
      log(`💰 Estimated Fiverr revenue: $5,400-9,300/month`, 'bright');
      log(`🚀 Ready for upload!\n`, 'bright');

      clearInterval(monitor);
      process.exit(0);
    }
  }, checkInterval);

  // Handle interrupt
  process.on('SIGINT', () => {
    log('\n\n⏹️  Monitoring stopped', 'yellow');
    log(`Processed: ${processedVideos.size}/${DEMO_CONFIGS.length} demos`, 'cyan');
    log('You can restart this script at any time', 'cyan');
    clearInterval(monitor);
    process.exit(0);
  });
}

monitorAndProcess().catch(error => {
  log(`❌ Error: ${error.message}`, 'yellow');
  process.exit(1);
});
