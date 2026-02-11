import { VoiceModel, GeneratedSong } from '../types';
import { bridge } from './BridgeService';

const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = localStorage.getItem(key);
      return result ? JSON.parse(result) : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
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
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
  }
};

const VOICE_MODEL_PREFIX = 'voice-model:';

const STYLE_TO_TEMPO: Record<string, number> = {
  trap: 140,
  synthwave: 108,
  rock: 122,
  ambient: 84,
};

class VoiceEngineService {
  async trainVoiceModel(samples: string[], name: string, persona?: string): Promise<VoiceModel> {
    const newModel: VoiceModel = {
      id: `vm-${Date.now()}`,
      name,
      trainedAt: Date.now(),
      samples,
      apiVoiceId: `local-${Date.now()}`,
      persona,
    };

    await storage.set(`${VOICE_MODEL_PREFIX}${newModel.id}`, newModel);
    return newModel;
  }

  async getVoiceModels(): Promise<VoiceModel[]> {
    const keys = await storage.list(VOICE_MODEL_PREFIX);
    const models: VoiceModel[] = [];
    for (const key of keys) {
      const model = await storage.get<VoiceModel>(key);
      if (model) models.push(model);
    }
    return models.sort((a, b) => b.trainedAt - a.trainedAt);
  }

  async deleteVoiceModel(id: string): Promise<void> {
    await storage.remove(`${VOICE_MODEL_PREFIX}${id}`);
  }

  async generateSong(
    voiceModel: VoiceModel | null,
    lyrics: string,
    style: string,
    options?: {
      userVocals?: Blob;
      voiceInput?: Blob | File;
      tempo?: number;
      outputName?: string;
      voiceId?: string;
      instrumental?: boolean;
    }
  ): Promise<GeneratedSong> {
    const voiceBlob = options?.userVocals || options?.voiceInput;
    if (!voiceBlob) {
      throw new Error('Voice input is required for local generation.');
    }

    const requestedStyle = style && style.trim() ? style.trim() : 'Trap';
    const styleKey = requestedStyle.toLowerCase();
    const tempo = Number.isFinite(options?.tempo) ? Number(options?.tempo) : (STYLE_TO_TEMPO[styleKey] || 120);
    const outputName = options?.outputName?.trim() || `local_song_${Date.now()}.wav`;

    bridge.connect();

    const saved = await bridge.saveAudioFile(voiceBlob, `voice_input_${Date.now()}.wav`);

    const result = await bridge.runMusicSystem(
      {
        voicePath: saved.audioPath,
        style: requestedStyle,
        tempo,
        lyrics,
        voiceId: options?.voiceId,
        instrumental: !!options?.instrumental,
        outputPath: outputName,
      },
      () => {
        // Progress handled by caller/wizard if needed; currently no-op.
      }
    );

    const songBuffer = await this.fetchAudioBuffer(result.songUrl || result.songPath);
    const vocalsBuffer = result.vocalsUrl
      ? await this.fetchAudioBuffer(result.vocalsUrl)
      : songBuffer;
    const instrumentalBuffer = result.instrumentalUrl
      ? await this.fetchAudioBuffer(result.instrumentalUrl)
      : songBuffer;

    return {
      id: `local-song-${Date.now()}`,
      name: `${voiceModel?.name || 'Local Voice'} - ${requestedStyle}`,
      buffer: songBuffer,
      stems: {
        vocals: vocalsBuffer,
        instrumental: instrumentalBuffer,
      },
      metadata: {
        prompt: lyrics || 'local voice-to-song',
        style: requestedStyle,
        voiceModelId: voiceModel?.id || 'local-voice',
        generatedAt: Date.now(),
      }
    };
  }

  private async fetchAudioBuffer(urlOrPath: string): Promise<AudioBuffer> {
    const res = await fetch(urlOrPath);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio: ${urlOrPath}`);
    }
    const arr = await res.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return audioContext.decodeAudioData(arr);
  }
}

export const voiceEngineService = new VoiceEngineService();
