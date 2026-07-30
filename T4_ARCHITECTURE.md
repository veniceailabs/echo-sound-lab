# T4: Desktop + Plugin Ecosystem Architecture

## Vision
Move Echo Sound Lab from **web-only** → **native powerhouse** with full system access:
- **Electron Standalone App** (Windows/Mac/Linux) - Full mastering suite
- **VST3 & AU Plugins** (Pro DAW integration) - Real-time in-DAW mastering
- **WebAudio Real-Time** (Browser) - Low-latency streaming version
- **GPU Acceleration** (CUDA/Metal) - 10x faster processing
- **AI Model Acceleration** - TensorRT for inference

---

## 1. THREE-TIER ARCHITECTURE

### **Tier 1A: Electron Standalone App**
**The flagship desktop application**

```
echo-sound-lab-desktop/
├── main/ (Electron main process)
│   ├── ipc-handlers.ts          # Audio processing bridge
│   ├── audio-engine.ts          # Native audio I/O
│   ├── gpu-manager.ts           # CUDA/Metal detection
│   └── window-manager.ts        # Multi-window support
├── src/ (React frontend - reuse web codebase)
│   ├── App.tsx
│   ├── components/
│   └── hooks/
├── native/ (C++/Rust backends)
│   ├── audio-processing/
│   │   ├── mastering-chain.cpp  # Real-time DSP
│   │   ├── eq-processor.cpp
│   │   ├── compressor.cpp
│   │   ├── limiter.cpp
│   │   └── saturation.cpp
│   ├── ai-inference/
│   │   ├── onnx-runtime.cpp    # Model loading (100MB models, not cloud)
│   │   └── tensor-ops.cpp       # Matrix math
│   └── gpu/
│       ├── cuda-kernels.cu      # NVIDIA acceleration
│       ├── metal-shaders.metal  # Apple Silicon
│       └── gpu-buffer.cpp
└── build/ (Native module compilation)
    ├── CMakeLists.txt
    ├── binding.gyp              # Node.js native addon
    └── prebuild/                # Pre-built binaries per platform
```

**Key capabilities:**
- **Low-latency**: <5ms processing (vs. ~100ms WebAudio)
- **Full CPU threads**: Use all cores for batch processing
- **GPU compute**: 10-100x speedup on EQ/compression curves
- **Local models**: 100-500MB AI models stored locally (offline capable)
- **System audio**: Direct line-in from interface, DAW integration

**Technology Stack:**
- **Frontend**: React (share with web)
- **IPC**: Electron IPC channels (main ↔ renderer)
- **Audio I/O**: PortAudio or RtAudio (portable)
- **DSP**: JUCE framework (industry standard)
- **AI**: ONNX Runtime (CPU/GPU inference)
- **Build**: electron-builder + CMake

**Launch Timeline**: 12-16 weeks

---

### **Tier 1B: VST3 & AU Plugins**
**In-DAW mastering for Pro Tools, Ableton, Logic, Cubase, Reaper**

```
echo-sound-lab-plugin/
├── src/
│   ├── processor.cpp            # IPlug2 or JUCE plugin processor
│   ├── editor.cpp               # GUI (web-based via JUCE WebView)
│   ├── state-sync.cpp           # Session recall, Undo/Redo
│   └── automation.cpp           # Parameter automation curves
├── dsp/
│   ├── mastering-chain.cpp      # Shared with standalone
│   ├── latency-compensation.cpp # Critical for real-time
│   └── dither.cpp               # Pro-grade dithering
└── build/
    ├── Windows.cmake
    ├── macOS.cmake
    └── Linux.cmake
```

**Plugin specs:**
- **Format**: VST3 (Windows/Mac/Linux), AU (Mac only)
- **Latency**: <2ms (DSD-aware, 32-bit float)
- **Features**:
  - Full T1/T2/T3 algorithms as real-time effects
  - Undo/Redo in DAW
  - Parameter automation
  - Sidechain inputs (future: multi-band from other tracks)
  - CPU meter + GPU usage display
- **GUI**: Web-based (Chromium Embedded Framework or JUCE WebView)
  - Same UI as Electron app
  - Real-time parameter feedback
  - Waveform display during processing

**Technology Stack:**
- **Framework**: JUCE (Roli) or IPlug2 (WDL-OL)
- **GUI**: JUCE WebView (Chromium-based)
- **DSP**: Shared C++ core with Electron
- **Build**: CMake + MSVC/Clang/GCC

**Launch Timeline**: 8-12 weeks (after Electron foundation)

---

### **Tier 1C: WebAudio Real-Time (Browser)**
**Low-latency browser processing, no installation**

```
web/
├── src/
│   ├── audio-worklet/
│   │   ├── processor.ts         # Sub-50ms latency
│   │   ├── mastering-dsp.ts     # WASM or JS DSP
│   │   └── buffer-management.ts
│   ├── wasm/
│   │   └── mastering-core.wasm  # Compiled C++ → WASM
│   └── components/
│       └── RealtimeVisualizer.tsx # Live input waveform
└── public/
    └── audio-worklet.js          # AudioWorkletProcessor
```

