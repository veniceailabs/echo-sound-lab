# Echo Sound Lab Core — Shared C++ Audio Engine

Status: pre-market backend core. This repository contains the DSP and validation engine, not a public launch claim.

For the market-readiness plan and current blockers, see:

- `docs/ESL_MARKET_READINESS_PLAN.md`
- `engine/release_readiness.py`

A unified C++ audio processing library that compiles to three targets:
- **Node.js native addon** (for Electron desktop app)
- **WebAssembly** (for browser Audio Worklet)
- **VST3/AU library** (for DAW plugin integration)

---

## Architecture

### Core DSP Modules

**`dsp/metering.h`** — LUFS loudness measurement (EBU R128 standard)
- Momentary, short-term, and integrated loudness calculation
- Loudness range (LU) measurement
- True peak detection
- K-weighting filter implementation

**`dsp/eq.h`** — 10-band parametric EQ
- Biquad filter implementation
- Peak, low-shelf, high-shelf filter types
- Real-time coefficient calculation
- Frequency response analysis

**`dsp/compressor.h`** — 4-band multiband compressor
- Frequency-aware dynamic processing
- Butterworth crossover network
- Per-band envelope follower
- Configurable attack/release times
- Makeup gain compensation

**`dsp/limiter.h`** — True peak limiter
- Look-ahead detection (5-10ms)
- Fast attack (<1ms)
- Prevents digital clipping
- Smooth gain reduction envelope

**`dsp/saturation.h`** — Harmonic saturation
- Tanh, sigmoid, and soft-clip curves
- Drive control
- Tone shaping for warmth

### AI Modules

**`ai/reference-analyzer.h`** — Reference track analysis
- Extracts LUFS, loudness range, true peak
- Spectral balance analysis (bass/mid/treble/air)
- Compression and saturation estimation
- Generates suggested EQ/compression to match reference

**`ai/learning-profile.h`** — User preference learning
- Tracks mastering tags over time (warm/bright/aggressive/dynamic)
- Learns preferred LUFS target
- Calculates profile strength (weak/learning/strong)
- JSON serialization for persistence

### Main Engine

**`mastering-engine.h`** — Orchestrates the complete chain
- EQ → Compression → Saturation → Limiter → Metering
- Automatic makeup gain calculation
- State management and reset
- Metrics reporting

---

## Building

### Prerequisites

- C++17 compiler (GCC 7+, Clang 6+, MSVC 2017+)
- Python 3.6+ (for build system)
- Node.js 14+ (for npm dependencies)

### Option 1: Node.js Native Addon

```bash
npm install
npm run build
```

Output: `build/Release/echo-sound-lab.node`

### Option 2: WebAssembly

```bash
# Install Emscripten first: https://emscripten.org/docs/getting_started/downloads.html
npm run build:wasm
```

Output: `build/wasm/libecho-sound-lab.js` and `.wasm`

### Option 3: CMake (for VST/AU plugins)

```bash
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)
```

Output: `build/libecho-sound-lab-static.a`

---

## Usage

### Node.js (Electron)

```typescript
import { MasteringEngine } from '../native/echo-sound-lab.node';

const engine = new MasteringEngine(48000);  // 48kHz sample rate

// Configure
engine.setLUFSTarget(-14);  // Streaming loudness
engine.setSaturation(0.3, 1.2);  // 30% saturation, 1.2x drive

// Process audio buffer
const audioBuffer = new Float32Array(48000);  // 1 second @ 48kHz
const output = engine.process(audioBuffer, 1);  // 1 channel

// Get metrics
const metrics = engine.getMetrics();
console.log(`LUFS: ${metrics.integrated_lufs}`);
console.log(`True Peak: ${metrics.true_peak_dbfs} dBFS`);
```

### Browser (WebAssembly)

```typescript
import init, { MasteringEngine } from './mastering_wasm.js';

await init();
const engine = MasteringEngine.new(48000);

const audioBuffer = new Float32Array(48000);
const output = engine.process(audioBuffer);
```

### VST/AU Plugin

Link `libecho-sound-lab-static.a` into your JUCE/IPlug2 plugin:

```cpp
#include "echo/mastering-engine.h"

class MasteringPlugin : public juce::AudioProcessor {
  std::unique_ptr<EchoSoundLab::MasteringEngine> engine_;

  void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
    auto output = engine_->ProcessBlock(buffer.getReadPointer(0), 
                                        buffer.getNumSamples(), 
                                        buffer.getNumChannels());
  }
};
```

---

## Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- LUFS accuracy vs. industry standards
- EQ frequency response
- Compressor dynamic range
- Limiter true peak protection
- Saturation curves
- AI module outputs

---

## Performance

Target metrics (on 2.5GHz CPU, single thread):

| Operation | Latency | Throughput |
|-----------|---------|-----------|
| Mastering 1s @ 48kHz | <5ms | 10MB/s |
| LUFS measurement | <1ms | 48MB/s |
| EQ processing | <0.5ms | 96MB/s |
| Compression | <2ms | 24MB/s |

GPU acceleration available for:
- EQ curve calculation (CUDA/Metal)
- Spectral analysis (cuFFT)
- Batch processing (10+ tracks parallel)

---

## Platform-Specific Notes

### macOS
- Native Apple Silicon support (Metal acceleration)
- Code signing for Electron/plugin distribution
- Framework linking for JUCE plugins

### Windows
- MSVC 2017+ or Clang
- AVX2 SIMD optimization enabled
- Installer generation via electron-builder

### Linux
- GCC 9+ or Clang 10+
- No native GPU acceleration (WASM/Vulkan future option)
- Plugin distribution via plugin stores

---

## Future Enhancements

- **Phase 2**: GPU acceleration (CUDA/Metal/Vulkan)
- **Phase 3**: TensorRT integration for AI model inference
- **Phase 4**: Real-time audio I/O (PortAudio integration)
- **Phase 5**: Advanced metering (LUFS history, spectrum animation)

---

## License

MIT — See LICENSE file for details

---

## Contributing

See CONTRIBUTING.md for development guidelines and pull request process.
