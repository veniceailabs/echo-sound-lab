import { ExportRequest, EncoderResult } from '../types';
// @ts-ignore - lamejs doesn't have types
import lamejs from 'lamejs';

export type Mp3Quality = 128 | 192 | 256 | 320;

// Real MP3 encoder using lamejs
const encodeBufferToMp3 = async (buffer: AudioBuffer, kbps: Mp3Quality = 320): Promise<Blob> => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

    const left = buffer.getChannelData(0);
    const right = numChannels > 1 ? buffer.getChannelData(1) : left;

    // Convert float32 to int16
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);

    for (let i = 0; i < left.length; i++) {
        leftInt16[i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)));
        rightInt16[i] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)));
    }

    // Encode in chunks
    const mp3Data: Int8Array[] = [];
    const sampleBlockSize = 1152;

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
        const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);

        const mp3buf = numChannels === 1
            ? mp3encoder.encodeBuffer(leftChunk)
            : mp3encoder.encodeBuffer(leftChunk, rightChunk);

        if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
        }
    }

    // Flush remaining data
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
};

class EncoderService {

    public async encode(request: ExportRequest): Promise<EncoderResult> {
        switch (request.format) {
            case 'WAV':
                return this.encodeToWav(request);
            case 'MP3':
                return this.encodeToMp3(request);
            case 'FLAC':
                return this.encodeToFlac(request);
            default:
                return {
                    success: false,
                    errorMessage: `Unsupported format: ${request.format}`
                };
        }
    }
    
    public async encodeWavToBase64(buffer: AudioBuffer): Promise<string> {
        const result = await this.encodeToWav({
            buffer,
            fileName: 'session.wav',
            format: 'WAV',
            sampleRate: buffer.sampleRate,
        });

        if (result.success && result.blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(result.blob);
            });
        }
        throw new Error('Failed to encode WAV to Base64');
    }

    public async exportAsWav(buffer: AudioBuffer): Promise<Blob> {
        return this.bufferToWavBlob(buffer);
    }

    public async exportAsMp3(buffer: AudioBuffer, quality: Mp3Quality = 320): Promise<Blob> {
        return encodeBufferToMp3(buffer, quality);
    }

    public async encodeBuffer(buffer: AudioBuffer, format: 'WAV' | 'MP3' | 'FLAC'): Promise<Blob> {
        const result = await this.encode({
            buffer,
            fileName: `export.${format.toLowerCase()}`,
            format,
            sampleRate: buffer.sampleRate
        });

        if (result.success && result.blob) {
            return result.blob;
        }
        throw new Error(`Failed to encode buffer as ${format}`);
    }

    private async encodeToWav(request: ExportRequest): Promise<EncoderResult> {
        try {
            const blob = this.bufferToWavBlob(request.buffer);
            return { success: true, blob };
        } catch (e) {
            console.error("WAV encoding failed", e);
            return { success: false, errorMessage: "Failed to encode WAV file." };
        }
    }

    private async encodeToMp3(request: ExportRequest): Promise<EncoderResult> {
        try {
            const blob = await encodeBufferToMp3(request.buffer);
            return { success: true, blob };
        } catch (e) {
            console.error("MP3 encoding failed", e);
            return { 
                success: false, 
                errorMessage: "MP3 encoding failed." 
            };
        }
    }

    private async encodeToFlac(request: ExportRequest): Promise<EncoderResult> {
        return {
            success: false,
            errorMessage: "FLAC export is coming soon."
        };
    }
    
    private bufferToWavBlob(buffer: AudioBuffer): Blob {
        const numOfChan = buffer.numberOfChannels,
            length = buffer.length * numOfChan * 2 + 44,
            bufferArr = new ArrayBuffer(length),
            view = new DataView(bufferArr),
            channels = [];
        let pos = 0;

        const setUint16 = (data: number) => {
            view.setUint16(pos, data, true);
            pos += 2;
        };

        const setUint32 = (data: number) => {
            view.setUint32(pos, data, true);
            pos += 4;
        };

        setUint32(0x46464952); // RIFF
        setUint32(length - 8); 
        setUint32(0x45564157); // WAVE

        setUint32(0x20746d66); // fmt
        setUint32(16); 
        setUint16(1); 
        setUint16(numOfChan); 
        setUint32(buffer.sampleRate); 
        setUint32(buffer.sampleRate * 2 * numOfChan); 
        setUint16(numOfChan * 2); 
        setUint16(16); 

        setUint32(0x61746164); // data
        setUint32(length - pos - 4); 

        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let offset = 0;
        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
                let sample = Math.max(-1, Math.min(1, channels[i][offset] || 0));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return new Blob([bufferArr], { type: "audio/wav" });
    }
}

export const encoderService = new EncoderService();

// Standalone export functions for direct imports
export const encodeToWav = async (buffer: AudioBuffer): Promise<EncoderResult> => {
    return encoderService.encode({
        buffer,
        fileName: 'export.wav',
        format: 'WAV',
        sampleRate: buffer.sampleRate
    });
};

export const encodeToMp3 = async (buffer: AudioBuffer, quality: Mp3Quality = 320): Promise<EncoderResult> => {
    try {
        const blob = await encodeBufferToMp3(buffer, quality);
        return { success: true, blob };
    } catch (e) {
        return { success: false, errorMessage: 'MP3 encoding failed' };
    }
};