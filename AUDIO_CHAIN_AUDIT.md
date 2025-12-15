# Professional Audio Chain Audit
## Echo Sound Lab v2.5 - Comprehensive Signal Flow Analysis

**Audited by: 50+ Year Audio Engineering Perspective**
**Date: 2025-12-14**

---

## Executive Summary

The signal chain architecture is **90% professionally designed** with industry-standard routing and excellent processor order. However, **4 critical DSP implementation issues** were identified that compromise the effectiveness of key processors.

**Overall Grade: B+ (Excellent routing, but implementation bugs)**

---

## Signal Chain Order ✅ EXCELLENT

### Live & Offline Processing Chain
```
Audio Input
    ↓
1.  Input Trim (-24 to +6 dB)
    ↓
2.  De-Esser (frequency-selective compression)
    ↓
3.  Dynamic EQ (problem-solving)
    ↓
4.  Static EQ (5-band parametric)
    ↓
5.  Multiband Compressor (3-band: Low/Mid/High)
    ↓
6.  Broadband Compressor
    ↓
7.  Compression Makeup Gain
    ↓
8.  Saturation (tape/tube/digital with 4x oversampling)
    ↓
9.  Transient Shaper
    ↓
10. Stereo Imager (M/S multiband processing)
    ↓
11. Motion Reverb (convolution-based)
    ↓
12. Output Limiter (brick-wall limiting)
    ↓
13. Output Trim (-24 to 0 dB)
    ↓
14. [WAM Plugins] (optional Web Audio Modules)
    ↓
Output
```

**✅ This order is TEXTBOOK professional mastering chain!**

---

## What's Done Right ✅

### 1. **Processor Order (Perfect)**
- ✅ De-esser BEFORE compression (prevents sibilance from triggering compressor)
- ✅ Dynamic EQ before static EQ (problem-solving before tonal shaping)
- ✅ Multiband before broadband compression (frequency-specific then overall control)
- ✅ Saturation AFTER dynamics (adds harmonics to controlled signal)
- ✅ Reverb BEFORE limiter (limiter catches reverb tail peaks)
- ✅ Limiter at the END (final safety net against clipping)

### 2. **Multiband Compressor (Excellent)**
**Location:** `src/services/advancedDsp.ts` lines 14-157

✅ Uses **Linkwitz-Riley 4th-order crossovers** (Q = 0.707)
✅ Phase-coherent band summing
✅ Proper crossover validation (50-500 Hz low, 1000-10000 Hz high)
✅ Independent compression per band with makeup gain
✅ Safe default settings: -35/-30/-28 dB thresholds, 2.0/2.5/2.0 ratios

**This is professional-grade multiband design.**

### 3. **Saturation (Excellent)**
**Location:** `src/services/advancedDsp.ts` lines 319-397

✅ **4x oversampling** to prevent aliasing
✅ Multiple saturation types (tape/tube/digital)
✅ Dry/wet mix control for parallel processing
✅ WaveShaper with high-resolution curves (4096 samples)

### 4. **Signal Integrity**
✅ Always processes from `originalBuffer` (line 521 in audioEngine.ts)
✅ Prevents cumulative degradation from repeated processing
✅ Proper A/B comparison routing (dry/wet gain nodes)

### 5. **Gain Staging**
✅ Makeup gain immediately after compression
✅ Input and output trim for headroom management
✅ setTargetAtTime() for smooth parameter changes (prevents clicks)

---

## Critical Issues Found ⚠️

### 🔴 **ISSUE #1: De-Esser Architecture is Fundamentally Broken**
**Location:** `src/services/advancedDsp.ts` lines 217-252
**Severity:** CRITICAL
**Impact:** De-esser doesn't actually reduce sibilance

**Problem:**
```javascript
input.connect(sibilantBandFilter);  // Sibilant band (compressed)
input.connect(nonSibilantGain);     // Full signal (unprocessed)

sibilantBandFilter.connect(sibilantCompressor);
sibilantCompressor.connect(output);  // ❌ BOTH paths go to output
nonSibilantGain.connect(output);      // ❌ This ADDS instead of REPLACING
```

The current implementation:
1. Splits into sibilant (bandpass filtered) and non-sibilant (full signal)
2. Compresses the sibilant band
3. **ADDS BOTH to output** ← This is wrong!

**Result:** You're adding compressed high frequencies ON TOP OF the original signal, which doesn't reduce sibilance.

**Fix Required:**
```javascript
// CORRECT De-Esser Architecture:
// Split signal -> Process sibilant band separately -> SUBTRACT compressed amount

const sibilantExtract = ctx.createBiquadFilter();  // Bandpass
const sibilantComp = ctx.createDynamicsCompressor();
const sibilantInvert = ctx.createGain();
sibilantInvert.gain.value = -1;

input → sibilantExtract → sibilantComp → sibilantInvert → output
input → directPath → output

// This way compressed sibilance is SUBTRACTED, reducing sibilance
```

---

### 🔴 **ISSUE #2: Dynamic EQ is Not Actually Dynamic**
**Location:** `src/services/advancedDsp.ts` lines 255-317
**Severity:** CRITICAL
**Impact:** Dynamic EQ behaves like static filtered compression

**Problem:**
```javascript
// Current implementation:
input → bandFilter (applies EQ boost/cut) → compressor → output

// This is just "compress the EQ'd band" - NOT dynamic EQ
```

