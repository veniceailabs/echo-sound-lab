import {
  APLProposal,
  buildAplProposalsFromActions,
  GeneratedAPLAction,
} from '../echo-sound-lab/apl/proposal-engine';
import { deterministicId } from './deterministicJson';

export interface AIAgentIntentContext {
  trackId: string;
  trackName: string;
  workspaceId?: string;
}

export const AI_AGENT_SYSTEM_PROMPT =
  "You are Echo AI. The user may speak any language. You must understand their intent and map it to the strictly defined English JSON APL schema. If you provide conversational feedback, reply in the user's detected language.";

function normalized(text: string): string {
  return text.trim().toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

type SupportedIntentLanguage = 'en' | 'es' | 'ko';

function detectIntentLanguage(text: string): SupportedIntentLanguage {
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[áéíóúñ¿¡]/i.test(text) || hasAny(text, ['voz', 'voces', 'mezcla', 'agresivo', 'brillo'])) return 'es';
  return 'en';
}

function buildPluginInstanceId(
  manifestId: string,
  context: AIAgentIntentContext,
  intent: string,
  ordinal: number
): string {
  return deterministicId('ai-plugin-inst', {
    manifestId,
    trackId: context.trackId,
    intent: intent.trim().toLowerCase(),
    ordinal,
  });
}

export class AIAgentService {
  getSystemPrompt(): string {
    return AI_AGENT_SYSTEM_PROMPT;
  }

  detectUserLanguage(intent: string): SupportedIntentLanguage {
    return detectIntentLanguage(intent);
  }

  async generateActionSequence(
    intent: string,
    context: AIAgentIntentContext
  ): Promise<GeneratedAPLAction[]> {
    const text = normalized(intent);
    const actions: GeneratedAPLAction[] = [];
    let pluginOrdinal = 0;

    const queuePluginWithParams = (
      manifestId: string,
      label: string,
      params: Record<string, unknown>
    ) => {
      pluginOrdinal += 1;
      const instanceId = buildPluginInstanceId(manifestId, context, intent, pluginOrdinal);
      actions.push({
        type: 'ADD_PLUGIN',
        description: `Insert ${label}`,
        trackId: context.trackId,
        trackName: context.trackName,
        parameters: {
          trackId: context.trackId,
          trackName: context.trackName,
          instanceId,
          manifestId,
        },
      });

      for (const [paramId, value] of Object.entries(params)) {
        actions.push({
          type: 'SET_PLUGIN_PARAM',
          description: `Set ${label} ${paramId}`,
          trackId: context.trackId,
          trackName: context.trackName,
          parameters: {
            trackId: context.trackId,
            trackName: context.trackName,
            instanceId,
            paramId,
            value,
          },
        });
      }
    };

    if (
      hasAny(text, [
        'aggressive',
        'punch',
        'tight',
        'forward',
        'agresiv',
        'agresivo',
        'agresiva',
        '공격적',
        '강하게',
      ])
    ) {
      queuePluginWithParams('echo.vocal.comp.fet', 'FET Compressor', {
        threshold: -20,
        ratio: '12',
        attack: 0.003,
        release: 0.18,
      });
    }

    if (
      hasAny(text, [
        'air',
        'bright',
        'clarity',
        'sparkle',
        'aire',
        'brillo',
        'claridad',
        '선명',
        '밝게',
      ])
    ) {
      queuePluginWithParams('echo.vocal.eq.air', 'Air EQ', {
        freq: 13500,
        boost: 4.5,
      });
    }

    if (hasAny(text, ['space', 'depth', 'reverb', 'larger', 'espacio', 'profundidad', '공간', '리버브'])) {
      queuePluginWithParams('echo.space.reverb.plate', 'Plate Reverb', {
        decay: 2.2,
        mix: 0.26,
      });
    }

    if (hasAny(text, ['delay', 'slap', 'double', 'retardo', 'eco', '딜레이', '슬랩'])) {
      queuePluginWithParams('echo.space.delay.slap', 'Slap Delay', {
        time: 0.09,
        feedback: 0.16,
        mix: 0.22,
      });
    }

    if (hasAny(text, ['loud', 'master', 'ceiling', 'limit', 'fuerte', 'techo', '마스터', '리미터'])) {
      queuePluginWithParams('echo.master.limiter.brick', 'Brick Limiter', {
        ceiling: -0.8,
        release: 0.2,
      });
    }

    if (actions.length === 0) {
      queuePluginWithParams('echo.utility.gain.v1', 'Utility Gain', {
        gainDb: 1.5,
      });
    }

    return JSON.parse(JSON.stringify(actions)) as GeneratedAPLAction[];
  }

  async generateProposals(
    intent: string,
    context: AIAgentIntentContext
  ): Promise<APLProposal[]> {
    const actions = await this.generateActionSequence(intent, context);
    return buildAplProposalsFromActions(actions, {
      intent,
      trackId: context.trackId,
      trackName: context.trackName,
      generatorId: 'ai-agent-service-v1',
      confidence: 0.9,
    });
  }
}

export const aiAgentService = new AIAgentService();
