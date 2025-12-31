import { PitchCorrectionConfig, PitchKey, PitchScale } from '../types';

const WORKLET_URL = '/worklets/pitch-correction-processor.js';
const WORKLET_NAME = 'pitch-correction-processor';

const KEY_TO_INDEX: Record<PitchKey, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

const SCALE_TO_INDEX: Record<PitchScale, number> = {
  chromatic: 0,
  major: 1,
  minor: 2,
};

class PitchCorrectionService {
  private loadedContexts = new WeakSet<BaseAudioContext>();

  async ensureWorklet(ctx: BaseAudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    if (!('audioWorklet' in ctx)) return;
    await (ctx as AudioContext).audioWorklet.addModule(WORKLET_URL);
    this.loadedContexts.add(ctx);
  }

  canUseRealtime(ctx: AudioContext): boolean {
    const baseLatency = (ctx as any).baseLatency ?? 0;
    const outputLatency = (ctx as any).outputLatency ?? 0;
    return baseLatency + outputLatency <= 0.02;
  }

  createNodeSync(ctx: BaseAudioContext, config: PitchCorrectionConfig): AudioWorkletNode | null {
    if (!this.loadedContexts.has(ctx)) return null;
    if (!('audioWorklet' in ctx)) return null;

    const node = new AudioWorkletNode(ctx as AudioContext, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.updateNode(node, config);
    return node;
  }

  async createNode(ctx: BaseAudioContext, config: PitchCorrectionConfig): Promise<AudioWorkletNode | null> {
    await this.ensureWorklet(ctx);
    return this.createNodeSync(ctx, config);
  }

  updateNode(node: AudioWorkletNode, config: PitchCorrectionConfig): void {
    node.parameters.get('enabled')?.setValueAtTime(config.enabled ? 1 : 0, 0);
    node.parameters.get('strength')?.setValueAtTime(config.strength ?? 15, 0);
    node.parameters.get('retuneSpeed')?.setValueAtTime(config.retuneSpeed ?? 70, 0);
    node.parameters.get('humanize')?.setValueAtTime(config.humanize ?? 80, 0);
    node.parameters.get('formantPreserve')?.setValueAtTime(config.formantPreserve ? 1 : 0, 0);

    node.port.postMessage({
      type: 'config',
      mode: config.mode ?? 'chromatic',
      key: config.key ? KEY_TO_INDEX[config.key] : null,
      scale: config.scale ? SCALE_TO_INDEX[config.scale] : null,
    });
  }
}

export const pitchCorrectionService = new PitchCorrectionService();
