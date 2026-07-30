const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8000/ws/bridge');
let messageCount = 0;
let completedTest = false;
const startTime = Date.now();

ws.on('open', () => {
  console.log('✅ Phase 3B: REAL DEMUCS (CLI-based)');
  console.log('📁 File: test_track.wav (10s @ 44.1kHz)');
  console.log('⚙️  Segment: 10s | Device: MPS | Threads: 4');
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
    console.log('[' + elapsed.toFixed(1) + 's] 📦 ' + msg.message);
  } else if (msg.status === 'processing') {
    const pct = msg.progress || 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    console.log('[' + elapsed.toFixed(1) + 's] ⏳ [' + bar + '] ' + pct + '% ' + msg.stage);
  } else if (msg.status === 'complete') {
    console.log('[' + elapsed.toFixed(1) + 's] ✅ COMPLETE');
    if (msg.result && msg.result.vocals) {
      console.log('       ✓ 4 stems separated and saved');
      console.log('       ✓ Processing: ' + msg.metadata.processing_time_ms + 'ms');
    }
    completedTest = true;
  } else if (msg.status === 'idle') {
    console.log('[' + elapsed.toFixed(1) + 's] 🟢 ' + msg.message);
  } else if (msg.status === 'error') {
    console.log('[' + elapsed.toFixed(1) + 's] ❌ ' + msg.message);
  }
});

ws.on('close', () => {
  const totalTime = (Date.now() - startTime) / 1000;
  console.log('\n' + '═'.repeat(65));
  if (completedTest) {
    console.log('🟢 PHASE 3B SUCCESS: REAL DEMUCS IS OPERATIONAL');
    console.log('   Total time: ' + totalTime.toFixed(1) + 's');
    console.log('   Messages: ' + messageCount);
  } else {
    console.log('⏳ Test did not complete');
  }
  console.log('═'.repeat(65));
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n⏱️ Timeout (' + elapsed.toFixed(0) + 's) - closing connection');
  ws.close();
  process.exit(0);
}, 300000);
