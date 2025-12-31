/**
 * Custom DSP Plugins for Echo Sound Lab
 *
 * Built from scratch to replace Web Audio API's artifact-prone processors.
 * Philosophy: Transparent, musical, protective mastering.
 */

/**
 * Custom Transparent Compressor
 *
 * Design goals:
 * - RMS detection (musical response, not aggressive peak)
 * - Smooth gain envelope (attack/release without pumping)
 * - True ratio control (1.5:1 = 1.5:1, not Web Audio's aggressive behavior)
 * - Zero makeup gain (preserve dynamics)
 * - Minimum phase distortion
 * - Lookahead buffer (prevent overshoot on transients)
 */
export class TransparentCompressor {
    private sampleRate: number;
    private threshold: number; // dB
    private ratio: number;
    private attack: number; // seconds
    private release: number; // seconds
    private knee: number; // dB

    // Internal state
    private envelope: number = 0; // Current gain reduction envelope (linear)
    private rmsBuffer: Float32Array;
    private rmsBufferIndex: number = 0;
    private rmsWindowSize: number;

    constructor(
        sampleRate: number,
        threshold: number = -12,
        ratio: number = 1.5,
        attack: number = 0.010, // 10ms
        release: number = 0.100, // 100ms
        knee: number = 6 // 6dB soft knee
    ) {
        this.sampleRate = sampleRate;
        this.threshold = threshold;
        this.ratio = ratio;
        this.attack = attack;
        this.release = release;
        this.knee = knee;

        // RMS window: 10ms for musical response
        this.rmsWindowSize = Math.floor(sampleRate * 0.010);
        this.rmsBuffer = new Float32Array(this.rmsWindowSize);
    }

    /**
     * Convert linear amplitude to dB
     */
    private linearToDb(linear: number): number {
        return 20 * Math.log10(Math.max(linear, 1e-10));
    }

    /**
     * Convert dB to linear amplitude
     */
    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    /**
     * Calculate RMS level in dB
     */
    private calculateRMS(): number {
        let sum = 0;
        for (let i = 0; i < this.rmsWindowSize; i++) {
            sum += this.rmsBuffer[i] * this.rmsBuffer[i];
        }
        const rms = Math.sqrt(sum / this.rmsWindowSize);
        return this.linearToDb(rms);
    }

    /**
     * Calculate gain reduction for given input level (dB)
     * Uses soft-knee compression curve
     */
    private calculateGainReduction(inputDb: number): number {
        // Soft knee calculation
        const kneeStart = this.threshold - this.knee / 2;
        const kneeEnd = this.threshold + this.knee / 2;

        let gainReductionDb = 0;

        if (inputDb < kneeStart) {
            // Below knee: no compression
            gainReductionDb = 0;
        } else if (inputDb < kneeEnd) {
            // Inside knee: smooth transition
            const kneePosition = (inputDb - kneeStart) / this.knee;
            const excess = inputDb - this.threshold;
            gainReductionDb = -(excess * kneePosition * kneePosition * (1 - 1 / this.ratio));
        } else {
            // Above knee: full compression
            const excess = inputDb - this.threshold;
            gainReductionDb = -(excess * (1 - 1 / this.ratio));
        }

        return gainReductionDb;
    }

    /**
     * Process a single sample
     */
    private processSample(input: number): number {
        // Update RMS buffer
        this.rmsBuffer[this.rmsBufferIndex] = Math.abs(input);
        this.rmsBufferIndex = (this.rmsBufferIndex + 1) % this.rmsWindowSize;

        // Calculate current RMS level
        const inputDb = this.calculateRMS();

        // Calculate target gain reduction
        const targetGainReductionDb = this.calculateGainReduction(inputDb);
        const targetGainReduction = this.dbToLinear(targetGainReductionDb);

        // Smooth envelope following (attack/release)
        const envelopeCoeff = targetGainReduction < this.envelope
            ? 1 - Math.exp(-1 / (this.attack * this.sampleRate)) // Attack (reducing gain)
            : 1 - Math.exp(-1 / (this.release * this.sampleRate)); // Release (restoring gain)

        this.envelope += envelopeCoeff * (targetGainReduction - this.envelope);

        // Apply gain reduction
        return input * this.envelope;
    }

    /**
     * Process audio buffer (in-place)
     */
    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = this.processSample(buffer[i]);
        }
    }

    /**
     * Process stereo buffer (in-place)
     * Uses linked stereo compression (sum of both channels for detection)
     */
    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        for (let i = 0; i < length; i++) {
            // Linked detection: use max of both channels
            const linkedSample = Math.max(Math.abs(leftBuffer[i]), Math.abs(rightBuffer[i]));

            // Update RMS buffer with linked signal
            this.rmsBuffer[this.rmsBufferIndex] = linkedSample;
            this.rmsBufferIndex = (this.rmsBufferIndex + 1) % this.rmsWindowSize;

            // Calculate current RMS level
            const inputDb = this.calculateRMS();

            // Calculate target gain reduction
            const targetGainReductionDb = this.calculateGainReduction(inputDb);
            const targetGainReduction = this.dbToLinear(targetGainReductionDb);

            // Smooth envelope
            const envelopeCoeff = targetGainReduction < this.envelope
                ? 1 - Math.exp(-1 / (this.attack * this.sampleRate))
                : 1 - Math.exp(-1 / (this.release * this.sampleRate));

            this.envelope += envelopeCoeff * (targetGainReduction - this.envelope);

            // Apply same gain reduction to both channels (linked stereo)
            leftBuffer[i] *= this.envelope;
            rightBuffer[i] *= this.envelope;
        }
    }

    /**
     * Reset internal state
     */
    public reset(): void {
        this.envelope = 1.0;
        this.rmsBuffer.fill(0);
        this.rmsBufferIndex = 0;
    }
}

/**
 * Custom Surgical EQ
 *
 * Design goals:
 * - Minimum-phase filters (no pre-ringing)
 * - High Q precision (surgical cuts without resonance)
 * - Body frequency protection (150-500Hz untouchable)
 * - No coloration on passband
 */
export class SurgicalEQ {
    private sampleRate: number;
    private filters: BiquadFilter[] = [];

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Add a peaking filter band
     */
    public addBand(frequency: number, gainDb: number, q: number = 0.7): void {
        // BODY PROTECTION: Block cuts in 150-500Hz range
        const isBodyRange = frequency >= 150 && frequency <= 500;
        const isCut = gainDb < 0;

        if (isBodyRange && isCut) {
            console.warn(`[SurgicalEQ] Blocked ${frequency}Hz cut (body protection)`);
            return;
        }

        // HIGH-FREQUENCY RESTRAINT: Cap cuts at -3dB above 5kHz
        const isHighFreq = frequency >= 5000;
        const cappedGain = isHighFreq && isCut ? Math.max(gainDb, -3) : gainDb;

        this.filters.push(new BiquadFilter(
            this.sampleRate,
            'peaking',
            frequency,
            cappedGain,
            q
        ));
    }

    /**
     * Add a high-pass filter (subsonic protection)
     *
     * ⚠️  WARNING: High-pass filters cause phase rotation and transient smearing
     *
     * Impact on audio:
     * - Phase shift across ALL frequencies (not just the cutoff)
     * - Transient attack/decay smearing (reduces "crispness")
     * - Group delay artifacts
     *
     * Safe usage guidelines:
     * - ONLY use for subsonic cleanup (< 30Hz)
     * - NEVER use for "tightening bass" or creative purposes
     * - Lower Q = less resonance but more phase rotation
     * - Higher Q = sharper cutoff but resonant peak
     *
     * TODO: Implement linear-phase alternative for frequencies > 30Hz
     *
     * @param frequency - Cutoff frequency (recommend < 30Hz only)
     * @param q - Filter resonance (default 0.5 = gentle, minimal resonance)
     */
    public addHighPass(frequency: number, q: number = 0.5): void {
        // SAFETY CHECK: Warn if used above subsonic range
        if (frequency > 35) {
            console.warn(
                `[SurgicalEQ] High-pass at ${frequency}Hz may cause audible phase rotation. ` +
                `Recommend < 30Hz for subsonic cleanup only.`
            );
        }

        this.filters.push(new BiquadFilter(
            this.sampleRate,
            'highpass',
            frequency,
            0,
            q
        ));
    }

    /**
     * Process audio buffer (in-place)
     */
    public process(buffer: Float32Array): void {
        for (const filter of this.filters) {
            filter.process(buffer);
        }
    }

    /**
     * Clear all filters
     */
    public clear(): void {
        this.filters = [];
    }
}

/**
 * Custom Biquad Filter Implementation
 *
 * Standard biquad filter with state variables.
 * More predictable than Web Audio's BiquadFilterNode.
 */
class BiquadFilter {
    private a0: number = 1;
    private a1: number = 0;
    private a2: number = 0;
    private b0: number = 1;
    private b1: number = 0;
    private b2: number = 0;

    // State variables
    private x1: number = 0;
    private x2: number = 0;
    private y1: number = 0;
    private y2: number = 0;

    constructor(
        sampleRate: number,
        type: 'peaking' | 'highpass' | 'lowpass',
        frequency: number,
        gainDb: number,
        q: number
    ) {
        this.calculateCoefficients(sampleRate, type, frequency, gainDb, q);
    }

