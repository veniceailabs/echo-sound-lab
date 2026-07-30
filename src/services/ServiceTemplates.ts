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
      {
        type: 'GAIN_ADJUSTMENT',
        description: 'Lift spoken program into an assertive delivery lane',
        parameters: {
          gainDb: 4.5,
        },
      },
      {
        type: 'NORMALIZATION',
        description: 'Normalize spoken program toward JellyFish-safe headroom',
        parameters: {
          targetLUFS: -14.4,
        },
      },
      {
        type: 'LIMITING',
        description: 'Apply conservative true-peak ceiling for spoken export',
        parameters: {
          threshold: -3.0,
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
      {
        type: 'GAIN_ADJUSTMENT',
        description: 'Trim vocal print before final loudness targeting',
        parameters: {
          gainDb: -1.5,
        },
      },
      {
        type: 'NORMALIZATION',
        description: 'Normalize vocal print toward JellyFish mastering band',
        parameters: {
          targetLUFS: -14.7,
        },
      },
      {
        type: 'LIMITING',
        description: 'Apply true-peak ceiling for polished vocal delivery',
        parameters: {
          threshold: -3.0,
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
            threshold: -18,
            ratio: 6,
            makeup: 4,
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
            lowGain: 1.4,
            midGain: 0.8,
            highGain: 1.4,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert mastering soft clipper',
        parameters: {
          manifestId: 'echo.master.clipper',
          instanceId: 'tpl-master-clipper',
          parameters: {
            drive: 28,
            knee: 84,
            mix: 0.9,
          },
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert pre-limiter utility drive',
        parameters: {
          manifestId: 'echo.utility.gain.v1',
          instanceId: 'tpl-master-pre-drive',
          parameters: {
            gainDb: 9,
          },
        },
      },
      {
        type: 'GAIN_ADJUSTMENT',
        description: 'Drive the print into a competitive mastering lane',
        parameters: {
          gainDb: 10,
        },
      },
      {
        type: 'ADD_PLUGIN',
        description: 'Insert final brick limiter',
        parameters: {
          manifestId: 'echo.master.limiter.brick',
          instanceId: 'tpl-master-limiter',
          parameters: {
            ceiling: -3.0,
            release: 0.08,
          },
        },
      },
      {
        type: 'NORMALIZATION',
        description: 'Normalize master toward JellyFish reference loudness',
        parameters: {
          targetLUFS: -13.4,
        },
      },
      {
        type: 'LIMITING',
        description: 'Apply JellyFish-style true-peak ceiling',
        parameters: {
          threshold: -3.0,
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
