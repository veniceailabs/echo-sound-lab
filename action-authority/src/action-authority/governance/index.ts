/**
 * Action Authority v1.1.0+ — Governance Module
 *
 * Level 2: Quorum gates, collaborative authority, multi-sig composition.
 * Level 3: Leased Intent, time-bound autonomy with Dead Man's Switch.
 *
 * Builds on top of immutable v1.0.0 authorization layer.
 */

// Level 2: Collaborative Authority
export { RiskLevel, Attestation, AuthorizationEnvelope, QuorumStatus } from './quorum-types';
export { QuorumGate, type QuorumRegistrationResult } from './QuorumGate';

// Level 3: Leased Intent
export {
  type LeaseScope,
  type LeaseRevocationReason,
  type AuthorityLease,
  type LeaseValidationResult,
  type HeartbeatSignal,
  createAuthorityLease,
  revokeAuthorityLease,
  updateLeaseHeartbeat,
  validateLeaseForExecution,
} from './lease-types';

export {
  EngagementMode,
  type IDeadMansSwitch,
  type HeartbeatStatus,
  DeadMansSwitchImpl,
  MockDeadMansSwitch,
} from './DeadMansSwitch';

export {
  LeasesGate,
  getLeasesGate,
  type LeaseRegistrationResult,
} from './LeasesGate';
