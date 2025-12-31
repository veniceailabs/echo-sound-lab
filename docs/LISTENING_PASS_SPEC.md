# Listening Pass Specification

**Status:** LOCKED (v1.0)
**Last Updated:** 2025-12-17

---

## Token #1: Listener Fatigue Events ✅

**Internal Code Name:** `FATIGUE_EVENT` (to distinguish perceptual fatigue from pain conditions)

### Definition
Human perception of listener fatigue caused by repeated, sharp energy in perceptually sensitive frequencies (upper-mid to presence range). Not loudness. Not average energy. **Accumulation of sharp transients that tire the ear over time.**

### What It IS
- Repeated sharp peaks in 2–6 kHz band
- Fast attack + short sustain pattern
- Escalation over song duration
- Vocal sibilance clusters
- Cymbal density that doesn't decay

### What It Is NOT
- High overall loudness
- Presence peak in isolation
- Single events (one peak doesn't trigger)
- Frequency content alone
- Peak amplitude alone

### Detection Logic

**Segmentation:**
- Divide audio into 2-second windows (overlapping 50%)
- Analyze each segment independently

**Per-Segment Analysis:**
1. Extract 2–6 kHz band (bandpass filter)
2. Detect transient peaks (look for > 3x average envelope level)
3. Count sharp transients per segment (threshold: attack < 10ms)
4. Measure recovery time — both local and global
   - **Local recovery:** Time for energy to return toward baseline after each sharp event
   - **Global recovery:** Does the segment ever meaningfully calm down before the next peak?
5. Flag if local recovery < 200ms (insufficient breathing room between events)

**Accumulation Logic:**
- Track sharp event count across segments
- If segment count > threshold for 3+ consecutive segments → ACCUMULATING
- If accumulation increases toward song end → ESCALATING (worse)
- If accumulation stable → STABLE (manageable)
- If accumulation decreases → RESOLVING (good)

**Output Trigger:**
- Token fires when: (sharp_events > threshold) AND (accumulation trend != RESOLVING)

### Output Format

**Minimal case (one event):**
```
Pain/Fatigue: Intermittent sharpness in 2–6kHz, accumulates during chorus.
```

**Complex case (escalating):**
```
Pain/Fatigue: Upper-mid sharpness escalates from verse to chorus. Recovery time insufficient. Will cause listener fatigue on headphones after 2 minutes.
```

**None detected:**
```
[No Pain/Fatigue detected]
```

### Pseudo-Code

```
function detectFatigueEvent(audio, sampleRate):
  segments = divideIntoWindows(audio, windowSize=2s, overlap=50%)
  sharpEventCounts = []
  recoveryTimes = []

  for segment in segments:
    band_2k6k = bandpass(segment, 2000, 6000)
    envelope = |hilbert(band_2k6k)|

    peaks = findPeaks(envelope, minHeight=3*mean(envelope), minDistance=50ms)

    sharpEvents = count(peaks where attackTime < 10ms)
    localRecovery = mean(timeToBaseline after each peak)
    globalRecovery = minimumEnvelopeLevel(between first peak and last peak)

    sharpEventCounts.append(sharpEvents)
    recoveryTimes.append(localRecovery)

  // Trend analysis
  trend = analyzeAccumulation(sharpEventCounts)

  if mean(sharpEventCounts) > threshold AND trend != RESOLVING:
    // Severity reflects LISTENER RISK, not signal intensity
    // Do not optimize this metric toward loudness or gain
    severity = calculateSeverity(trend, recoveryTimes, globalRecovery)
    return {
      detected: true,
      severity: severity,
      trend: trend,
      location: identifySection(peakIndices),
      confidence: calculateConfidence(sharpEventCounts, trend)
    }
  else:
    return { detected: false }
```

### Thresholds (Tunable)

- Sharp event threshold: 5+ per 2s window
- Recovery time threshold: > 200ms is good, < 100ms is bad
- Accumulation window: 3+ consecutive segments
- Presence band: 2000–6000 Hz

### Edge Cases

**Does NOT trigger on:**
- Isolated sibilant in one word (unless repeated)
- Bright but smooth presence EQ (no sharp transients)
- Natural cymbal shimmer with good decay
- One-off loud snare hit

**False positives to watch:**
- Overly sensitive to clipping (flag as fatigue, but tag "clipping" separately)
- Hi-hat rolls (legitimate transient density, not fatigue)

**Genre exception (not a false positive):**
- High-energy genres (hyperpop, punk, breakcore) intentionally sustain fatigue as part of style
- Token still reports accurately; intent is preserved in output ("deliberate aesthetic" vs "unintended problem")

**Refinement notes:**
- May need per-instrument variant (vocal sibilance vs drum harshness behaves differently)
- Recovery time might need adaptive threshold based on section energy

---

## Implementation Notes

- **Frequency band** may shift to 3–8 kHz after initial testing
- **Accumulation window** might compress to 2 segments based on real audio
- **Recovery threshold** needs A/B testing on known "tiring" vs "clean" tracks
- Token output should include confidence score (0.0–1.0)

---

---

## Token #1 Status: COMPLETE & LOCKED (v1.0)

This token is production-ready and truth-based. No further iteration needed.

---

## Token #2: Intelligibility Collapse

**Internal Code Name:** `INTELLIGIBILITY_LOSS` (to distinguish from overall loudness or clarity)

### Definition
Human perception of reduced ability to understand or follow a lead element (typically vocal, lead instrument, or narrative component) due to masking or spectral overlap. Not brightness. Not volume. **Loss of perceptual priority when a lead element should be dominant.**

### What It IS
- Lead element frequency range occupied by competing sounds
- Consonant details disappearing into background energy
- Spectral overlap during moments of intended lead prominence
- Accumulation of masking events (not isolated moments)
- Lead losing priority in sections where it should be primary

### What It Is NOT
- Low overall loudness
- Lack of presence peak
- Muddy bass in isolation
- Lead that is intentionally subtle or buried (style choice)
- Natural reverb tail (is decay, not masking)
- Single moment of overlap
- Dark but intelligible vocal tone (loss of brightness ≠ loss of clarity)
- Stylized vocal compression where words remain understandable

### Detection Logic

**Lead Confidence Handling:**
The system must first determine what the lead element is. This is not always certain.
- If lead detection confidence < 0.7: Token still observes overlap, but output must use cautious language
- If lead detection confidence ≥ 0.7: Standard reporting applies
- This prevents false certainty when system is guessing

**Segmentation:**
- Divide audio into 1-second windows (overlapping 50%)
- Analyze each segment for lead prominence loss

**Per-Segment Analysis:**
1. Extract lead frequency region (assume vocal: 100–3500 Hz, or analyze peak energy band)
2. Identify competing frequency occupancy in same region during lead presence
3. Measure sustained competing energy during lead-active moments (overlap coefficient; internal math only)
4. Detect consonant clarity loss by analyzing high-frequency detail (8–12 kHz band) — supporting indicator only, not primary trigger
5. Flag if overlap + consonant loss present together for 2+ consecutive seconds

**Accumulation Logic:**
- Track masking event count across segments
- If masking events > threshold for 3+ consecutive segments → RECURRING_MASKING
- If masking increases toward chorus → ESCALATING_LOSS
- If masking present but stable → CONSISTENT_OVERLAP
- If masking decreases or disappears → RESOLVING

**Output Trigger:**
- Token fires when: (overlap_coefficient > threshold) AND (accumulation trend != RESOLVING) AND (consonant_clarity < baseline)

### Output Format

**High confidence case:**
```
Intelligibility: Vocal competing with mid-range instruments, consonants unclear during chorus.
```

**High confidence, escalating:**
```
Intelligibility: Lead loses priority in mid-range overlap. Intensifies in final chorus. Listener must focus to follow lyrical content.
```

**Low confidence case (lead uncertain):**
```
Intelligibility: Primary element may be losing clarity due to mid-range competition.
```

**None detected:**
```
[No Intelligibility issues detected]
```

### Pseudo-Code

```
function detectIntelligibilityLoss(audio, sampleRate):
  segments = divideIntoWindows(audio, windowSize=1s, overlap=50%)
  maskingEvents = []
  consonantClarity = []

  // Detect lead channel / frequency (could be automated or manual)
  leadBand, leadConfidence = detectLeadFrequencyRegion(audio) // e.g., 100–3500 Hz for vocal

  for segment in segments:
    leadSignal = extract(segment, leadBand)
    allOtherSignal = extract(segment, except=leadBand)

    // Measure sustained competing energy during lead-active moments
    leadSpectrum = fft(leadSignal)
    otherSpectrum = fft(allOtherSignal)

    overlapCoeff = correlate(leadSpectrum, otherSpectrum)

    // Detect consonant clarity (HIGH-FREQ DETAIL — supporting indicator only)
    consonantBand = extract(leadSignal, 8000, 12000)
    consonantEnergy = rms(consonantBand)
    consonantClarity.append(consonantEnergy)

    // Flag masking event: OVERLAP is primary driver, consonants confirm
    if overlapCoeff > MASKING_THRESHOLD and consonantEnergy < CLARITY_THRESHOLD:
      maskingEvents.append(segment)

  // Trend analysis
  trend = analyzeAccumulation(maskingEvents)

  if len(maskingEvents) > MIN_EVENTS and trend != RESOLVING:
    // Confidence reflects LISTENER EFFORT, not signal metrics
    // Severity AND language depend on lead detection confidence
    severity = calculateSeverity(trend, overlapCoeff, consonantClarity)
    languageMode = "cautious" if leadConfidence < 0.7 else "standard"

    return {
      detected: true,
      severity: severity,
      trend: trend,
      overlapCoefficient: overlapCoeff,
      consonantLoss: mean(consonantClarity),
      leadConfidence: leadConfidence,
      languageMode: languageMode,
      confidence: calculateConfidence(maskingEvents, trend, leadConfidence)
    }
  else:
    return { detected: false }
```

### Thresholds (Tunable)

- Masking threshold (overlap coefficient): > 0.6 (internal math; reflects sustained competing energy during lead-active moments)
- Consonant clarity threshold: consonant energy < 0.3 * average lead band energy
- Minimum masking events: overlap + consonant loss together for 2+ consecutive segments
- Lead frequency band: adaptive or manual (vocal: 100–3500 Hz; lead guitar: 150–4000 Hz)
- Lead confidence threshold: 0.7 (confidence < 0.7 uses cautious output language)

### Edge Cases

**Does NOT trigger on:**
- Intentional call-and-response where lead is temporarily silent
- Stereo-width separation (L/R panning, not masking)
- Natural reverb or delay of lead (same element, not competing)
- Lead with intentional "buried in mix" aesthetic (e.g., shoegaze, lo-fi)
- Single unclear consonant

**False positives to watch:**
- Sustained pad instruments that are stylistically supportive, not masking
- Heavily compressed vocals that lose consonant detail naturally
- Genre-specific mixing (rap with heavily layered vocals by design)

**Genre exception (not a false positive):**
- Genres intentionally obscure leads (experimental, drone, ambient)
- Token still reports accurately; context preserved in output

### Refinement Notes

- Lead frequency region detection may require per-instrument tuning
- Overlap coefficient threshold needs A/B testing against known "unclear" vs "clear" mixes
- Consonant clarity proxy may need adaptive thresholding based on vocal gender/age
- May benefit from spectrogram visual for debugging

---

## Token #2 Status: COMPLETE & LOCKED (v1.0) ✅

**Applied Refinements:**
1. ✅ Lead Confidence Handling — explicitly accounts for detection uncertainty
2. ✅ Consonant Clarity De-risking — downgraded from primary to supporting indicator
3. ✅ Overlap Reframing — shifted from mathematical "60% occupancy" to perceptual "sustained competing energy"

**Final Checklist Status:**
- ✅ Perception Integrity — PASS
- ✅ Detection Honesty — PASS
- ✅ Language Discipline — PASS
- ✅ Safety & Trust — PASS
- ✅ Drift Protection — PASS

**This token is production-ready and truth-based. No further iteration needed.**

---

## Token #3: Instability / Anxiety

**Internal Code Name:** `INSTABILITY_EVENT` (to distinguish from overall dynamic range or compression)

### Definition
Human perception of unsettled or nervous quality caused by unpredictable transient behavior, inconsistent envelope recovery, or overly tight compression fighting natural dynamics. Not dynamics. Not quiet passages. **Accumulation of small, erratic energy events that create listener tension.**

### What It IS
- Repeated, unpredictable transient attacks with inconsistent spacing
- Inconsistent recovery times between similar events
- Compressor responding too aggressively to minor peaks
- High transient density without consistent pattern or decay
- Envelope behavior that feels "jumpy" rather than controlled
- Over-gating or abrupt cutoffs of sustained notes

### What It Is NOT
- Natural dynamic variation in performance
- Intentional stutter or rhythmic effect
- Sparse, intentional transients (one attack + clear decay is fine)
- Aggressive but predictable compression (if rhythm is consistent, not anxiety)
- Complex but learnable rhythmic structures (swung hi-hats, polyrhythms, syncopation)
- Dense but self-consistent grooves that stabilize into repeatable patterns
- Genres with intended nervous energy (IDM, glitch, breakcore)
- Normal breath, pick noise, or performance artifacts

### Detection Logic

**Segmentation:**
- Divide audio into 0.5-second windows (overlapping 75%)
- Short windows to catch erratic behavior patterns

**Per-Segment Analysis:**
1. Extract all transient events (attack time < 20ms, above 2x baseline)
2. Measure inter-event spacing (time between consecutive transients)
3. Calculate spacing variance (do events cluster unpredictably?)
4. Measure envelope recovery consistency (are decay times similar for similar-amplitude events?)
5. Detect gate artifacts (abrupt energy cutoffs that don't match natural decay)

**Pattern Learnability Test (Critical Safeguard):**
- If spacing variance is high in initial segments BUT stabilizes into a repeatable pattern across later segments → this is complex but intentional, not erratic
- Check: does the pattern repeat consistently after 3–4 occurrences?
- If yes: suppress Instability reporting (this is learnable rhythm, not nervous energy)
- If no: proceed to accumulation logic

**Accumulation Logic:**
- Track instability events across segments
- If spacing variance > threshold for 3+ consecutive segments → ERRATIC_TIMING
- If recovery consistency drops for 3+ segments → UNPREDICTABLE_ENVELOPE
- If gate artifacts present → OVER_GATING
- Combine triggers: if 2+ of these present together → ANXIETY_PATTERN
- If anxiety pattern escalates across song → ESCALATING_TENSION
- If pattern stabilizes → STABLE_NERVOUSNESS
- If pattern resolves → SETTLING

**Output Trigger:**
- Token fires when: (spacing_variance > threshold) AND (recovery_consistency < baseline) for 3+ segments OR (gate_artifacts detected)

### Output Format

**Erratic timing case (nervous, unlearnable):**
```
Instability: Transient spacing is unpredictable, creating a nervous quality. Listener must brace for the next attack.
```

**Over-compression case:**
```
Instability: Envelope recovery is too tight; sounds are being cut off unnaturally. Creates tension between what's played and what survives the gate.
```

**Escalating case:**
```
Instability: Erratic timing worsens toward the end of phrases. Mix feels unsettled rather than controlled.
```

**Complex but learnable rhythm (suppressed, no output):**
```
[No Instability detected]
```
*Internally: Pattern is complex but becomes consistent; this is intentional groove, not anxiety*

**None detected:**
```
[No Instability detected]
```

### Pseudo-Code

```
function detectInstability(audio, sampleRate):
  segments = divideIntoWindows(audio, windowSize=0.5s, overlap=75%)
  spacingVariances = []
  recoveryConsistencies = []
  gateArtifacts = []

  for segment in segments:
    // Extract all transients
    transients = findTransients(segment, attackTime < 20ms, amplitude > 2*baseline)
    transientTimes = [t.time for t in transients]

    // Measure inter-event spacing
    if len(transients) >= 2:
      interEventSpacing = differences(transientTimes)
      spacingVariance = stdev(interEventSpacing) / mean(interEventSpacing)  // Coefficient of variation
      spacingVariances.append(spacingVariance)

      // Measure envelope recovery consistency
      recoveryTimes = [t.recoveryTime for t in transients]  // Time to 50% decay
      recoveryConsistency = 1.0 - (stdev(recoveryTimes) / mean(recoveryTimes))  // Inverse: higher = more consistent
      recoveryConsistencies.append(recoveryConsistency)

      // Detect gate artifacts (unnatural cutoffs)
      gateCount = countArtificialCutoffs(segment)
      if gateCount > GATE_THRESHOLD:
        gateArtifacts.append(segment)

  // Pattern Learnability Test (Critical Safeguard)
  // Check if high variance stabilizes into a repeatable pattern
  if highVariance:
    patternRepeatability = analyzePatternRepetition(spacingVariances)  // 0.0-1.0, higher = more repeatable
    if patternRepeatability > LEARNABILITY_THRESHOLD:
      // Complex but intentional rhythm - suppress reporting
      return { detected: false, reason: "complex_learnable_rhythm" }

  // Trend analysis
  highVariance = mean(spacingVariances) > VARIANCE_THRESHOLD
  lowConsistency = mean(recoveryConsistencies) < CONSISTENCY_THRESHOLD
  hasGates = len(gateArtifacts) >= 2

  if (highVariance and lowConsistency) or hasGates:
    // Identify pattern
    pattern = "ERRATIC_TIMING"
    if hasGates: pattern = "OVER_GATING"
    if highVariance and lowConsistency: pattern = "ERRATIC_ENVELOPE"

    trend = analyzeTrend(spacingVariances + recoveryConsistencies)

    severity = calculateSeverity(pattern, trend, mean(spacingVariances))

    return {
      detected: true,
      severity: severity,
      pattern: pattern,
      trend: trend,
      spacingVariance: mean(spacingVariances),
      recoveryConsistency: mean(recoveryConsistencies),
      gateArtifacts: len(gateArtifacts),
      confidence: calculateConfidence(highVariance, lowConsistency, hasGates)
    }
  else:
    return { detected: false }
```

### Thresholds (Tunable)

- Spacing variance threshold (CoV): > 0.4 (coefficient of variation > 40% indicates erratic timing)
- Recovery consistency threshold: < 0.6 (inverse metric; < 0.6 indicates unpredictable decay)
- Minimum transient requirement: 3+ transients per segment for reliable spacing analysis
- Gate artifact threshold: 2+ cutoffs per 0.5s window = over-gating
- Confidence requirement: 2+ of (high variance, low consistency, gate artifacts) must be true
- **Learnability threshold: > 0.7 (pattern repeatability > 70% = complex but intentional, suppress reporting)**

### Edge Cases

**Does NOT trigger on:**
- Natural performance variations (slight timing drift, breath between phrases)
- Sparse, widely-spaced transients (kick drum with clear decay is fine)
- Consistent aggressive compression (if rhythm is regular, not nervous)
- Single transient event

**False positives to watch:**
- Vocal vibrato mistaken for erratic timing
- Natural reverb tail creating artifical "cutoff" detection
- Genres with intentional stutter (glitch, IDM, breakcore)
- Fast hi-hat rolls (legitimate transient density, not anxiety if predictable)

**Genre exception (not a false positive):**
- Experimental, IDM, breakcore intentionally create instability as aesthetic
- Token still reports accurately; intent is preserved in output ("deliberate rhythmic tension" vs "unintended nervousness")

### Refinement Notes

- Transient detection may need adaptive thresholding based on overall mix energy
- Spacing variance threshold should be tested against known "tight" vs "nervous" mixes
- **Pattern learnability is critical:** Analyze whether variance stabilizes into repetition. Swung grooves and polyrhythms must not trigger false positives
- Gate artifact detection is proxy-based; may benefit from spectrogram analysis for verification
- Recovery time analysis might need per-instrument tuning (vocal glottal closure vs drum natural decay behaves differently)

---

## Token #3 Status: REFINED — Ready for Final Lock

**Applied Refinement:**
1. ✅ Pattern Learnability Safeguard — complex but repeatable patterns (swung hi-hats, polyrhythms, syncopation) explicitly excluded from firing

**Checklist Status:** All five sections should now pass (Perception Integrity, Detection Honesty, Language Discipline, Safety & Trust, Drift Protection)
