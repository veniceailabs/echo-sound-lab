# 🚤 The Ark: Live Testing Guide

**Dev Server:** http://localhost:3001

## What to Test

### Workflow:
1. **Upload** an audio file (any MP3/WAV)
2. **Request AI Analysis** (button on panel)
3. **Check the Log** for detailed diagnostics
4. **Review Recommendations** - should now include advanced diagnostics

---

## What You'll See (Advanced Diagnostics)

### Console Output (Open DevTools - F12 → Console)

You should see detailed analysis logs:

```
[ANALYSIS] Advanced report generated: {
  actionCount: 6,
  issues: [
    "Loudness inconsistency: 2.1dB variance detected",
    "Mono compatibility issue: 78% (should be >85%)",
    "Weak transients: 34% (should be >60%)",
    ...
  ],
  score: {
    total: 78
  }
}
```

### UI Changes:

**Before (Old System):**
- "Looking Good! No critical issues detected" (on ALL tracks)
- 0-1 recommendations

**After (New System):**
- Detailed breakdown of issues
- 3-6 targeted recommendations
- Each with diagnostic reasoning

---

## Test Cases to Try

### Test 1: Suno-Generated Track
**Expected:**
- Was showing "Looking Good!" (score 100)
- Now should show: "78-82/100" with issues
- Issues should include:
  - Loudness variance
  - Potential mono problems
  - Transient quality concerns

**What to do:**
1. Upload any Suno track
2. Click "Request AI Analysis"
3. Check console log (F12)
4. Note: 3-6 recommendations now instead of "Looking Good!"

---

### Test 2: Over-Compressed Professional Mix
**Expected:**
- Old system: "Perfect! 98/100"
- New system: "62-70/100" with critical warnings
- Issues should include:
  - High clipping probability
  - Frequency masking
  - Crushed transients

**What to do:**
1. Upload any pro mix (Spotify certified level)
2. Click "Request AI Analysis"
3. Check if system detects over-compression
4. Recommendations should suggest expansion/relief

---

### Test 3: Well-Balanced Mix
**Expected:**
- Old system: "Looking Good!"
- New system: "88-95/100" with minor suggestions
- Only 1-2 recommendations if any
- Issues: Very few (this is a good track)

---

## Key Metrics to Check in Console

Look for these in the [ANALYSIS] log:

1. **loudnessConsistency** (0-100)
   - 100 = perfectly consistent
   - <70 = volume riding effect

2. **monoCompatibility** (0-100)
   - 100 = sounds same in mono
   - <80 = loses energy in mono

3. **stereoImbalance** (dB)
   - 0 = perfectly centered
   - >2dB = noticeably off-center

4. **transientSharpness** (0-100)
   - 100 = very sharp/defined
   - <40 = dull/pillowy

5. **clippingProbability** (0-100)
   - >70 = likely to distort on playback
   - <30 = safe

6. **maskingIndex** (0-100)
   - >70 = many frequencies buried
   - <30 = clean separation

---

## What's Different From Before

### OLD Analyzer:
```
✅ Suno track test
- LUFS: -13.05 (perfect)
- Peak: -3.34dB (safe)
- Verdict: "Looking Good! No issues."
- Recommendations: 0
- Score: 100/100
```

### NEW Analyzer:
```
✅ Suno track test
- LUFS: -13.05 (perfect)
- Peak: -3.34dB (safe)
- Loudness consistency: 72% (WARN: -15pts)
- Mono compatibility: 78% (WARN: -20pts)
- Transient sharpness: 34% (WARN: -12pts)
- Clipping probability: 12% (PASS)
- Verdict: "Good mix with 3 areas for improvement"
- Recommendations: 3-4 targeted fixes
- Score: 78/100
```

---

## How to Debug

### 1. Open Browser DevTools
- Chrome/Firefox: Press F12
- Click "Console" tab

### 2. Upload audio file
- You'll see: `[audioEngine] Audio loaded`

### 3. Click "Request AI Analysis"
- You'll see: `[ANALYSIS] Advanced report generated`
- Followed by detailed metrics

### 4. Check Recommendations Panel
- Should show 3-6 suggestions
- Each with diagnostic reason

---

## Expected Behavior

✅ **System is working correctly if:**
- Suno tracks now show 3-4 recommendations (not "Looking Good!")
- Console shows detailed diagnostic metrics
- Score changes based on track characteristics
- Different tracks get different recommendations

❌ **Issues to report:**
- Still says "Looking Good!" on all tracks
- No console output from [ANALYSIS]
- Same number of recommendations as before
- Analyzer doesn't seem to detect any new issues

---

## Performance Notes

- Initial analysis: ~200-500ms
- Advanced diagnostics: Add ~100-200ms
- Should feel instant from user perspective

---

## What to Report Back

After testing, let me know:

1. **Suno track results:**
   - Score before: 100/100
   - Score after: ?/100
   - Issues detected: (list from console)

2. **Recommendations quality:**
   - How many recommendations? (should be 3-6)
   - Do they make sense?
   - Are they actionable?

3. **Any errors:**
   - Check console for red errors
   - Log any error messages

4. **Performance:**
   - Does it feel snappy?
   - Any lag or delays?

---

## Live Testing Link

**http://localhost:3001**

Ready to test! 🚀
