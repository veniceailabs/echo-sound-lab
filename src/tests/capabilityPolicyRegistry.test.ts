import { describe, expect, test } from 'vitest';
import {
  CAPABILITY_RISK_TIER_MAP,
  Capability,
  getCapabilityPolicyDecision,
  getRiskTierForCapability,
  listCapabilitiesForTemplate,
} from '../services/capabilities';
import { createCreativeMixingPreset } from '../services/capabilityPresets';

describe('Capability Risk Registry', () => {
  test('defines a risk tier for every capability', () => {
    const capabilities = Object.values(Capability);
    for (const capability of capabilities) {
      expect(CAPABILITY_RISK_TIER_MAP[capability]).toBeDefined();
      expect(getRiskTierForCapability(capability)).toBeDefined();
    }
  });

  test('template policy decisions match expected approval model', () => {
    expect(getCapabilityPolicyDecision(Capability.UI_NAVIGATION, 'CO_PILOT').requiresACC).toBe(false);
    expect(getCapabilityPolicyDecision(Capability.PARAMETER_ADJUSTMENT, 'CO_PILOT').requiresACC).toBe(true);
    expect(getCapabilityPolicyDecision(Capability.RENDER_EXPORT, 'CO_PILOT').requiresACC).toBe(true);

    expect(getCapabilityPolicyDecision(Capability.PARAMETER_ADJUSTMENT, 'FULL_AUTONOMY').requiresACC).toBe(false);
    expect(getCapabilityPolicyDecision(Capability.FILE_WRITE, 'FULL_AUTONOMY').requiresACC).toBe(false);
    expect(getCapabilityPolicyDecision(Capability.RENDER_EXPORT, 'FULL_AUTONOMY').requiresACC).toBe(true);

    expect(getCapabilityPolicyDecision(Capability.UI_NAVIGATION, 'STRICT_REVIEW').requiresACC).toBe(true);
    expect(getCapabilityPolicyDecision(Capability.RENDER_EXPORT, 'STRICT_REVIEW').requiresACC).toBe(true);
  });

  test('listCapabilitiesForTemplate returns deterministic full policy summary', () => {
    const capabilities = Object.values(Capability);
    const summary = listCapabilitiesForTemplate('CO_PILOT');
    expect(summary).toHaveLength(capabilities.length);

    for (const capability of capabilities) {
      expect(summary.some((entry) => entry.capability === capability)).toBe(true);
    }
  });

  test('presets consume registry-derived risk tiers', () => {
    const preset = createCreativeMixingPreset('com.echo.soundlab', 3600000, 'CO_PILOT');

    for (const grant of preset.grants) {
      expect(grant.riskTier).toBe(getRiskTierForCapability(grant.capability));
    }
  });
});
