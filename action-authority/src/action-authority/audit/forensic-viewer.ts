/**
 * Forensic Viewer v2.0: Projection Builder
 *
 * Converts sealed ForensicAuditEntry + governance context
 * into a ForensicViewModel for UI rendering.
 *
 * This is purely derived state. No mutations. No side effects.
 */

import { ForensicAuditEntry } from './forensic-types';
import {
  ForensicViewModel,
  ExecutionMode,
  LeaseProjection,
  QuorumProjection,
  RevocationEvent,
  TelemetryEvent,
  deriveExecutionMode,
  modeToReadable,
  modeToColor,
} from './forensic-viewer-types';

/**
 * Telemetry Store: Append-only log of non-authoritative events
 * (Used ONLY for observability, never for decisions)
 */
class TelemetryStore {
  private events: TelemetryEvent[] = [];

  emit(event: TelemetryEvent): void {
    this.events.push(event);
  }

  getRevocationEvent(leaseId: string): RevocationEvent | null {
    const event = this.events.find(
      (e) => e.type === 'LEASE_REVOKED' && e.data.leaseId === leaseId,
    );
    if (!event) return null;

    return {
      type: (event.data.eventType as RevocationEvent['type']) || 'MANUAL_REVOCATION',
      revokedLeaseId: event.data.leaseId as string,
      reason: event.data.reason as string,
      revokedAt: event.timestamp,
      leaseAgeMs: event.data.leaseAgeMs as number,
    };
  }

  getAllRevocationEvents(): RevocationEvent[] {
    return this.events
      .filter((e) => e.type === 'LEASE_REVOKED')
      .map((e) => ({
        type: (e.data.eventType as RevocationEvent['type']) || 'MANUAL_REVOCATION',
        revokedLeaseId: e.data.leaseId as string,
        reason: e.data.reason as string,
        revokedAt: e.timestamp,
        leaseAgeMs: e.data.leaseAgeMs as number,
      }));
  }
}

export const telemetryStore = new TelemetryStore();

/**
 * Build Forensic View Model
 *
 * Given a sealed audit entry and optional governance context,
 * produce a view model for the UI.
 *
 * The audit entry is never modified. The context is queried
 * from external sources (LeasesGate, QuorumGate, telemetry).
 */
export function buildForensicViewModel(
  entry: ForensicAuditEntry,
  context?: {
    lease?: LeaseProjection;
    quorum?: QuorumProjection;
  },
): ForensicViewModel {
  // Check if this entry represents a revocation event
  const revocation = telemetryStore.getRevocationEvent(entry.actionId);

  // Derive execution mode from available context
  const executionMode = deriveExecutionMode(entry, context?.lease, context?.quorum, revocation);

  // Build readable mode string
  const readableMode = modeToReadable(executionMode, context?.quorum?.riskLevel);

  // Determine color scheme
  const colorScheme = modeToColor(executionMode);

  return {
    baseEntry: entry,
    executionMode,
    lease: context?.lease,
    quorum: context?.quorum,
    revocation,
    readableMode,
    colorScheme,
  };
}

/**
 * Query Lease Context from LeasesGate
 * (Stub: real implementation would call LeasesGate methods)
 *
 * This is called ONLY for UI rendering, not for authorization.
 */
export function queryLeaseContext(
  sessionId: string,
  domain: string,
  now: number = Date.now(),
): LeaseProjection | null {
  // Placeholder: In real implementation, would call:
  // const leaseCheck = LeasesGate.getLease(sessionId, domain);
  // if (!leaseCheck.lease) return null;
  // return {
  //   leaseId: leaseCheck.lease.leaseId,
  //   heartbeatLatencyMs: now - (leaseCheck.lease.lastHeartbeatAt || now),
  //   ...
  // }

  return null; // Stub for now
}

/**
 * Query Quorum Context from QuorumGate
 * (Stub: real implementation would call QuorumGate methods)
 *
 * This is called ONLY for UI rendering, not for authorization.
 */
export function queryQuorumContext(actionId: string): QuorumProjection | null {
  // Placeholder: In real implementation, would call:
  // const envelope = QuorumGate.getEnvelope(actionId);
  // if (!envelope) return null;
  // return {
  //   attestations: envelope.attestations.map(...),
  //   requiredSignatures: ...,
  //   ...
  // }

  return null; // Stub for now
}

/**
 * Format execution mode for display
 */
export function formatExecutionMode(model: ForensicViewModel): string {
  return model.readableMode;
}

/**
 * Format heartbeat latency for display
 */
export function formatHeartbeatLatency(model: ForensicViewModel): string | null {
  if (!model.lease) return null;
  return `${model.lease.heartbeatLatencyMs}ms / ${model.lease.heartbeatIntervalMs}ms`;
}

/**
 * Format signature status for display
 */
export function formatSignatureStatus(model: ForensicViewModel): string | null {
  if (!model.quorum) return null;
  return `${model.quorum.actualSignatures}/${model.quorum.requiredSignatures} signatures`;
}

/**
 * Format revocation reason for display
 */
export function formatRevocationReason(model: ForensicViewModel): string | null {
  if (!model.revocation) return null;
  return `${model.revocation.type}: ${model.revocation.reason}`;
}

/**
 * Emit a telemetry event (for revocation logging, heartbeat samples, etc.)
 * Non-authoritative. For observability only.
 */
export function emitTelemetry(event: TelemetryEvent): void {
  telemetryStore.emit(event);
}
