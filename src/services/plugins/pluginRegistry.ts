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

