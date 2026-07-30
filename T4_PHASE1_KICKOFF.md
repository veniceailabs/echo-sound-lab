# T4 Phase 1: Shared C++ Core + Build Pipeline
## 4-Week Sprint to Foundation

---

## GOAL
Extract T1-T3 algorithms into a **standalone C++ library** that can be:
1. Compiled to **Node.js native addon** (Electron)
2. Compiled to **WASM** (browser)
3. Linked into **VST/AU plugins**
4. Accelerated with **CUDA/Metal** (future)

---

## PHASE 1 DELIVERABLES

### **Week 1: Architecture & Scaffolding**

#### Day 1-2: Create C++ project structure
```bash
echo-sound-lab-core/
├── CMakeLists.txt
├── include/
│   └── echo/
│       ├── mastering-engine.h    # Main API
│       ├── dsp/
│       │   ├── eq.h              # 10-band parametric
│       │   ├── compressor.h      # Multiband (4 bands)
│       │   ├── limiter.h         # True peak
│       │   ├── saturation.h      # Harmonic saturation
│       │   └── metering.h        # LUFS, loudness range, peak
│       ├── ai/
│       │   ├── reference-analyzer.h   # Extract characteristics
│       │   ├── learning-profile.h     # Store user preferences
│       │   └── genre-classifier.h     # Detect genre
│       └── utils/
│           ├── circular-buffer.h
│           ├── simd-math.h       # SSE/AVX
│           └── dither.h
├── src/
│   ├── mastering-engine.cpp      # Main processing loop
│   ├── dsp/
│   │   ├── eq.cpp
│   │   ├── compressor.cpp
│   │   ├── limiter.cpp
│   │   ├── saturation.cpp
│   │   └── metering.cpp
│   ├── ai/
│   │   ├── reference-analyzer.cpp
│   │   └── learning-profile.cpp
│   └── utils/
│       └── simd-math.cpp
├── build/
│   ├── binding.gyp                # Node.js native addon
│   ├── CMakeLists.txt
│   └── emscripten-build.sh        # WASM compilation
├── tests/
│   ├── test-eq.cpp
│   ├── test-compressor.cpp
│   └── test-metering.cpp
└── benchmark/
    ├── perf-eq.cpp                # CPU profiling
    ├── perf-compression.cpp
    └── latency-test.cpp           # Real-time safety
```

#### Day 3-5: Port T1-T3 algorithms to C++
**Source of truth**: Existing processing logic (likely in audio engine)

Core algorithms to port:
1. **LUFS Metering** (EBU R128 standard)
   - Integrate into C++ `metering.cpp`
   - Test accuracy vs. current implementation
2. **EQ** (Parametric, 10-band)
   - Biquad filter implementation
   - Fast coefficient calculation
3. **Multiband Compressor** (4 bands)
   - Crossover network
   - Per-band envelope follower
4. **Limiter** (True Peak limiting)
   - Look-ahead buffer
   - Fast attack (<1ms)
5. **Saturation** (Soft clipping)
   - Sigmoid approximation
   - Tone shaping

### **Week 2: Native Module Integration**

#### Day 1-2: Node.js native addon binding
```cpp
// src/node-binding.cpp
#include <napi.h>
#include "echo/mastering-engine.h"

class MasteringEngineWrapper : public Napi::ObjectWrap<MasteringEngineWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  MasteringEngineWrapper(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;
  
  // Async processing
  Napi::Value ProcessAsync(const Napi::CallbackInfo& info);
  
  // Settings
  Napi::Value SetLUFSTarget(const Napi::CallbackInfo& info);
  Napi::Value SetCompressionRatio(const Napi::CallbackInfo& info);
  
  EchoSoundLab::MasteringEngine engine_;
};
```

#### Day 3-5: Electron integration
```typescript
// electron/main/audio-engine.ts
import binding from '../native/echo-sound-lab.node';

const engine = new binding.MasteringEngine();

ipcMain.handle('audio:process', async (event, audioBuffer: Float32Array) => {
  const result = await engine.processAsync(audioBuffer);
  return result; // SharedArrayBuffer for efficiency
});
```

### **Week 3: WASM Compilation**

