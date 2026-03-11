import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from './deterministicReplayService';
import { stableStringify } from './deterministicJson';

export interface TimelineSnapshot {
  index: number;
  state: ReplayState;
  outputStateHash: string;
}

export interface TimelineHydrationMetrics {
  targetIndex: number;
  fromSnapshotIndex: number;
  replayedActionCount: number;
  durationMs: number;
  snapshotInterval: number;
}

export interface TimelineHydrationResult {
  state: ReplayState;
  outputStateHash: string;
  metrics: TimelineHydrationMetrics;
}

export interface TimelineReplayCacheOptions {
  snapshotInterval?: number;
  workspaceId?: string;
}

function cloneState(state: ReplayState): ReplayState {
  return JSON.parse(stableStringify(state)) as ReplayState;
}

export class TimelineReplayCache {
  private readonly snapshotInterval: number;
  private readonly workspaceId: string;
  private readonly snapshots = new Map<number, TimelineSnapshot>();
  private actions: APLProposal[] = [];
  private hashHistory: string[] = [];
  private latestState: ReplayState;
  private latestHash: string;

  constructor(
    baseState: ReplayState,
    baseHash: string,
    options: TimelineReplayCacheOptions = {}
  ) {
    this.snapshotInterval = Math.max(1, Math.floor(options.snapshotInterval || 50));
    this.workspaceId = options.workspaceId || baseState.workspaceId || 'workspace-main';
    this.latestState = cloneState(baseState);
    this.latestHash = baseHash;
    this.hashHistory = [baseHash];
    this.snapshots.set(0, {
      index: 0,
      state: cloneState(baseState),
      outputStateHash: baseHash,
    });
  }

  getLength(): number {
    return this.actions.length;
  }

  getSnapshotInterval(): number {
    return this.snapshotInterval;
  }

  getActions(): APLProposal[] {
    return [...this.actions];
  }

  getHashHistory(): string[] {
    return [...this.hashHistory];
  }

  getLatestState(): ReplayState {
    return cloneState(this.latestState);
  }

  getLatestHash(): string {
    return this.latestHash;
  }

  private getSnapshotIndex(targetIndex: number): number {
    if (targetIndex <= 0) return 0;
    const candidate = Math.floor(targetIndex / this.snapshotInterval) * this.snapshotInterval;
    if (this.snapshots.has(candidate)) return candidate;

    let best = 0;
    for (const index of this.snapshots.keys()) {
      if (index <= targetIndex && index >= best) best = index;
    }
    return best;
  }

  async hydrateToIndex(index: number): Promise<TimelineHydrationResult> {
    const boundedIndex = Math.max(0, Math.min(index, this.actions.length));
    const fromSnapshotIndex = this.getSnapshotIndex(boundedIndex);
    const snapshot = this.snapshots.get(fromSnapshotIndex);
    if (!snapshot) {
      throw new Error(`TIMELINE_CACHE_ERROR: Missing snapshot for index ${fromSnapshotIndex}`);
    }

    const slice = this.actions.slice(fromSnapshotIndex, boundedIndex);
    const start = performance.now();

    if (slice.length === 0) {
      const durationMs = performance.now() - start;
      return {
        state: cloneState(snapshot.state),
        outputStateHash: snapshot.outputStateHash,
        metrics: {
          targetIndex: boundedIndex,
          fromSnapshotIndex,
          replayedActionCount: 0,
          durationMs,
          snapshotInterval: this.snapshotInterval,
        },
      };
    }

    const replay = await runDeterministicReplay(snapshot.state, slice, {
      workspaceId: this.workspaceId,
    });
    const durationMs = performance.now() - start;
    return {
      state: replay.outputState,
      outputStateHash: replay.outputStateHash,
      metrics: {
        targetIndex: boundedIndex,
        fromSnapshotIndex,
        replayedActionCount: slice.length,
        durationMs,
        snapshotInterval: this.snapshotInterval,
      },
    };
  }

  async appendProposal(proposal: APLProposal): Promise<TimelineHydrationResult> {
    const nextIndex = this.actions.length + 1;
    const start = performance.now();
    const replay = await runDeterministicReplay(this.latestState, [proposal], {
      workspaceId: this.workspaceId,
    });
    const durationMs = performance.now() - start;

    this.actions.push(proposal);
    this.latestState = cloneState(replay.outputState);
    this.latestHash = replay.outputStateHash;
    this.hashHistory.push(replay.outputStateHash);

    if (nextIndex % this.snapshotInterval === 0) {
      this.snapshots.set(nextIndex, {
        index: nextIndex,
        state: cloneState(this.latestState),
        outputStateHash: this.latestHash,
      });
    }

    return {
      state: cloneState(this.latestState),
      outputStateHash: this.latestHash,
      metrics: {
        targetIndex: nextIndex,
        fromSnapshotIndex: nextIndex - 1,
        replayedActionCount: 1,
        durationMs,
        snapshotInterval: this.snapshotInterval,
      },
    };
  }

  async restoreToIndex(index: number): Promise<TimelineHydrationResult> {
    const boundedIndex = Math.max(0, Math.min(index, this.actions.length));
    const restored = await this.hydrateToIndex(boundedIndex);

    this.actions = this.actions.slice(0, boundedIndex);
    this.hashHistory = this.hashHistory.slice(0, boundedIndex + 1);

    for (const key of Array.from(this.snapshots.keys())) {
      if (key > boundedIndex) {
        this.snapshots.delete(key);
      }
    }

    this.latestState = cloneState(restored.state);
    this.latestHash = restored.outputStateHash;

    if (!this.snapshots.has(boundedIndex)) {
      this.snapshots.set(boundedIndex, {
        index: boundedIndex,
        state: cloneState(restored.state),
        outputStateHash: restored.outputStateHash,
      });
    }

    return restored;
  }
}

