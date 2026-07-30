export class MixCombinerService {
    /**
     * Mixes down an instrumental and vocal buffer into a single stereo AudioBuffer.
     * Applies basic gain balancing to prevent immediate clipping.
     */
    public async mixDown(
        audioCtx: AudioContext,
        instrumentalBuffer: AudioBuffer,
        vocalBuffer: AudioBuffer,
        instrumentalGainDb: number = -3,
        vocalGainDb: number = 0
    ): Promise<AudioBuffer> {
        const sampleRate = instrumentalBuffer.sampleRate;
        const length = Math.max(instrumentalBuffer.length, vocalBuffer.length);
        // Force stereo mixdown
        const channels = 2;

        const mixedBuffer = audioCtx.createBuffer(channels, length, sampleRate);

        const instGainLinear = Math.pow(10, instrumentalGainDb / 20);
        const vocalGainLinear = Math.pow(10, vocalGainDb / 20);

        for (let channel = 0; channel < channels; channel++) {
            const mixedData = mixedBuffer.getChannelData(channel);
            
            // Handle mono or stereo inputs gracefully
            const instData = instrumentalBuffer.numberOfChannels > channel 
                ? instrumentalBuffer.getChannelData(channel) 
                : instrumentalBuffer.getChannelData(0);
                
            const vocalData = vocalBuffer.numberOfChannels > channel 
                ? vocalBuffer.getChannelData(channel) 
                : vocalBuffer.getChannelData(0);

            for (let i = 0; i < length; i++) {
                const instSample = i < instData.length ? instData[i] * instGainLinear : 0;
                const vocalSample = i < vocalData.length ? vocalData[i] * vocalGainLinear : 0;
                
                // Sum and hard clip at 0dBFS (engine will handle limiting later)
                let mixedSample = instSample + vocalSample;
                if (mixedSample > 1.0) mixedSample = 1.0;
                if (mixedSample < -1.0) mixedSample = -1.0;
                
                mixedData[i] = mixedSample;
            }
        }

        return mixedBuffer;
    }
}

export const mixCombinerService = new MixCombinerService();
