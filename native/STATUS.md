# Native audio core — status

Date: 2026-07-29

`Echo Sound Lab v2.5/native/` — C++17 capture + mastering engine, exposed to
Node via N-API. Consolidated here from the former `ESL_Archive/echo-sound-lab-core`.

Before this pass the code had **never been compiled**. It now builds, captures
real audio, masters it, and is verified against an independent reference.

## Build & test

```
cd native
npm install
npm run build
npm test          # 43 assertions across 4 suites
```

Requires node-gyp >= 11 (node-gyp 9 breaks on Python 3.12+) and
`brew install portaudio`.

## Use

```
# master a file
node master.js in.wav [out.wav] [--lufs -14] [--ceiling -0.3] [--sat 0.2] [--bits 24|16]

# record from hardware
node -e "const {Recorder}=require('./build/Release/echo-sound-lab.node');
         console.log(Recorder.listDevices())"
```

`Recorder`: `listDevices()`, `start({path, device, channels, sampleRate,
framesPerBuffer})`, `getStatus()` (live peak meters + overrun count), `stop()`.

## Verified behaviour

Cross-checked against **ffmpeg's ebur128** (mature BS.1770 implementation):

| Target | ESL | ffmpeg | Δ |
|--------|-----|--------|---|
| -16 LUFS | -16.00 | -16.00 | 0.00 LU |
| -14 LUFS | -14.00 | -14.00 | 0.00 LU |
| -11 LUFS | -11.00 | -11.00 | 0.00 LU |

- True peak agrees with ffmpeg within 0.03–0.7 dB; ceiling holds at -0.30 dBTP.
- Stereo image shift under linked limiting: **0.000 dB**.
- Crossover: no notch at any band edge (worst deviation 3.35 dB vs median).
- Throughput: 18–42x realtime.
- Live capture: 0 overruns, 36 ms input latency on the built-in mic.

## Defects found and fixed

All latent because the code had never been built or run.

1. `mastering-engine.h` — duplicate parameter name; compile error.
2. All headers — `size_t` without `<cstddef>`; compile error.
3. **`eq.cpp` — unstable biquad (fatal).** Wrong topology (fed back only past
   outputs) and normalised by `a2 + 1` instead of a per-type `a0`. Ten in
   series diverged to NaN. Replaced with RBJ coefficients + transposed DF-II.
4. **`compressor.cpp` — the "multiband" compressor was not multiband.**
   `crossover_states_` was declared, initialised, and never used; all four
   compressors ran on the full-band signal in series. Replaced with a real
   Linkwitz-Riley 4th-order crossover tree.
5. `metering.cpp` — K-weighting was one stage; BS.1770 needs shelf + RLB
   high-pass. Added stage 2.
6. `metering.cpp` — coefficients hardcoded for 48kHz. Now derived per sample
   rate, so 44.1kHz is accurate (confirmed against ffmpeg).
7. `metering.cpp` — O(n²) sliding windows (`erase(begin())` per sample).
   Replaced with ring buffers + incremental sums. 2x → 60x realtime.
8. `metering.cpp` — integrated LUFS was ungated. Added -70 absolute and
   -10 relative gating over 400ms blocks.
9. `metering.cpp` — "true peak" was sample peak. Added 4x polyphase
   windowed-sinc oversampling for real inter-sample detection.
10. **`limiter.cpp` — envelope initialised to -100 dB.** It tracks gain
    *reduction*, so this muted everything until it released.
11. **`limiter.cpp` — lookahead did nothing.** Detected ahead but applied gain
    to the undelayed sample. Now emits the delayed sample.
12. `saturation.cpp` — `FastTanh` dropped the sign for |x| < 0.5.
13. **`mastering-engine.cpp` — makeup gain applied after the limiter.** Output
    reached +9 dBFS. Moved before, and the required gain is now solved
    iteratively on scratch buffers (limiting removes loudness, so open-loop
    undershoots) with one committed limiter pass.
14. **Stereo was processed as two independent mono channels.** That
    under-reports loudness by ~3 LU (BS.1770 sums channel power) and lets the
    channels drift apart. Added a linked stereo path: summed loudness, one
    shared gain, stereo-linked compression and limiting.
15. `portaudio-binding.cpp` was excluded from the build and, on inspection,
    allocated inside the audio callback and had incorrect interleaved-buffer
    math. Replaced with `src/audio-io/recorder.cpp`.

## Architecture note: the recorder

The audio callback is hard real-time — it must not allocate, lock, throw, or
do I/O. It therefore only copies into a lock-free SPSC ring buffer; a separate
writer thread drains that to disk. Overruns are counted, never blocked on.
Capture is 32-bit float (no quantisation before mixing; dither belongs at
delivery only).

## Remaining limitations

- Capture is **single-device**. Multi-interface aggregate capture untested.
- No plugin delay compensation in any host graph.
- `ai/reference-analyzer.cpp` and `ai/learning-profile.cpp` compile but are
  **not audited or tested**. Given the defect rate above, assume bugs.
- Mono `ProcessBlock` still measures loudness as mono; correct for single
  channels, but do not use it for stereo — use `processStereo`.
- No AU/VST hosting, time-stretch, or automation lanes (see main assessment).
