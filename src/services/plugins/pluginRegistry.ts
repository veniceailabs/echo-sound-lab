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

  getAllPlugins(): EchoPluginManifest[] {
    return this.listManifests();
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

const floatParam = (
  id: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
  step = 0.01,
  unit?: string
): EchoPluginParameterSchema => ({
  id,
  label,
  type: 'float',
  min,
  max,
  step,
  defaultValue,
  unit,
});

const intParam = (
  id: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
  step = 1,
  unit?: string
): EchoPluginParameterSchema => ({
  id,
  label,
  type: 'int',
  min,
  max,
  step,
  defaultValue,
  unit,
});

const boolParam = (
  id: string,
  label: string,
  defaultValue = false
): EchoPluginParameterSchema => ({
  id,
  label,
  type: 'boolean',
  defaultValue,
});

const manifests: EchoPluginManifest[] = [
  // Utility baseline plugin (kept for existing sessions/tests)
  {
    manifestId: 'echo.utility.gain.v1',
    pluginId: 'echo-utility-gain',
    displayName: 'Echo Utility Gain',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'utility',
    parameters: [
      floatParam('gainDb', 'Gain', -24, 24, 0, 0.1, 'dB'),
      floatParam('pan', 'Pan', -1, 1, 0, 0.01),
      boolParam('phaseInvert', 'Phase Invert', false),
    ],
  },

  // Vocal 30
  {
    manifestId: 'echo.vocal.comp.fet',
    pluginId: 'echo-vocal-comp-fet',
    displayName: 'Echo FET Comp',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('threshold', 'Threshold', -60, 0, -20, 0.1, 'dB'),
      floatParam('ratio', 'Ratio', 4, 20, 4, 0.1),
      floatParam('attack', 'Attack', 0.001, 0.05, 0.005, 0.001, 's'),
      floatParam('release', 'Release', 0.05, 1, 0.1, 0.01, 's'),
    ],
  },
  {
    manifestId: 'echo.vocal.comp.opto',
    pluginId: 'echo-vocal-comp-opto',
    displayName: 'Echo Opto Leveler',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('peakReduction', 'Peak Reduction', -40, 0, -10, 0.1, 'dB'),
      floatParam('makeup', 'Makeup', 0, 24, 2, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.comp.vca',
    pluginId: 'echo-vocal-comp-vca',
    displayName: 'Echo VCA Punch',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('threshold', 'Threshold', -60, 0, -15, 0.1, 'dB'),
      floatParam('ratio', 'Ratio', 2, 10, 4, 0.1),
      floatParam('attack', 'Attack', 0.01, 0.1, 0.02, 0.001, 's'),
    ],
  },
  {
    manifestId: 'echo.vocal.deesser',
    pluginId: 'echo-vocal-deesser',
    displayName: 'Echo De-Esser',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('threshold', 'Threshold', -60, 0, -20, 0.1, 'dB'),
      floatParam('frequency', 'Frequency', 4000, 12000, 7000, 10, 'Hz'),
    ],
  },
  {
    manifestId: 'echo.vocal.gate',
    pluginId: 'echo-vocal-gate',
    displayName: 'Echo Noise Gate',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('threshold', 'Threshold', -80, -20, -50, 0.1, 'dB'),
      floatParam('release', 'Release', 0.1, 2, 0.5, 0.01, 's'),
    ],
  },
  {
    manifestId: 'echo.vocal.rider',
    pluginId: 'echo-vocal-rider',
    displayName: 'Echo Auto-Leveler',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('targetLufs', 'Target LUFS', -24, -6, -14, 0.1, 'LUFS'),
      floatParam('speed', 'Speed', 0.1, 2, 1, 0.01),
    ],
  },
  {
    manifestId: 'echo.vocal.expander',
    pluginId: 'echo-vocal-expander',
    displayName: 'Echo Upward Expander',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('threshold', 'Threshold', -60, -20, -40, 0.1, 'dB'),
      floatParam('ratio', 'Ratio', 0.1, 0.9, 0.5, 0.01),
    ],
  },
  {
    manifestId: 'echo.vocal.harshness',
    pluginId: 'echo-vocal-harshness',
    displayName: 'Echo Harshness Tamer',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'dynamics',
    parameters: [
      floatParam('amount', 'Amount', 0, 100, 50, 1, '%'),
      floatParam('freq', 'Freq', 2000, 5000, 3000, 1, 'Hz'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.air',
    pluginId: 'echo-vocal-eq-air',
    displayName: 'Echo Air Shelf',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('freq', 'Freq', 8000, 20000, 12000, 10, 'Hz'),
      floatParam('boost', 'Boost', 0, 15, 4, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.presence',
    pluginId: 'echo-vocal-eq-presence',
    displayName: 'Echo Presence Peak',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('freq', 'Freq', 2000, 6000, 3500, 1, 'Hz'),
      floatParam('gain', 'Gain', -10, 10, 3, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.mud',
    pluginId: 'echo-vocal-eq-mud',
    displayName: 'Echo Mud Cut',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('freq', 'Freq', 200, 600, 300, 1, 'Hz'),
      floatParam('cut', 'Cut', -15, 0, -4, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.telephone',
    pluginId: 'echo-vocal-eq-telephone',
    displayName: 'Echo Telephone Filter',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('lowcut', 'Low Cut', 300, 1000, 500, 1, 'Hz'),
      floatParam('highcut', 'High Cut', 2000, 6000, 4000, 1, 'Hz'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.proximity',
    pluginId: 'echo-vocal-eq-proximity',
    displayName: 'Echo Podcast Proximity',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('freq', 'Freq', 80, 200, 120, 1, 'Hz'),
      floatParam('boost', 'Boost', 0, 10, 3, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.tube',
    pluginId: 'echo-vocal-eq-tube',
    displayName: 'Echo Tube EQ',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('lowBoost', 'Low Boost', 0, 10, 0, 0.1, 'dB'),
      floatParam('highBoost', 'High Boost', 0, 10, 0, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.clean',
    pluginId: 'echo-vocal-eq-clean',
    displayName: 'Echo Clean Subtractive',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [
      floatParam('hpf', 'HPF', 20, 200, 80, 1, 'Hz'),
      floatParam('notchFreq', 'Notch Freq', 1000, 5000, 2000, 1, 'Hz'),
      floatParam('notchCut', 'Notch Cut', -20, 0, 0, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.vocal.eq.tilt',
    pluginId: 'echo-vocal-eq-tilt',
    displayName: 'Echo Brightness Tilt',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'eq',
    parameters: [floatParam('tilt', 'Tilt', -10, 10, 0, 0.1, 'dB')],
  },
  {
    manifestId: 'echo.space.reverb.plate',
    pluginId: 'echo-space-reverb-plate',
    displayName: 'Echo Vintage Plate',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 0.5, 5, 1.5, 0.01, 's'),
      floatParam('mix', 'Mix', 0, 1, 0.15, 0.01),
    ],
  },
  {
    manifestId: 'echo.space.reverb.hall',
    pluginId: 'echo-space-reverb-hall',
    displayName: 'Echo Concert Hall',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 2, 10, 4, 0.01, 's'),
      floatParam('mix', 'Mix', 0, 1, 0.2, 0.01),
    ],
  },
  {
    manifestId: 'echo.space.reverb.room',
    pluginId: 'echo-space-reverb-room',
    displayName: 'Echo Vocal Booth',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 0.1, 1, 0.4, 0.01, 's'),
      floatParam('mix', 'Mix', 0, 1, 0.1, 0.01),
    ],
  },
  {
    manifestId: 'echo.space.reverb.spring',
    pluginId: 'echo-space-reverb-spring',
    displayName: 'Echo Spring Verb',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 1, 4, 2, 0.01, 's'),
      floatParam('boing', 'Boing', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.space.reverb.shimmer',
    pluginId: 'echo-space-reverb-shimmer',
    displayName: 'Echo Shimmer',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 3, 15, 6, 0.01, 's'),
      floatParam('shimmerAmount', 'Shimmer Amount', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.space.reverb.chamber',
    pluginId: 'echo-space-reverb-chamber',
    displayName: 'Echo Chamber',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'reverb',
    parameters: [
      floatParam('decay', 'Decay', 1, 3, 1.8, 0.01, 's'),
      floatParam('mix', 'Mix', 0, 1, 0.2, 0.01),
    ],
  },
  {
    manifestId: 'echo.mod.delay.slap',
    pluginId: 'echo-mod-delay-slap',
    displayName: 'Echo Slapback',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'delay',
    parameters: [
      floatParam('time', 'Time', 0.05, 0.15, 0.08, 0.001, 's'),
      floatParam('feedback', 'Feedback', 0, 0.5, 0.1, 0.01),
      floatParam('mix', 'Mix', 0, 1, 0.2, 0.01),
    ],
  },
  {
    manifestId: 'echo.mod.delay.pingpong',
    pluginId: 'echo-mod-delay-pingpong',
    displayName: 'Echo Ping-Pong',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'delay',
    parameters: [
      floatParam('time', 'Time', 0.1, 1, 0.25, 0.001, 's'),
      floatParam('feedback', 'Feedback', 0, 0.8, 0.4, 0.01),
      floatParam('width', 'Width', 0, 1, 1, 0.01),
    ],
  },
  {
    manifestId: 'echo.mod.delay.tape',
    pluginId: 'echo-mod-delay-tape',
    displayName: 'Echo Tape Echo',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'delay',
    parameters: [
      floatParam('time', 'Time', 0.1, 1, 0.3, 0.001, 's'),
      floatParam('feedback', 'Feedback', 0, 0.8, 0.4, 0.01),
      floatParam('wow', 'Wow', 0, 100, 20, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.mod.doubler',
    pluginId: 'echo-mod-doubler',
    displayName: 'Echo Stereo Doubler',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('spread', 'Spread', 0, 100, 50, 1, '%'),
      floatParam('detune', 'Detune', 0, 50, 15, 1, 'cent'),
    ],
  },
  {
    manifestId: 'echo.mod.chorus',
    pluginId: 'echo-mod-chorus',
    displayName: 'Echo Vocal Chorus',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('rate', 'Rate', 0.1, 5, 1, 0.01, 'Hz'),
      floatParam('depth', 'Depth', 0, 100, 40, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.color.tube',
    pluginId: 'echo-color-tube',
    displayName: 'Echo Tube Drive',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'saturation',
    parameters: [
      floatParam('drive', 'Drive', 0, 100, 20, 1, '%'),
      floatParam('tone', 'Tone', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.color.tape',
    pluginId: 'echo-color-tape',
    displayName: 'Echo Tape Warmth',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'saturation',
    parameters: [
      floatParam('saturation', 'Saturation', 0, 100, 30, 1, '%'),
      floatParam('hiss', 'Hiss', 0, 100, 10, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.color.bitcrush',
    pluginId: 'echo-color-bitcrush',
    displayName: 'Echo Lo-Fi Bitcrusher',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'saturation',
    parameters: [
      intParam('bits', 'Bits', 4, 16, 8),
      intParam('downsample', 'Downsample', 1, 10, 3),
    ],
  },

  // Instrument 20
  {
    manifestId: 'echo.bus.glue',
    pluginId: 'echo-bus-glue',
    displayName: 'Echo Mix Glue',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'bus',
    parameters: [
      floatParam('threshold', 'Threshold', -40, 0, -10, 0.1, 'dB'),
      floatParam('ratio', 'Ratio', 2, 10, 4, 0.1),
      floatParam('makeup', 'Makeup', 0, 12, 0, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.bus.smasher',
    pluginId: 'echo-bus-smasher',
    displayName: 'Echo Drum Smasher',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'bus',
    parameters: [
      floatParam('drive', 'Drive', 0, 100, 50, 1, '%'),
      floatParam('smash', 'Smash', 0, 100, 100, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.bus.transient',
    pluginId: 'echo-bus-transient',
    displayName: 'Echo Transient Shaper',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'bus',
    parameters: [
      floatParam('attack', 'Attack', -100, 100, 20, 1, '%'),
      floatParam('sustain', 'Sustain', -100, 100, 0, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.bus.width',
    pluginId: 'echo-bus-width',
    displayName: 'Echo Stereo Imager',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'bus',
    parameters: [
      floatParam('width', 'Width', 0, 200, 120, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.bus.tapemaster',
    pluginId: 'echo-bus-tapemaster',
    displayName: 'Echo Master Tape',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'bus',
    parameters: [
      floatParam('drive', 'Drive', 0, 10, 2, 0.1),
      floatParam('bump', 'Bump', 0, 10, 3, 0.1),
    ],
  },
  {
    manifestId: 'echo.master.limiter.brick',
    pluginId: 'echo-master-limiter-brick',
    displayName: 'Echo Brickwall Limiter',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'mastering',
    parameters: [
      floatParam('ceiling', 'Ceiling', -6, 0, -0.1, 0.1, 'dB'),
      floatParam('release', 'Release', 0.01, 1, 0.1, 0.01, 's'),
    ],
  },
  {
    manifestId: 'echo.master.clipper',
    pluginId: 'echo-master-clipper',
    displayName: 'Echo Soft Clipper',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'mastering',
    parameters: [
      floatParam('drive', 'Drive', 0, 24, 0, 0.1, 'dB'),
      floatParam('knee', 'Knee', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.master.lufs',
    pluginId: 'echo-master-lufs',
    displayName: 'Echo LUFS Target',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'mastering',
    parameters: [
      floatParam('target', 'Target', -24, -6, -14, 0.1, 'LUFS'),
    ],
  },
  {
    manifestId: 'echo.master.linear',
    pluginId: 'echo-master-linear',
    displayName: 'Echo Master EQ',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'mastering',
    parameters: [
      floatParam('low', 'Low', -6, 6, 0, 0.1, 'dB'),
      floatParam('mid', 'Mid', -6, 6, 0, 0.1, 'dB'),
      floatParam('high', 'High', -6, 6, 0, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.master.multiband',
    pluginId: 'echo-master-multiband',
    displayName: 'Echo Multiband Comp',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'mastering',
    parameters: [
      floatParam('lowGain', 'Low Gain', -10, 10, 0, 0.1, 'dB'),
      floatParam('midGain', 'Mid Gain', -10, 10, 0, 0.1, 'dB'),
      floatParam('highGain', 'High Gain', -10, 10, 0, 0.1, 'dB'),
    ],
  },
  {
    manifestId: 'echo.fx.vinyl',
    pluginId: 'echo-fx-vinyl',
    displayName: 'Echo Lo-Fi Vinyl',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'creative',
    parameters: [
      floatParam('wear', 'Wear', 0, 100, 50, 1, '%'),
      floatParam('dust', 'Dust', 0, 100, 20, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.amp',
    pluginId: 'echo-fx-amp',
    displayName: 'Echo Guitar Amp Sim',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'creative',
    parameters: [
      floatParam('drive', 'Drive', 0, 100, 40, 1, '%'),
      intParam('cabinet', 'Cabinet', 1, 3, 1),
    ],
  },
  {
    manifestId: 'echo.fx.fuzz',
    pluginId: 'echo-fx-fuzz',
    displayName: 'Echo Fuzz Pedal',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'creative',
    parameters: [
      floatParam('fuzz', 'Fuzz', 0, 100, 70, 1, '%'),
      floatParam('tone', 'Tone', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.phaser',
    pluginId: 'echo-fx-phaser',
    displayName: 'Echo Phaser',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('rate', 'Rate', 0.1, 10, 1, 0.01, 'Hz'),
      floatParam('feedback', 'Feedback', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.flanger',
    pluginId: 'echo-fx-flanger',
    displayName: 'Echo Flanger',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('rate', 'Rate', 0.1, 5, 0.5, 0.01, 'Hz'),
      floatParam('depth', 'Depth', 0, 100, 60, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.tremolo',
    pluginId: 'echo-fx-tremolo',
    displayName: 'Echo Tremolo',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('rate', 'Rate', 1, 20, 5, 0.01, 'Hz'),
      floatParam('depth', 'Depth', 0, 100, 80, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.autowah',
    pluginId: 'echo-fx-autowah',
    displayName: 'Echo Auto-Wah',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('sensitivity', 'Sensitivity', 0, 100, 50, 1, '%'),
      floatParam('resonance', 'Resonance', 0, 100, 70, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.sub',
    pluginId: 'echo-fx-sub',
    displayName: 'Echo Sub Bass Enhancer',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'creative',
    parameters: [
      floatParam('freq', 'Freq', 30, 80, 50, 1, 'Hz'),
      floatParam('mix', 'Mix', 0, 100, 30, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.rotary',
    pluginId: 'echo-fx-rotary',
    displayName: 'Echo Rotary Speaker',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'modulation',
    parameters: [
      floatParam('speed', 'Speed', 0, 100, 50, 1, '%'),
    ],
  },
  {
    manifestId: 'echo.fx.ringmod',
    pluginId: 'echo-fx-ringmod',
    displayName: 'Echo Ring Modulator',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'creative',
    parameters: [
      floatParam('freq', 'Freq', 100, 2000, 500, 1, 'Hz'),
      floatParam('mix', 'Mix', 0, 100, 50, 1, '%'),
    ],
  },

  // Legacy alias to keep old sessions functional
  {
    manifestId: 'echo.space.delay.slap',
    pluginId: 'echo-space-delay-slap-legacy',
    displayName: 'Echo Slap Delay (Legacy)',
    version: '1.0.0',
    vendor: 'Echo Sound Lab',
    category: 'delay',
    parameters: [
      floatParam('time', 'Time', 0.05, 0.15, 0.08, 0.001, 's'),
      floatParam('feedback', 'Feedback', 0, 0.5, 0.1, 0.01),
      floatParam('mix', 'Mix', 0, 1, 0.2, 0.01),
    ],
  },
];

for (const manifest of manifests) {
  pluginRegistry.registerManifest(manifest);
}
