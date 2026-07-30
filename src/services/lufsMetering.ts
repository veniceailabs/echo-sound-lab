/**
 * LUFS (Loudness Units relative to Full Scale) Metering Service
 * Implements EBU R128 / ITU-R BS.1770 standard for broadcast-quality loudness measurement
 */

export interface LUFSMeasurement {
    integratedLUFS: number;      // Overall loudness of entire track
    shortTermLUFS: number;       // Rolling 3-second loudness
    momentaryLUFS: number;       // Rolling 400ms loudness
    loudnessRange: number;       // LRA - dynamic range in LU
    truePeak: number;            // True peak value in dBTP
    targetCompliance: {
        spotify: boolean;        // -14 LUFS ±1
        appleMusic: boolean;     // -16 LUFS ±1
        youtube: boolean;        // -13 to -15 LUFS
        tidal: boolean;          // -14 LUFS ±1
        broadcast: boolean;      // -23 LUFS (EBU R128)
    };
}

export interface StreamingTarget {
    name: string;
    targetLUFS: number;
    tolerance: number;
    maxTruePeak: number;
}

export const STREAMING_TARGETS: Record<string, StreamingTarget> = {
    spotify: { name: 'Spotify', targetLUFS: -14, tolerance: 1, maxTruePeak: -1 },
    appleMusic: { name: 'Apple Music', targetLUFS: -16, tolerance: 1, maxTruePeak: -1 },
    youtube: { name: 'YouTube', targetLUFS: -14, tolerance: 1, maxTruePeak: -1 },
    tidal: { name: 'Tidal', targetLUFS: -14, tolerance: 1, maxTruePeak: -1 },
    soundcloud: { name: 'SoundCloud', targetLUFS: -14, tolerance: 2, maxTruePeak: -1 },
    broadcast: { name: 'Broadcast (EBU R128)', targetLUFS: -23, tolerance: 1, maxTruePeak: -1 }
};

class LUFSMeteringService {
    // K-weighting filter coefficients (approximation for web audio)
    private readonly SAMPLE_RATE = 48000;
    private readonly ABSOLUTE_GATE_LUFS = -70;
    private readonly RELATIVE_GATE_OFFSET_LU = -10;
    private readonly CHANNEL_WEIGHTS = [1, 1, 1, 1.41, 1.41];

    private powerToLufs(meanSquare: number): number {
        if (!Number.isFinite(meanSquare) || meanSquare <= 0) return -Infinity;
        return -0.691 + 10 * Math.log10(meanSquare);
    }

    private lufsToPower(lufs: number): number {
        if (!Number.isFinite(lufs)) return 0;
        return Math.pow(10, (lufs + 0.691) / 10);
    }

    /**
     * Calculate integrated LUFS for entire audio buffer
     */
    async calculateIntegratedLUFS(buffer: AudioBuffer): Promise<number> {
        // Pre-filter with K-weighting across all channels.
        const filteredChannels = await this.applyKWeighting(buffer);

        // Calculate mean square in 400ms blocks (gating blocks)
        const blockSize = Math.floor(0.4 * buffer.sampleRate); // 400ms
        const hopSize = Math.max(1, Math.floor(0.1 * buffer.sampleRate)); // 100ms hop, 75% overlap

        const blocks: number[] = [];
        let position = 0;

        while (position + blockSize <= buffer.length) {
            let sumSquared = 0;
            let weightTotal = 0;

            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const channelData = filteredChannels[ch];
                const weight = this.CHANNEL_WEIGHTS[ch] ?? 1;
                if (!channelData) continue;
                for (let i = position; i < position + blockSize; i++) {
                    const sample = channelData[i] ?? 0;
                    sumSquared += (sample * sample) * weight;
                }
                weightTotal += weight;
            }

            if (weightTotal > 0) {
                const meanSquare = sumSquared / (blockSize * weightTotal);
                blocks.push(meanSquare);
            }
            position += hopSize;
        }

        // Apply absolute and relative gating per EBU R128
        const absoluteThreshold = this.lufsToPower(this.ABSOLUTE_GATE_LUFS);
        const gatedBlocks = blocks.filter(b => b > absoluteThreshold);

        if (gatedBlocks.length === 0) return -Infinity;

        // Calculate relative threshold
        const ungatedLufs = this.powerToLufs(gatedBlocks.reduce((a, b) => a + b, 0) / gatedBlocks.length);
        const relativeThreshold = this.lufsToPower(ungatedLufs + this.RELATIVE_GATE_OFFSET_LU);

        // Final gating
        const finalBlocks = gatedBlocks.filter(b => b >= relativeThreshold);
        if (finalBlocks.length === 0) return -Infinity;

        const finalMean = finalBlocks.reduce((a, b) => a + b, 0) / finalBlocks.length;

