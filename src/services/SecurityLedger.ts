export type AccessBlockReasonCode =
  | 'MISSING_GRANT'
  | 'SCOPE_MISMATCH'
  | 'TTL_EXPIRED'
  | 'REPLAY_DETECTED'
  | 'MAX_USES_EXCEEDED'
  | 'WORKSPACE_MISMATCH'
  | 'ACC_EVALUATION_ERROR';

export interface SecurityLedgerEntry {
  index: number;
  timestamp: number;
  proposalId: string;
  actionType: string;
  sessionId: string;
  reasonCode: AccessBlockReasonCode;
  reason: string;
  capability?: string;
  grantId?: string;
}

export interface SecurityBlockInput {
  proposalId: string;
  actionType: string;
  sessionId: string;
  reasonCode: AccessBlockReasonCode;
  reason: string;
  capability?: string;
  grantId?: string;
}

class SecurityLedger {
  private readonly entries: SecurityLedgerEntry[] = [];

  appendBlock(input: SecurityBlockInput): SecurityLedgerEntry {
    const entry: SecurityLedgerEntry = Object.freeze({
      index: this.entries.length,
      timestamp: Date.now(),
      proposalId: input.proposalId,
      actionType: input.actionType,
      sessionId: input.sessionId,
      reasonCode: input.reasonCode,
      reason: input.reason,
      capability: input.capability,
      grantId: input.grantId,
    });
    this.entries.push(entry);
    return entry;
  }

  getEntries(): SecurityLedgerEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  resetForTest(): void {
    this.entries.length = 0;
  }
}

export const securityLedger = new SecurityLedger();