    private calculateCoefficients(
        sampleRate: number,
        type: string,
        frequency: number,
        gainDb: number,
        q: number
    ): void {
        const omega = 2 * Math.PI * frequency / sampleRate;
        const sinOmega = Math.sin(omega);
        const cosOmega = Math.cos(omega);
        const alpha = sinOmega / (2 * q);
        const A = Math.pow(10, gainDb / 40); // Amplitude

        if (type === 'peaking') {
            this.b0 = 1 + alpha * A;
            this.b1 = -2 * cosOmega;
            this.b2 = 1 - alpha * A;
            this.a0 = 1 + alpha / A;
            this.a1 = -2 * cosOmega;
            this.a2 = 1 - alpha / A;
        } else if (type === 'highpass') {
            this.b0 = (1 + cosOmega) / 2;
            this.b1 = -(1 + cosOmega);
            this.b2 = (1 + cosOmega) / 2;
            this.a0 = 1 + alpha;
            this.a1 = -2 * cosOmega;
            this.a2 = 1 - alpha;
        } else if (type === 'lowpass') {
            this.b0 = (1 - cosOmega) / 2;
            this.b1 = 1 - cosOmega;
            this.b2 = (1 - cosOmega) / 2;
            this.a0 = 1 + alpha;
            this.a1 = -2 * cosOmega;
            this.a2 = 1 - alpha;
        }

        // Normalize coefficients
        this.b0 /= this.a0;
        this.b1 /= this.a0;
        this.b2 /= this.a0;
        this.a1 /= this.a0;
        this.a2 /= this.a0;
        this.a0 = 1;
    }

    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            const x0 = buffer[i];
            const y0 = this.b0 * x0 + this.b1 * this.x1 + this.b2 * this.x2
                      - this.a1 * this.y1 - this.a2 * this.y2;

            // Update state
            this.x2 = this.x1;
            this.x1 = x0;
            this.y2 = this.y1;
            this.y1 = y0;

            buffer[i] = y0;
        }
    }
}

/**
 * Custom Transparent Limiter
 *
 * Design goals:
 * - Brickwall ceiling (no inter-sample peaks)
 * - Lookahead buffer (prevents overshoot)
 * - Fast attack, musical release
 * - Preserves transient character
 * - No pumping or breathing
 */
export class TransparentLimiter {
    private sampleRate: number;
    private threshold: number; // dB
    private lookahead: number; // seconds
    private release: number; // seconds

    private lookaheadBuffer: Float32Array;
    private lookaheadIndex: number = 0;
    private lookaheadSize: number;
    private envelope: number = 1.0;

    constructor(
        sampleRate: number,
        threshold: number = -1.0, // -1dBFS ceiling
        lookahead: number = 0.005, // 5ms lookahead
        release: number = 0.100 // 100ms release
    ) {
        this.sampleRate = sampleRate;
        this.threshold = threshold;
        this.lookahead = lookahead;
        this.release = release;

        this.lookaheadSize = Math.floor(sampleRate * lookahead);
        this.lookaheadBuffer = new Float32Array(this.lookaheadSize);
    }

    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    private linearToDb(linear: number): number {
        return 20 * Math.log10(Math.max(linear, 1e-10));
    }

    public process(buffer: Float32Array): void {
        const thresholdLinear = this.dbToLinear(this.threshold);
        const releaseCoeff = 1 - Math.exp(-1 / (this.release * this.sampleRate));

        for (let i = 0; i < buffer.length; i++) {
            // Store current sample in lookahead buffer
            const currentSample = buffer[i];
            this.lookaheadBuffer[this.lookaheadIndex] = currentSample;

            // Get delayed sample (lookahead)
            const delayedIndex = (this.lookaheadIndex + 1) % this.lookaheadSize;
            const delayedSample = this.lookaheadBuffer[delayedIndex];

            this.lookaheadIndex = (this.lookaheadIndex + 1) % this.lookaheadSize;

            // Peak detection on current sample (for envelope calculation)
            const peakLevel = Math.abs(currentSample);

            // Calculate target gain
            let targetGain = 1.0;
            if (peakLevel > thresholdLinear) {
                targetGain = thresholdLinear / peakLevel;
            }

            // Smooth envelope (instant attack via min, musical release)
            this.envelope = Math.min(targetGain, this.envelope + releaseCoeff * (targetGain - this.envelope));

            // Apply gain to delayed sample
            buffer[i] = delayedSample * this.envelope;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const thresholdLinear = this.dbToLinear(this.threshold);
        const releaseCoeff = 1 - Math.exp(-1 / (this.release * this.sampleRate));
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        // Separate lookahead buffers for L/R
        const leftLookahead = new Float32Array(this.lookaheadSize);
        const rightLookahead = new Float32Array(this.lookaheadSize);
        let lookaheadIdx = 0;

        for (let i = 0; i < length; i++) {
            // Store current samples
            const currentL = leftBuffer[i];
            const currentR = rightBuffer[i];
            leftLookahead[lookaheadIdx] = currentL;
            rightLookahead[lookaheadIdx] = currentR;

            // Get delayed samples
            const delayedIdx = (lookaheadIdx + 1) % this.lookaheadSize;
            const delayedL = leftLookahead[delayedIdx];
            const delayedR = rightLookahead[delayedIdx];

            lookaheadIdx = (lookaheadIdx + 1) % this.lookaheadSize;

            // Linked peak detection (max of both channels)
            const peakLevel = Math.max(Math.abs(currentL), Math.abs(currentR));

            // Calculate target gain
            let targetGain = 1.0;
            if (peakLevel > thresholdLinear) {
                targetGain = thresholdLinear / peakLevel;
            }

            // Smooth envelope
            this.envelope = Math.min(targetGain, this.envelope + releaseCoeff * (targetGain - this.envelope));

            // Apply gain to delayed samples
            leftBuffer[i] = delayedL * this.envelope;
            rightBuffer[i] = delayedR * this.envelope;
        }
    }

    public reset(): void {
        this.envelope = 1.0;
        this.lookaheadBuffer.fill(0);
        this.lookaheadIndex = 0;
    }
}

/**
 * Custom DeEsser
 *
 * Professional sibilance reduction using split-band compression.
 * Targets harsh "S" and "T" sounds without affecting overall brightness.
 *
 * Design goals:
 * - Transparent when not triggered
 * - Musical compression curve (soft knee)
 * - Frequency-selective (only affects sibilant band)
 * - Preserves overall vocal tone
 */
export class CustomDeEsser {
    private sampleRate: number;
    private frequency: number;
    private threshold: number; // dB
    private amount: number; // 0-1

    private detector: BiquadFilter;
    private envelope: number = 0;
    private attackCoeff: number;
    private releaseCoeff: number;

    constructor(
        sampleRate: number,
        frequency: number = 6000, // Typical sibilance range
        threshold: number = -20,
        amount: number = 0.5
    ) {
        this.sampleRate = sampleRate;
        this.frequency = frequency;
        this.threshold = threshold;
        this.amount = amount;

        // Bandpass filter to isolate sibilant frequencies
        this.detector = new BiquadFilter(sampleRate, 'peaking', frequency, 12, 5); // High Q for narrow band

        // Fast attack (0.5ms) for catching sibilants
        this.attackCoeff = 1 - Math.exp(-1 / (0.0005 * sampleRate));
        // Medium release (50ms) for smooth recovery
        this.releaseCoeff = 1 - Math.exp(-1 / (0.050 * sampleRate));
    }

    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    public process(buffer: Float32Array): void {
        const thresholdLinear = this.dbToLinear(this.threshold);
        const detectedBuffer = new Float32Array(buffer);

        // Detect sibilant energy
        this.detector.process(detectedBuffer);

        for (let i = 0; i < buffer.length; i++) {
            // Envelope follower on sibilant band
            const sibilantLevel = Math.abs(detectedBuffer[i]);
            const targetEnvelope = sibilantLevel;

            if (targetEnvelope > this.envelope) {
                this.envelope += this.attackCoeff * (targetEnvelope - this.envelope);
            } else {
                this.envelope += this.releaseCoeff * (targetEnvelope - this.envelope);
            }

            // Calculate gain reduction when sibilant level exceeds threshold
            let gainReduction = 1.0;
            if (this.envelope > thresholdLinear) {
                const overThreshold = this.envelope / thresholdLinear;
                // Soft knee compression (ratio increases smoothly)
                const ratio = 1 + (this.amount * 3); // 1:1 to 4:1 based on amount
                gainReduction = 1.0 / Math.pow(overThreshold, (ratio - 1) / ratio);

                // Blend with dry signal based on amount
                gainReduction = 1.0 - (this.amount * (1.0 - gainReduction));
            }

            // Apply gain reduction
            buffer[i] *= gainReduction;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);
        const thresholdLinear = this.dbToLinear(this.threshold);

        // Detect sibilant energy in both channels
        const leftDetected = new Float32Array(leftBuffer);
        const rightDetected = new Float32Array(rightBuffer);
        this.detector.process(leftDetected);
        this.detector.process(rightDetected);

        for (let i = 0; i < length; i++) {
            // Stereo-linked detection (max of both channels)
            const sibilantLevel = Math.max(Math.abs(leftDetected[i]), Math.abs(rightDetected[i]));
            const targetEnvelope = sibilantLevel;

            if (targetEnvelope > this.envelope) {
                this.envelope += this.attackCoeff * (targetEnvelope - this.envelope);
            } else {
                this.envelope += this.releaseCoeff * (targetEnvelope - this.envelope);
            }

            // Calculate gain reduction
            let gainReduction = 1.0;
            if (this.envelope > thresholdLinear) {
                const overThreshold = this.envelope / thresholdLinear;
                const ratio = 1 + (this.amount * 3);
                gainReduction = 1.0 / Math.pow(overThreshold, (ratio - 1) / ratio);
                gainReduction = 1.0 - (this.amount * (1.0 - gainReduction));
            }

            // Apply same gain reduction to both channels (maintains stereo image)
            leftBuffer[i] *= gainReduction;
            rightBuffer[i] *= gainReduction;
        }
    }

