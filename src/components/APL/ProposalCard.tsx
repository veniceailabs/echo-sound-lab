import React, { useEffect, useRef } from 'react';
import { APLProposal } from '../../echo-sound-lab/apl/proposal-engine';
import { useActionAuthority, AAState } from '../../hooks/useActionAuthority';
import { ExecutionBridge } from '../../services/ExecutionBridge';
import { ExecutionPayload } from '../../types/execution-contract';

interface ProposalCardProps {
  proposal: APLProposal;
  onApplyDirect: (proposalId: string) => void;
  onAuthorizeGated: (proposalId: string) => void;
  contextId?: string;
  sourceHash?: string;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onApplyDirect,
  onAuthorizeGated,
  contextId = `proposal_${proposal.proposalId}`,
  sourceHash = `hash_${Date.now()}`
}) => {
  const isQuantum = proposal.provenance.engine !== 'CLASSICAL';

  // Initialize the Law (useActionAuthority hook)
  const { status, holdProgress, actions, metadata } = useActionAuthority(
    contextId,
    sourceHash,
    // Optional state change callback
    (newState) => {
      console.log(`[ProposalCard] FSM state changed to: ${newState}`);
    }
  );

  // Keyboard listener ref for cleanup
  const keyListenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Watch for FSM EXECUTED state → dispatch to ExecutionBridge
  useEffect(() => {
    if (status === AAState.EXECUTED) {
      console.log(`[ProposalCard] FSM EXECUTED, dispatching to ExecutionBridge`);

      // Construct ExecutionPayload (the contract)
      const payload: ExecutionPayload = {
        proposalId: proposal.proposalId,
        actionType: proposal.action.type,
        parameters: proposal.action.parameters,
        aaContext: {
          contextId: metadata.contextId,
          sourceHash: metadata.sourceHash,
          timestamp: Date.now(),
          signature: 'fsm-sealed' // Placeholder for cryptographic signature
        }
      };

      // Dispatch across the boundary
      ExecutionBridge.dispatch(payload)
        .then(result => {
          if (result.success) {
            console.log(`[ProposalCard] Execution successful: ${result.workOrderId}`);
            // Remove proposal from list (handled by parent via callback)
            onAuthorizeGated(proposal.proposalId);
          } else {
            console.error(`[ProposalCard] Execution failed: ${result.error}`);
          }
        })
        .catch(error => {
          console.error(`[ProposalCard] Bridge dispatch error:`, error);
        });
    }
  }, [status, proposal.proposalId, proposal.action.type, proposal.action.parameters, metadata.contextId, metadata.sourceHash, onAuthorizeGated]);

  // Keyboard listener: Enter to confirm, Escape to cancel
  useEffect(() => {
    if (status !== AAState.PREVIEW_ARMED) return;

    keyListenerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        console.log('[ProposalCard] Enter pressed, confirming action');
        actions.confirm();
      } else if (e.key === 'Escape') {
        console.log('[ProposalCard] Escape pressed, canceling action');
        actions.cancel();
      }
    };

    window.addEventListener('keydown', keyListenerRef.current);

    return () => {
      if (keyListenerRef.current) {
        window.removeEventListener('keydown', keyListenerRef.current);
      }
    };
  }, [status, actions]);

  return (
    <div className={`p-4 mb-4 border-l-4 rounded bg-slate-900/50 shadow-xl transition-all ${
      isQuantum
        ? 'border-amber-400 shadow-amber-900/20 animate-pulse-quantum'
        : 'border-blue-500 shadow-blue-900/20'
    }`}>

      {/* HEADER: Title + Provenance */}
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-bold text-slate-100 text-sm uppercase tracking-wider">
          {proposal.action.type.replace(/_/g, ' ')}
        </h4>
        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
          isQuantum
            ? 'bg-amber-400 text-black animate-pulse'
            : 'bg-blue-600 text-white'
        }`}>
          {proposal.provenance.engine}
        </span>
      </div>

      {/* EVIDENCE BOX: The "Why" (Constraint 1) */}
      <div className="bg-black/40 p-3 rounded border border-white/5 mb-3">
        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Forensic Evidence</div>

        {/* Metric Name */}
        <div className="text-[11px] font-bold text-slate-300 mb-2">
          {proposal.evidence.metric}
        </div>

        {/* Current → Target Arrow */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400 font-mono text-sm font-bold">
            {proposal.evidence.currentValue}
          </span>
          <span className="text-slate-600">→</span>
          <span className="text-green-400 font-mono text-sm font-bold">
            {proposal.evidence.targetValue}
          </span>
        </div>

        {/* Confidence Bar */}
        <div className="mb-2">
          <div className="text-[9px] text-slate-500 mb-1">
            Confidence: {Math.round(proposal.provenance.confidence * 100)}%
          </div>
          <div className="w-full bg-black/50 rounded-full h-1.5 border border-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                proposal.provenance.confidence >= 0.8
                  ? 'bg-green-500'
                  : proposal.provenance.confidence >= 0.6
                  ? 'bg-yellow-500'
                  : 'bg-orange-500'
              }`}
              style={{ width: `${proposal.provenance.confidence * 100}%` }}
            />
          </div>
        </div>

        {/* Rationale - Plain English */}
        <p className="text-xs text-slate-400 mt-2 italic leading-relaxed">
          "{proposal.evidence.rationale}"
        </p>

        {/* Optimization Level (Quantum only) */}
        {isQuantum && proposal.provenance.optimizationLevel !== undefined && (
          <div className="mt-2 pt-2 border-t border-white/5">
            <div className="text-[9px] text-amber-400 font-semibold">
              Optimization Depth: {Math.round(proposal.provenance.optimizationLevel * 100)}%
            </div>
            <div className="text-[9px] text-purple-300 italic mt-1">
              Found via Hamiltonian phase-space minimization
            </div>
          </div>
        )}
      </div>

      {/* FSM STATUS INDICATOR (Show preview when armed) */}
      {status === AAState.PREVIEW_ARMED && (
        <div className="mb-3 p-2 rounded bg-blue-500/10 border border-blue-500/30">
          <div className="text-[9px] text-blue-400 font-bold uppercase tracking-wider mb-2">
            Governance Hold Active
          </div>
          <div className="text-[9px] text-blue-300 mb-2">
            Preview: This action will be logged to the forensic audit trail
          </div>
          <div className="text-[9px] text-blue-300">
            Press <span className="font-mono font-bold">ENTER</span> to confirm or <span className="font-mono font-bold">ESC</span> to cancel
          </div>
        </div>
      )}

      {/* PROGRESS BAR (Only visible when holding or armed) */}
      {(status === AAState.PREVIEW_ARMED || holdProgress > 0) && (
        <div className="mb-3">
          <div className="text-[9px] text-slate-400 mb-1">
            Hold Progress: {Math.round(holdProgress * 100)}%
          </div>
          <div className="w-full bg-black/50 rounded-full h-2 border border-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all"
              style={{ width: `${holdProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ACTIONS SECTION */}
      <div className="flex gap-2">
        {/* PATH A: Direct Execution (Fast, no FSM) */}
        <button
          onClick={() => {
            console.log('[ProposalCard] Direct execution requested:', proposal.proposalId);

            // Construct ExecutionPayload for direct execution
            const payload: ExecutionPayload = {
              proposalId: proposal.proposalId,
              actionType: proposal.action.type,
              parameters: proposal.action.parameters,
              aaContext: {
                contextId: metadata.contextId,
                sourceHash: metadata.sourceHash,
                timestamp: Date.now(),
                signature: 'direct-approved' // No FSM hold
              }
            };

            // Dispatch directly
            ExecutionBridge.dispatch(payload)
              .then(result => {
                if (result.success) {
                  console.log(`[ProposalCard] Direct execution successful: ${result.workOrderId}`);
                  onApplyDirect(proposal.proposalId);
                } else {
                  console.error(`[ProposalCard] Direct execution failed: ${result.error}`);
                }
              })
              .catch(error => {
                console.error(`[ProposalCard] Bridge dispatch error:`, error);
              });
          }}
          disabled={status !== AAState.GENERATED && status !== AAState.VISIBLE_GHOST}
          className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900/50 disabled:opacity-50 text-white text-[10px] font-bold py-2 rounded border border-white/10 transition-colors uppercase">
          Apply Direct
        </button>

        {/* PATH B: Gated Execution (FSM, secure) */}
        <button
          onMouseDown={() => {
            if (status === AAState.VISIBLE_GHOST || status === AAState.GENERATED) {
              console.log('[ProposalCard] Mouse down on FSM button, arming...');
              actions.arm();
            }
          }}
          onMouseUp={() => {
            console.log('[ProposalCard] Mouse up on FSM button, releasing...');
            actions.release();
          }}
          onMouseLeave={() => {
            // Safety: Release if cursor leaves button while holding
            if (status === AAState.PREVIEW_ARMED && holdProgress < 1.0) {
              console.log('[ProposalCard] Mouse left button, safety release...');
              actions.release();
            }
          }}
          onClick={(e) => {
            // Only allow click when armed and ready
            if (status === AAState.PREVIEW_ARMED) {
              console.log('[ProposalCard] Click during armed, confirming...');
              actions.confirm();
            }
            e.preventDefault();
          }}
          disabled={status === AAState.EXECUTED || status === AAState.EXPIRED || status === AAState.REJECTED}
          className={`flex-1 text-white text-[10px] font-bold py-2 rounded shadow-lg transition-all uppercase ${
            status === AAState.EXECUTED
              ? 'bg-green-600/50 border border-green-500/50 cursor-default disabled:opacity-100'
              : status === AAState.PREVIEW_ARMED
              ? 'bg-blue-600 border border-blue-400 animate-pulse cursor-default'
              : status === AAState.EXPIRED || status === AAState.REJECTED
              ? 'bg-slate-700/50 border border-slate-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 border border-blue-500 cursor-grab active:cursor-grabbing'
          }`}>
          {status === AAState.EXECUTED
            ? 'Authorized'
            : status === AAState.PREVIEW_ARMED
            ? 'PRESS ENTER'
            : status === AAState.EXPIRED
            ? 'HOLD Expired'
            : status === AAState.REJECTED
            ? 'Canceled'
            : `HOLDING ${Math.round(holdProgress * 100)}%`}
        </button>
      </div>
    </div>
  );
};
