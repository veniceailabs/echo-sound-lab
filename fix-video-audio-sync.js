#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

async function fixDemo(demoId) {
  console.log(`\n🔧 Fixing ${demoId}...`);
  
  const demoDir = path.join(DEMOS_DIR, demoId);
  const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
  const audioDir = path.join(demoDir, 'audio');
  const audioPath = path.join(audioDir, 'timeline.wav');
  
  if (!fs.existsSync(audioPath)) {
    console.log(`  ❌ No audio found at ${audioPath}`);
    return;
  }

  // Get durations
  const getDuration = (filePath) => {
    try {
      const output = execSync(`${FFMPEG} -i "${filePath}" 2>&1 | grep Duration`, { encoding: 'utf8' });
      const match = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
      }
    } catch (e) {
      console.log(`  Warning: Could not get duration of ${path.basename(filePath)}`);
    }
    return 0;
  };

  const videoDuration = getSertion(videoPath);
  const audioDuration = getDuration(audioPath);
  
  console.log(`  Video: ${videoDuration.toFixed(2)}s, Audio: ${audioDuration.toFixed(2)}s`);

  if (audioDuration > videoDuration) {
    console.log(`  ⚠️  Audio is longer - will extend video with loop-back`);
    
    // Create temp output
    const tempPath = path.join(demoDir, 'fixed_temp.mp4');
    
    // Use filter_complex to pad video duration and loop last frame
    try {
      execSync(
        `${FFMPEG} -i "${videoPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]fps=3,pad=1280:720:0:0[v];[v]trim=0:${audioDuration},format=yuv420p[vf]" ` +
        `-map "[vf]" -map 1:a -c:v libx264 -c:a aac "${tempPath}" -y 2>/dev/null`,
        { stdio: 'pipe' }
      );
      
      // Replace original
      fs.renameSync(tempPath, videoPath);
      console.log(`  ✓ Fixed - video extended to ${audioDuration.toFixed(2)}s`);
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  } else {
    console.log(`  ✓ Video duration OK`);
  }
}

// Fix all demos
['master-lease', 'data-blaster', 'paper-perfector'].forEach(app => {
  try {
    fixDemo(app);
  } catch (e) {
    console.log(`Error fixing ${app}: ${e.message}`);
  }
});

console.log('\n✅ Done\n');