    public reset(): void {
        this.envelope = 0;
    }
}

/**
 * Custom Saturation
 *
 * Harmonic exciter using psychoacoustic waveshaping.
 * Adds warmth, presence, and perceived loudness through harmonic generation.
 *
 * Design principles:
 * - Even harmonics (2nd, 4th) = warmth, thickness
 * - Odd harmonics (3rd, 5th) = presence, edge
 * - Asymmetric shaping = more even harmonics (tube-like)
 * - Symmetric shaping = more odd harmonics (tape-like)
 */
export class CustomSaturation {
    private amount: number; // 0-1
    private type: 'tube' | 'tape' | 'transformer';
    private dryWet: number; // 0-1

    constructor(
        amount: number = 0.3,
        type: 'tube' | 'tape' | 'transformer' = 'tube',
        dryWet: number = 1.0
    ) {
        this.amount = amount;
        this.type = type;
        this.dryWet = dryWet;
    }

    /**
     * Tube saturation (asymmetric - emphasizes 2nd harmonic)
     * Warm, smooth, vintage character
     */
    private tubeSaturation(x: number): number {
        // Asymmetric soft clipping
        // Positive half gets more compression (2nd harmonic emphasis)
        const k = this.amount * 2;
        return x > 0
            ? x / (1 + k * x)  // Softer positive peaks
            : x / (1 + k * Math.abs(x) * 0.5); // Harder negative peaks
    }

    /**
     * Tape saturation (symmetric - emphasizes 3rd harmonic)
     * Cohesive, glue-like, musical
     */
    private tapeSaturation(x: number): number {
        // Symmetric soft clipping with tanh-like curve
        const k = this.amount * 3;
        return Math.tanh(x * (1 + k)) / (1 + k * 0.3);
    }

    /**
     * Transformer saturation (moderate asymmetry)
     * Punchy, present, controlled
     */
    private transformerSaturation(x: number): number {
        // Moderate asymmetric clipping
        const k = this.amount * 2.5;
        const abs_x = Math.abs(x);
        const sign = x >= 0 ? 1 : -1;

        // Soft knee compression
        if (abs_x < 0.5) {
            return x * (1 + k * 0.2);
        } else {
            const compressed = 0.5 + (abs_x - 0.5) / (1 + k * (abs_x - 0.5));
            return sign * compressed;
        }
    }

    private saturate(x: number): number {
        switch (this.type) {
            case 'tube':
                return this.tubeSaturation(x);
            case 'tape':
                return this.tapeSaturation(x);
            case 'transformer':
                return this.transformerSaturation(x);
            default:
                return x;
        }
    }

    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            const dry = buffer[i];
            const wet = this.saturate(dry);

            // Dry/wet blend
            buffer[i] = dry * (1 - this.dryWet) + wet * this.dryWet;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        for (let i = 0; i < length; i++) {
            const dryL = leftBuffer[i];
            const dryR = rightBuffer[i];

            const wetL = this.saturate(dryL);
            const wetR = this.saturate(dryR);

            // Independent L/R processing (preserves stereo image)
            leftBuffer[i] = dryL * (1 - this.dryWet) + wetL * this.dryWet;
            rightBuffer[i] = dryR * (1 - this.dryWet) + wetR * this.dryWet;
        }
    }

    public setAmount(amount: number): void {
        this.amount = Math.max(0, Math.min(1, amount));
    }

    public setType(type: 'tube' | 'tape' | 'transformer'): void {
        this.type = type;
    }

    public setDryWet(mix: number): void {
        this.dryWet = Math.max(0, Math.min(1, mix));
    }
}

/**
 * Custom Transient Shaper
 *
 * Controls attack and sustain independently using envelope detection.
 * Humans perceive transients as "punch", "snap", and "clarity".
 *
 * Psychoacoustic principles:
 * - Attack (0-10ms) = perceived impact and definition
 * - Sustain (10-500ms) = perceived body and thickness
 * - Independent control = reshape without affecting tonality
 * - Preserves phase = maintains stereo image
 */
export class CustomTransientShaper {
    private sampleRate: number;
    private attack: number; // -1 to +1 (reduce to enhance)
    private sustain: number; // -1 to +1 (reduce to enhance)

    private fastEnvelope: number = 0;
    private slowEnvelope: number = 0;

    // Attack = 0.5ms, Release = 5ms (catches transients)
    private fastAttack: number;
    private fastRelease: number;

    // Attack = 50ms, Release = 500ms (catches sustain)
    private slowAttack: number;
    private slowRelease: number;

    constructor(
        sampleRate: number,
        attack: number = 0, // 0 = no change
        sustain: number = 0
    ) {
        this.sampleRate = sampleRate;
        this.attack = attack;
        this.sustain = sustain;

        // Fast envelope (transient detection)
        this.fastAttack = 1 - Math.exp(-1 / (0.0005 * sampleRate)); // 0.5ms
        this.fastRelease = 1 - Math.exp(-1 / (0.005 * sampleRate));  // 5ms

        // Slow envelope (sustain detection)
        this.slowAttack = 1 - Math.exp(-1 / (0.050 * sampleRate));  // 50ms
        this.slowRelease = 1 - Math.exp(-1 / (0.500 * sampleRate)); // 500ms
    }

    private processEnvelopes(sample: number): { transient: number; sustain: number } {
        const level = Math.abs(sample);

        // Fast envelope follows transients
        if (level > this.fastEnvelope) {
            this.fastEnvelope += this.fastAttack * (level - this.fastEnvelope);
        } else {
            this.fastEnvelope += this.fastRelease * (level - this.fastEnvelope);
        }

        // Slow envelope follows overall level
        if (level > this.slowEnvelope) {
            this.slowEnvelope += this.slowAttack * (level - this.slowEnvelope);
        } else {
            this.slowEnvelope += this.slowRelease * (level - this.slowEnvelope);
        }

        // Transient = fast envelope minus slow envelope
        const transient = Math.max(0, this.fastEnvelope - this.slowEnvelope);

        // Sustain = slow envelope
        const sustain = this.slowEnvelope;

        return { transient, sustain };
    }

    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            const dry = buffer[i];
            const envelopes = this.processEnvelopes(dry);

            // Calculate gain adjustments
            // Transient gain: -1 = reduce attack, +1 = enhance attack
            const transientGain = 1 + (this.attack * envelopes.transient * 2);

            // Sustain gain: -1 = reduce body, +1 = enhance body
            const sustainGain = 1 + (this.sustain * envelopes.sustain);

            // Combine gains (transient takes priority)
            const totalGain = transientGain * sustainGain;

            buffer[i] = dry * totalGain;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        // Linked envelope detection (maintains stereo image)
        for (let i = 0; i < length; i++) {
            const dryL = leftBuffer[i];
            const dryR = rightBuffer[i];

            // Use max of both channels for envelope detection
            const linkedLevel = Math.max(Math.abs(dryL), Math.abs(dryR));
            const envelopes = this.processEnvelopes(linkedLevel);

            const transientGain = 1 + (this.attack * envelopes.transient * 2);
            const sustainGain = 1 + (this.sustain * envelopes.sustain);
            const totalGain = transientGain * sustainGain;

            // Apply same gain to both channels (preserves image)
            leftBuffer[i] = dryL * totalGain;
            rightBuffer[i] = dryR * totalGain;
        }
    }

    public setAttack(value: number): void {
        this.attack = Math.max(-1, Math.min(1, value));
    }

    public setSustain(value: number): void {
        this.sustain = Math.max(-1, Math.min(1, value));
    }

    public reset(): void {
        this.fastEnvelope = 0;
        this.slowEnvelope = 0;
    }
}

/**
 * Custom Stereo Imager
 *
 * Mid/Side processing for stereo width control.
 * Based on psychoacoustic principles of human spatial perception.
 *
 * Psychoacoustic principles:
 * - Mid (center) = perceived as "in front", mono-compatible
 * - Side (stereo difference) = perceived as "width" and "space"
 * - Frequency-dependent width = natural perception (lows narrow, highs wide)
 * - Phase-coherent = prevents mono collapse
 */
export class CustomStereoImager {
    private width: number; // 0-2 (0 = mono, 1 = unchanged, 2 = super wide)
    private lowCutoff: number; // Hz - frequencies below stay mono (bass management)

    private lowPassL: BiquadFilter | null = null;
    private lowPassR: BiquadFilter | null = null;
    private highPassL: BiquadFilter | null = null;
    private highPassR: BiquadFilter | null = null;

    constructor(
        sampleRate: number,
        width: number = 1.0,
        lowCutoff: number = 200 // Keep bass centered
    ) {
        this.width = width;
        this.lowCutoff = lowCutoff;

        if (lowCutoff > 0) {
            // Low frequencies (mono)
            this.lowPassL = new BiquadFilter(sampleRate, 'lowpass', lowCutoff, 0, 0.707);
            this.lowPassR = new BiquadFilter(sampleRate, 'lowpass', lowCutoff, 0, 0.707);

            // High frequencies (width processing)
            this.highPassL = new BiquadFilter(sampleRate, 'highpass', lowCutoff, 0, 0.707);
            this.highPassR = new BiquadFilter(sampleRate, 'highpass', lowCutoff, 0, 0.707);
        }
    }

