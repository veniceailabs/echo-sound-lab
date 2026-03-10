import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ACC_POLICY_TEMPLATE,
  RiskTier,
  shouldRequireACCForRiskTier,
  Capability,
} from '../services/capabilities';
import { createCreativeMixingPreset } from '../services/capabilityPresets';

function getGrantRequiresAcc(
  capability: Capability,
  template: 'FULL_AUTONOMY' | 'CO_PILOT' | 'STRICT_REVIEW'
): boolean {
  const preset = createCreativeMixingPreset('com.echo.soundlab', 3600000, template);
  const grant = preset.grants.find((item) => item.capability === capability);
  if (!grant) throw new Error(`Missing grant for capability: ${capability}`);
  return grant.requiresACC;
}

describe('ACC Risk Tier Policy Templates', () => {
  test('co-pilot is the default policy template', () => {
    expect(DEFAULT_ACC_POLICY_TEMPLATE).toBe('CO_PILOT');
  });

  test('full autonomy auto-approves LOW and MEDIUM only', () => {
    expect(shouldRequireACCForRiskTier(RiskTier.LOW, 'FULL_AUTONOMY')).toBe(false);
    expect(shouldRequireACCForRiskTier(RiskTier.MEDIUM, 'FULL_AUTONOMY')).toBe(false);
    expect(shouldRequireACCForRiskTier(RiskTier.HIGH, 'FULL_AUTONOMY')).toBe(true);
  });

  test('co-pilot auto-approves LOW and prompts MEDIUM/HIGH', () => {
    expect(shouldRequireACCForRiskTier(RiskTier.LOW, 'CO_PILOT')).toBe(false);
    expect(shouldRequireACCForRiskTier(RiskTier.MEDIUM, 'CO_PILOT')).toBe(true);
    expect(shouldRequireACCForRiskTier(RiskTier.HIGH, 'CO_PILOT')).toBe(true);
  });

  test('strict review prompts for all tiers', () => {
    expect(shouldRequireACCForRiskTier(RiskTier.LOW, 'STRICT_REVIEW')).toBe(true);
    expect(shouldRequireACCForRiskTier(RiskTier.MEDIUM, 'STRICT_REVIEW')).toBe(true);
    expect(shouldRequireACCForRiskTier(RiskTier.HIGH, 'STRICT_REVIEW')).toBe(true);
  });

  test('creative mixing presets map capabilities to expected risk tiers', () => {
    expect(getGrantRequiresAcc(Capability.PARAMETER_ADJUSTMENT, 'CO_PILOT')).toBe(false); // LOW
    expect(getGrantRequiresAcc(Capability.FILE_WRITE, 'CO_PILOT')).toBe(true); // MEDIUM
    expect(getGrantRequiresAcc(Capability.RENDER_EXPORT, 'CO_PILOT')).toBe(true); // HIGH

    expect(getGrantRequiresAcc(Capability.FILE_WRITE, 'FULL_AUTONOMY')).toBe(false);
    expect(getGrantRequiresAcc(Capability.RENDER_EXPORT, 'FULL_AUTONOMY')).toBe(true);

    expect(getGrantRequiresAcc(Capability.PARAMETER_ADJUSTMENT, 'STRICT_REVIEW')).toBe(true);
    expect(getGrantRequiresAcc(Capability.FILE_WRITE, 'STRICT_REVIEW')).toBe(true);
    expect(getGrantRequiresAcc(Capability.RENDER_EXPORT, 'STRICT_REVIEW')).toBe(true);
  });
});
