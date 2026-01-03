/**
 * Action Authority: Forensic Audit Entry Schema
 *
 * The capstone of accountability: proof that an action was:
 *  ✅ Based on intelligence (APL metrics)
 *  ✅ Authorized by a human (400ms hold + confirmation)
 *  ✅ Executed correctly (bridge result)
 *  ✅ Sealed permanently (immutable record)
 *
 * This schema answers:
 *  WHAT happened?      (execution.status + resultHash)
 *  WHY did we do it?   (rationale.evidence + rationale.description)
 *  WHO decided?        (session + authority.holdDurationMs proves intent)
 *  WHEN?               (timestamp)
 *  DID IT WORK?        (execution.status + resultHash)
 */

/**
 * Perception Data: Why this action was proposed
 * Comes from the APL (Audio Processing Layer)
 */
export interface PerceptionData {
  source: 'APL_SIG_INT' | 'USER_MANUAL' | 'SYSTEM_RULE';
  evidence: Record<string, unknown>; // APL metrics (e.g., { peak: 2.1, lufs: -8.5 })
  description: string;               // What the user saw in the HUD Ghost
  confidence?: number;               // 0.0-1.0, informational only
}

/**
 * Authority Data: How the human authorized this
 * Comes from the FSM state machine
 */
export interface AuthorityData {
  fsmPath: string[]; // Exact FSM transition path e.g., ["VISIBLE_GHOST", "HOLDING", "PREVIEW_ARMED", "CONFIRM_READY", "EXECUTED"]
  holdDurationMs: number; // Proof of ≥400ms intent (reflex protection)
  confirmationTime: number; // Timestamp of final confirmation (Enter pressed)
  contextId: string; // Session/file context at authorization time
  contextHash: string; // Immutable snapshot of context
}

/**
 * Execution Data: What actually happened
 * Comes from the bridge executor
 */
export interface ExecutionData {
  domain: string; // e.g., "LOGIC_PRO", "CHROME", "SYSTEM"
  bridge: string; // e.g., "APPLESCRIPT", "WEBSOCKET", "CLI"
  status: 'SUCCESS' | 'FAILED';
  resultHash: string; // Hash of the result (for integrity verification)
  executedAt: number; // Timestamp of execution
  duration: number; // How long execution took (ms)
  output?: Record<string, unknown>; // Bridge output (if successful)
  error?: {
    code: string;
    message: string;
  }; // Error details (if failed)
}

/**
 * Complete Forensic Audit Entry
 * Sealed, immutable, non-repudiable
 * LEVEL 1: Hash-chained for cryptographic continuity proof
 * LEVEL 5: Hybrid signature support (Amendment L: Algorithm Agnosticism)
 */
export interface ForensicAuditEntry {
  // 1. IDENTITY
  auditId: string; // Unique, immutable identifier
  actionId: string; // The action that was taken

  // 2. TIME & SESSION
  timestamp: number; // When this was recorded (epoch ms)
  session: string; // WHO: Session ID, user ID, or role

  // 3. PERCEPTION (The "WHY")
  rationale: PerceptionData;

  // 4. AUTHORITY (The "WHO/HOW")
  authority: AuthorityData;

  // 5. EXECUTION (The "DID IT WORK?")
  execution: ExecutionData;

  // 6. IMMUTABILITY PROOF
  sealed: true; // Cryptographic lock marker
  sealedAt: number; // When this was sealed
  sealedBy: string; // Authority that sealed this (system)

  // LEVEL 1: TRUST NETWORK (Hash Chaining)
  // ========================================
  // These fields create a cryptographic chain where each entry
  // is mathematically linked to the one before it.
  // If any entry is tampered with, all subsequent entries' hashes break.
  prevHash: string; // The ownHash of the previous entry (or GENESIS_BLOCK for first)
  ownHash: string; // SHA-256(this_entry_data + prevHash) - THIS entry's fingerprint
  chainIndex: number; // Sequence number in the chain (0, 1, 2, 3, ...)