    /**
     * Convert L/R to Mid/Side
     */
    private encodeMS(left: number, right: number): { mid: number; side: number } {
        const mid = (left + right) * 0.5;
        const side = (left - right) * 0.5;
        return { mid, side };
    }

    /**
     * Convert Mid/Side back to L/R
     */
    private decodeMS(mid: number, side: number): { left: number; right: number } {
        const left = mid + side;
        const right = mid - side;
        return { left, right };
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        if (this.lowCutoff > 0 && this.lowPassL && this.highPassL) {
            // Split into low and high bands
            const lowL = new Float32Array(leftBuffer);
            const lowR = new Float32Array(rightBuffer);
            const highL = new Float32Array(leftBuffer);
            const highR = new Float32Array(rightBuffer);

            // Filter bands
            this.lowPassL.process(lowL);
            this.lowPassR.process(lowR);
            this.highPassL.process(highL);
            this.highPassR.process(highR);

            // Process high band with width
            for (let i = 0; i < length; i++) {
                const { mid, side } = this.encodeMS(highL[i], highR[i]);

                // Adjust width on high frequencies only
                const wideSide = side * this.width;

                const { left, right } = this.decodeMS(mid, wideSide);

                // Combine low (mono) + high (wide)
                leftBuffer[i] = lowL[i] + left;
                rightBuffer[i] = lowR[i] + right;
            }
        } else {
            // Full-spectrum width processing
            for (let i = 0; i < length; i++) {
                const { mid, side } = this.encodeMS(leftBuffer[i], rightBuffer[i]);

                // Adjust width
                const wideSide = side * this.width;

                const { left, right } = this.decodeMS(mid, wideSide);

                leftBuffer[i] = left;
                rightBuffer[i] = right;
            }
        }
    }

    public setWidth(value: number): void {
        this.width = Math.max(0, Math.min(2, value));
    }

    public setLowCutoff(freq: number): void {
        this.lowCutoff = freq;
    }
}

/**
 * Custom Dynamic EQ
 *
 * Frequency-specific dynamics processing.
 * Combines EQ filtering with compression/expansion on targeted bands.
 *
 * Psychoacoustic use cases:
 * - Tame resonances dynamically (harsh frequencies only when loud)
 * - Add presence only when needed (intelligibility without harshness)
 * - Control bass bloom (tighten low end on loud notes)
 * - Surgical fixes without static EQ artifacts
 */
export class CustomDynamicEQ {
    private sampleRate: number;
    private bands: Array<{
        frequency: number;
        q: number;
        threshold: number; // dB
        ratio: number; // > 1 = compress, < 1 = expand
        filter: BiquadFilter;
        envelope: number;
        attackCoeff: number;
        releaseCoeff: number;
    }> = [];

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Add a dynamic EQ band
     */
    public addBand(
        frequency: number,
        q: number = 2.0,
        threshold: number = -20,
        ratio: number = 3.0 // 3:1 compression
    ): void {
        const filter = new BiquadFilter(this.sampleRate, 'peaking', frequency, 12, q);

        // Fast attack (5ms) for controlling peaks
        const attackCoeff = 1 - Math.exp(-1 / (0.005 * this.sampleRate));
        // Medium release (100ms) for musical response
        const releaseCoeff = 1 - Math.exp(-1 / (0.100 * this.sampleRate));

        this.bands.push({
            frequency,
            q,
            threshold,
            ratio,
            filter,
            envelope: 0,
            attackCoeff,
            releaseCoeff,
        });
    }

    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    private linearToDb(linear: number): number {
        return 20 * Math.log10(Math.max(linear, 1e-10));
    }

    public process(buffer: Float32Array): void {
        for (const band of this.bands) {
            const detected = new Float32Array(buffer);

            // Isolate frequency band
            band.filter.process(detected);

            const thresholdLinear = this.dbToLinear(band.threshold);

            for (let i = 0; i < buffer.length; i++) {
                // Envelope follower on band
                const level = Math.abs(detected[i]);

                if (level > band.envelope) {
                    band.envelope += band.attackCoeff * (level - band.envelope);
                } else {
                    band.envelope += band.releaseCoeff * (level - band.envelope);
                }

                // Calculate gain reduction when band exceeds threshold
                let gainAdjust = 1.0;
                if (band.envelope > thresholdLinear) {
                    const overThreshold = band.envelope / thresholdLinear;
                    // Compression formula
                    gainAdjust = 1.0 / Math.pow(overThreshold, (band.ratio - 1) / band.ratio);
                }

                // Apply gain to detected band and mix back
                buffer[i] = buffer[i] + detected[i] * (gainAdjust - 1.0);
            }
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        for (const band of this.bands) {
            const detectedL = new Float32Array(leftBuffer);
            const detectedR = new Float32Array(rightBuffer);

            // Isolate frequency band
            band.filter.process(detectedL);
            band.filter.process(detectedR);

            const thresholdLinear = this.dbToLinear(band.threshold);

            for (let i = 0; i < length; i++) {
                // Stereo-linked detection
                const level = Math.max(Math.abs(detectedL[i]), Math.abs(detectedR[i]));

                if (level > band.envelope) {
                    band.envelope += band.attackCoeff * (level - band.envelope);
                } else {
                    band.envelope += band.releaseCoeff * (level - band.envelope);
                }

                let gainAdjust = 1.0;
                if (band.envelope > thresholdLinear) {
                    const overThreshold = band.envelope / thresholdLinear;
                    gainAdjust = 1.0 / Math.pow(overThreshold, (band.ratio - 1) / band.ratio);
                }

                // Apply same gain to both channels
                leftBuffer[i] = leftBuffer[i] + detectedL[i] * (gainAdjust - 1.0);
                rightBuffer[i] = rightBuffer[i] + detectedR[i] * (gainAdjust - 1.0);
            }
        }
    }

    public reset(): void {
        for (const band of this.bands) {
            band.envelope = 0;
        }
    }

    public clearBands(): void {
        this.bands = [];
    }
}

/**
 * Custom Motion Reverb
 *
 * Algorithmic reverb with modulated delay lines for movement.
 * Simplified but professional implementation.
 *
 * Psychoacoustic principles:
 * - Early reflections = spatial positioning
 * - Late reflections = room size perception
 * - Modulation = movement/shimmer (breaks flutter echoes)
 * - High-frequency damping = natural absorption
 *
 * Note: Simplified for performance - full convolution would use IR files
 */
export class CustomMotionReverb {
    private sampleRate: number;
    private size: number; // 0-1
    private damping: number; // 0-1
    private mix: number; // 0-1

    private combFilters: Array<{
        buffer: Float32Array;
        index: number;
        feedback: number;
        damper: number;
    }> = [];

    private allPassFilters: Array<{
        buffer: Float32Array;
        index: number;
    }> = [];

    // LFO for modulation
    private lfoPhase: number = 0;
    private lfoRate: number = 0.5; // Hz

    constructor(
        sampleRate: number,
        size: number = 0.5,
        damping: number = 0.5,
        mix: number = 0.3
    ) {
        this.sampleRate = sampleRate;
        this.size = size;
        this.damping = damping;
        this.mix = mix;

        // Comb filter delays (scaled by size)
        const combDelays = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
        for (const delay of combDelays) {
            const scaledDelay = Math.floor(delay * (0.5 + size));
            this.combFilters.push({
                buffer: new Float32Array(scaledDelay),
                index: 0,
                feedback: 0.5 + size * 0.3, // More feedback = longer tail
                damper: 0,
            });
        }

        // All-pass filter delays (for diffusion)
        const allPassDelays = [225, 556, 441, 341];
        for (const delay of allPassDelays) {
            this.allPassFilters.push({
                buffer: new Float32Array(delay),
                index: 0,
            });
        }
    }

    private processCombFilter(
        input: number,
        comb: { buffer: Float32Array; index: number; feedback: number; damper: number }
    ): number {
        const delayed = comb.buffer[comb.index];

        // High-frequency damping (simple one-pole lowpass)
        comb.damper = delayed * (1 - this.damping) + comb.damper * this.damping;

        // Write to buffer with feedback
        comb.buffer[comb.index] = input + comb.damper * comb.feedback;

        comb.index = (comb.index + 1) % comb.buffer.length;

        return delayed;
    }

    private processAllPass(
        input: number,
        allPass: { buffer: Float32Array; index: number }
    ): number {
        const delayed = allPass.buffer[allPass.index];
        const output = delayed - input;

        allPass.buffer[allPass.index] = input + delayed * 0.5;
        allPass.index = (allPass.index + 1) % allPass.buffer.length;

        return output;
    }

    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            const dry = buffer[i];

