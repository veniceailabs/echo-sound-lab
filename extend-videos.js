#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const DEMOS_DIR = path.join(os.homedir(), 'demos');

function getDuration(filePath) {
  try {
    const output = execSync(`${FFMPEG} -i "${filePath}" 2>&1 | grep Duration`, { encoding: 'utf8' });
    const match = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
    }
  } catch (e) {}
  return 0;
}

function extendVideo(demoId) {
  console.log(`\n🎬 Extending ${demoId}...`);
  
  const demoDir = path.join(DEMOS_DIR, demoId);
  const screenshotsDir = path.join(demoDir, 'screenshots');
  const audioDir = path.join(demoDir, 'audio');
  const audioPath = path.join(audioDir, 'timeline.wav');
  
  if (!fs.existsSync(audioPath)) {
    console.log(`  ❌ No audio timeline found`);
    return;
  }

  const audioDuration = getDuration(audioPath);
  console.log(`  🔊 Audio duration: ${audioDuration.toFixed(2)}s`);

  // Get frame count
  const frames = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length;
  const videoDuration = frames / 3; // at 3fps
  console.log(`  📹 Video duration: ${videoDuration.toFixed(2)}s (${frames} frames)`);

  if (videoDuration >= audioDuration) {
    console.log(`  ✓ Video already long enough`);
    return;
  }

  // Need to extend - create new sequence that loops frames
  console.log(`  ⏱️  Need to extend by ${(audioDuration - videoDuration).toFixed(2)}s`);
  
  const lastFrame = path.join(screenshotsDir, `frame_${String(frames - 1).padStart(5, '0')}.png`);
  const loopDir = path.join(demoDir, 'loop_frames');
  
  // Create loop directory with last frame repeated
  if (fs.existsSync(loopDir)) fs.rmSync(loopDir, { recursive: true });
  fs.mkdirSync(loopDir, { recursive: true });
  
  // Copy original frames
  for (let i = 0; i < frames; i++) {
    const src = path.join(screenshotsDir, `frame_${String(i).padStart(5, '0')}.png`);
    const dst = path.join(loopDir, `frame_${String(i).padStart(5, '0')}.png`);
    fs.copyFileSync(src, dst);
  }
  
  // Add loop frames (about 3 frames per second for remaining duration)
  const framesNeeded = Math.ceil((audioDuration - videoDuration) * 3);
  console.log(`  🔁 Adding ${framesNeeded} loop frames...`);
  
  for (let i = 0; i < framesNeeded; i++) {
    const frameNum = frames + i;
    const dst = path.join(loopDir, `frame_${String(frameNum).padStart(5, '0')}.png`);
    fs.copyFileSync(lastFrame, dst);
  }
  
  // Create new video from extended frames
  console.log(`  🎥 Creating extended video...`);
  const extendedVideoPath = path.join(demoDir, 'extended_video.mp4');
  
  try {
    execSync(
      `${FFMPEG} -framerate 3 -pattern_type glob -i "${loopDir}/frame_*.png" ` +
      `-c:v libx264 -pix_fmt yuv420p "${extendedVideoPath}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    console.log(`  ❌ Video creation failed: ${e.message}`);
    return;
  }
  
  // Mix with audio
  console.log(`  🎵 Mixing with audio...`);
  const finalVideoPath = path.join(demoDir, 'final_demo_optimized.mp4');
  const tempMix = path.join(demoDir, 'temp_mix.mp4');
  
  try {
    execSync(
      `${FFMPEG} -i "${extendedVideoPath}" -i "${audioPath}" ` +
      `-c:v copy -c:a aac -map 0:v:0 -map 1:a:0 ` +
      `"${tempMix}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
    
    fs.copyFileSync(tempMix, finalVideoPath);
    fs.unlinkSync(tempMix);
    fs.unlinkSync(extendedVideoPath);
    
    const size = fs.statSync(finalVideoPath).size;
    const newDuration = getDuration(finalVideoPath);
    console.log(`  ✓ ${(size / 1024 / 1024).toFixed(2)}MB - Duration: ${newDuration.toFixed(2)}s`);
    
  } catch (e) {
    console.log(`  ❌ Mixing failed: ${e.message}`);
  }
  
  // Cleanup
  fs.rmSync(loopDir, { recursive: true });
}

console.log('🎬 EXTENDING ALL VIDEOS TO MATCH AUDIO');

['master-lease', 'data-blaster', 'paper-perfector'].forEach(app => {
  extendVideo(app);
});

console.log('\n✅ Done\n');
