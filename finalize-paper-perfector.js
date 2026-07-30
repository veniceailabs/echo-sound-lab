#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEMOS_DIR = path.join(os.homedir(), 'demos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const VOICE = 'Victoria';

const VOICEOVERS = [
  'Paper Perfector is your intelligent document creation platform powered by AI.',
  'The workspace displays document tiles on the left and editing tools on the right.',
  'Open a document by clicking on any tile in your library.',
  'The editing interface provides structured sections with smart formatting controls.',
  'Scroll through your document to see the full content and document structure.',
  'Access comprehensive formatting tools to customize fonts, colors, and text styling.',
  'Apply professional templates and styling options with a single click.',
  'Use the AI assistant to get intelligent suggestions for improving your writing quality.',
  'Document changes are automatically saved to your library in real-time.',
  'Toggle between light and dark themes for comfortable viewing and editing.',
  'Export your finished documents to PDF, Word, or other formats instantly.',
  'Paper Perfector transforms document creation from tedious to effortless.'
];

function log(msg) {
  console.log(`🎬 ${msg}`);
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

async function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(output) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  const demoDir = path.join(DEMOS_DIR, 'paper-perfector');
  const screenshotsDir = path.join(demoDir, 'screenshots');
  const audioDir = path.join(demoDir, 'audio');

  log('PAPER PERFECTOR - FINALIZE');
  log(`Screenshots: ${fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).length}`);

  // Generate voiceovers
  log(`Generating ${VOICEOVERS.length} voiceovers...`);
  const audioSegments = [];

  for (let i = 0; i < VOICEOVERS.length; i++) {
    try {
      const voPath = path.join(audioDir, `vo_${String(i).padStart(2, '0')}.wav`);
      const success = await generateVoiceover(VOICEOVERS[i], voPath);
      if (success) {
        const duration = await getAudioDuration(voPath);
        audioSegments.push({ path: voPath, duration });
        process.stdout.write(`\r  ${i + 1}/${VOICEOVERS.length}`);
      }
    } catch (e) {}
  }

  log('\n✓ Ready');
  if (audioSegments.length === 0) {
    log('❌ Failed to generate voiceovers');
    process.exit(1);
  }

  // Build audio timeline
  log('Building timeline...');
  const audioTimelinePath = path.join(audioDir, 'timeline.wav');
  const concatFile = path.join(audioDir, 'concat.txt');

  let concatContent = '';
  audioSegments.forEach(seg => {
    concatContent += `file '${seg.path}'\n`;
  });
  fs.writeFileSync(concatFile, concatContent);

  try {
    execSync(`${FFMPEG} -f concat -safe 0 -i "${concatFile}" -c copy "${audioTimelinePath}" -y 2>/dev/null`, { stdio: 'pipe' });
  } catch (e) {
    log('❌ Audio concat failed');
    process.exit(1);
  }

  // Create video
  log('Creating video...');
  const videoPath = path.join(demoDir, 'final_demo_optimized.mp4');
  try {
    execSync(`${FFMPEG} -framerate 3 -pattern_type glob -i "${screenshotsDir}/frame_*.png" -c:v libx264 -pix_fmt yuv420p "${videoPath}" -y 2>/dev/null`, { stdio: 'pipe' });
  } catch (e) {
    log('❌ Video creation failed');
    process.exit(1);
  }

  // Mix
  log('Mixing audio & video...');
  const finalPath = path.join(demoDir, 'demo_final.mp4');
  try {
    execSync(`${FFMPEG} -i "${videoPath}" -i "${audioTimelinePath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${finalPath}" -y 2>/dev/null`, { stdio: 'pipe' });
    fs.copyFileSync(finalPath, videoPath);
    fs.unlinkSync(finalPath);

    const size = fs.statSync(videoPath).size;
    log(`✓ ${(size / 1024 / 1024).toFixed(2)}MB`);
  } catch (e) {
    log('❌ Mixing failed');
    process.exit(1);
  }

  log('✅ COMPLETE\n');
}

main().catch(e => {
  console.log(`❌ ${e.message}`);
  process.exit(1);
});