        // Convert to LUFS
        return this.powerToLufs(finalMean);
    }

    /**
     * Calculate true peak using 4x oversampling
     */
    async calculateTruePeak(buffer: AudioBuffer): Promise<number> {
        // Use offline context for precise oversampling
        const oversampleRate = buffer.sampleRate * 4;
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length * 4,
            oversampleRate
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        const oversampledBuffer = await offlineCtx.startRendering();

        // Find true peak across all channels
        let truePeak = 0;
        for (let ch = 0; ch < oversampledBuffer.numberOfChannels; ch++) {
            const channelData = oversampledBuffer.getChannelData(ch);
            for (let i = 0; i < channelData.length; i++) {
                const absSample = Math.abs(channelData[i]);
                if (absSample > truePeak) {
                    truePeak = absSample;
                }
            }
        }

        // Convert to dBTP (decibels True Peak)
        return truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity;
    }

    /**
     * Calculate loudness range (LRA) - dynamic range measurement
     */
    async calculateLoudnessRange(buffer: AudioBuffer): Promise<number> {
        const filteredChannels = await this.applyKWeighting(buffer);
        const blockSize = Math.floor(3.0 * buffer.sampleRate); // 3 second blocks
        const blocks: number[] = [];

        for (let position = 0; position + blockSize <= buffer.length; position += blockSize) {
            let sumSquared = 0;
            let weightTotal = 0;

            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const channelData = filteredChannels[ch];
                const weight = this.CHANNEL_WEIGHTS[ch] ?? 1;
                if (!channelData) continue;
                for (let i = position; i < position + blockSize; i++) {
                    const sample = channelData[i] ?? 0;
                    sumSquared += (sample * sample) * weight;
                }
                weightTotal += weight;
            }

            if (weightTotal > 0) {
                const meanSquare = sumSquared / (blockSize * weightTotal);
                const loudness = this.powerToLufs(meanSquare);
                if (Number.isFinite(loudness)) {
                    blocks.push(loudness);
                }
            }
        }

        if (blocks.length === 0) return 0;

        // Sort and find 10th and 95th percentiles
        blocks.sort((a, b) => a - b);
        const idx10 = Math.floor(blocks.length * 0.1);
        const idx95 = Math.floor(blocks.length * 0.95);

        return blocks[idx95] - blocks[idx10];
    }

    /**
     * Apply K-weighting filter (simplified for web audio)
     * This is an approximation - full implementation would require custom DSP
     */
    private async applyKWeighting(buffer: AudioBuffer): Promise<Float32Array[]> {
        const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Stage 1: High-shelf filter at ~1500 Hz (+4 dB)
        const shelf = ctx.createBiquadFilter();
        shelf.type = 'highshelf';
        shelf.frequency.value = 1500;
        shelf.gain.value = 4;

        // Stage 2: High-pass filter at ~38 Hz
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 38;
        highpass.Q.value = 0.5;

        source.connect(highpass);
        highpass.connect(shelf);
        shelf.connect(ctx.destination);
        source.start(0);

        const rendered = await ctx.startRendering();
        return Array.from({ length: rendered.numberOfChannels }, (_, idx) => rendered.getChannelData(idx).slice());
    }

    /**
     * Complete LUFS measurement with all metrics
     */
    async measureLUFS(buffer: AudioBuffer): Promise<LUFSMeasurement> {
        const [integratedLUFS, truePeak, loudnessRange] = await Promise.all([
            this.calculateIntegratedLUFS(buffer),
            this.calculateTruePeak(buffer),
            this.calculateLoudnessRange(buffer)
        ]);

        // For now, use integrated for short-term and momentary (could be enhanced)
        const shortTermLUFS = integratedLUFS;
        const momentaryLUFS = integratedLUFS;

        // Check compliance with streaming platforms
        const targetCompliance = {
            spotify: this.checkCompliance(integratedLUFS, truePeak, STREAMING_TARGETS.spotify),
            appleMusic: this.checkCompliance(integratedLUFS, truePeak, STREAMING_TARGETS.appleMusic),
            youtube: this.checkCompliance(integratedLUFS, truePeak, STREAMING_TARGETS.youtube),
            tidal: this.checkCompliance(integratedLUFS, truePeak, STREAMING_TARGETS.tidal),
            broadcast: this.checkCompliance(integratedLUFS, truePeak, STREAMING_TARGETS.broadcast)
        };

        return {
            integratedLUFS,
            shortTermLUFS,
            momentaryLUFS,
            loudnessRange,
            truePeak,
            targetCompliance
        };
    }

    /**
     * Check if audio meets streaming platform requirements
     */
    private checkCompliance(lufs: number, truePeak: number, target: StreamingTarget): boolean {
        const lufsInRange = Math.abs(lufs - target.targetLUFS) <= target.tolerance;
        const peakOK = truePeak <= target.maxTruePeak;
        return lufsInRange && peakOK;
    }

    /**
     * Calculate gain adjustment needed to match target LUFS
     */
    calculateGainAdjustment(currentLUFS: number, targetLUFS: number): number {
        return targetLUFS - currentLUFS;
    }

    /**
     * Get recommended target based on intended distribution
     */
    getRecommendedTarget(platform: keyof typeof STREAMING_TARGETS): StreamingTarget {
        return STREAMING_TARGETS[platform];
    }
}

export const lufsMeteringService = new LUFSMeteringService();
