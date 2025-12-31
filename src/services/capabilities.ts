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
  PARAMETER_ADJUSTMENT = 'PARAMETER_ADJUSTMENT',
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  TRANSPORT_CONTROL = 'TRANSPORT_CONTROL',
  RENDER_EXPORT = 'RENDER_EXPORT',
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

export default {
  Capability,
  type CapabilityScope,
  type CapabilityGrant,
  type CapabilityRequest,
  type CapabilityCheckResult
};
