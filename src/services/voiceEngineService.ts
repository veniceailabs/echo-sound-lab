import { VoiceModel, GeneratedSong } from '../types';
import { audioEngine } from './audioEngine';

// Local-first persistent storage
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

const STYLE_TEMPO: Record<string, number> = {
  'hip-hop': 88,
  'r&b': 74,
  pop: 108,
  electronic: 126,
  rock: 118,
  indie: 96,
  country: 92,
};

class VoiceEngineService {
  async trainVoiceModel(samples: string[], name: string, persona?: string): Promise<VoiceModel> {
    await new Promise((resolve) => setTimeout(resolve, 400));

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
    const sampleRate = audioEngine.getSampleRate() || 44100;
    const durationSec = this.estimateDuration(lyrics, !!options?.instrumental);

    const instrumental = options?.sourceBeat
      ? this.fitBufferToDuration(options.sourceBeat, durationSec, sampleRate)
      : await this.renderInstrumental(style, durationSec, sampleRate);

    const voiceSource = options?.userVocals || options?.voiceInput;
    const vocals = options?.instrumental
      ? this.createSilentBuffer(durationSec, sampleRate)
      : await this.renderVocals({
          source: voiceSource,
          lyrics,
          style,
          durationSec,
          sampleRate,
          harmonies: !!options?.generateHarmonies,
          voiceModel,
        });

    const mastered = this.mixToMaster(instrumental, vocals, options?.instrumental ? 1.0 : 0.85, options?.instrumental ? 0.0 : 0.9);

    return {
      id: `local-song-${Date.now()}`,
      name: options?.instrumental ? `${style} Instrumental` : `${voiceModel?.name || 'Local Voice'} - ${style}`,
      buffer: mastered,
      stems: {
        vocals,
        instrumental,
      },
      metadata: {
        prompt: options?.instrumental ? `${style} instrumental` : `${style} song`,
        style,
        voiceModelId: voiceModel?.id || 'local-instrumental',
        generatedAt: Date.now(),
      }
    };
  }

  private estimateDuration(lyrics: string, instrumental: boolean): number {
    if (instrumental) return 28;
    const lineCount = lyrics.split('\n').filter((l) => l.trim().length > 0).length;
    return Math.min(48, Math.max(20, 14 + lineCount * 1.6));
  }

