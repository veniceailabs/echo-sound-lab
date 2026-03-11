import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from './deterministicReplayService';
import {
  TimelineHydrationMetrics,
  TimelineHydrationResult,
  TimelineReplayCache,
} from './timelineReplayCache';
import { stableStringify } from './deterministicJson';

export interface BranchEntity {
  id: string;
  name: string;
  parentBranchId: string | null;
  parentHash: string;
  headHash: string;
  forkIndex: number;
  headIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface BranchCheckoutResult {
  branch: BranchEntity;
  state: ReplayState;
  outputStateHash: string;
  metrics: TimelineHydrationMetrics;
}

export interface BranchMutationResult {
  branch: BranchEntity;
  state: ReplayState;
  outputStateHash: string;
  metrics: TimelineHydrationMetrics;
}

export interface DeterministicBranchRegistryOptions {
  snapshotInterval?: number;
  rootBranchName?: string;
  workspaceId?: string;
}

export type MergeStrategy = 'OURS' | 'THEIRS' | 'MANUAL';

export interface MergeConflict {
  key: string;
  targetProposalId: string;
  sourceProposalId: string;
  targetActionType: string;
  sourceActionType: string;
}

export class MergeConflictError extends Error {
  constructor(public readonly conflicts: MergeConflict[]) {
    super(`MERGE_CONFLICT: ${conflicts.length} conflict(s) require manual resolution`);
    this.name = 'MergeConflictError';
  }
}

interface BranchRuntime {
  meta: BranchEntity;
  cache: TimelineReplayCache;
}

function cloneBranch(branch: BranchEntity): BranchEntity {
  return { ...branch };
}

function proposalComparable(proposal: APLProposal): unknown {
  return {
    proposalId: proposal.proposalId,
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    actionType: proposal.action.type,
    parameters: proposal.action.parameters,
  };
}

function proposalEquivalent(left: APLProposal, right: APLProposal): boolean {
  return stableStringify(proposalComparable(left)) === stableStringify(proposalComparable(right));
}

function getStringParam(params: Record<string, unknown>, key: string, fallback = ''): string {
  const value = params[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function getNumberParam(params: Record<string, unknown>, key: string, fallback = 0): number {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getConflictKey(proposal: APLProposal): string | null {
  const params = proposal.action.parameters || {};
  const trackId = proposal.trackId || getStringParam(params, 'trackId', 'track-main');
  switch (proposal.action.type) {
    case 'SET_AUTOMATION_POINT': {
      const parameter = getStringParam(params, 'parameter', 'value');
      const timeSec = Number(getNumberParam(params, 'timeSec', 0).toFixed(3));
      return `auto:${trackId}:${parameter}:${timeSec}`;
    }
    case 'MOVE_REGION':
    case 'SPLIT_REGION': {
      const regionId = getStringParam(params, 'regionId', '');
      return regionId ? `region:${regionId}` : null;
    }
    case 'ADD_TRACK': {
      const addTrackId = getStringParam(params, 'trackId', trackId);
      return `track:add:${addTrackId}`;
    }
    case 'GAIN_ADJUSTMENT':
    case 'NORMALIZATION':
    case 'LIMITING':
    case 'DC_REMOVAL':
      return `track:${trackId}:${proposal.action.type}`;
    default:
      return `${proposal.action.type}:${trackId}`;
  }
}

export class DeterministicBranchRegistry {
  private readonly branches = new Map<string, BranchRuntime>();
  private readonly snapshotInterval: number;
  private readonly baseState: ReplayState;
  private readonly baseHash: string;
  private readonly workspaceId: string;
  private idCounter = 0;
  private activeBranchId: string;

  private constructor(
    baseState: ReplayState,
    baseHash: string,
    snapshotInterval: number,
    workspaceId: string,
    rootBranchName: string
  ) {
    this.baseState = baseState;
    this.baseHash = baseHash;
    this.snapshotInterval = snapshotInterval;
    this.workspaceId = workspaceId;

    const now = Date.now();
    const rootId = this.nextBranchId(rootBranchName);
    const rootCache = new TimelineReplayCache(this.baseState, this.baseHash, {
      snapshotInterval: this.snapshotInterval,
      workspaceId: this.workspaceId,
    });

    const rootBranch: BranchEntity = {
      id: rootId,
      name: rootBranchName,
      parentBranchId: null,
      parentHash: this.baseHash,
      headHash: this.baseHash,
      forkIndex: 0,
      headIndex: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.branches.set(rootId, {
      meta: rootBranch,
      cache: rootCache,
    });
    this.activeBranchId = rootId;
  }

  static async create(
    baseState: ReplayState,
    options: DeterministicBranchRegistryOptions = {}
  ): Promise<DeterministicBranchRegistry> {
    const normalizedBase = await runDeterministicReplay(baseState, []);
    const snapshotInterval = Math.max(1, Math.floor(options.snapshotInterval || 50));
    const workspaceId = options.workspaceId || normalizedBase.outputState.workspaceId || 'workspace-main';
    const rootBranchName = options.rootBranchName || 'main';
    return new DeterministicBranchRegistry(
      normalizedBase.outputState,
      normalizedBase.outputStateHash,
      snapshotInterval,
      workspaceId,
      rootBranchName
    );
  }

  private nextBranchId(name: string): string {
    this.idCounter += 1;
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'branch';
    return `branch-${safe}-${this.idCounter.toString(36)}`;
  }

  private getRuntime(branchId: string): BranchRuntime {
    const runtime = this.branches.get(branchId);
    if (!runtime) {
      throw new Error(`BRANCH_NOT_FOUND: ${branchId}`);
    }
    return runtime;
  }

  getActiveBranchId(): string {
    return this.activeBranchId;
  }

  getActiveBranch(): BranchEntity {
    return cloneBranch(this.getRuntime(this.activeBranchId).meta);
  }

  getBranch(branchId: string): BranchEntity | null {
    const runtime = this.branches.get(branchId);
    return runtime ? cloneBranch(runtime.meta) : null;
  }

  getBranchByName(name: string): BranchEntity | null {
    for (const runtime of this.branches.values()) {
      if (runtime.meta.name === name) {
        return cloneBranch(runtime.meta);
      }
    }
    return null;
  }

  listBranches(): BranchEntity[] {
    return Array.from(this.branches.values())
      .map((runtime) => cloneBranch(runtime.meta))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  private commonPrefixLength(left: APLProposal[], right: APLProposal[]): number {
    const max = Math.min(left.length, right.length);
    let idx = 0;
    while (idx < max && proposalEquivalent(left[idx], right[idx])) {
      idx += 1;
    }
    return idx;
  }

  private dedupeByProposalId(actions: APLProposal[]): APLProposal[] {
    const seen = new Set<string>();
    const deduped: APLProposal[] = [];
    for (const action of actions) {
      if (seen.has(action.proposalId)) continue;
      seen.add(action.proposalId);
      deduped.push(action);
    }
    return deduped;
  }

  private detectConflicts(targetTail: APLProposal[], sourceTail: APLProposal[]): MergeConflict[] {
    const targetByKey = new Map<string, APLProposal>();
    const sourceByKey = new Map<string, APLProposal>();

    for (const proposal of targetTail) {
      const key = getConflictKey(proposal);
      if (!key || targetByKey.has(key)) continue;
      targetByKey.set(key, proposal);
    }
    for (const proposal of sourceTail) {
      const key = getConflictKey(proposal);
      if (!key || sourceByKey.has(key)) continue;
      sourceByKey.set(key, proposal);
    }

    const conflicts: MergeConflict[] = [];
    for (const [key, targetProposal] of targetByKey.entries()) {
      const sourceProposal = sourceByKey.get(key);
      if (!sourceProposal) continue;
      if (proposalEquivalent(targetProposal, sourceProposal)) continue;
      conflicts.push({
        key,
        targetProposalId: targetProposal.proposalId,
        sourceProposalId: sourceProposal.proposalId,
        targetActionType: targetProposal.action.type,
        sourceActionType: sourceProposal.action.type,
      });
    }

    return conflicts;
  }

  private async buildCacheFromActions(
    actions: APLProposal[]
  ): Promise<{ cache: TimelineReplayCache; hydration: TimelineHydrationResult }> {
    const cache = new TimelineReplayCache(this.baseState, this.baseHash, {
      snapshotInterval: this.snapshotInterval,
      workspaceId: this.workspaceId,
    });

    let hydration = await cache.hydrateToIndex(0);
    for (const action of actions) {
      hydration = await cache.appendProposal(action);
    }

    return { cache, hydration };
  }

  async appendToActiveBranch(proposal: APLProposal): Promise<BranchMutationResult> {
    const runtime = this.getRuntime(this.activeBranchId);
    const hydration = await runtime.cache.appendProposal(proposal);
    runtime.meta.headIndex = runtime.cache.getLength();
    runtime.meta.headHash = hydration.outputStateHash;
    runtime.meta.updatedAt = Date.now();

    return {
      branch: cloneBranch(runtime.meta),
      state: hydration.state,
      outputStateHash: hydration.outputStateHash,
      metrics: hydration.metrics,
    };
  }

  async forkBranch(targetIndex: number, newBranchName: string): Promise<BranchEntity> {
    const sourceRuntime = this.getRuntime(this.activeBranchId);
    const boundedIndex = Math.max(0, Math.min(targetIndex, sourceRuntime.cache.getLength()));
    const sourceHydration = await sourceRuntime.cache.hydrateToIndex(boundedIndex);
    const prefixActions = sourceRuntime.cache.getActions().slice(0, boundedIndex);

    const newCache = new TimelineReplayCache(this.baseState, this.baseHash, {
      snapshotInterval: this.snapshotInterval,
      workspaceId: this.workspaceId,
    });
    for (const action of prefixActions) {
      await newCache.appendProposal(action);
    }

    const now = Date.now();
    const newBranchId = this.nextBranchId(newBranchName);
    const branch: BranchEntity = {
      id: newBranchId,
      name: newBranchName,
      parentBranchId: sourceRuntime.meta.id,
      parentHash: sourceHydration.outputStateHash,
      headHash: sourceHydration.outputStateHash,
      forkIndex: boundedIndex,
      headIndex: boundedIndex,
      createdAt: now,
      updatedAt: now,
    };

    this.branches.set(newBranchId, {
      meta: branch,
      cache: newCache,
    });
    return cloneBranch(branch);
  }

  async checkoutBranch(branchId: string): Promise<BranchCheckoutResult> {
    const runtime = this.getRuntime(branchId);
    const hydration = await runtime.cache.hydrateToIndex(runtime.meta.headIndex);
    runtime.meta.headHash = hydration.outputStateHash;
    runtime.meta.updatedAt = Date.now();
    this.activeBranchId = branchId;

    return {
      branch: cloneBranch(runtime.meta),
      state: hydration.state,
      outputStateHash: hydration.outputStateHash,
      metrics: hydration.metrics,
    };
  }

  async hydrateBranchHead(branchId: string): Promise<TimelineHydrationResult> {
    const runtime = this.getRuntime(branchId);
    return runtime.cache.hydrateToIndex(runtime.meta.headIndex);
  }

  async mergeBranches(
    sourceBranchId: string,
    targetBranchId: string,
    strategy: MergeStrategy = 'THEIRS'
  ): Promise<BranchEntity> {
    if (sourceBranchId === targetBranchId) {
      return cloneBranch(this.getRuntime(targetBranchId).meta);
    }

    const sourceRuntime = this.getRuntime(sourceBranchId);
    const targetRuntime = this.getRuntime(targetBranchId);

    const sourceActions = sourceRuntime.cache.getActions();
    const targetActions = targetRuntime.cache.getActions();
    const commonPrefix = this.commonPrefixLength(sourceActions, targetActions);

    // Case 1: Fast-forward (target is prefix of source)
    if (commonPrefix === targetActions.length && sourceActions.length > targetActions.length) {
      const rebuilt = await this.buildCacheFromActions(sourceActions);
      targetRuntime.cache = rebuilt.cache;
      targetRuntime.meta.headIndex = rebuilt.cache.getLength();
      targetRuntime.meta.headHash = rebuilt.hydration.outputStateHash;
      targetRuntime.meta.updatedAt = Date.now();
      return cloneBranch(targetRuntime.meta);
    }

    // Source already behind target; no merge needed.
    if (commonPrefix === sourceActions.length) {
      return cloneBranch(targetRuntime.meta);
    }

    const prefix = targetActions.slice(0, commonPrefix);
    let targetTail = targetActions.slice(commonPrefix);
    let sourceTail = sourceActions.slice(commonPrefix);

    const conflicts = this.detectConflicts(targetTail, sourceTail);
    if (conflicts.length > 0 && strategy === 'MANUAL') {
      throw new MergeConflictError(conflicts);
    }

    if (conflicts.length > 0) {
      const conflictKeys = new Set(conflicts.map((entry) => entry.key));
      if (strategy === 'THEIRS') {
        targetTail = targetTail.filter((proposal) => {
          const key = getConflictKey(proposal);
          return !key || !conflictKeys.has(key);
        });
      } else if (strategy === 'OURS') {
        sourceTail = sourceTail.filter((proposal) => {
          const key = getConflictKey(proposal);
          return !key || !conflictKeys.has(key);
        });
      }
    }

    const mergedActions = this.dedupeByProposalId([...prefix, ...targetTail, ...sourceTail]);
    const rebuilt = await this.buildCacheFromActions(mergedActions);

    targetRuntime.cache = rebuilt.cache;
    targetRuntime.meta.headIndex = rebuilt.cache.getLength();
    targetRuntime.meta.headHash = rebuilt.hydration.outputStateHash;
    targetRuntime.meta.updatedAt = Date.now();

    return cloneBranch(targetRuntime.meta);
  }
}
