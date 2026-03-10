/**
 * Core Capability Types & Interfaces
 *
 * Fundamental definitions for app-agnostic, default-deny capability system.
 * Every action must map to exactly one capability.
 * Every capability must have scope + expiry.
 */

export enum Capability {
  UI_NAVIGATION = 'UI_NAVIGATION',
  TEXT_INPUT = 'TEXT_INPUT',
  TEXT_INPUT_SAFE = 'TEXT_INPUT_SAFE',
  PARAMETER_ADJUSTMENT = 'PARAMETER_ADJUSTMENT',
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  TRANSPORT_CONTROL = 'TRANSPORT_CONTROL',
  RENDER_EXPORT = 'RENDER_EXPORT',
}

export enum RiskTier {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type AccPolicyTemplateName = 'FULL_AUTONOMY' | 'CO_PILOT' | 'STRICT_REVIEW';

export type AccPolicyTemplate = {
  name: AccPolicyTemplateName;
  description: string;
  autoApproveTiers: RiskTier[];
};

export const ACC_POLICY_TEMPLATES: Record<AccPolicyTemplateName, AccPolicyTemplate> = {
  FULL_AUTONOMY: {
    name: 'FULL_AUTONOMY',
    description: 'Auto-approves LOW and MEDIUM. Prompts for HIGH.',
    autoApproveTiers: [RiskTier.LOW, RiskTier.MEDIUM],
  },
  CO_PILOT: {
    name: 'CO_PILOT',
    description: 'Auto-approves LOW. Prompts for MEDIUM and HIGH.',
    autoApproveTiers: [RiskTier.LOW],
  },
  STRICT_REVIEW: {
    name: 'STRICT_REVIEW',
    description: 'Prompts for all actions.',
    autoApproveTiers: [],
  },
};

export const DEFAULT_ACC_POLICY_TEMPLATE: AccPolicyTemplateName = 'CO_PILOT';

export const CAPABILITY_RISK_TIER_MAP: Readonly<Record<Capability, RiskTier>> = Object.freeze({
  [Capability.UI_NAVIGATION]: RiskTier.LOW,
  [Capability.TEXT_INPUT]: RiskTier.MEDIUM,
  [Capability.TEXT_INPUT_SAFE]: RiskTier.LOW,
  [Capability.PARAMETER_ADJUSTMENT]: RiskTier.MEDIUM,
  [Capability.FILE_READ]: RiskTier.LOW,
  [Capability.FILE_WRITE]: RiskTier.MEDIUM,
  [Capability.TRANSPORT_CONTROL]: RiskTier.LOW,
  [Capability.RENDER_EXPORT]: RiskTier.HIGH,
});

export function shouldRequireACCForRiskTier(
  riskTier: RiskTier,
  policyTemplate: AccPolicyTemplateName = DEFAULT_ACC_POLICY_TEMPLATE
): boolean {
  const template = ACC_POLICY_TEMPLATES[policyTemplate] || ACC_POLICY_TEMPLATES[DEFAULT_ACC_POLICY_TEMPLATE];
  return !template.autoApproveTiers.includes(riskTier);
}

export function getRiskTierForCapability(capability: Capability): RiskTier {
  return CAPABILITY_RISK_TIER_MAP[capability] || RiskTier.HIGH;
}

export type CapabilityPolicyDecision = {
  capability: Capability;
  riskTier: RiskTier;
  requiresACC: boolean;
  policyTemplate: AccPolicyTemplateName;
};

export function getCapabilityPolicyDecision(
  capability: Capability,
  policyTemplate: AccPolicyTemplateName = DEFAULT_ACC_POLICY_TEMPLATE
): CapabilityPolicyDecision {
  const riskTier = getRiskTierForCapability(capability);
  return {
    capability,
    riskTier,
    requiresACC: shouldRequireACCForRiskTier(riskTier, policyTemplate),
    policyTemplate,
  };
}

export function listCapabilitiesForTemplate(
  policyTemplate: AccPolicyTemplateName = DEFAULT_ACC_POLICY_TEMPLATE
): CapabilityPolicyDecision[] {
  const allCapabilities = Object.values(Capability) as Capability[];
  return allCapabilities.map((capability) => getCapabilityPolicyDecision(capability, policyTemplate));
}

/**
 * TEXT_INPUT field classification (C: Context Narrowing).
 * Prevents typing destructive content into command/script fields.
 */
export enum TextInputFieldType {
  SAFE = 'SAFE',                              // Preset name, label, metadata (always safe)
  UNKNOWN = 'UNKNOWN',                        // Default: conservative, requires ACC
  SENSITIVE = 'SENSITIVE',                    // Terminal, code editor, macro, shell (hard stop)
}

/**
 * Scope: Where a capability is valid.
 * Prevents cross-app authority leakage.
 */
export type CapabilityScope = {
  appId: string;                // e.g. "com.apple.logic10", "com.test.app"
  windowId?: string;            // optional: specific UI region
  resourceIds?: string[];       // optional: specific files/tracks/nodes
};

/**
 * CapabilityGrant: What's allowed.
 * Immutable once issued. Time-bounded. No escalation.
 */
export type CapabilityGrant = {
  capability: Capability;
  scope: CapabilityScope;
  expiresAt: number;            // absolute epoch ms (monotonic)
  requiresACC: boolean;         // if true, must get active consent before each use
  riskTier?: RiskTier;
  policyTemplate?: AccPolicyTemplateName;
};

/**
 * CapabilityRequest: What's being attempted.
 * Logged on every check (deny + allow).
 */
export type CapabilityRequest = {
  capability: Capability;
  scope: CapabilityScope;
  reason: string;               // human-readable intent, logged
};

/**
 * Capability Result: What happened.
 * For audit trail.
 */
export type CapabilityCheckResult = {
  allowed: boolean;
  grant?: CapabilityGrant;
  denialReason?: string;
  timestamp: number;
};

export type {
  CapabilityScope,
  CapabilityGrant,
  CapabilityRequest,
  CapabilityCheckResult
};
