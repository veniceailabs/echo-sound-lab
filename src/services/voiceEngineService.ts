import { VoiceModel, Stem, GeneratedSong } from "../types";
import { audioEngine } from "./audioEngine";
import { encoderService } from "./encoderService";
import { sunoApiService } from "./sunoApiService";
import { fxMatchingEngine } from "./fxMatchingEngine";
import { voiceApiService } from "./voiceApiService";

// Basic persistent storage simulation using localStorage
const storage = {
    async get<T>(key: string): Promise<T | null> {
        try {
            const result = localStorage.getItem(key);
            return result ? JSON.parse(result) : null;
        } catch (e) {
            return null;
        }
    },
    async set(key: string, value: any): Promise<void> {
         try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(e);
        }
    },
    async remove(key: string): Promise<void> {
         try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(e);
        }
    },
    async list(prefix: string): Promise<string[]> {
        return Object.keys(localStorage).filter(k => k.startsWith(prefix));
    }
};

const VOICE_MODEL_PREFIX = 'voice-model:';

class VoiceEngineService {
    async trainVoiceModel(samples: string[], name: string, persona?: string): Promise<VoiceModel> {
        if (voiceApiService.isConfigured()) {
            return voiceApiService.trainVoiceModel(samples, name, persona);
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        const newModel: VoiceModel = {
            id: `vm-${Date.now()}`,
            name,
            trainedAt: Date.now(),
            samples,
            apiVoiceId: `simulated-${Date.now()}`,
            persona
        };

        await storage.set(`${VOICE_MODEL_PREFIX}${newModel.id}`, newModel);
        return newModel;
    }

    async getVoiceModels(): Promise<VoiceModel[]> {
        if (voiceApiService.isConfigured()) {
            return voiceApiService.listVoiceModels();
        }

        const keys = await storage.list(VOICE_MODEL_PREFIX);
        const models: VoiceModel[] = [];
        for (const key of keys) {
            const model = await storage.get<VoiceModel>(key);
            if (model) {
                models.push(model);
            }
        }
        return models.sort((a, b) => b.trainedAt - a.trainedAt);
    }
    
    async deleteVoiceModel(id: string): Promise<void> {
        if (voiceApiService.isConfigured()) {
            return voiceApiService.deleteVoiceModel(id);
        }

        await storage.remove(`${VOICE_MODEL_PREFIX}${id}`);
    }
    
    async generateSong(
        voiceModel: VoiceModel | null,
        lyrics: string,
        style: string,
        options?: {
            referenceTrack?: AudioBuffer;
            userVocals?: Blob;
            generateHarmonies?: boolean;
            instrumental?: boolean;
            sourceBeat?: AudioBuffer;
            coverAudio?: Blob | File;
            styleTags?: string;
            weirdness?: number;
            styleInfluence?: number;
            voiceInput?: Blob | File;
        }
    ): Promise<GeneratedSong> {
        console.log('[VoiceEngine] Starting song generation:', { voiceModel: voiceModel?.name, style, options });

        // 1. Call Suno API to generate song
        let referenceAudioUrl: string | undefined;
        let voiceSampleUrl: string | undefined;

        if (options?.coverAudio) {
            referenceAudioUrl = await sunoApiService.uploadAudioAsset(options.coverAudio);
        } else if (options?.sourceBeat) {
            const beatBlob = await encoderService.exportAsWav(options.sourceBeat);
            referenceAudioUrl = await sunoApiService.uploadAudioAsset(beatBlob);
        }

        if (options?.voiceInput) {
            voiceSampleUrl = await sunoApiService.uploadAudioAsset(options.voiceInput);
        }

        const response = await sunoApiService.generateSong({
            prompt: options?.instrumental ? `${style} instrumental beat` : `${style} song`,
            lyrics,
            style,
            voiceModelId: voiceModel?.apiVoiceId,
            instrumental: options?.instrumental || false,
            styleTags: options?.styleTags,
            weirdness: options?.weirdness,
            styleInfluence: options?.styleInfluence,
            referenceAudioUrl,
            voiceSampleUrl,
            coverMode: referenceAudioUrl ? 'reference' : undefined
        });

        // 2. Poll until complete
        let status = response;
        while (status.status !== 'completed') {
            if (status.status === 'failed') {
                throw new Error(status.error || 'Generation failed');
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
            status = await sunoApiService.pollGenerationStatus(status.songId);
        }

        if (!status.audioUrl) {
            throw new Error('No audio URL in completed response');
        }

        // 3. Download and extract stems
        console.log('[VoiceEngine] Downloading song...');
        const buffer = await sunoApiService.downloadSong(status.audioUrl);

        console.log('[VoiceEngine] Extracting stems...');
        const stems = await sunoApiService.extractStems(status.songId);

        // 4. Apply FX matching if reference provided
        if (options?.referenceTrack) {
            console.log('[VoiceEngine] Applying reference track FX matching...');
            const fxMatch = await fxMatchingEngine.matchReference(options.referenceTrack);

            // Apply matched FX to vocals
            const processedVocals = await audioEngine.renderProcessedAudio(fxMatch.suggestedConfig);
            stems.vocals = processedVocals;

            console.log('[VoiceEngine] FX matching applied with confidence:', fxMatch.matchConfidence);
        }

        // 5. Mix with user vocals if provided (hybrid workflow)
        if (options?.userVocals) {
            console.log('[VoiceEngine] Creating hybrid vocal mix...');
            const userBuffer = await this.convertBlobToBuffer(options.userVocals);

            if (options.generateHarmonies) {
                // Generate AI harmonies and mix all together
                const aiHarmonies = await sunoApiService.generateHarmonies(
                    options.userVocals,
                    voiceModel.apiVoiceId,
                    'harmonies'
                );
                stems.vocals = await this.mixHybridVocals(userBuffer, aiHarmonies, stems.instrumental);
            } else {
                // Just mix user vocals with instrumental
                stems.vocals = await this.mixHybridVocals(userBuffer, stems.vocals, stems.instrumental);
            }
        }

        return {
            id: status.songId,
            name: options?.instrumental ? `${style} Instrumental` : `${voiceModel?.name || 'AI'} - ${style}`,
            buffer,
            stems,
            metadata: {
                prompt: options?.instrumental ? `${style} instrumental beat` : `${style} song`,
                style,
                voiceModelId: voiceModel?.id || 'instrumental',
                generatedAt: Date.now()
            }
        };
    }

    /**
     * Convert Blob to AudioBuffer
     */
    private async convertBlobToBuffer(blob: Blob): Promise<AudioBuffer> {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        return await audioContext.decodeAudioData(arrayBuffer);
    }

    /**
     * Mix user vocals with AI harmonies/doubles and instrumental
     */
    private async mixHybridVocals(
        userLead: AudioBuffer,
        aiVocals: AudioBuffer,
        instrumental: AudioBuffer
    ): Promise<AudioBuffer> {
        const sampleRate = audioEngine.getSampleRate();
        const maxDuration = Math.max(userLead.duration, aiVocals.duration, instrumental.duration);
        const frameCount = Math.floor(sampleRate * maxDuration);

        const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);

        // User lead vocals (0dB - main vocal)
        const userSource = offlineCtx.createBufferSource();
        userSource.buffer = userLead;
        const userGain = offlineCtx.createGain();
        userGain.gain.value = 1.0; // Unity gain for lead
        userSource.connect(userGain);
        userGain.connect(offlineCtx.destination);
        userSource.start();

        // AI harmonies/doubles (-4dB - blend under lead)
        const aiSource = offlineCtx.createBufferSource();
        aiSource.buffer = aiVocals;
        const aiGain = offlineCtx.createGain();
        aiGain.gain.value = 0.63; // -4dB
        aiSource.connect(aiGain);
        aiGain.connect(offlineCtx.destination);
        aiSource.start();

        // Instrumental (-6dB - duck for vocals)
        const instSource = offlineCtx.createBufferSource();
        instSource.buffer = instrumental;
        const instGain = offlineCtx.createGain();
        instGain.gain.value = 0.5; // -6dB
        instSource.connect(instGain);
        instGain.connect(offlineCtx.destination);
        instSource.start();

        return await offlineCtx.startRendering();
    }
}

export const voiceEngineService = new VoiceEngineService();
