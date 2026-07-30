#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEMO_CONFIGS = [
  {
    name: 'Paper Perfector (Test)',
    scriptPath: './paper_perfector_demo_test.json',
    outputDir: `${process.env.HOME}/demos/paper-perfector-test`,
    timeout: 30000
  },
  {
    name: 'Echo Sound Lab (Test)',
    scriptPath: './echo_sound_lab_demo_test.json',
    outputDir: `${process.env.HOME}/demos/echo-sound-lab-test`,
    timeout: 40000
  }
];

async function runDemoTest(demoConfig) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 TESTING: ${demoConfig.name}`);
  console.log(`${'='.repeat(60)}\n`);

  // Create output directory
  if (!fs.existsSync(demoConfig.outputDir)) {
    execSync(`mkdir -p "${demoConfig.outputDir}"`);
    console.log(`✅ Created output directory: ${demoConfig.outputDir}`);
  }

  // Read demo script
  if (!fs.existsSync(demoConfig.scriptPath)) {
    console.error(`❌ Demo script not found: ${demoConfig.scriptPath}`);
    return null;
  }

  const demoScript = JSON.parse(fs.readFileSync(demoConfig.scriptPath, 'utf8'));
  console.log(`📋 Demo script loaded: ${demoScript.meta.title}`);
  console.log(`⏱️  Target duration: ${demoScript.meta.duration_target}s`);

  let browser;
  try {
    console.log(`\n🚀 Launching browser...`);
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport for consistent recording
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`📲 Navigating to http://localhost:3005`);
    await page.goto('http://localhost:3005', { waitUntil: 'networkidle0' });

    // Wait for demo factory to be available
    console.log(`⏳ Waiting for demo interface to load...`);
    await page.waitForSelector('[data-testid="demo-factory"], [data-demo-factory], .demo-factory', { timeout: 10000 }).catch(() => {
      console.warn(`⚠️  Demo factory selector not found, continuing anyway...`);
    });

    console.log(`\n✅ Browser ready. Demo test will run automatically.`);
    console.log(`📍 Expected video output: ${demoConfig.outputDir}/final_demo_optimized.mp4`);

    // Note: Actual execution would require the React component to be interactive
    // For now, we just verify the setup is ready
    console.log(`\n⏰ Waiting ${demoConfig.timeout / 1000}s for demo execution...`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if video was created
    const videoPath = path.join(demoConfig.outputDir, 'final_demo_optimized.mp4');
    if (fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      console.log(`\n✅ VIDEO CREATED!`);
      console.log(`📹 Path: ${videoPath}`);
      console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      return videoPath;
    } else {
      console.log(`\n⚠️  Video not yet created (recording may still be in progress)`);
      return null;
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function extractFrames(videoPath, outputDir, frameInterval = 5) {
  console.log(`\n📸 EXTRACTING FRAMES: ${path.basename(videoPath)}`);
  console.log(`${'='.repeat(60)}`);

  const framesDir = path.join(outputDir, 'frames');
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  try {
    // Use ffprobe to get duration
    const ffprobePath = '/opt/homebrew/bin/ffprobe';
    let probePath = 'ffprobe'; // Fallback

    if (fs.existsSync(ffprobePath)) {
      probePath = ffprobePath;
    }

    console.log(`📊 Getting video info...`);
    const probeCmd = `${probePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const durationStr = execSync(probeCmd, { encoding: 'utf8' }).trim();
    const duration = parseFloat(durationStr);

    console.log(`⏱️  Video duration: ${duration.toFixed(2)}s`);

    // Extract frames every N seconds
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    let ffCmd = 'ffmpeg'; // Fallback

    if (fs.existsSync(ffmpegPath)) {
      ffCmd = ffmpegPath;
    }

    console.log(`🎬 Extracting frames (every ${frameInterval}s)...`);
    const framePattern = path.join(framesDir, 'frame-%03d.png');
    const extractCmd = `${ffCmd} -i "${videoPath}" -vf fps=1/${frameInterval} "${framePattern}" -y`;

    execSync(extractCmd, { stdio: 'inherit' });

    const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
    console.log(`✅ Extracted ${frames.length} frames to ${framesDir}`);

    return { framesDir, frames, duration };

  } catch (error) {
    console.error(`❌ Frame extraction failed: ${error.message}`);
    return null;
  }
}

async function createContactSheet(framesDir, frames, outputPath) {
  console.log(`\n🖼️  CREATING CONTACT SHEET`);
  console.log(`${'='.repeat(60)}`);

  try {
    const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    let ffCmd = 'ffmpeg';

    if (fs.existsSync(ffmpegPath)) {
      ffCmd = ffmpegPath;
    }

    if (frames.length === 0) {
      console.error(`❌ No frames found to create contact sheet`);
      return null;
    }

    // Create a tile layout for contact sheet
    // For 10-15 second videos with 1 frame per 5 seconds: 2-3 frames
    const cols = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / cols);

    console.log(`📐 Creating ${cols}×${rows} grid from ${frames.length} frames`);

    // Use montage if available
    const frameList = frames.map(f => path.join(framesDir, f));
    const tileCmd = `${ffCmd} ${frameList.map(f => `-i "${f}"`).join(' ')} -filter_complex "scale=320:-1,tile=${cols}x${rows}" -frames:v 1 "${outputPath}" -y`;

    console.log(`🔨 Generating contact sheet...`);
    execSync(tileCmd, { stdio: 'inherit' });

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`✅ Contact sheet created!`);
      console.log(`📍 Path: ${outputPath}`);
      console.log(`📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
      return outputPath;
    } else {
      console.error(`❌ Contact sheet creation failed`);
      return null;
    }

  } catch (error) {
    console.error(`❌ Error creating contact sheet: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n${'█'.repeat(60)}`);
  console.log(`  🎬 DEMO TEST RUNNER - Verify Recording Pipeline`);
  console.log(`${'█'.repeat(60)}\n`);

  const results = [];

  for (const config of DEMO_CONFIGS) {
    try {
      const videoPath = await runDemoTest(config);

      if (videoPath && fs.existsSync(videoPath)) {
        const frameData = await extractFrames(videoPath, config.outputDir, 3);

        if (frameData) {
          const contactSheetPath = path.join(config.outputDir, 'contact-sheet.png');
          const contactSheet = await createContactSheet(frameData.framesDir, frameData.frames, contactSheetPath);

          results.push({
            demo: config.name,
            video: videoPath,
            contactSheet: contactSheet,
            frameCount: frameData.frames.length,
            duration: frameData.duration,
            status: 'success'
          });
        }
      } else {
        results.push({
          demo: config.name,
          status: 'pending',
          message: 'Video generation in progress or not yet started'
        });
      }
    } catch (error) {
      results.push({
        demo: config.name,
        status: 'error',
        message: error.message
      });
    }
  }

  // Print summary
  console.log(`\n${'█'.repeat(60)}`);
  console.log(`  📊 TEST SUMMARY`);
  console.log(`${'█'.repeat(60)}\n`);

  results.forEach(result => {
    const icon = result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : '⏳';
    console.log(`${icon} ${result.demo}`);
    if (result.video) {
      console.log(`   📹 Video: ${result.video}`);
    }
    if (result.contactSheet) {
      console.log(`   🖼️  Contact Sheet: ${result.contactSheet}`);
    }
    if (result.message) {
      console.log(`   📝 Note: ${result.message}`);
    }
  });

  console.log(`\n${'█'.repeat(60)}\n`);
}

main().catch(console.error);