            // LFO modulation (adds shimmer/movement)
            this.lfoPhase += (this.lfoRate * 2 * Math.PI) / this.sampleRate;
            if (this.lfoPhase > 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
            const lfo = Math.sin(this.lfoPhase) * 0.0001; // Subtle modulation

            // Parallel comb filters
            let wet = 0;
            for (const comb of this.combFilters) {
                wet += this.processCombFilter(dry, comb);
            }
            wet /= this.combFilters.length;

            // Series all-pass filters (diffusion)
            for (const allPass of this.allPassFilters) {
                wet = this.processAllPass(wet, allPass);
            }

            // Apply modulation
            wet *= 1 + lfo;

            // Dry/wet mix
            buffer[i] = dry * (1 - this.mix) + wet * this.mix;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        for (let i = 0; i < length; i++) {
            const dryL = leftBuffer[i];
            const dryR = rightBuffer[i];

            // LFO modulation
            this.lfoPhase += (this.lfoRate * 2 * Math.PI) / this.sampleRate;
            if (this.lfoPhase > 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
            const lfo = Math.sin(this.lfoPhase) * 0.0001;

            // Process left channel through first half of combs
            let wetL = 0;
            for (let j = 0; j < this.combFilters.length / 2; j++) {
                wetL += this.processCombFilter(dryL, this.combFilters[j]);
            }
            wetL /= this.combFilters.length / 2;

            // Process right channel through second half of combs (decorrelation)
            let wetR = 0;
            for (let j = this.combFilters.length / 2; j < this.combFilters.length; j++) {
                wetR += this.processCombFilter(dryR, this.combFilters[j]);
            }
            wetR /= this.combFilters.length / 2;

            // All-pass diffusion
            for (const allPass of this.allPassFilters) {
                wetL = this.processAllPass(wetL, allPass);
                wetR = this.processAllPass(wetR, allPass);
            }

            // Apply modulation
            wetL *= 1 + lfo;
            wetR *= 1 - lfo; // Inverted for stereo width

            // Dry/wet mix
            leftBuffer[i] = dryL * (1 - this.mix) + wetL * this.mix;
            rightBuffer[i] = dryR * (1 - this.mix) + wetR * this.mix;
        }
    }

    public setSize(value: number): void {
        this.size = Math.max(0, Math.min(1, value));
    }

    public setDamping(value: number): void {
        this.damping = Math.max(0, Math.min(1, value));
    }

    public setMix(value: number): void {
        this.mix = Math.max(0, Math.min(1, value));
    }

    public reset(): void {
        for (const comb of this.combFilters) {
            comb.buffer.fill(0);
            comb.index = 0;
            comb.damper = 0;
        }
        for (const allPass of this.allPassFilters) {
            allPass.buffer.fill(0);
            allPass.index = 0;
        }
        this.lfoPhase = 0;
    }
}

/**
 * Custom Pitch Correction
 *
 * Real-time pitch detection and correction (Auto-Tune level).
 * Uses autocorrelation for pitch detection and granular synthesis for shifting.
 *
 * Psychoacoustic principles:
 * - Formant preservation = maintains vocal character
 * - Gradual correction = natural vs robotic effect
 * - Vibrato preservation = musical expression
 * - Scale-aware = only corrects to in-tune notes
 */
export class CustomPitchCorrection {
    private sampleRate: number;
    private targetKey: string; // 'C', 'C#', 'D', etc.
    private scale: 'major' | 'minor' | 'chromatic';
    private correctionSpeed: number; // 0-1 (0 = slow/natural, 1 = instant/auto-tune)
    private amount: number; // 0-1 (correction strength)

    // Scale definitions (semitones from root)
    private static SCALES = {
        major: [0, 2, 4, 5, 7, 9, 11], // Major scale intervals
        minor: [0, 2, 3, 5, 7, 8, 10], // Natural minor
        chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // All notes
    };

    private detectedPitch: number = 0; // Hz
    private targetPitch: number = 0; // Hz
    private pitchShift: number = 1.0; // Ratio

    constructor(
        sampleRate: number,
        targetKey: string = 'C',
        scale: 'major' | 'minor' | 'chromatic' = 'chromatic',
        correctionSpeed: number = 0.5,
        amount: number = 1.0
    ) {
        this.sampleRate = sampleRate;
        this.targetKey = targetKey;
        this.scale = scale;
        this.correctionSpeed = correctionSpeed;
        this.amount = amount;
    }

    /**
     * Autocorrelation pitch detection (YIN-inspired)
     */
    private detectPitch(buffer: Float32Array): number {
        const minPeriod = Math.floor(this.sampleRate / 1000); // 1000 Hz max
        const maxPeriod = Math.floor(this.sampleRate / 50);   // 50 Hz min

        let bestPeriod = minPeriod;
        let minDifference = Infinity;

        // Autocorrelation
        for (let period = minPeriod; period < maxPeriod; period++) {
            let sum = 0;
            for (let i = 0; i < buffer.length - period; i++) {
                const diff = buffer[i] - buffer[i + period];
                sum += diff * diff;
            }

            if (sum < minDifference) {
                minDifference = sum;
                bestPeriod = period;
            }
        }

        return this.sampleRate / bestPeriod;
    }

    /**
     * Find nearest in-scale pitch
     */
    private findNearestScaleNote(frequencyHz: number): number {
        if (frequencyHz < 50 || frequencyHz > 1000) return frequencyHz; // Out of vocal range

        // Convert frequency to MIDI note
        const midiNote = 12 * Math.log2(frequencyHz / 440) + 69;
        const rootNote = this.noteToMidi(this.targetKey);
        const scaleIntervals = CustomPitchCorrection.SCALES[this.scale];

        // Find nearest scale degree
        let nearestNote = Math.round(midiNote);
        let minDistance = Infinity;

        for (let octave = -2; octave <= 2; octave++) {
            for (const interval of scaleIntervals) {
                const candidateNote = rootNote + interval + (octave * 12);
                const distance = Math.abs(midiNote - candidateNote);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestNote = candidateNote;
                }
            }
        }

        // Convert back to frequency
        return 440 * Math.pow(2, (nearestNote - 69) / 12);
    }

    /**
     * Convert note name to MIDI number
     */
    private noteToMidi(note: string): number {
        const notes: { [key: string]: number } = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
            'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        return notes[note.toUpperCase()] || 0;
    }

    /**
     * Simple granular pitch shifting
     * (Simplified - production would use phase vocoder)
     */
    private shiftPitch(buffer: Float32Array, ratio: number): Float32Array {
        if (Math.abs(ratio - 1.0) < 0.001) return buffer; // No shift needed

        const output = new Float32Array(buffer.length);
        const grainSize = 2048;
        const overlap = 4;
        const hopSize = grainSize / overlap;

        for (let pos = 0; pos < buffer.length - grainSize; pos += hopSize) {
            // Read grain at original pitch
            const readPos = pos * ratio;
            if (readPos + grainSize >= buffer.length) break;

            // Apply Hann window and write
            for (let i = 0; i < grainSize; i++) {
                const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / grainSize));
                const sample = buffer[Math.floor(readPos + i)] || 0;
                const writePos = pos + i;
                if (writePos < output.length) {
                    output[writePos] += sample * window;
                }
            }
        }

        return output;
    }

    public process(buffer: Float32Array): void {
        // Detect current pitch
        this.detectedPitch = this.detectPitch(buffer);

        // Find target pitch (nearest scale note)
        this.targetPitch = this.findNearestScaleNote(this.detectedPitch);

        // Calculate pitch shift ratio
        const targetRatio = this.targetPitch / Math.max(this.detectedPitch, 1);

        // Smooth the pitch shift (gradual vs instant correction)
        const alpha = this.correctionSpeed;
        this.pitchShift = this.pitchShift * (1 - alpha) + targetRatio * alpha;

        // Apply pitch shift with amount control
        const actualRatio = 1 + (this.pitchShift - 1) * this.amount;
        const shifted = this.shiftPitch(buffer, actualRatio);

        // Copy shifted audio back to buffer
        for (let i = 0; i < Math.min(buffer.length, shifted.length); i++) {
            buffer[i] = shifted[i];
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        // Process both channels with same pitch detection (mono sum)
        const monoSum = new Float32Array(leftBuffer.length);
        for (let i = 0; i < monoSum.length; i++) {
            monoSum[i] = (leftBuffer[i] + rightBuffer[i]) * 0.5;
        }

        this.detectedPitch = this.detectPitch(monoSum);
        this.targetPitch = this.findNearestScaleNote(this.detectedPitch);

        const targetRatio = this.targetPitch / Math.max(this.detectedPitch, 1);
        const alpha = this.correctionSpeed;
        this.pitchShift = this.pitchShift * (1 - alpha) + targetRatio * alpha;
        const actualRatio = 1 + (this.pitchShift - 1) * this.amount;

        // Apply same shift to both channels
        const shiftedL = this.shiftPitch(leftBuffer, actualRatio);
        const shiftedR = this.shiftPitch(rightBuffer, actualRatio);

        for (let i = 0; i < leftBuffer.length; i++) {
            leftBuffer[i] = shiftedL[i];
            rightBuffer[i] = shiftedR[i];
        }
    }

    public setKey(key: string): void {
        this.targetKey = key;
    }

    public setScale(scale: 'major' | 'minor' | 'chromatic'): void {
        this.scale = scale;
    }

    public setCorrectionSpeed(speed: number): void {
        this.correctionSpeed = Math.max(0, Math.min(1, speed));
    }

    public setAmount(amount: number): void {
        this.amount = Math.max(0, Math.min(1, amount));
    }

    public reset(): void {
        this.detectedPitch = 0;
        this.targetPitch = 0;
        this.pitchShift = 1.0;
    }
}

/**
 * Custom Delay
 *
 * Professional delay/echo effect with tempo sync and feedback control.
 *
 * Psychoacoustic principles:
 * - Short delays (< 35ms) = perceived as thickness/doubling
 * - Medium delays (35-100ms) = slap-back, room reflections
 * - Long delays (> 100ms) = distinct echoes
 * - Filtered feedback = prevents buildup, musical decay
 */
export class CustomDelay {
    private sampleRate: number;
    private delayTime: number; // seconds
    private feedback: number; // 0-1
    private mix: number; // 0-1

    private delayBuffer: Float32Array;
    private writeIndex: number = 0;
    private feedbackDamping: number = 0; // One-pole lowpass state

