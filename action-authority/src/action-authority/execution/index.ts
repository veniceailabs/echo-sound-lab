/**
 * Action Authority: Execution Engine
 * Multi-domain execution infrastructure (downstream of Authority Layer)
 */

// Core types and interfaces
export {
  ExecutionDomain,
  BridgeType,
  AAWorkOrder,
  AAExecutionResult,
  IExecutionBridge,
  createWorkOrder,
  createExecutionResult,
} from './work-order';

// Dispatcher (switchboard)
export { AAExecutionDispatcher, getExecutionDispatcher } from './dispatcher';

// Bridge adapters
export { getLogicProBridge } from './adapters/LogicProBridge';
export { getChromeBridge } from './adapters/ChromeBridge';
export { getSystemBridge } from './adapters/SystemBridge';
