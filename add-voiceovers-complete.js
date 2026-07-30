#!/usr/bin/env node

/**
 * PROFESSIONAL VOICEOVER SYSTEM FOR DEMO VIDEOS
 *
 * This script:
 * 1. Reads demo JSON configuration files
 * 2. Generates natural, conversational TTS audio using Flo voice
 * 3. Concatenates audio timeline with proper timing
 * 4. Mixes audio into final video using ffmpeg
 * 5. Creates final MP4 with professional, human-sounding narration
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const SCRIPT_DIR = path.resolve('.');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

// Demo configuration files
const DEMO_CONFIGS = [
  { id: 'paper-perfector', configFile: 'paper_perfector_demo_hybrid.json' },
  { id: 'master-lease', configFile: 'master_lease_demo_hybrid.json' },
  { id: 'data-blaster', configFile: 'data_blaster_demo_hybrid.json' },
  { id: 'echo-sound-lab', configFile: 'echo_sound_lab_demo_hybrid.json' }
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

function logSection(title) {
  console.log('');
  log(`${'═'.repeat(70)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'═'.repeat(70)}`, 'blue');
  console.log('');
}

/**
 * Generate a single voiceover audio file using natural voice
 * Uses Flo for more natural, conversational tone
 */
async function generateVoiceoverAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    // Use macOS 'say' command with Flo voice (more natural than Samantha)
    // Flo is a neural voice that sounds professional yet conversational
    const aiffPath = outputPath.replace('.wav', '.aiff');
    const cmd = `say -v 'Flo (English (US))' -o "${aiffPath}" "${text.replace(/"/g, '\\"')}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });

      // Verify file was created
      if (fs.existsSync(aiffPath)) {
        // Convert AIFF to WAV using ffmpeg
        const convertCmd = `${FFMPEG} -i "${aiffPath}" "${outputPath}" -y 2>/dev/null`;
        execSync(convertCmd, { stdio: 'pipe' });

        // Cleanup AIFF
        if (fs.existsSync(aiffPath)) {
          fs.unlinkSync(aiffPath);
        }

        if (fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          reject(new Error('WAV conversion failed'));
        }
      } else {
        reject(new Error('Audio file not created'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Convert WAV to M4A (AAC) for better ffmpeg compatibility
 */
async function convertToM4A(wavPath, m4aPath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFMPEG} -i "${wavPath}" -c:a aac -q:a 9 "${m4aPath}" -y 2>/dev/null`;

    try {
      execSync(cmd, { stdio: 'pipe' });
      if (fs.existsSync(m4aPath)) {
        resolve(true);
      } else {
        reject(new Error('M4A conversion failed'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get audio duration in seconds
 */
async function getAudioDuration(audioPath) {
  try {
    const output = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(output);
  } catch (e) {
    return 0;
  }
}

/**
 * Create silent audio padding of specified duration (in seconds)
 */
async function createSilentAudio(duration, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFMPEG} -f lavfi -i anullsrc=r=48000:cl=mono -t ${duration} -q:a 9 -acodec libmp3lame "${outputPath}" -y 2>/dev/null`;

    try {
      execSync(cmd, { stdio: 'pipe' });
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Concatenate multiple audio files with timing
 */
async function buildAudioTimeline(audioSegments, outputPath) {
  return new Promise((resolve, reject) => {
    // Create a concat demux file for ffmpeg
    const concatFile = outputPath.replace('.m4a', '_concat.txt');
    let concatContent = '';

    audioSegments.forEach(segment => {
      concatContent += `file '${segment.path}'\n`;
    });

    fs.writeFileSync(concatFile, concatContent);

    try {
      const cmd = `${FFMPEG} -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}" -y 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe' });

      // Cleanup concat file
      fs.unlinkSync(concatFile);

      if (fs.existsSync(outputPath)) {
        resolve(true);
      } else {
        reject(new Error('Audio timeline creation failed'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Mix audio with video using ffmpeg
 */
async function mixAudioWithVideo(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg to mix video and audio
    // If video is shorter, pad audio; if audio is shorter, will be padded by ffmpeg
    const cmd = `${FFMPEG} -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y 2>/dev/null`;

    try {
      execSync(cmd, { stdio: 'pipe' });

      if (fs.existsSync(outputPath)) {
        resolve(true);
      } else {
        reject(new Error('Video-audio mix failed'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Process a single demo: generate voiceovers and mix with video
 */
async function processDemo(demoConfig) {
  log(`\nProcessing: ${demoConfig.id}`, 'cyan');

  // Load demo config
  const configPath = path.join(SCRIPT_DIR, demoConfig.configFile);
  if (!fs.existsSync(configPath)) {
    log(`  ❌ Config not found: ${configPath}`, 'yellow');
    return false;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const demoDir = path.join(DEMOS_DIR, demoConfig.id);
  const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
  const audioWorkDir = path.join(demoDir, 'audio-work');

  // Verify video exists
  if (!fs.existsSync(videoPath)) {
    log(`  ❌ Video not found: ${videoPath}`, 'yellow');
    return false;
  }

  // Create working directory
  if (!fs.existsSync(audioWorkDir)) {
    fs.mkdirSync(audioWorkDir, { recursive: true });
  }

  log(`  📹 Video duration check...`, 'yellow');
  let videoDuration = 0;
  try {
    const output = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    videoDuration = parseFloat(output);
    log(`  ✅ Video duration: ${videoDuration.toFixed(1)}s`, 'green');
  } catch (e) {
    log(`  ⚠️  Could not determine video duration`, 'yellow');
    videoDuration = config.meta.duration_target || 60;
  }

  log(`  🎙️  Generating voiceovers...`, 'yellow');
  const scenes = config.scenes || [];
  const audioSegments = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const voiceover = scene.voiceover || '';
    const duration = scene.duration || 2;

    if (voiceover) {
      try {
        const wavPath = path.join(audioWorkDir, `vo_${String(i).padStart(2, '0')}.wav`);
        const m4aPath = path.join(audioWorkDir, `vo_${String(i).padStart(2, '0')}.m4a`);

        log(`     Scene ${i + 1}/${scenes.length}: "${voiceover.slice(0, 50)}..."`, 'yellow');

        // Generate voiceover
        await generateVoiceoverAudio(voiceover, wavPath);

        // Convert to M4A
        await convertToM4A(wavPath, m4aPath);

        // Get audio duration
        const audioDuration = await getAudioDuration(m4aPath);

        // If audio is shorter than scene duration, use audio duration
        // Otherwise use the full duration for timing
        const actualDuration = Math.max(audioDuration, duration);

        audioSegments.push({
          path: m4aPath,
          duration: actualDuration,
          index: i
        });

        currentTime += actualDuration;

        // Cleanup WAV
        fs.unlinkSync(wavPath);

      } catch (error) {
        log(`     ⚠️  Scene ${i + 1} failed: ${error.message}`, 'yellow');
      }
    } else {
      // Scene without voiceover - add silence
      try {
        const silencePath = path.join(audioWorkDir, `silence_${String(i).padStart(2, '0')}.m4a`);
        await createSilentAudio(duration, silencePath);

        audioSegments.push({
          path: silencePath,
          duration: duration,
          index: i
        });

        currentTime += duration;
      } catch (error) {
        log(`     ⚠️  Could not create silence for scene ${i + 1}`, 'yellow');
      }
    }
  }

  if (audioSegments.length === 0) {
    log(`  ❌ No audio segments created`, 'yellow');
    return false;
  }

  log(`  ✅ Generated ${audioSegments.length} audio segments`, 'green');
  log(`  📊 Total audio timeline: ${currentTime.toFixed(1)}s`, 'cyan');

  // Build audio timeline
  log(`  🎵 Building audio timeline...`, 'yellow');
  const audioTimelinePath = path.join(audioWorkDir, 'audio_timeline.m4a');

  try {
    await buildAudioTimeline(audioSegments, audioTimelinePath);
    log(`  ✅ Audio timeline created`, 'green');
  } catch (error) {
    log(`  ❌ Failed to build audio timeline: ${error.message}`, 'yellow');
    return false;
  }

  // Mix audio with video
  log(`  🎬 Mixing audio with video...`, 'yellow');
  const finalVideoPath = path.join(demoDir, 'final_demo_with_voiceovers.mp4');

  try {
    await mixAudioWithVideo(videoPath, audioTimelinePath, finalVideoPath);

    if (fs.existsSync(finalVideoPath)) {
      const fileSize = fs.statSync(finalVideoPath).size;
      log(`  ✅ Final video created: ${(fileSize / 1024 / 1024).toFixed(1)}MB`, 'green');
      log(`  📁 ${finalVideoPath}`, 'cyan');

      // Also update the original file
      fs.copyFileSync(finalVideoPath, videoPath);
      log(`  ✅ Updated original video file`, 'green');

      return true;
    }
  } catch (error) {
    log(`  ❌ Failed to mix audio: ${error.message}`, 'yellow');
    return false;
  }

  return false;
}

async function main() {
  logSection('🎙️  PROFESSIONAL VOICEOVER SYSTEM - FLO VOICE');

  // Verify tools
  log('Verifying setup...', 'cyan');
  log('Voice: Flo (Natural, Conversational)', 'cyan');

  if (!fs.existsSync(FFMPEG) || !fs.existsSync(FFPROBE)) {
    log('❌ FFmpeg/FFprobe not found at expected paths', 'yellow');
    log(`   FFMPEG: ${FFMPEG}`, 'yellow');
    log(`   FFPROBE: ${FFPROBE}`, 'yellow');
    process.exit(1);
  }
  log('✅ Tools verified\n', 'green');

  // Verify demos directory
  if (!fs.existsSync(DEMOS_DIR)) {
    log(`❌ Demos directory not found: ${DEMOS_DIR}`, 'yellow');
    process.exit(1);
  }

  const results = [];

  // Process each demo
  for (let i = 0; i < DEMO_CONFIGS.length; i++) {
    const demoConfig = DEMO_CONFIGS[i];
    logSection(`DEMO ${i + 1}/${DEMO_CONFIGS.length}`);

    try {
      const success = await processDemo(demoConfig);
      results.push({
        id: demoConfig.id,
        status: success ? 'success' : 'failed'
      });
    } catch (error) {
      log(`\n❌ Fatal error: ${error.message}`, 'yellow');
      results.push({
        id: demoConfig.id,
        status: 'error'
      });
    }
  }

  // Summary
  logSection('📊 FINAL SUMMARY');

  results.forEach(r => {
    const icon = r.status === 'success' ? '✅' : '❌';
    const color = r.status === 'success' ? 'green' : 'yellow';
    log(`${icon} ${r.id}`, color);
  });

  const success = results.filter(r => r.status === 'success').length;
  log(`\n\n🎙️  Complete: ${success}/${DEMO_CONFIGS.length} demos processed with natural voiceovers`, 'bright');
  log(`📁 Videos with voiceovers: ~/demos/[demo-id]/final_demo_optimized.mp4`, 'bright');
  log(`\n🚀 All demos now feature Flo voice - natural, conversational, and professional!\n`, 'green');
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'yellow');
  process.exit(1);
});
