import { MidSideMode } from '../types';

/**
 * Mid-Side Processing Service
 * Allows independent processing of Mid (center) and Side (stereo) channels
 */

export interface MidSideConfig {
    mode: MidSideMode;
    midGain: number;    // dB adjustment for mid channel
    sideGain: number;   // dB adjustment for side channel
    midEQ?: {
        low: number;
        mid: number;
        high: number;
    };
    sideEQ?: {
        low: number;
        mid: number;
        high: number;
    };
}

class MidSideProcessorService {

    /**
     * Convert stereo buffer to Mid-Side representation
     */
    async convertToMidSide(buffer: AudioBuffer): Promise<{
        midChannel: Float32Array;
        sideChannel: Float32Array;
    }> {
        if (buffer.numberOfChannels < 2) {
            throw new Error('Mid-Side processing requires stereo audio');
        }

        const leftChannel = buffer.getChannelData(0);
        const rightChannel = buffer.getChannelData(1);
        const length = buffer.length;

        const midChannel = new Float32Array(length);
        const sideChannel = new Float32Array(length);

        // M = (L + R) / 2
        // S = (L - R) / 2
        for (let i = 0; i < length; i++) {
            midChannel[i] = (leftChannel[i] + rightChannel[i]) / 2;
            sideChannel[i] = (leftChannel[i] - rightChannel[i]) / 2;
        }

        return { midChannel, sideChannel };
    }

    /**
     * Convert Mid-Side back to stereo (Left-Right)
     */
    convertToStereo(
        midChannel: Float32Array,
        sideChannel: Float32Array
    ): {
        leftChannel: Float32Array;
        rightChannel: Float32Array;
    } {
        const length = midChannel.length;
        const leftChannel = new Float32Array(length);
        const rightChannel = new Float32Array(length);

        // L = M + S
        // R = M - S
        for (let i = 0; i < length; i++) {
            leftChannel[i] = midChannel[i] + sideChannel[i];
            rightChannel[i] = midChannel[i] - sideChannel[i];
        }

        return { leftChannel, rightChannel };
    }

    /**
     * Process audio with Mid-Side configuration
     */
    async processMidSide(
        buffer: AudioBuffer,
        config: MidSideConfig
    ): Promise<AudioBuffer> {
        const ctx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // Convert to M-S
        const { midChannel, sideChannel } = await this.convertToMidSide(buffer);

        // Apply gain adjustments
        const midGainLinear = Math.pow(10, config.midGain / 20);
        const sideGainLinear = Math.pow(10, config.sideGain / 20);

        for (let i = 0; i < midChannel.length; i++) {
            midChannel[i] *= midGainLinear;
            sideChannel[i] *= sideGainLinear;
        }

        // Apply EQ if specified
        let processedMid = midChannel;
        let processedSide = sideChannel;

        if (config.midEQ) {
            processedMid = await this.applyEQToChannel(midChannel, config.midEQ, ctx.sampleRate);
        }

        if (config.sideEQ) {
            processedSide = await this.applyEQToChannel(sideChannel, config.sideEQ, ctx.sampleRate);
        }

        // Convert back to stereo
        const { leftChannel, rightChannel } = this.convertToStereo(processedMid, processedSide);

        // Create output buffer
        const outputBuffer = ctx.createBuffer(2, buffer.length, buffer.sampleRate);
        outputBuffer.copyToChannel(leftChannel, 0);
        outputBuffer.copyToChannel(rightChannel, 1);

        return outputBuffer;
    }

    /**
     * Apply simple 3-band EQ to a mono channel
     */
    private async applyEQToChannel(
        channel: Float32Array,
        eq: { low: number; mid: number; high: number },
        sampleRate: number
    ): Promise<Float32Array> {
        const length = channel.length;
        const ctx = new OfflineAudioContext(1, length, sampleRate);

        // Create buffer from channel
        const inputBuffer = ctx.createBuffer(1, length, sampleRate);
        inputBuffer.copyToChannel(channel, 0);

        const source = ctx.createBufferSource();
        source.buffer = inputBuffer;

        // Low shelf
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 150;
        lowShelf.gain.value = eq.low;

        // Mid peak
        const midPeak = ctx.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 1.0;
        midPeak.gain.value = eq.mid;

        // High shelf
        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 8000;
        highShelf.gain.value = eq.high;

        // Connect chain
        source.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);
        highShelf.connect(ctx.destination);

        source.start(0);

        const rendered = await ctx.startRendering();
        return rendered.getChannelData(0);
    }

    /**
     * Get stereo width from Mid-Side balance
     */
    calculateStereoWidth(midChannel: Float32Array, sideChannel: Float32Array): number {
        let midEnergy = 0;
        let sideEnergy = 0;

        for (let i = 0; i < midChannel.length; i += 100) {
            midEnergy += midChannel[i] * midChannel[i];
            sideEnergy += sideChannel[i] * sideChannel[i];
        }

        const width = midEnergy > 0 ? Math.sqrt(sideEnergy / midEnergy) : 0;
        return Math.min(2.0, width); // Cap at 2.0
    }

    /**
     * Create preset configs for common scenarios
     */
    getPresetConfig(preset: 'vocal-focus' | 'wide-stereo' | 'mono-bass' | 'balanced'): MidSideConfig {
        switch (preset) {
            case 'vocal-focus':
                return {
                    mode: 'mid-side',
                    midGain: 3,
                    sideGain: -2,
                    midEQ: { low: -1, mid: 2, high: 1 },
                    sideEQ: { low: -3, mid: 0, high: 0 }
                };

            case 'wide-stereo':
                return {
                    mode: 'mid-side',
                    midGain: -1,
                    sideGain: 4,
                    midEQ: { low: 0, mid: 0, high: 0 },
                    sideEQ: { low: -2, mid: 1, high: 2 }
                };

            case 'mono-bass':
                return {
                    mode: 'mid-side',
                    midGain: 0,
                    sideGain: 0,
                    midEQ: { low: 2, mid: 0, high: 0 },
                    sideEQ: { low: -6, mid: 0, high: 2 }
                };

            case 'balanced':
            default:
                return {
                    mode: 'stereo',
                    midGain: 0,
                    sideGain: 0
                };
        }
    }
}

export const midSideProcessor = new MidSideProcessorService();
