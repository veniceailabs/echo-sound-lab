/**
 * Capability Presets — Common Artist Use Cases
 *
 * Pre-configured capability sets for common workflows.
 * Artist selects use case → preset is loaded → capabilities are granted.
 *
 * Prevents artists from micro-managing individual capabilities.
 * All presets are mechanical, testable, and auditable.
 */

import { Capability, CapabilityGrant, CapabilityScope } from './capabilities';

export type PresetName = 'SYSTEM_NAVIGATION' | 'CREATIVE_MIXING' | 'FILE_EXPORT_ONLY' | 'CUSTOM';

export interface CapabilityPreset {
  name: PresetName;
  description: string;
  grants: CapabilityGrant[];
}

/**
 * Preset 1: SYSTEM_NAVIGATION
 * Artist can use UI but cannot modify audio or save.
 * Use case: Browse, analyze, compare, learn.
 */
export function createSystemNavigationPreset(
  appId: string,
  expiryMs: number = 3600000  // 1 hour default
): CapabilityPreset {
  const expiresAt = Date.now() + expiryMs;

  return {
    name: 'SYSTEM_NAVIGATION',
    description: 'Browse and analyze audio. No modifications or file operations.',
    grants: [
      {
        capability: Capability.UI_NAVIGATION,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.TRANSPORT_CONTROL,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.FILE_READ,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.TEXT_INPUT_SAFE,
        scope: { appId },
        expiresAt,
        requiresACC: false
      }
    ]
  };
}

/**
 * Preset 2: CREATIVE_MIXING
 * Artist can modify parameters, process audio, but exports require ACC.
 * Use case: Full mixing session with confirmation on exports.
 */
export function createCreativeMixingPreset(
  appId: string,
  expiryMs: number = 14400000  // 4 hours default
): CapabilityPreset {
  const expiresAt = Date.now() + expiryMs;

  return {
    name: 'CREATIVE_MIXING',
    description: 'Full mixing: parameters, processing, and exports (exports require confirmation).',
    grants: [
      {
        capability: Capability.UI_NAVIGATION,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.TRANSPORT_CONTROL,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.PARAMETER_ADJUSTMENT,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.FILE_READ,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.FILE_WRITE,
        scope: { appId },
        expiresAt,
        requiresACC: false  // Autosave is allowed
      },
      {
        capability: Capability.RENDER_EXPORT,
        scope: { appId },
        expiresAt,
        requiresACC: true  // Exports require explicit confirmation (Rule C4)
      },
      {
        capability: Capability.TEXT_INPUT_SAFE,
        scope: { appId },
        expiresAt,
        requiresACC: false
      }
    ]
  };
}

/**
 * Preset 3: FILE_EXPORT_ONLY
 * Artist can only export already-processed audio.
 * Use case: Finalization pass, format conversion, backup.
 */
export function createFileExportOnlyPreset(
  appId: string,
  expiryMs: number = 1800000  // 30 minutes default
): CapabilityPreset {
  const expiresAt = Date.now() + expiryMs;

  return {
    name: 'FILE_EXPORT_ONLY',
    description: 'Export only: read, compare, and export. No modifications.',
    grants: [
      {
        capability: Capability.UI_NAVIGATION,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.TRANSPORT_CONTROL,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.FILE_READ,
        scope: { appId },
        expiresAt,
        requiresACC: false
      },
      {
        capability: Capability.RENDER_EXPORT,
        scope: { appId },
        expiresAt,
        requiresACC: true  // Exports require confirmation
      },
      {
        capability: Capability.TEXT_INPUT_SAFE,
        scope: { appId },
        expiresAt,
        requiresACC: false
      }
    ]
  };
}

/**
 * Preset registry for discovery.
 */
export const CAPABILITY_PRESETS = {
  SYSTEM_NAVIGATION: createSystemNavigationPreset,
  CREATIVE_MIXING: createCreativeMixingPreset,
  FILE_EXPORT_ONLY: createFileExportOnlyPreset
};

/**
 * Load preset by name.
 */
export function loadPreset(
  presetName: PresetName,
  appId: string,
  expiryMs?: number
): CapabilityPreset {
  switch (presetName) {
    case 'SYSTEM_NAVIGATION':
      return createSystemNavigationPreset(appId, expiryMs);
    case 'CREATIVE_MIXING':
      return createCreativeMixingPreset(appId, expiryMs);
    case 'FILE_EXPORT_ONLY':
      return createFileExportOnlyPreset(appId, expiryMs);
    default:
      throw new Error(`Unknown preset: ${presetName}`);
  }
}

/**
 * Describe preset for UI (human-readable).
 */
export function describePreset(presetName: PresetName): {
  title: string;
  description: string;
  capabilities: string[];
} {
  switch (presetName) {
    case 'SYSTEM_NAVIGATION':
      return {
        title: 'Browse & Analyze',
        description: 'Navigate the interface, play audio, open files, but make no changes.',
        capabilities: [
          'UI Navigation',
          'Transport Control (play/pause)',
          'File Read',
          'Text Input (safe fields: names, labels only)'
        ]
      };

    case 'CREATIVE_MIXING':
      return {
        title: 'Full Mixing Session',
        description: 'Adjust parameters, process audio, save and export (exports require confirmation).',
        capabilities: [
          'UI Navigation',
          'Transport Control',
          'Parameter Adjustment',
          'File Read',
          'File Write (autosave)',
          'Render & Export (requires confirmation)',
          'Text Input (safe fields only: names, labels, metadata)'
        ]
      };

    case 'FILE_EXPORT_ONLY':
      return {
        title: 'Export Only',
        description: 'Compare audio and export to different formats. No modifications allowed.',
        capabilities: [
          'UI Navigation',
          'Transport Control',
          'File Read',
          'Render & Export (requires confirmation)',
          'Text Input (safe fields only: names, labels, metadata)'
        ]
      };

    default:
      throw new Error(`Unknown preset: ${presetName}`);
  }
}

/**
 * Get total duration for a preset (for session TTL planning).
 */
export function getPresetDuration(presetName: PresetName): number {
  switch (presetName) {
    case 'SYSTEM_NAVIGATION':
      return 3600000;  // 1 hour
    case 'CREATIVE_MIXING':
      return 14400000;  // 4 hours
    case 'FILE_EXPORT_ONLY':
      return 1800000;  // 30 minutes
    default:
      return 3600000;  // Default to 1 hour
  }
}

export default {
  createSystemNavigationPreset,
  createCreativeMixingPreset,
  createFileExportOnlyPreset,
  loadPreset,
  describePreset,
  getPresetDuration
};
