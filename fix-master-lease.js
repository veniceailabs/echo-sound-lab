#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const VOICE = 'Victoria';
const demoDir = path.join(os.homedir(), 'demos', 'master-lease');
const audioDir = path.join(demoDir, 'audio');

const voiceovers = [
  'Master Lease is the complete platform for real estate investment analysis.',
  'The main interface shows market input fields and property analysis sections.',
  'Enter a zip code to instantly load lyve market data for your area.',
  'Real-time market data loads with current trends, sales prices, and rental rates.',
  'Market assumptions are cached for accurate and consistent investment modeling.',
  'View detailed market data including rental prices, sales trends, and comparable properties.',
  'Room-level rental comparables provide granular data for specific property types and sizes.',
  'Whole-home rental data benchmarks competitive pricing across the market.',
  'Property comparables show similar homes sold recently, informing your investment strategy.',
  'Advanced profit analysis reveals potential returns and key investment metrics.',
  'Browse available listings directly to identify specific investment opportunities.',
  'Master Lease brings professional-grade analysis to real estate investing.'
];

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function generateVoiceover(text, outputPath) {
  return new Promise((resolve) => {
    try {
      const escapedText = text.replace(/"/g, '\\"');
      const aiffPath = outputPath.replace('.wav', '.aiff');
      const cmd = `say -v '${VOICE}' -o "${aiffPath}" "${escapedText}" && ${FFMPEG} -i "${aiffPath}" "${outputPath}" -y 2>/dev/null && rm "${aiffPath}" 2>/dev/null`;
      execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
      resolve(fs.existsSync(outputPath));
    } catch (e) {
      resolve(fs.existsSync(outputPath));
    }
  });
}

async function main() {
  console.log('🎬 FIXING MASTER LEASE AUDIO\n');
  
  // Clear and recreate audio dir
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  console.log('Generating voiceovers...');
  const audioSegments = [];

  for (let i = 0; i < voiceovers.length; i++) {
    const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
    const success = await generateVoiceover(voiceovers[i], voPath);
    if (success) {
      audioSegments.push(voPath);
      process.stdout.write(`\r  ${i + 1}/${voiceovers.length}`);
    }
  }

  console.log('\n\nBuilding timeline...');
  const concatFile = path.join(audioDir, 'concat.txt');
  const timelineFile = path.join(audioDir, 'timeline.wav');

  let concatContent = '';
  audioSegments.forEach(seg => {
    concatContent += `file '${seg}'\n`;
  });
  fs.writeFileSync(concatFile, concatContent);

  try {
    execSync(`${FFMPEG} -f concat -safe 0 -i "${concatFile}" -c copy "${timelineFile}" -y 2>/dev/null`, { stdio: 'pipe' });
    console.log('✓ Audio ready');
  } catch (e) {
    console.log('❌ Failed to build timeline');
    process.exit(1);
  }
}

main().catch(e => {
  console.log(`❌ ${e.message}`);
  process.exit(1);
});
