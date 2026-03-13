import {
  buildAplProposalsFromActions,
  BuildAplProposalOptions,
  GeneratedAPLAction,
  APLProposal,
} from '../echo-sound-lab/apl/proposal-engine';

export interface ServiceTemplate {
  templateId: 'podcast-cleanup' | 'pro-vocal-polish' | 'master-fast';
  name: string;
  category: 'Podcast' | 'Music Vocal' | 'Mastering';
  summary: string;
  actions: GeneratedAPLAction[];
}

const SERVICE_TEMPLATE_REGISTRY: ServiceTemplate[] = [
  {
    templateId: 'podcast-cleanup',
    name: 'Podcast Cleanup',
    category: 'Podcast',
    summary: 'Gate, focus vocal body, smooth leveling, and brickwall safety for spoken voice.',
    actions: [
      {
        type: 'ADD_PLUGIN',
        description: 'Insert vocal gate',
        parameters: {
          manifestId: 'echo.vocal.gate',
          instanceId: 'tpl-podcast-gate',
          parameters: {
            threshold: -52,
            release: 0.45,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert podcast proximity EQ',
        parameters: {
          manifestId: 'echo.vocal.eq.proximity',
          instanceId: 'tpl-podcast-proximity',
          parameters: {
            freq: 120,
            boost: 2.5,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert opto vocal leveling',
        parameters: {
          manifestId: 'echo.vocal.comp.opto',
          instanceId: 'tpl-podcast-opto',
          parameters: {
            peakReduction: -14,
            makeup: 3,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert brick limiter for delivery safety',
        parameters: {
          manifestId: 'echo.master.limiter.brick',
          instanceId: 'tpl-podcast-limiter',
          parameters: {
            ceiling: -1,
            release: 0.12,
          },
        },
      },
    ],
  },
  {
    templateId: 'pro-vocal-polish',
    name: 'Pro Vocal Polish',
    category: 'Music Vocal',
    summary: 'Subtractive cleanup, de-ess, FET energy, air EQ, and tasteful plate ambience.',
    actions: [
      {
        type: 'ADD_PLUGIN',
        description: 'Insert clean subtractive EQ',
        parameters: {
          manifestId: 'echo.vocal.eq.clean',
          instanceId: 'tpl-vocal-clean',
          parameters: {
            hpf: 85,
            notchFreq: 2400,
            notchCut: -3,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert de-esser',
        parameters: {
          manifestId: 'echo.vocal.deesser',
          instanceId: 'tpl-vocal-deesser',
          parameters: {
            threshold: -24,
            frequency: 7200,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert FET compressor',
        parameters: {
          manifestId: 'echo.vocal.comp.fet',
          instanceId: 'tpl-vocal-fet',
          parameters: {
            threshold: -18,
            ratio: 8,
            attack: 0.004,
            release: 0.1,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert air shelf EQ',
        parameters: {
          manifestId: 'echo.vocal.eq.air',
          instanceId: 'tpl-vocal-air',
          parameters: {
            freq: 12500,
            boost: 3.5,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert plate reverb',
        parameters: {
          manifestId: 'echo.space.reverb.plate',
          instanceId: 'tpl-vocal-plate',
          parameters: {
            decay: 1.7,
            mix: 0.14,
          },
        },
      },
    ],
  },
  {
    templateId: 'master-fast',
    name: 'Master Fast',
    category: 'Mastering',
    summary: 'Glue bus, multiband contour, LUFS target, and final limiter for streaming.',
    actions: [
      {
        type: 'ADD_PLUGIN',
        description: 'Insert glue compressor',
        parameters: {
          manifestId: 'echo.bus.glue',
          instanceId: 'tpl-master-glue',
          parameters: {
            threshold: -12,
            ratio: 4,
            makeup: 1,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert multiband contour',
        parameters: {
          manifestId: 'echo.master.multiband',
          instanceId: 'tpl-master-multiband',
          parameters: {
            lowGain: 1,
            midGain: 0,
            highGain: 1.2,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert LUFS target stage',
        parameters: {
          manifestId: 'echo.master.lufs',
          instanceId: 'tpl-master-lufs',
          parameters: {
            target: -14,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert final brick limiter',
        parameters: {
          manifestId: 'echo.master.limiter.brick',
          instanceId: 'tpl-master-limiter',
          parameters: {
            ceiling: -0.9,
            release: 0.1,
          },
        },
      },
    ],
  },
];

export function listServiceTemplates(): ServiceTemplate[] {
  return SERVICE_TEMPLATE_REGISTRY.map((template) => ({
    ...template,
    actions: template.actions.map((action) => ({
      ...action,
      parameters: { ...action.parameters },
    })),
  }));
}

export function getServiceTemplate(templateId: ServiceTemplate['templateId']): ServiceTemplate | null {
  return listServiceTemplates().find((template) => template.templateId === templateId) || null;
}

export function buildServiceTemplateProposals(
  template: ServiceTemplate,
  options: Omit<BuildAplProposalOptions, 'intent'>
): APLProposal[] {
  return buildAplProposalsFromActions(template.actions, {
    ...options,
    intent: `service-template:${template.templateId}`,
    confidence: options.confidence ?? 0.99,
    generatorId: options.generatorId || `service-template/${template.templateId}`,
  });
}
