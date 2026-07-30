import React from 'react';
import { APLProposal } from '../../echo-sound-lab/apl/proposal-engine';
import { ProposalCard } from './ProposalCard';

interface APLProposalPanelProps {
  proposals: APLProposal[];
  isScanning?: boolean;
  dataSource?: 'real' | 'unavailable';
  dataSourceReason?: string | null;
  onApplyDirect?: (proposalId: string) => void;
  onAuthorizeGated?: (proposalId: string) => void;
}

export const APLProposalPanel: React.FC<APLProposalPanelProps> = ({
  proposals,
  isScanning = false,
  dataSource = 'real',
  dataSourceReason = null,
  onApplyDirect = (id) => console.log('APL: Executing Direct', id),
  onAuthorizeGated = (id) => console.log('APL: Forwarding to AA FSM', id)
}) => {
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[44vh] w-full flex-col border-t border-white/10 bg-[#0a0c12] md:inset-y-0 md:right-0 md:left-auto md:h-screen md:w-80 md:border-t-0 md:border-l">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
          Intelligence Feed
        </h3>
        <div className="flex items-center gap-2">
          {dataSource !== 'real' && (
            <span className="bg-amber-500/10 text-amber-300 text-[9px] px-2 py-0.5 rounded-full border border-amber-500/20 font-mono font-bold">
              ANALYSIS UNAVAILABLE
            </span>
          )}
          <span className="bg-blue-500/10 text-blue-400 text-[9px] px-2 py-0.5 rounded-full border border-blue-500/20 font-mono font-bold">
            APL v1.1
          </span>
        </div>
      </div>

      {dataSource !== 'real' && (
        <div className="border-b border-amber-500/10 bg-amber-500/10 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            No Proposal Feed
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
            {dataSourceReason || 'Real APL analysis was unavailable for this file, so no proposal cards are being shown.'}
          </p>
        </div>
      )}

      {/* Proposals Container */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isScanning && proposals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale">
            <div className="w-12 h-12 border-2 border-dashed border-slate-600 rounded-full mb-4 animate-spin"></div>
            <p className="text-[10px] font-mono uppercase tracking-tighter text-slate-400">
              Scanning Signal Context...
            </p>
          </div>
        ) : proposals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
            <div className="w-12 h-12 rounded-full bg-slate-800/30 mb-4 flex items-center justify-center border border-white/5">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-tighter text-slate-400">
              Ready for Analysis
            </p>
          </div>
        ) : (
          proposals.map((proposal) => (
            <ProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              onApplyDirect={onApplyDirect}
              onAuthorizeGated={onAuthorizeGated}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {proposals.length > 0 && (
        <div className="p-3 border-t border-white/5 bg-black/20 text-[10px] text-slate-500 text-center font-mono">
          {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} available
        </div>
      )}
    </aside>
  );
};
