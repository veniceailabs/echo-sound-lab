/**
 * Phase 3B Audit & Diagnostics UI Components
 *
 * All components are read-only and log-backed.
 * No reverse imports to authority, confirmation, or execution systems.
 *
 * Exports:
 * - AccHistoryPanel: ACC issuance and outcomes
 * - CapabilityTimeline: Authority grants and expiration
 * - DenialLog: Capability denials (final)
 * - SessionSummary: Session lifecycle and activity
 *
 * CRITICAL: These components form a view layer only.
 * They do not export any authority code, handlers, or state mutations.
 */

export { AccHistoryPanel, type AccHistoryPanelProps } from './AccHistoryPanel';
export { CapabilityTimeline, type CapabilityTimelineProps } from './CapabilityTimeline';
export { DenialLog, type DenialLogProps } from './DenialLog';
export { SessionSummary, type SessionSummaryProps } from './SessionSummary';

// Type re-export for convenience (read-only)
export type { AuditEvent } from './AccHistoryPanel';
