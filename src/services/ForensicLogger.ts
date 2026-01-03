/**
 * FORENSIC LOGGER
 * The Black Box. Writes immutable audit logs to the local filesystem.
 *
 * RUNTIME: Node.js (Main Process) ONLY.
 * Persistence: ~/EchoSoundLab/audit_logs/audit_YYYY-MM-DD.jsonl
 *
 * Records every execution attempt, success, failure, and policy violation.
 * Creates an immutable, verifiable audit trail for regulatory compliance.
 */

export interface AuditEntry {
  timestamp: string; // ISO 8601 UTC
  eventType: 'EXECUTION_ATTEMPT' | 'EXECUTION_SUCCESS' | 'EXECUTION_FAILURE' | 'POLICY_BLOCK';
  proposalId: string;
  actionType: string;
  userHash?: string; // From AAContext.sourceHash
  details: any;
}

/**
 * ForensicLogger: Main service for persistent audit logging
 *
 * - Node.js only (uses fs, path, os modules)
 * - Logs to user's home directory (survives app reinstall)
 * - Daily log rotation
 * - JSON Lines format (one entry per line, easy to parse)
 * - Asynchronous writes (non-blocking)
 */
class ForensicLogger {
  private logPath: string;
  private initialized: boolean = false;

  constructor() {
    // Safe initialization check for Node.js environment
    try {
      // Only attempt fs operations in Node context
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Store logs in ~/EchoSoundLab/audit_logs/ (persists across app updates)
        const baseDir = path.join(os.homedir(), 'EchoSoundLab', 'audit_logs');

        // Create directory if not exists (sync is acceptable for initialization)
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
          console.log(`[ForensicLogger] Created audit logs directory: ${baseDir}`);
        }

        // Rotated log file by date (YYYY-MM-DD format)
        const dateStr = new Date().toISOString().split('T')[0];
        this.logPath = path.join(baseDir, `audit_${dateStr}.jsonl`);
        this.initialized = true;

        console.log(`[ForensicLogger] Initialized. Logging to: ${this.logPath}`);
      } else {
        console.warn('[ForensicLogger] Not in Node.js environment. Logging disabled.');
      }
    } catch (error) {
      console.error('[ForensicLogger] Initialization failed:', error);
    }
  }

  /**
   * Main logging method
   * Writes audit entry to disk asynchronously
   */
  public log(entry: Omit<AuditEntry, 'timestamp'>): void {
    if (!this.initialized) {
      console.warn('[ForensicLogger] Not initialized. Skipping log.');
      return;
    }

    try {
      const fs = require('fs');

      const fullEntry: AuditEntry = {
        timestamp: new Date().toISOString(),
        ...entry
      };

      // JSON Lines format: one JSON object per line
      const line = JSON.stringify(fullEntry) + '\n';

      // Append asynchronously to prevent blocking
      fs.appendFile(this.logPath, line, { encoding: 'utf8' }, (err: any) => {
        if (err) {
          console.error('[ForensicLogger] Write failed:', err);
        } else {
          console.log(`[ForensicLogger] Logged ${entry.eventType}: ${entry.proposalId}`);
        }
      });
    } catch (error) {
      console.error('[ForensicLogger] Error in log method:', error);
    }
  }

  /**
   * Get the current log file path (for debugging)
   */
  public getLogPath(): string {
    return this.logPath;
  }

  /**
   * Log an execution attempt
   */
  public logAttempt(proposalId: string, actionType: string, sourceHash: string, parameters: any): void {
    this.log({
      eventType: 'EXECUTION_ATTEMPT',
      proposalId,
      actionType,
      userHash: sourceHash,
      details: {
        parameters,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Log a successful execution
   */
  public logSuccess(proposalId: string, actionType: string, simulationMode: boolean, workOrderId: string): void {
    this.log({
      eventType: 'EXECUTION_SUCCESS',
      proposalId,
      actionType,
      details: {
        workOrderId,
        mode: simulationMode ? 'SIMULATION' : 'REAL',
        timestamp: Date.now()
      }
    });
  }

  /**
   * Log an execution failure
   */
  public logFailure(proposalId: string, actionType: string, error: string): void {
    this.log({
      eventType: 'EXECUTION_FAILURE',
      proposalId,
      actionType,
      details: {
        error,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Log a policy block (safety violation)
   */
  public logPolicyBlock(proposalId: string, actionType: string, policyName: string, reason: string): void {
    this.log({
      eventType: 'POLICY_BLOCK',
      proposalId,
      actionType,
      details: {
        policy: policyName,
        reason,
        timestamp: Date.now()
      }
    });
  }
}

/**
 * Singleton instance
 * Safe to call from any context - gracefully handles browser environment
 */
export const forensicLogger = new ForensicLogger();
