#!/usr/bin/env node
/**
 * PHASE 5B TEST: The Hearing Test
 * Validates the complete pipeline:
 * M2 Pro → Demucs → Local CDN → Browser Playback
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const ws = new WebSocket('ws://localhost:8000/ws/bridge');
let messageCount = 0;
let completedTest = false;
let stemURLs = {};
const startTime = Date.now();

console.log('═'.repeat(70));
console.log('🎵 PHASE 5B: THE HEARING TEST');
console.log('═'.repeat(70));
console.log('Testing: M2 Pro → Demucs → Local CDN → Browser Playback');
console.log('');

ws.on('open', () => {
  console.log('✅ WebSocket connected to ws://localhost:8000/ws/bridge');
  console.log('');

  // Send separation request
  console.log('📤 Sending SEPARATE_AUDIO request...');
  console.log('   File: test_track.wav');
  console.log('   Model: htdemucs');
  console.log('   Device: mps');
  console.log('');

  ws.send(JSON.stringify({
    action: 'SEPARATE_AUDIO',
    filename: 'test_track.wav'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  messageCount++;
  const elapsed = (Date.now() - startTime) / 1000;

  if (msg.status === 'loading') {
    console.log(`[${elapsed.toFixed(1)}s] 📦 ${msg.message}`);
  } else if (msg.status === 'processing') {
    const pct = msg.progress || 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    console.log(`[${elapsed.toFixed(1)}s] ⏳ [${bar}] ${pct}% ${msg.stage || 'Processing'}`);
  } else if (msg.status === 'complete') {
    console.log(`[${elapsed.toFixed(1)}s] ✅ SEPARATION COMPLETE`);

    // Extract and display stem URLs
    if (msg.result) {
      stemURLs = msg.result;
      console.log('');
      console.log('📍 Stem URLs Generated:');
      Object.entries(stemURLs).forEach(([stem, url]) => {
        console.log(`   • ${stem}: ${url}`);
      });

      // Display metadata
      if (msg.metadata) {
        console.log('');
        console.log('📊 Metadata:');
        console.log(`   • Model: ${msg.metadata.model}`);
        console.log(`   • Device: ${msg.metadata.device}`);
        console.log(`   • Processing Time: ${msg.metadata.processing_time_ms}ms`);
      }

      completedTest = true;
    }
  } else if (msg.status === 'idle') {
    console.log(`[${elapsed.toFixed(1)}s] 🟢 ${msg.message}`);
  } else if (msg.status === 'error') {
    console.log(`[${elapsed.toFixed(1)}s] ❌ ERROR: ${msg.message}`);
  }
});

ws.on('close', async () => {
  const totalTime = (Date.now() - startTime) / 1000;

  console.log('');
  console.log('═'.repeat(70));

  if (completedTest && Object.keys(stemURLs).length > 0) {
    console.log('🟢 PHASE 5B TEST: PROCESSING COMPLETE');
    console.log('');

    // Test HTTP accessibility of stems
    console.log('🔗 Testing HTTP Accessibility of Stems...');
    let allAccessible = true;

    for (const [stem, url] of Object.entries(stemURLs)) {
      try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type');
        const size = response.headers.get('content-length');

        if (response.ok) {
          console.log(`   ✅ ${stem}: ${response.status} OK (${contentType}, ${size} bytes)`);
        } else {
          console.log(`   ❌ ${stem}: ${response.status} ${response.statusText}`);
          allAccessible = false;
        }
      } catch (err) {
        console.log(`   ❌ ${stem}: ${err.message}`);
        allAccessible = false;
      }
    }

    console.log('');
    if (allAccessible) {
      console.log('✅ ALL STEMS ACCESSIBLE VIA HTTP');
      console.log('✅ LOCAL CDN IS WORKING');
      console.log('✅ BROWSER CAN FETCH STEMS FOR PLAYBACK');
    } else {
      console.log('⚠️  Some stems not accessible - check Python server');
    }

    console.log('');
    console.log('📱 Next Step: Open http://localhost:3007 in browser');
    console.log('   1. Navigate to BridgeTest component (should be visible)');
    console.log('   2. Click "Separate" button to trigger processing');
    console.log('   3. Wait for progress bar (should be fast, ~5s)');
    console.log('   4. You should see 4 audio players appear');
    console.log('   5. Click Play on "vocals" player to hear isolated vocals');

    console.log('');
    console.log(`Stats: ${totalTime.toFixed(1)}s | ${messageCount} messages`);
  } else {
    console.log('⏳ TEST DID NOT COMPLETE');
    console.log(`   Messages received: ${messageCount}`);
  }

  console.log('═'.repeat(70));
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('❌ WebSocket Error:', err.message);
  console.error('   Check that Python server is running: python server.py');
  process.exit(1);
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\n⏱️  Test timeout (300s) - closing connection');
  ws.close();
  process.exit(0);
}, 300000);
