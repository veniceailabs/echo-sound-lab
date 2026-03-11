import React, { useEffect, useState } from 'react';
import type { BranchEntity, MergeStrategy } from '../services/timelineBranchingService';

interface MergeModalProps {
  isOpen: boolean;
  branches: BranchEntity[];
  defaultTargetBranchId: string | null;
  isMerging?: boolean;
  error?: string | null;
  onClose: () => void;
  onMerge: (params: {
    sourceBranchId: string;
    targetBranchId: string;
    strategy: MergeStrategy;
  }) => void;
}

function MergeModal({
  isOpen,
  branches,
  defaultTargetBranchId,
  isMerging = false,
  error = null,
  onClose,
  onMerge,
}: MergeModalProps) {
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [strategy, setStrategy] = useState<MergeStrategy>('THEIRS');

  useEffect(() => {
    if (!isOpen) return;
    const fallbackTarget = defaultTargetBranchId || branches[0]?.id || '';
    const fallbackSource = branches.find((b) => b.id !== fallbackTarget)?.id || '';
    setTargetBranchId(fallbackTarget);
    setSourceBranchId(fallbackSource);
    setStrategy('THEIRS');
  }, [isOpen, branches, defaultTargetBranchId]);

  if (!isOpen) return null;

  const canMerge =
    sourceBranchId &&
    targetBranchId &&
    sourceBranchId !== targetBranchId &&
    !isMerging;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-200">Merge Branches</h3>
          <button
            type="button"
            disabled={isMerging}
            onClick={onClose}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-slate-500">Source Branch</span>
            <select
              value={sourceBranchId}
              disabled={isMerging}
              onChange={(event) => setSourceBranchId(event.target.value)}
              className="w-full rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Select source</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-slate-500">Target Branch</span>
            <select
              value={targetBranchId}
              disabled={isMerging}
              onChange={(event) => setTargetBranchId(event.target.value)}
              className="w-full rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Select target</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">Conflict Strategy</p>
            <div className="flex gap-2">
              {(['OURS', 'THEIRS', 'MANUAL'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  disabled={isMerging}
                  onClick={() => setStrategy(candidate)}
                  className={`rounded px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] ${
                    strategy === candidate
                      ? 'border border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                      : 'border border-white/15 bg-slate-900 text-slate-300'
                  }`}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={!canMerge}
            onClick={() => onMerge({ sourceBranchId, targetBranchId, strategy })}
            className="rounded border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-xs uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isMerging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MergeModal);

