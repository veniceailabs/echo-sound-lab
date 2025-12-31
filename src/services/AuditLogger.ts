/**
 * Audit Logger
 *
 * Canonical instrumentation for Phase 3A End-to-End Golden Path Test.
 * Emits exactly the log events specified in PHASE3_E2E_CHECKLIST.md.
 *
 * Rules:
 * - One entry per observable event
 * - Strict timestamp (millisecond precision)
 * - Structured JSON format
 * - No summaries, no inference
 * - Ordered by emission time
 */

export type AuditEventType =
  | 'SESSION_STARTED'
  | 'AUTHORITY_GRANTED'
  | 'CAPABILITY_VISIBLE'
  | 'CAPABILITY_CHECK'
  | 'CAPABILITY_ALLOWED'
  | 'CAPABILITY_REQUIRES_ACC'
  | 'CAPABILITY_DENIED'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_HALTED_PENDING_ACC'
  | 'EXECUTION_RESUMED_ONCE'
  | 'EXECUTION_COMPLETED'
  | 'ACC_ISSUED'
  | 'ACC_RESPONSE_RECEIVED'
  | 'ACC_VALIDATED'
  | 'ACC_TOKEN_CONSUMED'
  | 'FILE_WRITE_ATTEMPT'
  | 'FILE_WRITE_ALLOWED'
  | 'AUDIT_LOG_APPEND'
  | 'REVOKE_ALL_AUTHORITIES'
  | 'CAPABILITY_GRANTS_CLEARED'
  | 'ACC_TOKENS_INVALIDATED'
  | 'SESSION_END_REQUESTED'
  | 'SESSION_INACTIVE';

export interface AuditEvent {
  type: AuditEventType;
  timestamp: number; // milliseconds since epoch
  data: Record<string, any>;
  sequence: number; // ordering guarantee
}

export class AuditLogger {
  private events: AuditEvent[] = [];
  private sequence = 0;
  private startTime = Date.now();

  /**
   * Emit a structured audit event.
   * Timestamps are absolute epoch time.
   * Sequence is strictly monotonic.
   */
  emit(type: AuditEventType, data: Record<string, any> = {}): AuditEvent {
    const event: AuditEvent = {
      type,
      timestamp: Date.now(),
      data,
      sequence: this.sequence++
    };

    this.events.push(event);

    // Console output for real-time visibility (test harness can capture)
    console.log(`[AUDIT] ${event.sequence.toString().padStart(3, '0')} | ${event.type.padEnd(30)} | ${JSON.stringify(event.data)}`);

    return event;
  }

  /**
   * Get all events in order.
   */
  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type.
   */
  getEventsByType(type: AuditEventType): AuditEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Check if an event type occurred.
   */
  hasEvent(type: AuditEventType): boolean {
    return this.events.some(e => e.type === type);
  }

  /**
   * Check if a forbidden event occurred.
   */
  hasForbiddenEvent(type: AuditEventType): boolean {
    return this.hasEvent(type);
  }

  /**
   * Get event count for a type.
   */
  countEvents(type: AuditEventType): number {
    return this.events.filter(e => e.type === type).length;
  }

  /**
   * Clear all events (for testing).
   */
  clear(): void {
    this.events = [];
    this.sequence = 0;
  }

  /**
   * Export as JSON for analysis.
   */
  toJSON(): AuditEvent[] {
    return this.getAllEvents();
  }

  /**
   * Export as markdown trace.
   */
  toMarkdownTrace(): string {
    let output = '';
    output += '# Audit Log Trace\n\n';
    output += '| Seq | Timestamp (ms) | Event Type | Data |\n';
    output += '|-----|-------|-----------|------|\n';

    for (const event of this.events) {
      const dataStr = JSON.stringify(event.data).replace(/\|/g, '\\|');
      output += `| ${event.sequence} | ${event.timestamp} | ${event.type} | ${dataStr} |\n`;
    }

    return output;
  }
}

// Global singleton
let _auditLogger: AuditLogger | null = null;

export function initAuditLogger(): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new AuditLogger();
  }
  return _auditLogger;
}

export function getAuditLogger(): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new AuditLogger();
  }
  return _auditLogger;
}