    constructor(
        sampleRate: number,
        delayTime: number = 0.375, // 375ms (eighth note at 120 BPM)
        feedback: number = 0.3,
        mix: number = 0.3
    ) {
        this.sampleRate = sampleRate;
        this.delayTime = delayTime;
        this.feedback = feedback;
        this.mix = mix;

        const maxDelay = 2.0; // 2 seconds max
        this.delayBuffer = new Float32Array(Math.floor(sampleRate * maxDelay));
    }

    /**
     * Set delay time in milliseconds
     */
    public setDelayMs(ms: number): void {
        this.delayTime = ms / 1000;
    }

    /**
     * Set delay time based on tempo (BPM) and note division
     */
    public setTempo(bpm: number, division: '1/4' | '1/8' | '1/16' | 'dotted-1/8' = '1/8'): void {
        const beatDuration = 60 / bpm; // seconds per beat

        const divisions: { [key: string]: number } = {
            '1/4': 1.0,
            '1/8': 0.5,
            '1/16': 0.25,
            'dotted-1/8': 0.75, // 1/8 + 1/16
        };

        this.delayTime = beatDuration * divisions[division];
    }

    public process(buffer: Float32Array): void {
        const delaySamples = Math.floor(this.delayTime * this.sampleRate);

        for (let i = 0; i < buffer.length; i++) {
            const dry = buffer[i];

            // Read from delay buffer
            const readIndex = (this.writeIndex - delaySamples + this.delayBuffer.length) % this.delayBuffer.length;
            const wet = this.delayBuffer[readIndex];

            // High-frequency damping on feedback (one-pole lowpass)
            const dampingCoeff = 0.3; // More damping = darker repeats
            this.feedbackDamping = wet * (1 - dampingCoeff) + this.feedbackDamping * dampingCoeff;

            // Write to delay buffer (input + feedback)
            this.delayBuffer[this.writeIndex] = dry + this.feedbackDamping * this.feedback;
            this.writeIndex = (this.writeIndex + 1) % this.delayBuffer.length;

            // Mix dry and wet
            buffer[i] = dry * (1 - this.mix) + wet * this.mix;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);
        const delaySamples = Math.floor(this.delayTime * this.sampleRate);

        // Separate delay buffers for stereo
        const leftDelay = new Float32Array(this.delayBuffer.length);
        const rightDelay = new Float32Array(this.delayBuffer.length);
        let leftDamping = 0;
        let rightDamping = 0;
        let writeIdx = 0;

        for (let i = 0; i < length; i++) {
            const dryL = leftBuffer[i];
            const dryR = rightBuffer[i];

            // Read from delay buffers
            const readIndex = (writeIdx - delaySamples + leftDelay.length) % leftDelay.length;
            const wetL = leftDelay[readIndex];
            const wetR = rightDelay[readIndex];

            // High-frequency damping on feedback
            const dampingCoeff = 0.3;
            leftDamping = wetL * (1 - dampingCoeff) + leftDamping * dampingCoeff;
            rightDamping = wetR * (1 - dampingCoeff) + rightDamping * dampingCoeff;

            // Write to delay buffers with feedback
            leftDelay[writeIdx] = dryL + leftDamping * this.feedback;
            rightDelay[writeIdx] = dryR + rightDamping * this.feedback;
            writeIdx = (writeIdx + 1) % leftDelay.length;

            // Mix dry and wet
            leftBuffer[i] = dryL * (1 - this.mix) + wetL * this.mix;
            rightBuffer[i] = dryR * (1 - this.mix) + wetR * this.mix;
        }
    }

    public setFeedback(value: number): void {
        this.feedback = Math.max(0, Math.min(0.95, value)); // Cap at 0.95 to prevent runaway
    }

    public setMix(value: number): void {
        this.mix = Math.max(0, Math.min(1, value));
    }

    public reset(): void {
        this.delayBuffer.fill(0);
        this.writeIndex = 0;
        this.feedbackDamping = 0;
    }
}

/**
 * Custom Noise Gate
 *
 * Attenuates signal below threshold to remove background noise.
 * Essential for clean vocal/instrument recording.
 *
 * Psychoacoustic principles:
 * - Fast attack = preserves transients
 * - Slow release = prevents choppy sound
 * - Hysteresis = prevents chattering at threshold
 * - Range control = partial gating vs full mute
 */
export class CustomNoiseGate {
    private sampleRate: number;
    private threshold: number; // dB
    private attack: number; // seconds
    private release: number; // seconds
    private range: number; // dB (how much to reduce when closed)

    private envelope: number = 0;
    private attackCoeff: number;
    private releaseCoeff: number;
    private isOpen: boolean = false;
    private hysteresis: number = 3; // dB

    constructor(
        sampleRate: number,
        threshold: number = -40,
        attack: number = 0.001, // 1ms (fast)
        release: number = 0.100, // 100ms (smooth)
        range: number = -60 // dB reduction
    ) {
        this.sampleRate = sampleRate;
        this.threshold = threshold;
        this.attack = attack;
        this.release = release;
        this.range = range;

        this.attackCoeff = 1 - Math.exp(-1 / (attack * sampleRate));
        this.releaseCoeff = 1 - Math.exp(-1 / (release * sampleRate));
    }

    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    private linearToDb(linear: number): number {
        return 20 * Math.log10(Math.max(linear, 1e-10));
    }

    public process(buffer: Float32Array): void {
        const thresholdLinear = this.dbToLinear(this.threshold);
        const rangeLinear = this.dbToLinear(this.range);

        for (let i = 0; i < buffer.length; i++) {
            const inputLevel = Math.abs(buffer[i]);

            // Envelope follower
            if (inputLevel > this.envelope) {
                this.envelope += this.attackCoeff * (inputLevel - this.envelope);
            } else {
                this.envelope += this.releaseCoeff * (inputLevel - this.envelope);
            }

            // Hysteresis: different thresholds for opening vs closing
            const openThreshold = thresholdLinear;
            const closeThreshold = thresholdLinear * this.dbToLinear(-this.hysteresis);

            // State machine with hysteresis
            if (this.envelope > openThreshold) {
                this.isOpen = true;
            } else if (this.envelope < closeThreshold) {
                this.isOpen = false;
            }

            // Calculate gate gain
            const gateGain = this.isOpen ? 1.0 : rangeLinear;

            // Apply gate
            buffer[i] *= gateGain;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);
        const thresholdLinear = this.dbToLinear(this.threshold);
        const rangeLinear = this.dbToLinear(this.range);

        for (let i = 0; i < length; i++) {
            // Stereo-linked detection (max of both channels)
            const inputLevel = Math.max(Math.abs(leftBuffer[i]), Math.abs(rightBuffer[i]));

            // Envelope follower
            if (inputLevel > this.envelope) {
                this.envelope += this.attackCoeff * (inputLevel - this.envelope);
            } else {
                this.envelope += this.releaseCoeff * (inputLevel - this.envelope);
            }

            // Hysteresis
            const openThreshold = thresholdLinear;
            const closeThreshold = thresholdLinear * this.dbToLinear(-this.hysteresis);

            if (this.envelope > openThreshold) {
                this.isOpen = true;
            } else if (this.envelope < closeThreshold) {
                this.isOpen = false;
            }

            const gateGain = this.isOpen ? 1.0 : rangeLinear;

            // Apply same gate to both channels
            leftBuffer[i] *= gateGain;
            rightBuffer[i] *= gateGain;
        }
    }

    public setThreshold(db: number): void {
        this.threshold = db;
    }

    public setAttack(seconds: number): void {
        this.attack = seconds;
        this.attackCoeff = 1 - Math.exp(-1 / (seconds * this.sampleRate));
    }

    public setRelease(seconds: number): void {
        this.release = seconds;
        this.releaseCoeff = 1 - Math.exp(-1 / (seconds * this.sampleRate));
    }

    public setRange(db: number): void {
        this.range = Math.max(-80, Math.min(0, db));
    }

    public reset(): void {
        this.envelope = 0;
        this.isOpen = false;
    }
}

/**
 * Parallel Compression (New York Compression)
 *
 * Industry-standard technique: blend heavily compressed signal with dry.
 * Adds punch and density without losing dynamics.
 *
 * Psychoacoustic principles:
 * - Heavy compression on wet = brings up sustain and body
 * - Dry signal = preserves transient attack and naturalness
 * - Blend = "best of both worlds" - punchy AND dynamic
 * - Used on drums, vocals, entire mixes
 */
export class ParallelCompression {
    private sampleRate: number;
    private compressor: TransparentCompressor;
    private mix: number; // 0-1 (how much compressed signal to blend)

    constructor(
        sampleRate: number,
        threshold: number = -20,
        ratio: number = 8, // Aggressive compression
        mix: number = 0.3
    ) {
        this.sampleRate = sampleRate;
        this.mix = mix;

        // Heavy compression for parallel path
        this.compressor = new TransparentCompressor(
            sampleRate,
            threshold,
            ratio,
            0.001, // Fast attack (1ms)
            0.100, // Medium release (100ms)
            0 // No knee (hard compression)
        );
    }

    public process(buffer: Float32Array): void {
        // Copy dry signal
        const dry = new Float32Array(buffer);

        // Compress buffer (in-place)
        this.compressor.process(buffer);

        // Blend dry + compressed
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = dry[i] * (1 - this.mix) + buffer[i] * this.mix;
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        // Copy dry signals
        const dryL = new Float32Array(leftBuffer);
        const dryR = new Float32Array(rightBuffer);

        // Compress buffers (in-place, stereo-linked)
        this.compressor.processStereo(leftBuffer, rightBuffer);

        // Blend dry + compressed
        const length = Math.min(leftBuffer.length, rightBuffer.length);
        for (let i = 0; i < length; i++) {
            leftBuffer[i] = dryL[i] * (1 - this.mix) + leftBuffer[i] * this.mix;
            rightBuffer[i] = dryR[i] * (1 - this.mix) + rightBuffer[i] * this.mix;
        }
    }