  // LEVEL 5: HYBRID SIGNATURE BUNDLE (Amendment L)
  // =============================================
  // Support parallel signatures (classical + post-quantum) for algorithm agility
  // - Entries 0-100 (2025): classicalOnly = true, signatures.postQuantum.signature = null
  // - Entries 101+ (2026): classicalOnly = false, signatures includes both algorithms
  // This enables cryptographic agility without log migration
  signatures?: {
    classical: {
      algorithm: 'SHA-256';
      hash: string;
      timestamp: number;
    };
    postQuantum: {
      algorithm: 'ML-DSA-87' | null;
      signature: string | null; // Reserved for 2026
      publicKeyId: string | null;
      timestamp: number | null;
    };
    bundleVersion: 1 | 2; // v1: classical only | v2: hybrid
  };
}

/**
 * Forensic Audit Query Result
 * For exporting/analyzing audit history
 */
export interface ForensicAuditQueryResult {
  totalEntries: number;
  dateRange: {
    earliest: number;
    latest: number;
  };
  successCount: number;
  failureCount: number;
  entries: ForensicAuditEntry[];
}

/**
 * Forensic Audit Export (for compliance/regulatory review)
 * JSON structure that can be handed to CISO or regulator
 */
export interface ForensicAuditExport {
  exportedAt: number;
  exportedBy: string;
  version: string; // e.g., "1.0.0"
  systemName: string;
  entries: ForensicAuditEntry[];

  // Summary statistics
  statistics: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    avgHoldDurationMs: number;
    dateRange: {
      earliest: string; // ISO 8601
      latest: string; // ISO 8601
    };
  };

  // Integrity check
  entryCount: number; // For verification that all entries are present
  exportHash: string; // SHA-256 of all entries (for tamper detection)
}

/**
 * LEVEL 1: Chain Verification Report
 * Result of verifying the entire hash chain
 * Shows whether the log has been tampered with, and where
 */
export interface ChainVerificationReport {
  isValid: boolean; // true = chain is intact, false = tampering detected
  totalEntries: number; // How many entries were verified
  tamperedEntryId: string | null; // If isValid = false, which entry first failed verification
  verifiedAt: number; // When this verification was performed (epoch ms)
}

/**
 * Helper: Create a forensic audit entry (once all data is collected)
 * Now with LEVEL 1: Trust Network chaining support
 */
export function createForensicAuditEntry(
  auditId: string,
  actionId: string,
  session: string,
  rationale: PerceptionData,
  authority: AuthorityData,
  execution: ExecutionData,
  // LEVEL 1: Chain fields
  prevHash: string = 'GENESIS_BLOCK_000000000000000000000000',
  ownHash: string = '',
  chainIndex: number = 0,
): ForensicAuditEntry {
  const entry: ForensicAuditEntry = {
    auditId,
    actionId,
    timestamp: Date.now(),
    session,
    rationale,
    authority,
    execution,
    sealed: true,
    sealedAt: Date.now(),
    sealedBy: 'ACTION_AUTHORITY_V1.0.0',
    // LEVEL 1: Chain fields
    prevHash,
    ownHash,
    chainIndex,
  };

  // Freeze to enforce immutability
  Object.freeze(entry);
  Object.freeze(entry.rationale);
  Object.freeze(entry.authority);
  Object.freeze(entry.execution);

  return entry;
}

/**
 * Helper: Verify a forensic entry is sealed and immutable
 */
export function verifyForensicIntegrity(entry: ForensicAuditEntry): boolean {
  // Check that entry is frozen
  if (!Object.isFrozen(entry)) {
    return false;
  }

  // Check that sealed flag is true
  if (entry.sealed !== true) {
    return false;
  }

  // Check that sub-objects are frozen
  if (!Object.isFrozen(entry.rationale) || !Object.isFrozen(entry.authority) || !Object.isFrozen(entry.execution)) {
    return false;
  }

  return true;
}