**Tech:**
- **Audio Worklet**: AudioWorkletProcessor for sub-50ms latency
- **WASM**: Compile C++ DSP to WebAssembly (share with plugins)
- **Buffer strategy**: Ring buffers, lock-free queues
- **Performance**: Real-time scheduling, no GC pauses

**Launch Timeline**: 4-6 weeks (runs in parallel)

---

## 2. GPU ACCELERATION STRATEGY

### **What gets GPU'd:**
1. **EQ Curve Calculation** (Biquad filter chain)
   - CUDA: 1000x parallel biquads
   - Metal: GPU shader for filter coefficients
2. **Spectrogram** (FFT analysis)
   - cuFFT or Metal Accelerate framework
   - Real-time 24-band analysis
3. **Compressor envelope** (Look-ahead detection)
   - Parallel peak detection across channels
4. **Saturation** (Non-linear curves)
   - LUT (lookup table) pre-computation on GPU

### **GPU Flow:**
```
Upload buffer → GPU memory
GPU kernel runs (EQ chain)
GPU outputs → Download to CPU
CPU handles I/O + UI updates
```

**Performance targets:**
- EQ: 10MB/s → GPU: 1GB/s (100x speedup)
- Compression: Real-time at any sample rate (even 192kHz on weak machines)
- Batch: 10 tracks in parallel on high-end GPUs

---

## 3. SHARED C++ CORE (DRY Principle)

All three apps (Electron, VST, Web) share same DSP:

```
shared/
├── mastering-engine/
│   ├── lufs-meter.cpp          # Loudness measurement
│   ├── dynamic-eq.cpp          # Multiband EQ
│   ├── compressor.cpp          # Multiband compression
│   ├── limiter.cpp             # True peak limiter
│   ├── saturation.cpp          # Harmonic saturation
│   └── dither.cpp              # Noise shaping
├── ai-models/
│   ├── reference-encoder.cpp   # Embed reference tracks
│   ├── learning-profile.cpp    # User preference model
│   └── genre-detector.cpp      # Automatic genre classification
└── utils/
    ├── audio-math.cpp
    ├── buffer-pool.cpp
    └── simd-ops.cpp            # SSE4.2, AVX2, AVX-512
```

**Build target**: Compile to:
1. **C++ library** (`libecho-sound-lab.a`)
2. **WASM** (for browser)
3. **Node native addon** (for Electron IPC)

---

## 4. AUDIO I/O & LATENCY

### **Standalone (Electron):**
- Real-time I/O via PortAudio
- Hardware buffer: 64-256 samples @ 48kHz = 1.3-5.3ms
- Plugin delay compensation: Automatic
- CPU load meter: Display % used

### **Plugin (VST/AU):**
- Host-controlled buffer size (64-2048)
- Latency report to DAW (critical for automation)
- Offline rendering: GPU-accelerated batch mastering

### **Browser (WebAudio):**
- AudioWorklet (40-100ms inherent browser latency)
- Real-time visualization of input waveform
- Not for tracking (offline mastering only in browser)

---

## 5. BUILD & DISTRIBUTION PIPELINE

### **Electron Standalone:**
```
npm run build:electron
├── electron-builder (creates DMG/NSIS installers)
├── Code signing (Apple + Windows cert)
├── Auto-updater (Squirrel.Windows, Sparkle on Mac)
└── Distribution: GitHub Releases, direct download
```

**Release channels:**
- **Stable**: Monthly releases
- **Beta**: Weekly builds for testing
- **Dev**: Daily/weekly snapshots

### **VST/AU Plugins:**
```
npm run build:plugin
├── CMake build for each OS/arch
├── Code signing + notarization
├── Distribution: Plugin stores (KVR, Splice, Gumroad)
└── Version sync with Electron
```

### **Web:**
```
npm run build:web
├── Current Vercel pipeline
├── WASM compilation (emscripten)
└── Service Worker (offline capability)
```

---

## 6. PERFORMANCE BENCHMARKS

**Target numbers:**

| Operation | Browser | Electron | Plugin | GPU |
|-----------|---------|----------|--------|-----|
| Mastering 1 track (3min @ 44.1kHz) | 120s | 8s | Real-time | 0.5s |
| LUFS measurement | 2s | 0.1s | <1ms | - |
| Reference analysis | 20s | 1s | Real-time | 0.2s |
| AI profile inference | 5s | 0.2s | <10ms | 50ms |
| Batch 10 tracks | ∞ | 80s | N/A | 5s |
| Plugin load time | - | <50ms | <100ms | - |

---

## 7. FEATURE PARITY MATRIX

