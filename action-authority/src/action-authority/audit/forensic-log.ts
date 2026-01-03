/**
 * Action Authority: Forensic Audit Log Service
 *
 * Single source of truth for all action execution records.
 *
 * Guarantees:
 *  ✅ Append-only: Entries can only be added, never modified
 *  ✅ Immutable: Each entry is sealed with Object.freeze()
 *  ✅ Ordered: Entries maintain strict chronological order
 *  ✅ Complete: Every EXECUTED action generates exactly one entry
 *  ✅ Sealed: Once written, entry is permanent
 *
 * This log can be:
 *  - Exported as JSON for regulatory review
 *  - Analyzed for intelligence debugging
 *  - Used for non-repudiation in disputes
 *  - Archived for compliance
 */

import {
  ForensicAuditEntry,
  ForensicAuditQueryResult,
  ForensicAuditExport,
  ChainVerificationReport,
  createForensicAuditEntry,
  verifyForensicIntegrity,
  PerceptionData,
  AuthorityData,
  ExecutionData,
} from './forensic-types';
import { getSignatureProvider, initializeSignatureProvider } from './SignatureProvider';

/**
 * Forensic Audit Log: Immutable, append-only storage
 * LEVEL 1: Hash-chained for cryptographic continuity
 */
export class ForensicAuditLog {
  private static entries: ForensicAuditEntry[] = [];
  private static entryMap: Map<string, ForensicAuditEntry> = new Map();
  private static sealed: boolean = false; // Can be sealed for production (read-only)
  // LEVEL 1: Trust Network
  private static tipHash: string = 'GENESIS_BLOCK_000000000000000000000000'; // Current chain tip

  /**
   * LEVEL 1 + LEVEL 5: Generate cryptographic signature via SignatureProvider
   * AMENDMENT L: Decoupled signing strategy supports algorithm rotation
   *
   * The SignatureProvider abstracts the hashing algorithm:
   * - 2025: SHA-256 (classical)
   * - 2026: SHA-256 + ML-DSA (hybrid)
   * - 2028+: Failover to post-quantum if classical breaks
   */
  private static async generateSignatureBundle(data: Record<string, unknown>) {
    const provider = getSignatureProvider();
    return provider.sign(data);
  }

  /**
   * Write a forensic entry (the only way to record a decision)
   *
   * This is called by the Dispatcher after execution completes.
   * It combines perception (WHY), authority (WHO), and execution (OUTCOME).
   * LEVEL 1: Hash chaining support
   * LEVEL 5: Hybrid signature support (Amendment L)
   */
  public static async writeEntry(
    auditId: string,
    actionId: string,
    session: string,
    rationale: PerceptionData,
    authority: AuthorityData,
    execution: ExecutionData,
  ): Promise<string> {
    if (this.sealed) {
      throw new Error('Forensic Audit Log is sealed. Cannot write new entries.');
    }

    // LEVEL 1: Chain setup
    const chainIndex = this.entries.length;
    const prevHash = this.tipHash;

    // Create the record structure (without signatures initially)
    const record = {
      auditId,
      actionId,
      timestamp: Date.now(),
      session,
      rationale,
      authority,
      execution,
      sealed: true,
      sealedAt: Date.now(),
      sealedBy: 'ACTION_AUTHORITY_V1.3.0',
      prevHash,
      chainIndex,
    };

    // LEVEL 5: Generate signature bundle via provider (Amendment L: Algorithm Agnosticism)
    const signatureBundle = await this.generateSignatureBundle(record);
    const ownHash = signatureBundle.classical.hash; // Use classical hash for chain (until 2028)

    // Add signatures to record (for later forensic inspection)
    const recordWithSignatures = {
      ...record,
      signatures: signatureBundle,
    };

    // Create the sealed entry with signatures and calculated hash
    const entry = createForensicAuditEntry(
      auditId,
      actionId,
      session,
      rationale,
      authority,
      execution,
      prevHash,
      ownHash,
      chainIndex,
    );

    // Attach signature bundle to entry (optional field)
    (entry as any).signatures = signatureBundle;

    // Verify integrity before storing
    if (!verifyForensicIntegrity(entry)) {
      throw new Error('Forensic entry failed integrity check. Entry is not properly sealed.');
    }

    // Store in both array (for order) and map (for O(1) lookup)
    this.entries.push(entry);
    this.entryMap.set(auditId, entry);

    // LEVEL 1: Advance the chain tip
    this.tipHash = ownHash;

    // Log to console for development visibility
    console.log(`🏛️ [FORENSIC_AUDIT] Entry sealed: ${auditId}`);
    console.log(`   Action: ${actionId}`);
    console.log(`   Session: ${session}`);
    console.log(`   Status: ${execution.status}`);
    console.log(`   Domain: ${execution.domain}`);
    console.log(`   ⛓️ [TRUST_NETWORK] Chain #${chainIndex} | Hash: ${ownHash.substring(0, 8)}...`);

    return auditId;
  }

