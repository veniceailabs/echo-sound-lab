import {
  buildDefaultPluginParameters,
  EchoPluginManifest,
  EchoPluginParameterSchema,
  sanitizePluginParameterValue,
} from './echoPlugin';

function cloneParameterSchema(schema: EchoPluginParameterSchema): EchoPluginParameterSchema {
  return {
    ...schema,
    options: schema.options ? schema.options.map((option) => ({ ...option })) : undefined,
  };
}

function cloneManifest(manifest: EchoPluginManifest): EchoPluginManifest {
  return {
    ...manifest,
    parameters: manifest.parameters.map(cloneParameterSchema),
  };
}

export class PluginRegistry {
  private manifests = new Map<string, EchoPluginManifest>();

  registerManifest(manifest: EchoPluginManifest): void {
    if (!manifest.manifestId || !manifest.pluginId) {
      throw new Error('PLUGIN_REGISTRY_INVALID_MANIFEST: missing manifestId or pluginId');
    }
    if (!Array.isArray(manifest.parameters)) {
      throw new Error('PLUGIN_REGISTRY_INVALID_MANIFEST: parameters must be an array');
    }
    this.manifests.set(manifest.manifestId, cloneManifest(manifest));
  }

  getManifest(manifestId: string): EchoPluginManifest | null {
    const manifest = this.manifests.get(manifestId);
    return manifest ? cloneManifest(manifest) : null;
  }

  listManifests(): EchoPluginManifest[] {
    return Array.from(this.manifests.values()).map(cloneManifest);
  }

  ensureManifest(manifestId: string): EchoPluginManifest {
    const manifest = this.getManifest(manifestId);
    if (!manifest) {
      throw new Error(`PLUGIN_REGISTRY_UNKNOWN_MANIFEST: ${manifestId}`);
    }
    return manifest;
  }

  sanitizeParameters(
    manifestId: string,
    rawParams: Record<string, unknown> = {}
  ): Record<string, number | boolean | string> {
    const manifest = this.ensureManifest(manifestId);
    const defaults = buildDefaultPluginParameters(manifest);
    const sanitized: Record<string, number | boolean | string> = { ...defaults };

    for (const schema of manifest.parameters) {
      if (rawParams[schema.id] === undefined) continue;
      sanitized[schema.id] = sanitizePluginParameterValue(schema, rawParams[schema.id]);
    }
    return sanitized;
  }

  sanitizeParamValue(
    manifestId: string,
    paramId: string,
    rawValue: unknown
  ): number | boolean | string {
    const manifest = this.ensureManifest(manifestId);
    const schema = manifest.parameters.find((entry) => entry.id === paramId);
    if (!schema) {
      throw new Error(`PLUGIN_REGISTRY_UNKNOWN_PARAM: ${manifestId}.${paramId}`);
    }
    return sanitizePluginParameterValue(schema, rawValue);
  }
}

export const pluginRegistry = new PluginRegistry();

pluginRegistry.registerManifest({
  manifestId: 'echo.utility.gain.v1',
  pluginId: 'echo-utility-gain',
  displayName: 'Echo Utility Gain',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'utility',
  parameters: [
    {
      id: 'gainDb',
      label: 'Gain',
      type: 'float',
      min: -24,
      max: 24,
      step: 0.1,
      defaultValue: 0,
      unit: 'dB',
    },
    {
      id: 'pan',
      label: 'Pan',
      type: 'float',
      min: -1,
      max: 1,
      step: 0.01,
      defaultValue: 0,
    },
    {
      id: 'phaseInvert',
      label: 'Phase Invert',
      type: 'boolean',
      defaultValue: false,
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.vocal.comp.fet',
  pluginId: 'echo-vocal-comp-fet',
  displayName: 'Echo FET Compressor',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'dynamics',
  parameters: [
    {
      id: 'threshold',
      label: 'Threshold',
      type: 'float',
      min: -60,
      max: 0,
      step: 0.1,
      defaultValue: -24,
      unit: 'dB',
    },
    {
      id: 'ratio',
      label: 'Ratio',
      type: 'enum',
      defaultValue: '8',
      options: [
        { label: '4:1', value: '4' },
        { label: '8:1', value: '8' },
        { label: '12:1', value: '12' },
        { label: '20:1', value: '20' },
      ],
    },
    {
      id: 'attack',
      label: 'Attack',
      type: 'float',
      min: 0.001,
      max: 0.05,
      step: 0.001,
      defaultValue: 0.005,
      unit: 's',
    },
    {
      id: 'release',
      label: 'Release',
      type: 'float',
      min: 0.05,
      max: 1,
      step: 0.01,
      defaultValue: 0.2,
      unit: 's',
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.vocal.comp.opto',
  pluginId: 'echo-vocal-comp-opto',
  displayName: 'Echo Opto Leveler',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'dynamics',
  parameters: [
    {
      id: 'peakReduction',
      label: 'Peak Reduction',
      type: 'float',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 45,
      unit: '%',
    },
    {
      id: 'gain',
      label: 'Gain',
      type: 'float',
      min: 0,
      max: 24,
      step: 0.1,
      defaultValue: 0,
      unit: 'dB',
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.vocal.eq.air',
  pluginId: 'echo-vocal-eq-air',
  displayName: 'Echo Air EQ',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'eq',
  parameters: [
    {
      id: 'freq',
      label: 'Frequency',
      type: 'float',
      min: 8000,
      max: 20000,
      step: 10,
      defaultValue: 12000,
      unit: 'Hz',
    },
    {
      id: 'boost',
      label: 'Boost',
      type: 'float',
      min: 0,
      max: 15,
      step: 0.1,
      defaultValue: 2.5,
      unit: 'dB',
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.space.reverb.plate',
  pluginId: 'echo-space-reverb-plate',
  displayName: 'Echo Plate Reverb',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'reverb',
  parameters: [
    {
      id: 'decay',
      label: 'Decay',
      type: 'float',
      min: 0.5,
      max: 5,
      step: 0.01,
      defaultValue: 1.8,
      unit: 's',
    },
    {
      id: 'mix',
      label: 'Mix',
      type: 'float',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.2,
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.space.delay.slap',
  pluginId: 'echo-space-delay-slap',
  displayName: 'Echo Slap Delay',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'delay',
  parameters: [
    {
      id: 'time',
      label: 'Time',
      type: 'float',
      min: 0.05,
      max: 0.15,
      step: 0.001,
      defaultValue: 0.09,
      unit: 's',
    },
    {
      id: 'feedback',
      label: 'Feedback',
      type: 'float',
      min: 0,
      max: 0.5,
      step: 0.01,
      defaultValue: 0.15,
    },
    {
      id: 'mix',
      label: 'Mix',
      type: 'float',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.2,
    },
  ],
});

pluginRegistry.registerManifest({
  manifestId: 'echo.master.limiter.brick',
  pluginId: 'echo-master-limiter-brick',
  displayName: 'Echo Brick Limiter',
  version: '1.0.0',
  vendor: 'Echo Sound Lab',
  category: 'dynamics',
  parameters: [
    {
      id: 'ceiling',
      label: 'Ceiling',
      type: 'float',
      min: -6,
      max: 0,
      step: 0.1,
      defaultValue: -0.8,
      unit: 'dB',
    },
    {
      id: 'release',
      label: 'Release',
      type: 'float',
      min: 0.01,
      max: 2,
      step: 0.01,
      defaultValue: 0.2,
      unit: 's',
    },
  ],
});
