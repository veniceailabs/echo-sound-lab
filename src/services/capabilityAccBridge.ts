/**
 * Capability → ACC Bridge
 *
 * Connects CapabilityAuthority's `requiresACC` flag to Self_Session_v0_Confirmation system.
 * When a capability requires active consent, this bridge:
 * 1. Creates an ACC (Active Consent Checkpoint)
 * 2. Issues a confirmation token
 * 3. Waits for user response
 * 4. Validates response
 * 5. Marks token as consumed (single-use)
 *
 * Bridge maintains separation of concerns:
 * - CapabilityAuthority: declarative (what's allowed)
 * - ConfirmationManager: mechanical (how to confirm)
 * - This bridge: orchestration (wiring them together)
 */

import { CapabilityRequest, CapabilityGrant } from './capabilities';

// Import Self Session v0 types (from previous phase)
interface ConfirmationToken {
  token_id: string;
  session_id: string;
  acc_event_id: string;
  confirmation_type: string;
  challenge_payload: string;
  challenge_hash: string;
  is_used: boolean;
  was_valid: boolean | null;
}

interface ACCCheckpoint {
  acc_id: string;
  timestamp: number;
  capabilityRequested: CapabilityRequest;
  grant: CapabilityGrant;
  confirmationToken: ConfirmationToken | null;
  response: string | null;
  isValidated: boolean;
  validatedAt: number | null;
}

export class CapabilityAccBridge {
  private pendingACCs: Map<string, ACCCheckpoint> = new Map();

  constructor(
    private sessionId: string,
    private confirmationManager: any  // Self_Session_v0_Confirmation.ConfirmationManager
  ) {}

  /**
   * Issue ACC when a capability requires active consent.
   * Returns token that user must provide feedback on.
   */
  async issueACC(
    capabilityRequest: CapabilityRequest,
    grant: CapabilityGrant
  ): Promise<ConfirmationToken> {
    if (!grant.requiresACC) {
      throw new Error('[ACC_BRIDGE] Grant does not require ACC');
    }

    // Create ACC checkpoint
    const accId = `acc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const acc: ACCCheckpoint = {
      acc_id: accId,
      timestamp: Date.now(),
      capabilityRequested: capabilityRequest,
      grant,
      confirmationToken: null,
      response: null,
      isValidated: false,
      validatedAt: null
    };

    // Issue confirmation token from Self Session v0 system
    const token = this.confirmationManager.issue_confirmation(
      this.sessionId,
      accId,
      'TYPE_CODE',  // Can be randomized
      300  // 5 minutes TTL
    );

    acc.confirmationToken = token;
    this.pendingACCs.set(accId, acc);

    // Log ACC issuance
    console.log(
      `[CapabilityAccBridge] ACC issued: ${accId}\n` +
      `Capability: ${capabilityRequest.capability}\n` +
      `Reason: ${capabilityRequest.reason}\n` +
      `Token: ${token.token_id.substring(0, 8)}...`
    );

    return token;
  }

  /**
   * User provides confirmation response.
   * Validates against token and marks as consumed (single-use).
   */
  async validateACC(
    accId: string,
    userResponse: string
  ): Promise<boolean> {
    const acc = this.pendingACCs.get(accId);

    if (!acc) {
      throw new Error(`[ACC_BRIDGE] ACC not found: ${accId}`);
    }

    if (!acc.confirmationToken) {
      throw new Error(`[ACC_BRIDGE] No confirmation token for ACC: ${accId}`);
    }

    // Validate response against token (single-use enforcement)
    const isValid = this.confirmationManager.validate_confirmation(
      acc.confirmationToken.token_id,
      userResponse,
      new Date()
    );

    acc.response = userResponse;
    acc.isValidated = isValid;
    acc.validatedAt = Date.now();

    if (isValid) {
      console.log(`[CapabilityAccBridge] ACC validated: ${accId}`);
    } else {
      console.warn(`[CapabilityAccBridge] ACC validation failed: ${accId}`);
    }

    return isValid;
  }

  /**
   * Check if ACC is still pending (not yet validated).
   */
  isACCPending(accId: string): boolean {
    const acc = this.pendingACCs.get(accId);
    return !!acc && !acc.isValidated;
  }

  /**
   * Get ACC status for UI display.
   */
  getACCStatus(accId: string): ACCCheckpoint | null {
    return this.pendingACCs.get(accId) || null;
  }

  /**
   * Revoke ACC (e.g., on session halt).
   * Marks token as consumed, prevents future validation.
   */
  revokeACC(accId: string): void {
    const acc = this.pendingACCs.get(accId);

    if (!acc || !acc.confirmationToken) {
      return;
    }

    // Revoke token from confirmation manager
    this.confirmationManager.revoke_token(
      acc.confirmationToken.token_id,
      new Date()
    );

    console.log(`[CapabilityAccBridge] ACC revoked: ${accId}`);

    // Remove from pending
    this.pendingACCs.delete(accId);
  }

  /**
   * Revoke all pending ACCs (e.g., session end or halt).
   * Rule: Session end destroys all authority.
   */
  revokeAllACCs(): void {
    for (const [accId] of this.pendingACCs) {
      this.revokeACC(accId);
    }
    console.log('[CapabilityAccBridge] All ACCs revoked');
  }

  /**
   * Clean up expired ACCs.
   */
  cleanupExpiredACCs(expiryMs: number = 600000): void {
    // 10 minutes default
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [accId, acc] of this.pendingACCs) {
      if (now - acc.timestamp > expiryMs) {
        toDelete.push(accId);
      }
    }

    for (const accId of toDelete) {
      this.pendingACCs.delete(accId);
    }

    if (toDelete.length > 0) {
      console.log(`[CapabilityAccBridge] Cleaned up ${toDelete.length} expired ACCs`);
    }
  }

  /**
   * Get all pending ACCs (for diagnostics/UI).
   */
  getPendingACCs(): ACCCheckpoint[] {
    return Array.from(this.pendingACCs.values()).filter(acc => !acc.isValidated);
  }

  /**
   * Get audit trail of all ACCs (for logging).
   */
  getACCHistory(): ACCCheckpoint[] {
    return Array.from(this.pendingACCs.values());
  }
}

export default CapabilityAccBridge;