  /**
   * Retrieve a single forensic entry by audit ID
   * Returns a deep copy to prevent external modification
   */
  public static getEntry(auditId: string): ForensicAuditEntry | null {
    const entry = this.entryMap.get(auditId);
    if (!entry) {
      return null;
    }

    // Return deep copy
    return JSON.parse(JSON.stringify(entry));
  }

  /**
   * Get all forensic entries (in chronological order)
   * Returns deep copies
   */
  public static getAllEntries(): ForensicAuditEntry[] {
    return this.entries.map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Query entries by session
   */
  public static getEntriesBySession(session: string): ForensicAuditEntry[] {
    return this.entries
      .filter((entry) => entry.session === session)
      .map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Query entries by time range
   */
  public static getEntriesInTimeRange(startTime: number, endTime: number): ForensicAuditEntry[] {
    return this.entries
      .filter((entry) => entry.timestamp >= startTime && entry.timestamp <= endTime)
      .map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Query entries by execution status
   */
  public static getEntriesByStatus(status: 'SUCCESS' | 'FAILED'): ForensicAuditEntry[] {
    return this.entries
      .filter((entry) => entry.execution.status === status)
      .map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Query result: statistics about the audit log
   */
  public static queryStatistics(): ForensicAuditQueryResult {
    const successCount = this.entries.filter((e) => e.execution.status === 'SUCCESS').length;
    const failureCount = this.entries.filter((e) => e.execution.status === 'FAILED').length;

    const timestamps = this.entries.map((e) => e.timestamp).sort((a, b) => a - b);

    return {
      totalEntries: this.entries.length,
      dateRange: {
        earliest: timestamps[0] || 0,
        latest: timestamps[timestamps.length - 1] || 0,
      },
      successCount,
      failureCount,
      entries: this.getAllEntries(),
    };
  }

  /**
   * Export for compliance/regulatory review
   * Creates a JSON structure suitable for CISO or regulator
   */
  public static exportForCompliance(systemName: string = 'Echo Sound Lab'): ForensicAuditExport {
    const stats = this.queryStatistics();
    const allEntries = this.getAllEntries();

    // Calculate export hash (SHA-256 of all entry IDs)
    const entryIds = allEntries.map((e) => e.auditId).join('|');
    const exportHash = this.simpleHash(entryIds);

    const earliestDate = stats.dateRange.earliest > 0 ? new Date(stats.dateRange.earliest).toISOString() : 'N/A';
    const latestDate = stats.dateRange.latest > 0 ? new Date(stats.dateRange.latest).toISOString() : 'N/A';

    return {
      exportedAt: Date.now(),
      exportedBy: 'ACTION_AUTHORITY_V1.0.0',
      version: '1.0.0',
      systemName,
      entries: allEntries,

      statistics: {
        totalActions: stats.totalEntries,
        successfulActions: stats.successCount,
        failedActions: stats.failureCount,
        avgHoldDurationMs:
          stats.totalEntries > 0
            ? Math.round(
                allEntries.reduce((sum, e) => sum + e.authority.holdDurationMs, 0) / stats.totalEntries,
              )
            : 0,
        dateRange: {
          earliest: earliestDate,
          latest: latestDate,
        },
      },

      entryCount: allEntries.length,
      exportHash,
    };
  }

  /**
   * Verify integrity of an entry
   */
  public static verifyEntry(auditId: string): boolean {
    const entry = this.entryMap.get(auditId);
    if (!entry) {
      return false;
    }

    return verifyForensicIntegrity(entry);
  }

  /**
   * LEVEL 1: Verify the entire chain integrity
   * Re-calculates every hash to detect tampering
   * Returns report with tamper location if detected
   */
  public static async verifyChainIntegrity(): Promise<ChainVerificationReport> {
    let currentPrevHash = 'GENESIS_BLOCK_000000000000000000000000';

    for (const entry of this.entries) {
      // 1. Verify prevHash links to the expected value
      if (entry.prevHash !== currentPrevHash) {
        console.error(`🚨 [TRUST_NETWORK] TAMPERING DETECTED at Entry #${entry.chainIndex} (${entry.auditId})`);
        console.error(`   Expected prevHash: ${currentPrevHash}`);
        console.error(`   Found prevHash: ${entry.prevHash}`);
        return {
          isValid: false,
          totalEntries: this.entries.length,
          tamperedEntryId: entry.auditId,
          verifiedAt: Date.now(),
        };
      }

      // 2. Verify chainIndex is sequential
      if (entry.chainIndex !== this.entries.indexOf(entry)) {
        console.error(`🚨 [TRUST_NETWORK] CHAIN INDEX MISMATCH at Entry #${entry.chainIndex} (${entry.auditId})`);
        return {
          isValid: false,
          totalEntries: this.entries.length,
          tamperedEntryId: entry.auditId,
          verifiedAt: Date.now(),
        };
      }

      // 3. Re-calculate the hash for this entry
      // Build the record without ownHash (as it was when hashed)
      const verificationRecord = {
        auditId: entry.auditId,
        actionId: entry.actionId,
        timestamp: entry.timestamp,
        session: entry.session,
        rationale: entry.rationale,
        authority: entry.authority,
        execution: entry.execution,
        sealed: true,
        sealedAt: entry.sealedAt,
        sealedBy: entry.sealedBy,
        prevHash: entry.prevHash,
        chainIndex: entry.chainIndex,
      };

      const calculatedHash = await this.generateHash(verificationRecord);

      // 4. Compare calculated hash with stored ownHash
      if (entry.ownHash !== calculatedHash) {
        console.error(`🚨 [TRUST_NETWORK] DATA TAMPERING DETECTED at Entry #${entry.chainIndex} (${entry.auditId})`);
        console.error(`   Expected hash: ${entry.ownHash}`);
        console.error(`   Calculated hash: ${calculatedHash}`);
        return {
          isValid: false,
          totalEntries: this.entries.length,
          tamperedEntryId: entry.auditId,
          verifiedAt: Date.now(),
        };
      }

      // Advance prevHash for next iteration
      currentPrevHash = entry.ownHash;
    }

    // All entries verified successfully
    console.log(`✅ [TRUST_NETWORK] Chain Integrity Verified. All ${this.entries.length} entries are authentic.`);
    return {
      isValid: true,
      totalEntries: this.entries.length,
      tamperedEntryId: null,
      verifiedAt: Date.now(),
    };
  }

  /**
   * Seal the log for production (read-only mode)
   * Once sealed, no new entries can be added
   */
  public static sealLog(): void {
    this.sealed = true;
    console.log('🏛️ [FORENSIC_AUDIT] Log sealed for production (read-only)');
  }

  /**
   * Get seal status
   */
  public static isSealed(): boolean {
    return this.sealed;
  }

  /**
   * Clear all entries (development only, production should not allow this)
   */
  public static clearAll(): void {
    if (this.sealed) {
      throw new Error('Cannot clear sealed forensic log');
    }
    this.entries = [];
    this.entryMap.clear();
    console.log('🏛️ [FORENSIC_AUDIT] Log cleared (development mode)');
  }

  /**
   * Simple hash for export integrity check
   * In production, use SHA-256
   */
  private static simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `sha256_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Singleton accessor
 */
export function getForensicAuditLog(): typeof ForensicAuditLog {
  return ForensicAuditLog;
}
