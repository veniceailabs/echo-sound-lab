/**
 * Action Authority: Universal Work Order Schema
 *
 * Every action executed by Action Authority follows this schema.
 * Domain-agnostic. Transport-agnostic. Purely structural.
 *
 * The FSM doesn't care what gets executed. It only knows:
 *  1. Authorization happened (EXECUTED state reached)
 *  2. Context was valid at execution time
 *  3. The work order is immutable (frozen in audit log)
 *
 * The actual execution is delegated to domain-specific bridges.
 */

// LEVEL 1.1.0: Governance types
import { RiskLevel } from '../governance/quorum-types';

/**
 * Supported execution domains.
 * Add new domains here as you support more applications.
 */
export enum ExecutionDomain {
  LOGIC_PRO = 'LOGIC_PRO',      // Audio workstation (AppleScript)
  EXCEL = 'EXCEL',               // Spreadsheet (REST API / VBA)
  CHROME = 'CHROME',             // Web browser (CDP / JS injection)
  VS_CODE = 'VS_CODE',           // Code editor (Extension API)
  SYSTEM = 'SYSTEM',             // OS-level commands (CLI)
  CUSTOM = 'CUSTOM',             // User-defined domain
}

/**
 * Supported execution transports.
 * How the system communicates with the target application.
 */
export enum BridgeType {
  APPLESCRIPT = 'APPLESCRIPT',   // macOS scripting
  REST_API = 'REST_API',         // HTTP/JSON interface
  CLI = 'CLI',                   // Command-line execution
  MIDI = 'MIDI',                 // MIDI protocol
  OSC = 'OSC',                   // Open Sound Control
  WEBSOCKET = 'WEBSOCKET',       // WebSocket connection
  NATIVE = 'NATIVE',             // Direct library call
}

/**
 * Forensic Metadata: For complete audit trail
 * Optional - included only when forensic logging is enabled
 */
export interface WorkOrderForensicMetadata {
  // Perception: Why was this action proposed?
  rationale?: {
    source: 'APL_SIG_INT' | 'USER_MANUAL' | 'SYSTEM_RULE';
    evidence: Record<string, unknown>;
    description: string;
    confidence?: number;
  };

  // Authority: Who decided and how?
  authority?: {
    fsmPath: string[];
    holdDurationMs: number;
    confirmationTime: number;
    contextId: string;
    contextHash: string;
  };

  // Session: Who authorized this?
  session?: string;
}

/**
 * Universal Work Order: What gets executed.
 *
 * Immutable. Frozen. Audit-bound.
 * Created by Perception Layer ONLY when FSM reaches EXECUTED.
 * Must include valid audit binding or dispatcher refuses it.
 */
export interface AAWorkOrder {
  // Identifiers (core)
  actionId: string;                              // Unique action ID (from FSM)
  description: string;                           // Human-readable (what user sees in HUD)

  // Target (where and how)
  domain: ExecutionDomain;                       // Where to execute (Logic Pro, Excel, etc.)
  bridgeType: BridgeType;                        // How to execute (AppleScript, REST, CLI, etc.)

  // Payload (what)
  payload: Record<string, unknown>;              // Domain-specific execution parameters

  // Governance (v1.1.0 - Collaborative Authority)
  riskLevel: RiskLevel;                          // LOW (1 sig) or HIGH (2 sigs) - determines quorum requirement

  // Audit Binding (REQUIRED - proof of authorization)
  audit: {
    auditId: string;                             // From Action Authority audit log
    contextHash: string;                         // Proves correct target/context
    authorizedAt: number;                        // Timestamp of authorization
    contextId: string;                           // Must match FSM context
    sourceHash: string;                          // Source state hash at execution time
  };

  // Forensic Metadata (OPTIONAL - for complete audit trail)
  forensic?: WorkOrderForensicMetadata;

  // Immutability marker
  immutable: true;                               // This work order cannot be modified
}

/**
 * Execution Result: What happened.
 * Returned by bridges. Recorded in audit log.
 * Immutable. Frozen.
 */
export interface AAExecutionResult {
  // Identifiers
  auditId: string;                               // From work order
  status: 'SUCCESS' | 'FAILED' | 'PENDING_ATTESTATION';  // Outcome (PENDING_ATTESTATION = awaiting quorum)
  executedAt: number;                            // Timestamp

  // If success
  output?: Record<string, unknown>;              // What the bridge returned

  // If failed
  error?: {
    code: string;                                // Error classification
    message: string;                             // Human-readable error
  };

  // Forensic Entry ID (populated by dispatcher after sealing)
  forensicEntryId?: string;                      // ID of sealed forensic audit entry

  // Immutability marker
  immutable: true;
}

/**
 * Bridge Adapter Interface
 * All domain bridges must implement this.
 *
 * Rules:
 *  1. Be idempotent or report complete failure (no partial state)
 *  2. Do not throw—return error in result
 *  3. Record result immediately (audit binding is immutable)
 */
export interface IExecutionBridge {
  domain: ExecutionDomain;
  bridgeType: BridgeType;

  /**
   * Execute the work order atomically.
   * Must return result with status SUCCESS or FAILED.
   * Must not throw.
   */
  execute(workOrder: AAWorkOrder): Promise<AAExecutionResult>;
}

/**
 * Helper: Create a work order
 * Called by Perception Layer when FSM reaches EXECUTED
 */
export function createWorkOrder(params: {
  actionId: string;
  description: string;
  domain: ExecutionDomain;
  bridgeType: BridgeType;
  payload: Record<string, unknown>;
  auditId: string;
  contextHash: string;
  authorizedAt: number;
  contextId: string;
  sourceHash: string;
  forensic?: WorkOrderForensicMetadata;
}): AAWorkOrder {
  const workOrder: AAWorkOrder = {
    actionId: params.actionId,
    description: params.description,
    domain: params.domain,
    bridgeType: params.bridgeType,
    payload: params.payload,
    audit: {
      auditId: params.auditId,
      contextHash: params.contextHash,
      authorizedAt: params.authorizedAt,
      contextId: params.contextId,
      sourceHash: params.sourceHash,
    },
    forensic: params.forensic,
    immutable: true,
  };

  // Freeze to enforce immutability
  Object.freeze(workOrder);
  Object.freeze(workOrder.payload);
  Object.freeze(workOrder.audit);
  if (workOrder.forensic) {
    Object.freeze(workOrder.forensic);
    if (workOrder.forensic.rationale) Object.freeze(workOrder.forensic.rationale);
    if (workOrder.forensic.authority) Object.freeze(workOrder.forensic.authority);
  }

  return workOrder;
}

/**
 * Helper: Create an execution result
 * Called by bridge after execution, or by dispatcher for quorum states
 */
export function createExecutionResult(
  auditId: string,
  status: 'SUCCESS' | 'FAILED' | 'PENDING_ATTESTATION',
  output?: Record<string, unknown>,
  error?: { code: string; message: string },
  forensicEntryId?: string,
): AAExecutionResult {
  const result: AAExecutionResult = {
    auditId,
    status,
    executedAt: Date.now(),
    output,
    error,
    forensicEntryId,
    immutable: true,
  };

  Object.freeze(result);
  if (result.output) Object.freeze(result.output);
  if (result.error) Object.freeze(result.error);

  return result;
}
