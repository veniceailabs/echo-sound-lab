import React from 'react';
import type { BranchEntity } from '../services/timelineBranchingService';

interface BranchSelectorProps {
  branches: BranchEntity[];
  activeBranchId: string | null;
  isBusy?: boolean;
  onCheckout: (branchId: string) => void;
  onOpenMerge: () => void;
}

function BranchSelectorComponent({
  branches,
  activeBranchId,
  isBusy = false,
  onCheckout,
  onOpenMerge,
}: BranchSelectorProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Branches</p>
          <p className="text-[11px] text-slate-400">{branches.length} branch{branches.length === 1 ? '' : 'es'}</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeBranchId || ''}
            disabled={isBusy}
            onChange={(event) => onCheckout(event.target.value)}
            className="rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isBusy || branches.length < 2}
            onClick={onOpenMerge}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Merge
          </button>
        </div>
      </div>
    </section>
  );
}

const BranchSelector = React.memo(BranchSelectorComponent);

export default BranchSelector;

