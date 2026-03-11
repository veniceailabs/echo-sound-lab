import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from './deterministicReplayService';
import {
  TimelineHydrationMetrics,
  TimelineHydrationResult,
  TimelineReplayCache,
} from './timelineReplayCache';

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

interface BranchRuntime {
  meta: BranchEntity;
  cache: TimelineReplayCache;
}

function cloneBranch(branch: BranchEntity): BranchEntity {
  return { ...branch };
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
}