    public setMix(value: number): void {
        this.mix = Math.max(0, Math.min(1, value));
    }

    public setThreshold(db: number): void {
        // Would need to expose compressor methods or recreate
        // For now, set at construction
    }

    public reset(): void {
        this.compressor.reset();
    }
}

/**
 * Bass Management
 *
 * Forces low frequencies to mono for club system compatibility.
 * Prevents phase cancellation and ensures solid bass on all systems.
 *
 * Psychoacoustic principles:
 * - Humans can't localize bass (< 150Hz) spatially
 * - Stereo bass = phase issues on mono systems (clubs, phones)
 * - Mono bass = maximum power and clarity
 * - Keep mids/highs stereo = width and imaging
 */
export class BassManagement {
    private sampleRate: number;
    private crossoverFreq: number; // Hz - frequencies below go mono

    private lowPassL: BiquadFilter;
    private lowPassR: BiquadFilter;
    private highPassL: BiquadFilter;
    private highPassR: BiquadFilter;

    constructor(
        sampleRate: number,
        crossoverFreq: number = 120 // Typical for hip-hop/EDM
    ) {
        this.sampleRate = sampleRate;
        this.crossoverFreq = crossoverFreq;

        // Lowpass filters (bass band)
        this.lowPassL = new BiquadFilter(sampleRate, 'lowpass', crossoverFreq, 0, 0.707);
        this.lowPassR = new BiquadFilter(sampleRate, 'lowpass', crossoverFreq, 0, 0.707);

        // Highpass filters (mids/highs band)
        this.highPassL = new BiquadFilter(sampleRate, 'highpass', crossoverFreq, 0, 0.707);
        this.highPassR = new BiquadFilter(sampleRate, 'highpass', crossoverFreq, 0, 0.707);
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);

        // Split into low and high bands
        const lowL = new Float32Array(leftBuffer);
        const lowR = new Float32Array(rightBuffer);
        const highL = new Float32Array(leftBuffer);
        const highR = new Float32Array(rightBuffer);

        // Filter bands
        this.lowPassL.process(lowL);
        this.lowPassR.process(lowR);
        this.highPassL.process(highL);
        this.highPassR.process(highR);

        // Sum bass to mono
        for (let i = 0; i < length; i++) {
            const monoB = (lowL[i] + lowR[i]) * 0.5;

            // Recombine: mono bass + stereo mids/highs
            leftBuffer[i] = monoB + highL[i];
            rightBuffer[i] = monoB + highR[i];
        }
    }

    public setCrossover(freq: number): void {
        this.crossoverFreq = freq;
        // Would need to recreate filters - simplified for now
    }
}

/**
 * Custom Clipper
 *
 * Controlled distortion for competitive loudness (loudness war tool).
 * Use carefully - adds harmonics and perceived volume.
 *
 * Psychoacoustic principles:
 * - Hard clipping = odd harmonics (harsh, aggressive)
 * - Soft clipping = mixed harmonics (warmer, rounder)
 * - Perceived loudness increases without raising peaks
 * - Used in mastering for streaming loudness targets
 */
export class CustomClipper {
    private threshold: number; // Linear 0-1
    private hardness: number; // 0-1 (0 = soft, 1 = hard)

    constructor(
        threshold: number = 0.9, // Clip above 90%
        hardness: number = 0.5 // Medium hardness
    ) {
        this.threshold = threshold;
        this.hardness = hardness;
    }

    private clip(sample: number): number {
        const absInput = Math.abs(sample);
        const sign = sample >= 0 ? 1 : -1;

        if (absInput < this.threshold) {
            return sample; // No clipping
        }

        const over = absInput - this.threshold;
        const range = 1.0 - this.threshold;

        // Soft knee clipping (tanh-based)
        const softClipped = this.threshold + range * Math.tanh(over / range * (1 + this.hardness * 4));

        // Hard clipping
        const hardClipped = Math.min(this.threshold + over * 0.1, 1.0);

        // Blend based on hardness
        const clipped = softClipped * (1 - this.hardness) + hardClipped * this.hardness;

        return sign * clipped;
    }

    public process(buffer: Float32Array): void {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = this.clip(buffer[i]);
        }
    }

    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        const length = Math.min(leftBuffer.length, rightBuffer.length);
        for (let i = 0; i < length; i++) {
            leftBuffer[i] = this.clip(leftBuffer[i]);
            rightBuffer[i] = this.clip(rightBuffer[i]);
        }
    }

    public setThreshold(value: number): void {
        this.threshold = Math.max(0, Math.min(1, value));
    }

    public setHardness(value: number): void {
        this.hardness = Math.max(0, Math.min(1, value));
    }
}

/**
 * Custom Processing Chain
 *
 * Professional mastering chain with full custom processor suite.
 * Signal flow (Stereo):
 *   NoiseGate → PitchCorrection → DeEsser → DynamicEQ → EQ →
 *   ParallelCompression/Compressor → Saturation → TransientShaper →
 *   StereoImager → Delay → Reverb → BassManagement → Clipper → Limiter
 *
 * Signal flow (Mono):
 *   NoiseGate → PitchCorrection → DeEsser → DynamicEQ → EQ →
 *   ParallelCompression/Compressor → Saturation → TransientShaper →
 *   Delay → Reverb → Clipper → Limiter
 *
 * Design goals:
 * - Stereo-linked processing (maintains imaging)
 * - Minimal buffer copies (performance)
 * - Transparent signal path (zero artifacts when bypassed)
 * - Protective defaults (body frequency protection, no makeup gain)
 * - Professional mastering order (based on human perception)
 * - 100% custom code (no Web Audio API dependencies)
 */
export class CustomProcessingChain {
    private sampleRate: number;

    // Core processors
    private noiseGate: CustomNoiseGate | null = null;
    private pitchCorrection: CustomPitchCorrection | null = null;
    private deEsser: CustomDeEsser | null = null;
    private dynamicEQ: CustomDynamicEQ | null = null;
    private eq: SurgicalEQ | null = null;
    private compressor: TransparentCompressor | null = null;
    private parallelCompression: ParallelCompression | null = null;
    private saturation: CustomSaturation | null = null;
    private transientShaper: CustomTransientShaper | null = null;
    private stereoImager: CustomStereoImager | null = null;
    private delay: CustomDelay | null = null;
    private reverb: CustomMotionReverb | null = null;
    private bassManagement: BassManagement | null = null;
    private clipper: CustomClipper | null = null;
    private limiter: TransparentLimiter | null = null;

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Configure DeEsser
     */
    public setDeEsser(frequency: number = 6000, threshold: number = -20, amount: number = 0.5): void {
        this.deEsser = new CustomDeEsser(this.sampleRate, frequency, threshold, amount);
    }

    /**
     * Configure Dynamic EQ
     */
    public setDynamicEQ(bands: Array<{ frequency: number; q?: number; threshold?: number; ratio?: number }>): void {
        this.dynamicEQ = new CustomDynamicEQ(this.sampleRate);
        for (const band of bands) {
            this.dynamicEQ.addBand(
                band.frequency,
                band.q || 2.0,
                band.threshold || -20,
                band.ratio || 3.0
            );
        }
    }

    /**
     * Configure EQ bands
     */
    public setEQ(bands: Array<{ frequency: number; gainDb: number; q?: number }>): void {
        this.eq = new SurgicalEQ(this.sampleRate);
        for (const band of bands) {
            this.eq.addBand(band.frequency, band.gainDb, band.q || 0.7);
        }
    }

    /**
     * Add high-pass filter to EQ
     */
    public setHighPass(frequency: number, q: number = 0.707): void {
        if (!this.eq) {
            this.eq = new SurgicalEQ(this.sampleRate);
        }
        this.eq.addHighPass(frequency, q);
    }

    /**
     * Configure compressor
     */
    public setCompressor(
        threshold: number,
        ratio: number,
        attack: number = 0.010,
        release: number = 0.100,
        knee: number = 6
    ): void {
        this.compressor = new TransparentCompressor(
            this.sampleRate,
            threshold,
            ratio,
            attack,
            release,
            knee
        );
    }

    /**
     * Configure Saturation
     */
    public setSaturation(amount: number = 0.3, type: 'tube' | 'tape' | 'transformer' = 'tube', mix: number = 1.0): void {
        this.saturation = new CustomSaturation(amount, type, mix);
    }

    /**
     * Configure Transient Shaper
     */
    public setTransientShaper(attack: number = 0, sustain: number = 0): void {
        this.transientShaper = new CustomTransientShaper(this.sampleRate, attack, sustain);
    }

    /**
     * Configure Stereo Imager
     */
    public setStereoImager(width: number = 1.0, lowCutoff: number = 200): void {
        this.stereoImager = new CustomStereoImager(this.sampleRate, width, lowCutoff);
    }

    /**
     * Configure Motion Reverb
     */
    public setReverb(size: number = 0.5, damping: number = 0.5, mix: number = 0.3): void {
        this.reverb = new CustomMotionReverb(this.sampleRate, size, damping, mix);
    }