| Feature | Web | Standalone | Plugin |
|---------|-----|-----------|--------|
| T1-T3 algorithms | ✅ | ✅ | ✅ |
| Real-time processing | ⏳ AudioWorklet | ✅ Full latency | ✅ <2ms |
| GPU acceleration | ❌ | ✅ | ✅ |
| Batch mastering | ❌ | ✅ | ✅ |
| AI Learning Profile | ✅ | ✅ | ✅ |
| Reference matching | ✅ | ✅ | ✅ |
| Collaboration | ✅ | ✅ (file-based) | ✅ (project sync) |
| Offline mode | ⏳ | ✅ | ✅ |
| Cloud sync | ✅ | ✅ (Supabase) | ✅ (session recall) |

---

## 8. IMPLEMENTATION ROADMAP

### **Phase 1: Shared Core (Weeks 1-4)**
- Extract DSP to C++ shared library
- WASM compilation pipeline
- GPU kernel scaffold (CUDA + Metal stubs)

### **Phase 2: Electron Standalone (Weeks 5-12)**
- Electron app shell
- Native audio I/O (PortAudio)
- Shared core integration via Node addon
- GPU acceleration (CUDA first, Metal after)
- Desktop UI (React-based, same as web)

### **Phase 3: WebAudio + WASM (Weeks 4-8, parallel)**
- Audio Worklet processor
- WASM compilation & integration
- Real-time latency optimization

### **Phase 4: VST/AU Plugins (Weeks 13-20)**
- JUCE plugin wrapper
- GUI (WebView-based)
- DAW integration testing
- Code signing & distribution setup

### **Phase 5: GPU Acceleration (Weeks 12-18, parallel)**
- CUDA kernel implementation (EQ, compression)
- Metal shader equivalents (Mac)
- GPU buffer management
- Performance profiling

### **Phase 6: Polish & Distribution (Weeks 19-24)**
- Auto-updater setup
- Crash reporting
- Telemetry (opt-in)
- Plugin store submissions
- Documentation & marketing

---

## 9. TECHNOLOGY CHOICES

### **Why these stacks:**

| Component | Choice | Why |
|-----------|--------|-----|
| **Desktop framework** | Electron | Widest ecosystem, code reuse with web |
| **Plugin framework** | JUCE | Industry standard, robust |
| **Native language** | C++17 | Performance, GPU support, audio libs |
| **GPU compute** | CUDA + Metal | Widest coverage (NVIDIA + Apple) |
| **WASM compiler** | Emscripten | Mature, C++ → WASM |
| **Audio I/O** | PortAudio | Cross-platform, low-latency |
| **AI inference** | ONNX Runtime | Vendor-neutral, CPU + GPU |
| **Package manager** | CMake | Native build, Electron compatible |

---

## 10. RESOURCE REQUIREMENTS

### **Team:**
- **1 Audio Engineer** (C++, DSP, JUCE)
- **1 GPU Specialist** (CUDA, Metal, optimization)
- **1 Electron Dev** (Desktop app, native modules)
- **1 QA/Testing** (Multi-DAW testing, latency verification)

### **Infrastructure:**
- **CI/CD**: GitHub Actions (Windows/Mac/Linux builds)
- **Signing certs**: Apple + Windows (EV cert for installer)
- **GPU testing**: NVIDIA cloud (16+ CUDA cores for CI)
- **Storage**: S3 for releases (~2GB per month)

### **Timeline:** 16-24 weeks (full T4 stack)

---

## 11. SUCCESS METRICS

| Metric | Target |
|--------|--------|
| Plugin downloads (first month) | 500+ |
| Standalone downloads (first month) | 1000+ |
| Plugin CPU usage (at 44.1kHz) | <5% per instance |
| Real-time latency | <2ms (plugin), <5ms (standalone) |
| Crash rate | <0.1% |
| User satisfaction (plugin stores) | 4.5+/5 stars |

---

## 12. COMPETITIVE ADVANTAGE

After T4 ships, Echo Sound Lab will offer:

| vs. LANDR | vs. Waves | vs. iZotope | vs. Splice |
|-----------|-----------|------------|-----------|
| ✅ Offline mastering | ✅ Professional plugin | ✅ Award-winning DSP | ✅ DAW integration |
| ✅ Learns your style | ✅ Low CPU overhead | ✅ Customizable chain | ✅ Integration with samples |
| ✅ Reference matching | ❌ No learning | ❌ No reference matching | ❌ No standalone |
| ✅ Collaboration built-in | ❌ Solo tool | ❌ No collaboration | ❌ Limited collab |
| **🏆 Web + Desktop + Plugin unified** | **Offline + GPU acceleration** | **Learning profile across all 3** | **Unique ecosystem** |

---

## NEXT STEPS

**To start T4:**

1. **Create C++ shared library** from existing T1-T3 algorithms
2. **Set up Electron skeleton** with React reuse
3. **Profile current DSP** to identify GPU targets
4. **Begin JUCE plugin framework** in parallel
5. **GPU kernel prototyping** (start with EQ)

**Decision point**: Proceed with T4 or ship T1-T3 to market first and gather feedback?