  private createSilentBuffer(durationSec: number, sampleRate: number): AudioBuffer {
    const frames = Math.max(1, Math.floor(durationSec * sampleRate));
    return new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate });
  }

  private fitBufferToDuration(buffer: AudioBuffer, durationSec: number, sampleRate: number): AudioBuffer {
    const targetFrames = Math.max(1, Math.floor(durationSec * sampleRate));
    const out = new AudioBuffer({ numberOfChannels: 2, length: targetFrames, sampleRate });

    for (let ch = 0; ch < 2; ch++) {
      const inData = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      const outData = out.getChannelData(ch);
      for (let i = 0; i < targetFrames; i++) {
        outData[i] = inData[i % inData.length] * 0.92;
      }
    }
    return out;
  }

  private async renderInstrumental(style: string, durationSec: number, sampleRate: number): Promise<AudioBuffer> {
    const tempo = STYLE_TEMPO[style] || 96;
    const beatsPerSecond = tempo / 60;
    const beatDur = 1 / beatsPerSecond;
    const frameCount = Math.max(1, Math.floor(durationSec * sampleRate));

    const ctx = new OfflineAudioContext(2, frameCount, sampleRate);
    const master = ctx.createGain();
    master.gain.value = 0.78;
    master.connect(ctx.destination);

    // Kick + snare skeleton
    for (let t = 0; t < durationSec; t += beatDur) {
      this.spawnKick(ctx, master, t);
      const beatIndex = Math.floor(t / beatDur) % 4;
      if (beatIndex === 1 || beatIndex === 3) {
        this.spawnSnare(ctx, master, t + beatDur * 0.02);
      }
      this.spawnHat(ctx, master, t + beatDur * 0.5);
    }

    // Bass
    const bass = ctx.createOscillator();
    bass.type = 'triangle';
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.0;
    bass.connect(bassGain);
    bassGain.connect(master);

    const bassPattern = [48, 48, 43, 45, 48, 50, 43, 45];
    for (let step = 0; step < durationSec / beatDur; step++) {
      const st = step * beatDur;
      const midi = bassPattern[step % bassPattern.length];
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      bass.frequency.setValueAtTime(hz, st);
      bassGain.gain.setValueAtTime(0.0, st);
      bassGain.gain.linearRampToValueAtTime(0.22, st + 0.01);
      bassGain.gain.exponentialRampToValueAtTime(0.04, Math.min(durationSec, st + beatDur * 0.95));
    }
    bass.start(0);
    bass.stop(durationSec);

    // Pad/wash
    const pad = ctx.createOscillator();
    pad.type = 'sawtooth';
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = style === 'electronic' ? 3800 : 2200;
    const padGain = ctx.createGain();
    padGain.gain.value = style === 'rock' ? 0.08 : 0.12;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);
    pad.frequency.value = 220;
    pad.start(0);
    pad.stop(durationSec);

    return ctx.startRendering();
  }

  private spawnKick(ctx: OfflineAudioContext, destination: AudioNode, at: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(destination);

    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.95, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);

    osc.start(at);
    osc.stop(at + 0.2);
  }

  private spawnSnare(ctx: OfflineAudioContext, destination: AudioNode, at: number): void {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);

    source.connect(hp);
    hp.connect(gain);
    gain.connect(destination);
    source.start(at);
  }

  private spawnHat(ctx: OfflineAudioContext, destination: AudioNode, at: number): void {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 0.08;

    source.connect(hp);
    hp.connect(gain);
    gain.connect(destination);
    source.start(at);
  }

  private async renderVocals(params: {
    source?: Blob | File;
    lyrics: string;
    style: string;
    durationSec: number;
    sampleRate: number;
    harmonies: boolean;
    voiceModel: VoiceModel | null;
  }): Promise<AudioBuffer> {
    if (params.source) {
      const sourceBuffer = await this.convertBlobToBuffer(params.source);
      const fitted = this.fitBufferToDuration(sourceBuffer, params.durationSec, params.sampleRate);
      if (!params.harmonies) return fitted;
      return this.addSimpleHarmony(fitted);
    }

    return this.renderSyntheticLead(params.lyrics, params.style, params.durationSec, params.sampleRate, params.harmonies, params.voiceModel?.name || 'local');
  }

  private async renderSyntheticLead(
    lyrics: string,
    style: string,
    durationSec: number,
    sampleRate: number,
    harmonies: boolean,
    voiceSeed: string
  ): Promise<AudioBuffer> {
    const frameCount = Math.max(1, Math.floor(durationSec * sampleRate));
    const ctx = new OfflineAudioContext(2, frameCount, sampleRate);
    const out = ctx.createGain();
    out.gain.value = 0.82;
    out.connect(ctx.destination);

    const lead = ctx.createOscillator();
    lead.type = style === 'rock' ? 'sawtooth' : 'triangle';
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.0;
    lead.connect(leadGain);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1450;
    bp.Q.value = 1.1;

    leadGain.connect(bp);
    bp.connect(out);

    const syllables = Math.max(8, lyrics.split(/\s+/).filter(Boolean).length);
    const stepDur = Math.max(0.18, durationSec / syllables);

    const baseMidi = style === 'r&b' ? 58 : style === 'hip-hop' ? 55 : 60;
    let h = 0;
    const seed = `${lyrics}|${voiceSeed}`;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;

    for (let i = 0; i < syllables; i++) {
      const t = i * stepDur;
      const variation = ((h + i * 13) % 7) - 3;
      const midi = baseMidi + variation;
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      lead.frequency.setValueAtTime(hz, t);

      leadGain.gain.setValueAtTime(0.0001, t);
      leadGain.gain.linearRampToValueAtTime(0.19, t + 0.03);
      leadGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSec, t + stepDur * 0.9));
    }

    lead.start(0);
    lead.stop(durationSec);

    if (harmonies) {
      const harm = ctx.createOscillator();
      harm.type = 'sine';
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.06;
      harm.frequency.value = lead.frequency.value * 1.25;
      harm.connect(harmGain);
      harmGain.connect(out);
      harm.start(0);
      harm.stop(durationSec);
    }

    return ctx.startRendering();
  }

  private addSimpleHarmony(vocal: AudioBuffer): AudioBuffer {
    const out = new AudioBuffer({ numberOfChannels: 2, length: vocal.length, sampleRate: vocal.sampleRate });
    for (let ch = 0; ch < 2; ch++) {
      const src = vocal.getChannelData(Math.min(ch, vocal.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      const delaySamples = Math.floor(vocal.sampleRate * 0.03);
      for (let i = 0; i < dst.length; i++) {
        const dry = src[i] || 0;
        const wet = i - delaySamples >= 0 ? src[i - delaySamples] * 0.45 : 0;
        dst[i] = Math.max(-1, Math.min(1, dry * 0.8 + wet));
      }
    }
    return out;
  }

  private mixToMaster(instrumental: AudioBuffer, vocals: AudioBuffer, instGain = 0.9, vocalGain = 1.0): AudioBuffer {
    const sampleRate = instrumental.sampleRate;
    const maxLen = Math.max(instrumental.length, vocals.length);
    const out = new AudioBuffer({ numberOfChannels: 2, length: maxLen, sampleRate });

    for (let ch = 0; ch < 2; ch++) {
      const inst = instrumental.getChannelData(Math.min(ch, instrumental.numberOfChannels - 1));
      const voc = vocals.getChannelData(Math.min(ch, vocals.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      for (let i = 0; i < maxLen; i++) {
        const v = (inst[i] || 0) * instGain + (voc[i] || 0) * vocalGain;
        dst[i] = Math.max(-1, Math.min(1, v));
      }
    }
    return out;
  }

  private async convertBlobToBuffer(blob: Blob | File): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return audioContext.decodeAudioData(arrayBuffer);
  }
}

export const voiceEngineService = new VoiceEngineService();
