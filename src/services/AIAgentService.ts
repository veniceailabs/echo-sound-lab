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

function normalized(text: string): string {
  return text.trim().toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
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

    if (hasAny(text, ['aggressive', 'punch', 'tight', 'forward'])) {
      queuePluginWithParams('echo.vocal.comp.fet', 'FET Compressor', {
        threshold: -20,
        ratio: '12',
        attack: 0.003,
        release: 0.18,
      });
    }

    if (hasAny(text, ['air', 'bright', 'clarity', 'sparkle'])) {
      queuePluginWithParams('echo.vocal.eq.air', 'Air EQ', {
        freq: 13500,
        boost: 4.5,
      });
    }

    if (hasAny(text, ['space', 'depth', 'reverb', 'larger'])) {
      queuePluginWithParams('echo.space.reverb.plate', 'Plate Reverb', {
        decay: 2.2,
        mix: 0.26,
      });
    }

    if (hasAny(text, ['delay', 'slap', 'double'])) {
      queuePluginWithParams('echo.space.delay.slap', 'Slap Delay', {
        time: 0.09,
        feedback: 0.16,
        mix: 0.22,
      });
    }

    if (hasAny(text, ['loud', 'master', 'ceiling', 'limit'])) {
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