#### Day 1-2: Emscripten configuration
```bash
# build/emscripten-build.sh
emconfigure cmake -DWASM=ON -DCMAKE_BUILD_TYPE=Release ..
emmake make -j8
# Output: libecho-sound-lab.js + .wasm
```

#### Day 3-5: WebAssembly module integration
```typescript
// src/wasm/mastering.ts
import init, { MasteringEngine } from './mastering_wasm.js';

await init();
const engine = MasteringEngine.new();

// AudioWorklet processor
registerProcessor('mastering-processor', class extends AudioWorkletProcessor {
  engine = new MasteringEngine();
  
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0][0];
    const output = this.engine.process(input);
    outputs[0][0].set(output);
    return true;
  }
});
```

### **Week 4: Testing & Benchmarking**

#### Day 1-3: Correctness testing
```cpp
// tests/test-metering.cpp
TEST(Metering, LUFSAccuracy) {
  const auto input = GenerateTestSignal(1000); // 1kHz sine
  const auto lufs = engine.MeasureLUFS(input);
  EXPECT_NEAR(lufs, -23.0f, 0.1f); // Within 0.1 dB
}

TEST(Compressor, Ratio4to1) {
  engine.SetCompressionRatio(4.0f);
  const auto output = engine.Compress(input);
  EXPECT_EQ(output.DynamicRange(), expectedRange);
}
```

#### Day 4-5: Performance profiling
```cpp
// benchmark/perf-compression.cpp
BENCHMARK(CompressorMultiband) {
  const auto input = GenerateAudio(10_seconds);
  const auto start = std::chrono::high_resolution_clock::now();
  engine.Compress(input);
  const auto end = std::chrono::high_resolution_clock::now();
  // Target: Process 10s audio in <100ms (100x real-time)
}
```

---

## BUILD COMMANDS (End of Phase 1)

```bash
# Build Node.js native addon
npm run build:native              # Output: echo-sound-lab.node

# Build WASM module
npm run build:wasm                # Output: mastering_wasm.js/.wasm

# Run tests
npm test                          # C++ unit tests via GTest

# Benchmark
npm run benchmark                 # Performance profiling
```

---

## PHASE 1 SUCCESS CRITERIA

✅ All T1-T3 algorithms ported to C++ with <5% numerical variance
✅ Node.js addon compiles & passes tests (Windows/Mac/Linux)
✅ WASM module compiles & loads in browser
✅ Processing latency: <5ms for 1-second buffer (Node), <50ms (WASM)
✅ CPU profiling: Identify EQ/compression as GPU targets
✅ Documentation: API reference for plugin developers

---

## DEPENDENCIES TO ADD

```json
{
  "devDependencies": {
    "cmake-js": "^7.1",
    "node-gyp": "^9.0",
    "emcripten": "^3.1",
    "gtest": "^1.14",
    "benchmark": "^0.2"
  }
}
```

---

## PHASE 2 TRIGGERS (Weeks 5-12)

Once Phase 1 ships:
1. **Electron app** starts using `echo-sound-lab.node`
2. **Web app** switches to `mastering_wasm.js`
3. **VST/AU plugins** link `libecho-sound-lab.a` as static lib

All three share **identical algorithms**. No algorithm divergence.

---

## RESOURCE ALLOCATION

**1 person (C++ audio engineer)**, 4 weeks full-time:
- Week 1: 40% porting, 60% scaffolding
- Week 2: 50% node binding, 50% testing
- Week 3: 80% WASM, 20% debugging
- Week 4: 40% testing/bench, 60% optimization

**Parallel track** (React dev):
- Start Electron app shell (window manager, IPC handlers)
- Prepare VST/AU JUCE boilerplate

---

## SUCCESS LOOKS LIKE

At end of Phase 1, you can do:

```javascript
// In Electron
const { MasteringEngine } = require('./native/echo-sound-lab.node');
const engine = new MasteringEngine();
const mastered = engine.process(audioBuffer);  // <5ms latency

// In browser
import { MasteringEngine } from './wasm/mastering_wasm.js';
const engine = MasteringEngine.new();
const mastered = engine.process(audioBuffer);  // <50ms latency
```

**Same algorithm, two worlds. Next: Build three products around it.**