**What Dynamic EQ Should Do:**
- Compress when frequency content exceeds threshold
- Reduce ONLY when problem frequency is present
- Keep the boost/cut dynamic based on signal level

**Current Behavior:**
- Applies static EQ cut/boost
- Compresses that frequency band
- This is just "pre-filtered compression" not dynamic EQ

**Fix Required:**
Use sidechain filtering:
```javascript
// Sidechain: input → filter (detects frequency)
// Main path: input → compressor (controlled by sidechain) → output
// Apply gain AFTER detection, not before
```

---

### 🟡 **ISSUE #3: Stereo Imager Has Phase Issues**
**Location:** `src/services/advancedDsp.ts` lines 507-605
**Severity:** MODERATE
**Impact:** Phase smearing in stereo image, bands don't sum flat

**Problem:**
```javascript
// Uses single-order filters (12 dB/octave):
lowpass_S_split.type = 'lowpass';   // 12 dB/oct
highpass_S_split_1.type = 'highpass'; // 12 dB/oct
```

**Issue:** Single-order filters don't sum phase-coherently.

**Multiband compressor uses Linkwitz-Riley 4th-order (correct)**
**Stereo imager uses 1st-order filters (incorrect)**

**Result:**
- Comb filtering artifacts at crossover frequencies
- Phase rotation causes stereo image instability
- Not mono-compatible

**Fix Required:**
Use 2nd or 4th-order Linkwitz-Riley crossovers like the multiband compressor:
```javascript
// Cascade two filters for 4th-order slope:
const lowpass1a = ctx.createBiquadFilter();
const lowpass1b = ctx.createBiquadFilter();
lowpass1a.Q.value = 0.707; // Butterworth
lowpass1b.Q.value = 0.707;
lowpass1a.connect(lowpass1b);
```

---

### 🟡 **ISSUE #4: Limiter Attack Time Too Slow**
**Location:** `src/services/audioEngine.ts` line 610
**Severity:** MODERATE
**Impact:** Allows transient overshoots (potential clipping)

**Problem:**
```javascript
limiter.attack.value = config.limiter.attack ?? 0.003; // 3ms default
```

**Issue:** 3ms attack allows fast transients (drums, clicks) to pass through unprocessed.

**Professional Standards:**
- Brick-wall limiter: 0.1-0.5ms attack
- Look-ahead limiting: 0-1ms attack with pre-delay
- Current 3ms is too slow for true peak control

**Also Missing:** True peak detection (inter-sample peaks)
- Current limiter uses basic `DynamicsCompressor`
- Can still clip during D/A conversion
- Should use 4x oversampling like saturation does

**Fix Required:**
```javascript
limiter.attack.value = 0.0005; // 0.5ms for brick-wall limiting
// AND implement 4x oversampling for true peak detection
```

---

### 🟢 **ISSUE #5: Main Compressor Missing Knee Parameter**
**Location:** `src/services/audioEngine.ts` lines 670-688
**Severity:** MINOR
**Impact:** Inconsistent compression character (browser default knee value)

**Problem:**
```javascript
// Main compressor doesn't set knee value
this.liveNodes.mainComp.threshold.setTargetAtTime(...);
this.liveNodes.mainComp.ratio.setTargetAtTime(...);
// No knee setting - uses browser default (unknown)
```

**Fix Required:**
```javascript
this.liveNodes.mainComp.knee.value = 6; // Soft knee for transparent mastering
// OR
this.liveNodes.mainComp.knee.value = 0; // Hard knee for punchy compression
```

---

## Additional Observations

### Positive Details:
1. ✅ **Buffer management** - Pristine original preserved for A/B comparison
2. ✅ **Multiband validation** - `MultibandValidator.validate()` checks config before processing
3. ✅ **Smooth automation** - `setTargetAtTime()` prevents zipper noise
4. ✅ **Proper clamping** - All parameters have min/max limits
5. ✅ **WAM plugin support** - Extensible with Web Audio Modules

### Architecture Strengths:
- Clean separation of concerns (audioEngine vs advancedDsp)
- Consistent API for all processors (input/output nodes)
- Live and offline chains use identical processor order
- Proper error handling and fallbacks

---

## Priority Recommendations

### 🔴 **CRITICAL (Fix Immediately):**
1. **Redesign De-Esser** (Issue #1) - Currently not working as intended
2. **Fix Dynamic EQ** (Issue #2) - Not actually dynamic

### 🟡 **HIGH PRIORITY:**
3. **Stereo Imager Crossovers** (Issue #3) - Phase coherency issues
4. **Limiter Attack Time** (Issue #4) - Prevents clipping overshoots

### 🟢 **NICE TO HAVE:**
5. **Main Compressor Knee** (Issue #5) - Consistency
6. **True Peak Limiting** - Add oversampling to limiter

---

## Conclusion

The **signal chain routing is professionally designed** and follows industry best practices. The order of processors is textbook correct, and the multiband compressor implementation is excellent.

However, **3 critical processors have implementation bugs** that prevent them from working as intended:
- De-esser adds instead of subtracts
- Dynamic EQ isn't actually dynamic
- Stereo imager has phase issues

**Bottom Line:** Great architecture, but DSP math needs correction on specific processors.

---

**Files Analyzed:**
- `src/services/audioEngine.ts` (lines 47-750)
- `src/services/advancedDsp.ts` (lines 1-650)

**Next Steps:** Fix the 4 critical issues and re-test with pink noise + impulse response measurements.
