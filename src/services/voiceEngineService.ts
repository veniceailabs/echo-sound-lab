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
      songTitle?: string;
      voiceId?: string;
      instrumental?: boolean;
      inputAudioPath?: string;
      startTime?: number;
      licenseTier?: string;
      username?: string;
      vocalTexture?: 'none' | 'gospel_choir' | 'rn_b_silk' | 'gritty_soul';
      enableHonestTuner?: boolean;
      tunerKey?: string;
      tunerScale?: 'major' | 'minor' | 'chromatic';
      tunerStrength?: number;
      enableSmartComping?: boolean;
      compingSegmentMs?: number;
      compTakeInputs?: Array<Blob | File>;
    }
  ): Promise<GeneratedSong> {
    const voiceBlob = options?.userVocals || options?.voiceInput;
    const hasInputAudioPath = !!options?.inputAudioPath;
    const hasCompTakes = !!(options?.enableSmartComping && options?.compTakeInputs?.length);
    if (!voiceBlob && !hasInputAudioPath && !hasCompTakes) {
      throw new Error('Voice input is required unless extending an existing song.');
    }

    const requestedStyle = style && style.trim() ? style.trim() : 'Trap';
    const styleKey = requestedStyle.toLowerCase();
    const tempo = Number.isFinite(options?.tempo) ? Number(options?.tempo) : (STYLE_TO_TEMPO[styleKey] || 120);
    const outputName = options?.outputName?.trim() || `local_song_${Date.now()}.wav`;

    bridge.connect();

    const saved = voiceBlob
      ? await bridge.saveAudioFile(voiceBlob, `voice_input_${Date.now()}.wav`)
      : null;
    const savedCompTakes = options?.compTakeInputs?.length
      ? await Promise.all(
          options.compTakeInputs.map((take, idx) =>
            bridge.saveAudioFile(take, `voice_take_${Date.now()}_${idx + 1}.wav`)
          )
        )
      : [];

    const result = await bridge.runMusicSystem(
      {
        voicePath: saved?.audioPath,
        style: requestedStyle,
        tempo,
        lyrics,
        songTitle: options?.songTitle,
        voiceId: options?.voiceId,
        instrumental: !!options?.instrumental,
        outputPath: outputName,
        inputAudioPath: options?.inputAudioPath,
        startTime: options?.startTime,
        licenseTier: options?.licenseTier,
        username: options?.username,
        vocalTexture: options?.vocalTexture || 'none',
        enableHonestTuner: !!options?.enableHonestTuner,
        tunerKey: options?.tunerKey || 'C',
        tunerScale: options?.tunerScale || 'chromatic',
        tunerStrength: Number.isFinite(options?.tunerStrength) ? Number(options?.tunerStrength) : 18,
        enableSmartComping: !!options?.enableSmartComping,
        compingSegmentMs: Number.isFinite(options?.compingSegmentMs) ? Number(options?.compingSegmentMs) : 420,
        takePaths: savedCompTakes.map((t) => t.audioPath),
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
      coverArtUrl: result.coverArtUrl,
      coverArtPath: result.coverArtPath,
      sourceSongPath: result.songPath,
      sourceSongUrl: result.songUrl,
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

  async extendSong(
    baseSong: GeneratedSong,
    options?: {
      lyrics?: string;
      style?: string;
      tempo?: number;
      songTitle?: string;
      voiceId?: string;
      instrumental?: boolean;
      startTime?: number;
      voiceInput?: Blob | File;
      licenseTier?: string;
      username?: string;
      vocalTexture?: 'none' | 'gospel_choir' | 'rn_b_silk' | 'gritty_soul';
      enableHonestTuner?: boolean;
      tunerKey?: string;
      tunerScale?: 'major' | 'minor' | 'chromatic';
      tunerStrength?: number;
      enableSmartComping?: boolean;
      compingSegmentMs?: number;
      compTakeInputs?: Array<Blob | File>;
    }
  ): Promise<GeneratedSong> {
    const basePath = baseSong.sourceSongPath;
    if (!basePath) {
      throw new Error('Base song path is missing; cannot extend this track.');
    }

    const outputName = `${(options?.songTitle || baseSong.name || 'extended_song')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')}_${Date.now()}.wav`;

    return this.generateSong(
      null,
      options?.lyrics || baseSong.metadata.prompt || '',
      options?.style || baseSong.metadata.style || 'Trap',
      {
        voiceInput: options?.voiceInput,
        tempo: options?.tempo,
        outputName,
        songTitle: options?.songTitle || `${baseSong.name} (Extended)`,
        voiceId: options?.voiceId,
        instrumental: !!options?.instrumental,
        inputAudioPath: basePath,
        startTime: Number.isFinite(options?.startTime)
          ? options!.startTime
          : Math.max(0, (baseSong.buffer?.duration || 0) - 0.01),
        licenseTier: options?.licenseTier,
        username: options?.username,
        vocalTexture: options?.vocalTexture || 'none',
        enableHonestTuner: !!options?.enableHonestTuner,
        tunerKey: options?.tunerKey || 'C',
        tunerScale: options?.tunerScale || 'chromatic',
        tunerStrength: Number.isFinite(options?.tunerStrength) ? Number(options?.tunerStrength) : 18,
        enableSmartComping: !!options?.enableSmartComping,
        compingSegmentMs: Number.isFinite(options?.compingSegmentMs) ? Number(options?.compingSegmentMs) : 420,
        compTakeInputs: options?.compTakeInputs,
      }
    );
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