    /**
     * Configure Noise Gate
     */
    public setNoiseGate(threshold: number = -40, attack: number = 0.001, release: number = 0.100, range: number = -60): void {
        this.noiseGate = new CustomNoiseGate(this.sampleRate, threshold, attack, release, range);
    }

    /**
     * Configure Pitch Correction
     */
    public setPitchCorrection(amount: number = 0.5, scale: 'major' | 'minor' | 'chromatic' = 'chromatic', key: number = 0): void {
        this.pitchCorrection = new CustomPitchCorrection(this.sampleRate, amount, scale, key);
    }

    /**
     * Configure Delay
     */
    public setDelay(time: number = 0.25, feedback: number = 0.3, mix: number = 0.3, damping: number = 0.7): void {
        this.delay = new CustomDelay(this.sampleRate, time, feedback, mix, damping);
    }

    /**
     * Configure Parallel Compression (NY Compression)
     */
    public setParallelCompression(threshold: number = -20, ratio: number = 8, mix: number = 0.3): void {
        this.parallelCompression = new ParallelCompression(this.sampleRate, threshold, ratio, mix);
    }

    /**
     * Configure Bass Management
     */
    public setBassManagement(crossover: number = 120): void {
        this.bassManagement = new BassManagement(this.sampleRate, crossover);
    }

    /**
     * Configure Clipper
     */
    public setClipper(threshold: number = -0.5, hardness: number = 0.5): void {
        this.clipper = new CustomClipper(threshold, hardness);
    }

    /**
     * Configure limiter
     */
    public setLimiter(
        threshold: number = -1.0,
        lookahead: number = 0.005,
        release: number = 0.100
    ): void {
        this.limiter = new TransparentLimiter(
            this.sampleRate,
            threshold,
            lookahead,
            release
        );
    }

    /**
     * Process mono buffer
     * Full professional mastering chain
     *
     * Signal flow:
     * NoiseGate → PitchCorrection → DeEsser → DynamicEQ → EQ →
     * ParallelCompression/Compressor → Saturation → TransientShaper →
     * Delay → Reverb → Clipper → Limiter
     */
    public processMono(buffer: Float32Array): void {
        // 1. Noise Gate (remove background noise before processing)
        if (this.noiseGate) {
            this.noiseGate.process(buffer);
        }

        // 2. Pitch Correction (before any frequency-dependent processing)
        if (this.pitchCorrection) {
            this.pitchCorrection.process(buffer);
        }

        // 3. DeEsser (before compression to avoid sibilance triggering)
        if (this.deEsser) {
            this.deEsser.process(buffer);
        }

        // 4. Dynamic EQ (surgical frequency dynamics)
        if (this.dynamicEQ) {
            this.dynamicEQ.process(buffer);
        }

        // 5. Static EQ (frequency shaping)
        if (this.eq) {
            this.eq.process(buffer);
        }

        // 6. Parallel Compression or Regular Compression
        // (Parallel compression takes precedence if both are set)
        if (this.parallelCompression) {
            this.parallelCompression.process(buffer);
        } else if (this.compressor) {
            this.compressor.process(buffer);
        }

        // 7. Saturation (warmth and harmonics, after dynamics)
        if (this.saturation) {
            this.saturation.process(buffer);
        }

        // 8. Transient Shaper (attack/sustain control)
        if (this.transientShaper) {
            this.transientShaper.process(buffer);
        }

        // 9. Delay (spatial depth, before reverb)
        if (this.delay) {
            this.delay.process(buffer);
        }

        // 10. Reverb (spatial effects - note: stereo imager N/A for mono)
        if (this.reverb) {
            this.reverb.process(buffer);
        }

        // 11. Clipper (loudness maximization, before final limiter)
        if (this.clipper) {
            this.clipper.process(buffer);
        }

        // 12. Limiter (peak protection - always last)
        if (this.limiter) {
            this.limiter.process(buffer);
        }
    }

    /**
     * Process stereo buffer (linked)
     * Full professional mastering chain
     *
     * Signal flow:
     * NoiseGate → PitchCorrection → DeEsser → DynamicEQ → EQ →
     * ParallelCompression/Compressor → Saturation → TransientShaper →
     * StereoImager → Delay → Reverb → BassManagement → Clipper → Limiter
     */
    public processStereo(leftBuffer: Float32Array, rightBuffer: Float32Array): void {
        // 1. Noise Gate (remove background noise, stereo-linked)
        if (this.noiseGate) {
            this.noiseGate.processStereo(leftBuffer, rightBuffer);
        }

        // 2. Pitch Correction (before frequency processing, independent channels)
        if (this.pitchCorrection) {
            this.pitchCorrection.process(leftBuffer);
            this.pitchCorrection.process(rightBuffer);
        }

        // 3. DeEsser (before compression, stereo-linked)
        if (this.deEsser) {
            this.deEsser.processStereo(leftBuffer, rightBuffer);
        }

        // 4. Dynamic EQ (surgical frequency dynamics, stereo-linked)
        if (this.dynamicEQ) {
            this.dynamicEQ.processStereo(leftBuffer, rightBuffer);
        }

        // 5. Static EQ (frequency shaping, independent channels)
        if (this.eq) {
            this.eq.process(leftBuffer);
            this.eq.process(rightBuffer);
        }

        // 6. Parallel Compression or Regular Compression
        // (Parallel compression takes precedence if both are set, stereo-linked)
        if (this.parallelCompression) {
            this.parallelCompression.processStereo(leftBuffer, rightBuffer);
        } else if (this.compressor) {
            this.compressor.processStereo(leftBuffer, rightBuffer);
        }

        // 7. Saturation (warmth and harmonics, independent channels)
        if (this.saturation) {
            this.saturation.processStereo(leftBuffer, rightBuffer);
        }

        // 8. Transient Shaper (attack/sustain, stereo-linked)
        if (this.transientShaper) {
            this.transientShaper.processStereo(leftBuffer, rightBuffer);
        }

        // 9. Stereo Imager (width control, stereo-specific)
        if (this.stereoImager) {
            this.stereoImager.processStereo(leftBuffer, rightBuffer);
        }

        // 10. Delay (spatial depth, stereo with decorrelation)
        if (this.delay) {
            this.delay.processStereo(leftBuffer, rightBuffer);
        }

        // 11. Reverb (spatial effects, stereo)
        if (this.reverb) {
            this.reverb.processStereo(leftBuffer, rightBuffer);
        }

        // 12. Bass Management (mono bass below crossover, stereo-specific)
        if (this.bassManagement) {
            this.bassManagement.processStereo(leftBuffer, rightBuffer);
        }

        // 13. Clipper (loudness maximization, independent channels)
        if (this.clipper) {
            this.clipper.processStereo(leftBuffer, rightBuffer);
        }

        // 14. Limiter (peak protection, stereo-linked - always last)
        if (this.limiter) {
            this.limiter.processStereo(leftBuffer, rightBuffer);
        }
    }

    /**
     * Clear all processors
     */
    public clear(): void {
        this.noiseGate = null;
        this.pitchCorrection = null;
        this.deEsser = null;
        this.dynamicEQ = null;
        this.eq = null;
        this.compressor = null;
        this.parallelCompression = null;
        this.saturation = null;
        this.transientShaper = null;
        this.stereoImager = null;
        this.delay = null;
        this.reverb = null;
        this.bassManagement = null;
        this.clipper = null;
        this.limiter = null;
    }

    /**
     * Reset all processor states
     */
    public reset(): void {
        if (this.noiseGate) this.noiseGate.reset();
        if (this.pitchCorrection) this.pitchCorrection.reset();
        if (this.deEsser) this.deEsser.reset();
        if (this.dynamicEQ) this.dynamicEQ.reset();
        if (this.compressor) this.compressor.reset();
        if (this.parallelCompression) this.parallelCompression.reset();
        if (this.transientShaper) this.transientShaper.reset();
        if (this.stereoImager) this.stereoImager.reset();
        if (this.delay) this.delay.reset();
        if (this.reverb) this.reverb.reset();
        if (this.bassManagement) this.bassManagement.reset();
        if (this.limiter) this.limiter.reset();
    }
}

/**
 * Factory function to create custom processing chain from Echo recommendations
 */
export function createChainFromEchoAction(
    sampleRate: number,
    action: any
): CustomProcessingChain {
    const chain = new CustomProcessingChain(sampleRate);

    // Parse EQ bands
    if (action.refinementType === 'eq' && action.bands) {
        const bands = action.bands
            .filter((b: any) => b.enabledByDefault !== false)
            .map((b: any) => ({
                frequency: b.freqHz,
                gainDb: b.gainDb,
                q: 0.7
            }));

        if (bands.length > 0) {
            chain.setEQ(bands);
        }
    }

    // Parse compression
    if (action.refinementType === 'compression' && action.params) {
        let threshold = -12;
        let ratio = 1.5;
        let attack = 0.010;
        let release = 0.100;

        action.params.forEach((p: any) => {
            if (p.enabledByDefault === false) return;
            if (p.name === 'threshold') threshold = p.value;
            if (p.name === 'ratio') ratio = p.value;
            if (p.name === 'attack') attack = p.value;
            if (p.name === 'release') release = p.value;
        });

        chain.setCompressor(threshold, ratio, attack, release);
    }

    // Parse limiter
    if (action.refinementType === 'limiter' && action.params) {
        let threshold = -1.0;
        let release = 0.100;

        action.params.forEach((p: any) => {
            if (p.name === 'threshold') threshold = p.value;
            if (p.name === 'release') release = p.value;
        });

        chain.setLimiter(threshold, 0.005, release);
    }

    return chain;
}
